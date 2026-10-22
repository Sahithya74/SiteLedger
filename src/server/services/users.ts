import "server-only";
import {
  PERMISSION_PRESETS,
  PERMISSIONS,
  sanitizeManagerPermissions,
  type Permission,
  type PresetKey,
} from "@/lib/permissions";
import type { CurrentUser } from "@/server/auth/current-user";
import { hashPassword, passwordProblem, verifyPassword } from "@/server/auth/password";
import { invalidateUserSessions } from "@/server/auth/session";
import { generateTotpSecret, otpauthUrl, verifyTotp } from "@/server/auth/totp";
import { consumeCode, issueCode, normaliseEmail } from "@/server/auth/verification";
import { emailConfigured } from "@/integrations/email";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { AppError, ForbiddenError, NotFoundError } from "@/server/errors";
import { ensureDefaults } from "@/server/services/defaults";

function requireOwner(actor: CurrentUser) {
  if (actor.role !== "ADMIN") throw new ForbiddenError("Only the owner can manage users.");
}

function assertPassword(password: string, username: string, field = "password") {
  const problem = passwordProblem(password, username);
  if (problem) throw new AppError(problem, { [field]: problem });
}

export async function userCount(): Promise<number> {
  return db.user.count();
}

/**
 * First-run setup: creates the owner account. Only works while there are no
 * users at all, so it cannot be used to add a second owner later.
 */
export async function createFirstOwner(input: {
  companyName: string;
  name: string;
  username: string;
  password: string;
}): Promise<{ id: string; name: string; role: "ADMIN" }> {
  assertPassword(input.password, input.username);
  const passwordHash = await hashPassword(input.password);
  return db.$transaction(
    async (tx) => {
      // Serialise concurrent setup attempts.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(424242)`;
      if ((await tx.user.count()) > 0) throw new AppError("SITECORE is already set up. Please log in.");
      const user = await tx.user.create({
        data: { name: input.name, username: input.username, role: "ADMIN", passwordHash, passwordChangedAt: new Date() },
      });
      await tx.appSetting.upsert({
        where: { key: "company" },
        create: { key: "company", value: { name: input.companyName } },
        update: { value: { name: input.companyName } },
      });
      await ensureDefaults(tx);
      await audit(tx, {
        actor: { id: user.id, name: user.name, role: "ADMIN" },
        action: "CREATE",
        entityType: "User",
        entityId: user.id,
        summary: `set up SITECORE for ${input.companyName} and created the owner account "${user.username}"`,
      });
      return { id: user.id, name: user.name, role: "ADMIN" as const };
    },
    { isolationLevel: "Serializable" },
  );
}

export async function listUsers(actor: CurrentUser) {
  requireOwner(actor);
  const users = await db.user.findMany({
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      username: true,
      phone: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      mustChangePassword: true,
      createdAt: true,
      _count: { select: { sessions: true, projectAssignments: true, permissions: true } },
    },
  });
  return users;
}

export async function getManagedUser(actor: CurrentUser, id: string) {
  requireOwner(actor);
  const user = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      username: true,
      phone: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      mustChangePassword: true,
      permissions: { select: { permission: true } },
      projectAssignments: { select: { projectId: true } },
    },
  });
  if (!user) return null;
  return {
    ...user,
    permissions: user.permissions.map((p) => p.permission),
    projectIds: user.projectAssignments.map((a) => a.projectId),
  };
}

export async function createManager(
  actor: CurrentUser,
  input: { name: string; username: string; phone: string | null; password: string; preset: PresetKey | "NONE" },
): Promise<{ id: string }> {
  requireOwner(actor);
  assertPassword(input.password, input.username);
  const taken = await db.user.findUnique({ where: { username: input.username }, select: { id: true } });
  if (taken) throw new AppError("That login name is already used.", { username: "That login name is already used." });
  const permissions = input.preset === "NONE" ? [] : sanitizeManagerPermissions(PERMISSION_PRESETS[input.preset].permissions);
  const passwordHash = await hashPassword(input.password);
  return db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: input.name,
        username: input.username,
        phone: input.phone,
        role: "MANAGER",
        passwordHash,
        // The manager chooses their own password on first login.
        mustChangePassword: true,
        permissions: { create: permissions.map((permission) => ({ permission, grantedById: actor.id })) },
      },
    });
    await audit(tx, {
      actor,
      action: "CREATE",
      entityType: "User",
      entityId: user.id,
      summary: `created manager account "${user.username}" for ${user.name}${
        input.preset !== "NONE" ? ` with ${PERMISSION_PRESETS[input.preset].label} permissions` : ""
      }`,
    });
    return { id: user.id };
  });
}

