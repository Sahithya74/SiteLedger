import "server-only";
import { sendEmail } from "@/integrations/email";
import { formatDateTime } from "@/lib/dates";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { hashPassword, passwordProblem } from "./password";
import { invalidateUserSessions } from "./session";
import { consumeCode, issueCode, normaliseEmail } from "./verification";

type Meta = { ipAddress: string; userAgent: string | null };

/** Finds an active user by login name or by their confirmed email. */
async function findAccount(identifier: string) {
  const value = identifier.trim().toLowerCase();
  if (!value) return null;
  const user = value.includes("@")
    ? await db.user.findFirst({ where: { email: normaliseEmail(value), emailVerifiedAt: { not: null } } })
    : await db.user.findUnique({ where: { username: value } });
  return user?.isActive ? user : null;
}

/**
 * Step 1 of "forgot password": email a code to the account's confirmed
 * address. The reply is the same whether or not the account exists.
 */
export async function requestPasswordReset(identifier: string, meta: Meta): Promise<void> {
  const user = await findAccount(identifier);
  if (!user || !user.email || !user.emailVerifiedAt) return;
  await issueCode(user, "PASSWORD_RESET", user.email, meta.ipAddress);
  await audit(db, { actor: null, action: "UPDATE", entityType: "User", entityId: user.id, summary: `"forgot password" code emailed to ${user.username}`, ipAddress: meta.ipAddress });
}

/** Step 2: the code from the email plus a new password. */
export async function resetPasswordWithCode(identifier: string, code: string, newPassword: string, meta: Meta): Promise<void> {
  const user = await findAccount(identifier);
  if (!user) throw new AppError("That code is not right.", { code: "Wrong code." });
  const problem = passwordProblem(newPassword, user.username);
  if (problem) throw new AppError(problem, { newPassword: problem });
  const result = await consumeCode(user.id, "PASSWORD_RESET", code);
  if (!result.ok) {
    await audit(db, { actor: null, action: "LOGIN_FAILED", entityType: "User", entityId: user.id, summary: `Wrong password reset code for "${user.username}"`, ipAddress: meta.ipAddress });
    throw new AppError(result.error, { code: result.error });
  }
  const passwordHash = await hashPassword(newPassword);
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { passwordHash, mustChangePassword: false, passwordChangedAt: new Date() } });
    // Proving the email lifts the 15-minute lock from earlier wrong passwords.
    await tx.loginAttempt.create({ data: { username: user.username, ipAddress: meta.ipAddress, success: true } });
    await audit(tx, {
      actor: { id: user.id, name: user.name, role: user.role },
      action: "PASSWORD_CHANGE",
      entityType: "User",
      entityId: user.id,
      summary: "reset their password with a code sent to their email",
      ipAddress: meta.ipAddress,
    });
  });
  await invalidateUserSessions(user.id);
  await sendEmail({
    to: result.email,
    subject: "Your SITECORE password was changed",
    text: `Hello ${user.name},\n\nYour SITECORE password was changed on ${formatDateTime(new Date())} using a code sent to this email.\n\nIf this was not you, tell the owner straight away.\n\n— SITECORE`,
  }).catch(() => undefined);
}
