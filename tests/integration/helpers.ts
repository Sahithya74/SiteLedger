import type { Role } from "@/generated/prisma/enums";
import { todayIST } from "@/lib/dates";
import { sanitizeManagerPermissions } from "@/lib/permissions";
import type { CurrentUser } from "@/server/auth/current-user";
import { hashPassword } from "@/server/auth/password";
import { db } from "@/server/db";
import { createClient } from "@/server/services/clients";
import { ensureDefaults } from "@/server/services/defaults";
import { createProject } from "@/server/services/projects";

let counter = 0;

/** Creates a user and returns it shaped like the logged-in user the services expect. */
export async function makeUser(role: Role, options: { permissions?: string[]; password?: string; username?: string } = {}): Promise<CurrentUser> {
  counter++;
  const username = options.username ?? `${role.toLowerCase()}${counter}`;
  const permissions = role === "MANAGER" ? sanitizeManagerPermissions(options.permissions ?? []) : [];
  const user = await db.user.create({
    data: {
      name: `${role === "ADMIN" ? "Owner" : "Manager"} ${counter}`,
      username,
      role,
      passwordHash: await hashPassword(options.password ?? "Correct-Horse-9"),
      permissions: { create: permissions.map((permission) => ({ permission })) },
    },
  });
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role,
    permissions,
    mustChangePassword: false,
    sessionId: "test",
  };
}

export async function makeProject(owner: CurrentUser, overrides: { name?: string; contractLakhs?: number } = {}) {
  await db.$transaction((tx) => ensureDefaults(tx));
  const client = await createClient(owner, {
    name: "Test Client",
    phone: "9876543210",
    altPhone: null,
    email: null,
    address: null,
    city: "Chennai",
    gstin: null,
    pan: null,
    notes: null,
  });
  const project = await createProject(owner, {
    name: overrides.name ?? "Test Villa",
    clientId: client.id,
    type: "RESIDENTIAL",
    status: "ACTIVE",
    description: null,
    address: null,
    city: "Chennai",
    state: null,
    pincode: null,
    latitude: null,
    longitude: null,
    mapUrl: null,
    startDate: todayIST(),
    expectedEndDate: null,
    actualEndDate: null,
    quotedPaise: 0n,
    contractPaise: BigInt(Math.round((overrides.contractLakhs ?? 10) * 1e7)),
    statusNote: null,
  });
  return { clientId: client.id, projectId: project.id };
}

export async function makeBankAccount(name = "Test Bank") {
  return db.bankAccount.create({
    data: { kind: "BANK", name, openingBalancePaise: 0n, openingDate: new Date("2026-04-01T00:00:00Z") },
  });
}