export async function updateUserProfile(actor: CurrentUser, id: string, input: { name: string; phone: string | null }) {
  requireOwner(actor);
  const user = await db.user.findUnique({ where: { id } });
  if (!user) throw new NotFoundError("user");
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: input });
    await audit(tx, {
      actor,
      action: "UPDATE",
      entityType: "User",
      entityId: id,
      summary: `updated the details of ${user.username}`,
      before: { name: user.name, phone: user.phone },
      after: input,
    });
  });
}

export async function setManagerPermissions(actor: CurrentUser, userId: string, keys: string[]): Promise<void> {
  requireOwner(actor);
  const user = await db.user.findUnique({ where: { id: userId }, include: { permissions: true } });
  if (!user) throw new NotFoundError("user");
  if (user.role !== "MANAGER") throw new AppError("The owner always has full access.");
  const next = sanitizeManagerPermissions(keys);
  const current = user.permissions.map((p) => p.permission).sort();
  const added = next.filter((k) => !current.includes(k));
  const removed = current.filter((k) => !next.includes(k as Permission));
  if (added.length === 0 && removed.length === 0) return;
  const label = (k: string) => (k in PERMISSIONS ? PERMISSIONS[k as Permission].label : k);
  await db.$transaction(async (tx) => {
    await tx.userPermission.deleteMany({ where: { userId } });
    if (next.length) {
      await tx.userPermission.createMany({ data: next.map((permission) => ({ userId, permission, grantedById: actor.id })) });
    }
    await audit(tx, {
      actor,
      action: "PERMISSION_CHANGE",
      entityType: "User",
      entityId: userId,
      summary: `changed permissions for ${user.name}${added.length ? ` — allowed: ${added.map(label).join("; ")}` : ""}${
        removed.length ? ` — removed: ${removed.map(label).join("; ")}` : ""
      }`,
      before: current,
      after: next,
    });
  });
}

export async function setManagerProjects(actor: CurrentUser, userId: string, projectIds: string[]): Promise<void> {
  requireOwner(actor);
  const user = await db.user.findUnique({ where: { id: userId }, include: { projectAssignments: true } });
  if (!user) throw new NotFoundError("user");
  if (user.role !== "MANAGER") throw new AppError("The owner can always see every project.");
  const valid = await db.project.findMany({ where: { id: { in: projectIds }, deletedAt: null }, select: { id: true, name: true } });
  const current = user.projectAssignments.map((a) => a.projectId);
  await db.$transaction(async (tx) => {
    await tx.projectAssignment.deleteMany({ where: { userId } });
    if (valid.length) await tx.projectAssignment.createMany({ data: valid.map((p) => ({ userId, projectId: p.id })) });
    await audit(tx, {
      actor,
      action: "PERMISSION_CHANGE",
      entityType: "User",
      entityId: userId,
      summary: `set the projects ${user.name} can see: ${valid.map((p) => p.name).join(", ") || "none"}`,
      before: current,
      after: valid.map((p) => p.id),
    });
  });
}

export async function resetUserPassword(actor: CurrentUser, userId: string, newPassword: string): Promise<void> {
  requireOwner(actor);
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError("user");
  assertPassword(newPassword, user.username, "newPassword");
  const passwordHash = await hashPassword(newPassword);
  const isSelf = user.id === actor.id;
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      // A reset for someone else also turns off their 2-step login (usually a lost phone).
      data: { passwordHash, mustChangePassword: !isSelf, passwordChangedAt: new Date(), ...(isSelf ? {} : { totpEnabled: false, totpSecret: null }) },
    });
    await audit(tx, {
      actor,
      action: "PASSWORD_CHANGE",
      entityType: "User",
      entityId: userId,
      summary: `reset the password for ${user.username}${isSelf ? "" : " (they must choose a new one when they next log in)"}`,
    });
  });
  // Sign the person out everywhere so the old password stops working immediately.
  await invalidateUserSessions(userId, isSelf ? actor.sessionId : undefined);
}

