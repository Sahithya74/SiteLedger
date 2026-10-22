import "server-only";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { getDummyHash, verifyPassword } from "./password";
import { createSession, deleteExpiredSessions } from "./session";

const WINDOW_MS = 15 * 60 * 1000;
export const MAX_FAILURES_PER_USERNAME = 5;
export const MAX_FAILURES_PER_IP = 20;

export type LoginResult =
  | { ok: true; token: string; expiresAt: Date; mustChangePassword: boolean }
  | { ok: false; error: string };

const WRONG_DETAILS = "Wrong login name or password.";
const LOCKED = "Too many wrong attempts. Please wait 15 minutes and try again.";

/** Failed attempts in the last 15 minutes since the last successful login. */
async function recentFailures(where: { username?: string; ipAddress?: string }): Promise<number> {
  const windowStart = new Date(Date.now() - WINDOW_MS);
  const lastSuccess = where.username
    ? await db.loginAttempt.findFirst({
        where: { username: where.username, success: true, createdAt: { gte: windowStart } },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      })
    : null;
  return db.loginAttempt.count({
    where: { ...where, success: false, createdAt: { gte: lastSuccess?.createdAt ?? windowStart } },
  });
}

export async function attemptLogin(
  rawUsername: string,
  password: string,
  meta: { ipAddress: string; userAgent: string | null },
): Promise<LoginResult> {
  const username = rawUsername.trim().toLowerCase();
  if (!username || !password) return { ok: false, error: "Enter your login name and password." };

  const [userFailures, ipFailures] = await Promise.all([
    recentFailures({ username }),
    recentFailures({ ipAddress: meta.ipAddress }),
  ]);
  if (userFailures >= MAX_FAILURES_PER_USERNAME || ipFailures >= MAX_FAILURES_PER_IP) {
    return { ok: false, error: LOCKED };
  }

  const user = await db.user.findUnique({ where: { username } });
  // Always run a hash check so response time does not reveal whether the user exists.
  const passwordOk = await verifyPassword(user?.passwordHash ?? (await getDummyHash()), password);

  if (!user || !passwordOk || !user.isActive) {
    await db.loginAttempt.create({ data: { username, ipAddress: meta.ipAddress, success: false } });
    if (user) {
      await audit(db, {
        actor: null,
        action: "LOGIN_FAILED",
        entityType: "User",
        entityId: user.id,
        summary: user.isActive
          ? `Failed login attempt for "${username}"`
          : `Login refused for deactivated user "${username}"`,
        ipAddress: meta.ipAddress,
      });
    }
    const left = MAX_FAILURES_PER_USERNAME - userFailures - 1;
    if (left <= 0) return { ok: false, error: LOCKED };
    return {
      ok: false,
      error: left <= 2 ? `${WRONG_DETAILS} ${left} ${left === 1 ? "try" : "tries"} left.` : WRONG_DETAILS,
    };
  }

  await db.loginAttempt.create({ data: { username, ipAddress: meta.ipAddress, success: true } });
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await deleteExpiredSessions();
  const { token, absoluteExpiresAt } = await createSession(user.id, meta);
  await audit(db, {
    actor: { id: user.id, name: user.name, role: user.role },
    action: "LOGIN",
    entityType: "User",
    entityId: user.id,
    summary: "logged in",
    ipAddress: meta.ipAddress,
  });
  return { ok: true, token, expiresAt: absoluteExpiresAt, mustChangePassword: user.mustChangePassword };
}