export async function setUserActive(actor: CurrentUser, userId: string, active: boolean): Promise<void> {
  requireOwner(actor);
  if (userId === actor.id) throw new AppError("You cannot deactivate your own account.");
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError("user");
  if (user.role === "ADMIN" && !active) {
    const owners = await db.user.count({ where: { role: "ADMIN", isActive: true } });
    if (owners <= 1) throw new AppError("There must always be at least one active owner.");
  }
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { isActive: active } });
    await audit(tx, {
      actor,
      action: "STATUS_CHANGE",
      entityType: "User",
      entityId: userId,
      summary: `${active ? "re-activated" : "deactivated"} the account "${user.username}"`,
    });
  });
  if (!active) await invalidateUserSessions(userId);
}

export async function changeOwnPassword(
  actor: CurrentUser,
  input: { currentPassword: string; newPassword: string },
): Promise<void> {
  const user = await db.user.findUnique({ where: { id: actor.id } });
  if (!user) throw new NotFoundError("user");
  if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
    throw new AppError("Your current password is not correct.", { currentPassword: "Your current password is not correct." });
  }
  if (input.currentPassword === input.newPassword) {
    throw new AppError("Choose a password different from the current one.", { newPassword: "Choose a different password." });
  }
  assertPassword(input.newPassword, user.username, "newPassword");
  const passwordHash = await hashPassword(input.newPassword);
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: actor.id },
      data: { passwordHash, mustChangePassword: false, passwordChangedAt: new Date() },
    });
    await audit(tx, {
      actor,
      action: "PASSWORD_CHANGE",
      entityType: "User",
      entityId: actor.id,
      summary: "changed their own password",
    });
  });
  // Keep this browser signed in; sign out everywhere else.
  await invalidateUserSessions(actor.id, actor.sessionId);
}

export async function listSessions(actor: CurrentUser) {
  const where = actor.role === "ADMIN" ? {} : { userId: actor.id };
  return db.session.findMany({
    where: { ...where, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      lastSeenAt: true,
      ipAddress: true,
      userAgent: true,
      user: { select: { id: true, name: true, username: true } },
    },
  });
}

export async function endSession(actor: CurrentUser, sessionId: string): Promise<void> {
  const session = await db.session.findUnique({ where: { id: sessionId }, include: { user: true } });
  if (!session) return;
  if (actor.role !== "ADMIN" && session.userId !== actor.id) throw new ForbiddenError();
  await db.session.delete({ where: { id: sessionId } });
  await audit(db, {
    actor,
    action: "LOGOUT",
    entityType: "User",
    entityId: session.userId,
    summary: `signed out a session of ${session.user.username}`,
  });
}

export async function signOutEverywhere(actor: CurrentUser): Promise<number> {
  const count = await invalidateUserSessions(actor.id, actor.sessionId);
  await audit(db, {
    actor,
    action: "LOGOUT",
    entityType: "User",
    entityId: actor.id,
    summary: `signed out of all other devices (${count})`,
  });
  return count;
}

/** Manager accounts, for assigning projects. */
export async function managerOptions() {
  return db.user.findMany({
    where: { role: "MANAGER" },
    select: { id: true, name: true, isActive: true },
    orderBy: { name: "asc" },
  });
}

export async function companyName(): Promise<string> {
  const row = await db.appSetting.findUnique({ where: { key: "company" } });
  const value = row?.value as { name?: string } | undefined;
  return value?.name ?? "SITECORE";
}

export type CompanyProfile = {
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  pan: string | null;
  /** Printed under bills so clients know where to pay. */
  bankDetails: string | null;
};

/** Company details printed on quotations, bills and receipts. */
export async function companyProfile(): Promise<CompanyProfile> {
  const row = await db.appSetting.findUnique({ where: { key: "company" } });
  const v = (row?.value ?? {}) as Partial<CompanyProfile>;
  return {
    name: v.name ?? "SITECORE",
    address: v.address ?? null,
    phone: v.phone ?? null,
    email: v.email ?? null,
    gstin: v.gstin ?? null,
    pan: v.pan ?? null,
    bankDetails: v.bankDetails ?? null,
  };
}

export async function setCompanyProfile(actor: CurrentUser, input: CompanyProfile): Promise<void> {
  requireOwner(actor);
  const before = await companyProfile();
  const changed = (Object.keys(input) as (keyof CompanyProfile)[]).filter((k) => (before[k] ?? null) !== (input[k] ?? null));
  if (changed.length === 0) return;
  await db.$transaction(async (tx) => {
    await tx.appSetting.upsert({ where: { key: "company" }, create: { key: "company", value: input }, update: { value: input } });
    await audit(tx, {
      actor,
      action: "UPDATE",
      entityType: "Settings",
      summary: `updated company details (${changed.join(", ")})`,
      before,
      after: input,
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 2-step login (authenticator app)
// ─────────────────────────────────────────────────────────────────────────────

export async function totpStatus(actor: CurrentUser) {
  const u = await db.user.findUniqueOrThrow({ where: { id: actor.id }, select: { totpEnabled: true, totpSecret: true, username: true } });
  return { enabled: u.totpEnabled, pendingSecret: !u.totpEnabled ? u.totpSecret : null, username: u.username };
}

/** Starts setup: a new secret is kept (not yet active) until a code from the app confirms it. */
export async function beginTotpSetup(actor: CurrentUser): Promise<{ secret: string; url: string }> {
  const u = await db.user.findUniqueOrThrow({ where: { id: actor.id } });
  if (u.totpEnabled) throw new AppError("2-step login is already on.");
  const secret = u.totpSecret ?? generateTotpSecret();
  if (!u.totpSecret) await db.user.update({ where: { id: actor.id }, data: { totpSecret: secret } });
  return { secret, url: otpauthUrl(secret, u.username, await companyName()) };
}

export async function enableTotp(actor: CurrentUser, code: string): Promise<void> {
  const u = await db.user.findUniqueOrThrow({ where: { id: actor.id } });
  if (u.totpEnabled) return;
  if (!u.totpSecret || verifyTotp(u.totpSecret, code) === null) throw new AppError("That code is not right. Type the code now showing in the app.", { code: "Wrong code." });
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: actor.id }, data: { totpEnabled: true } });
    await audit(tx, { actor, action: "UPDATE", entityType: "User", entityId: actor.id, summary: "turned on 2-step login" });
  });
  // Other devices must log in again with the code.
  await invalidateUserSessions(actor.id, actor.sessionId);
}

export async function disableTotp(actor: CurrentUser, password: string, code: string): Promise<void> {
  const u = await db.user.findUniqueOrThrow({ where: { id: actor.id } });
  if (!u.totpEnabled || !u.totpSecret) return;
  if (!(await verifyPassword(u.passwordHash, password))) throw new AppError("Your password is not right.", { password: "Wrong password." });
  if (verifyTotp(u.totpSecret, code) === null) throw new AppError("That code is not right.", { code: "Wrong code." });
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: actor.id }, data: { totpEnabled: false, totpSecret: null } });
    await audit(tx, { actor, action: "UPDATE", entityType: "User", entityId: actor.id, summary: "turned off 2-step login" });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Email for "forgot password" (confirmed with a code first)
// ─────────────────────────────────────────────────────────────────────────────

export async function emailStatus(actor: CurrentUser) {
  const u = await db.user.findUniqueOrThrow({ where: { id: actor.id }, select: { email: true, emailVerifiedAt: true } });
  return { email: u.email, verified: Boolean(u.email && u.emailVerifiedAt), emailConfigured: emailConfigured() };
}

/** Saves the address (not yet trusted) and emails a code to confirm it. */
export async function setOwnEmail(actor: CurrentUser, rawEmail: string, ipAddress: string | null): Promise<void> {
  const email = normaliseEmail(rawEmail);
  const taken = await db.user.findFirst({ where: { email, id: { not: actor.id } }, select: { id: true } });
  if (taken) throw new AppError("This email is already used by another login.", { email: "Already used." });
  const before = await db.user.findUniqueOrThrow({ where: { id: actor.id } });
  if (before.email !== email || !before.emailVerifiedAt) {
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: actor.id }, data: { email, emailVerifiedAt: null } });
      await audit(tx, { actor, action: "UPDATE", entityType: "User", entityId: actor.id, summary: `set their email to ${email} (waiting for confirmation)` });
    });
  }
  await issueCode(actor, "EMAIL_VERIFY", email, ipAddress);
}

export async function confirmOwnEmail(actor: CurrentUser, code: string): Promise<void> {
  const u = await db.user.findUniqueOrThrow({ where: { id: actor.id } });
  if (!u.email) throw new AppError("Add your email first.");
  const result = await consumeCode(actor.id, "EMAIL_VERIFY", code);
  if (!result.ok) throw new AppError(result.error, { code: result.error });
  if (result.email !== u.email) throw new AppError("This code was for a different email. Ask for a new one.", { code: "Old code." });
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: actor.id }, data: { emailVerifiedAt: new Date() } });
    await audit(tx, { actor, action: "UPDATE", entityType: "User", entityId: actor.id, summary: `confirmed their email ${u.email}` });
  });
}
