import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/server/db";

/**
 * Database-backed sessions.
 * - The browser cookie holds a random 256-bit token.
 * - The database stores only SHA-256(token), so a leaked database backup
 *   cannot be used to log in.
 * - Sessions end after a period of inactivity (idle timeout) and always after
 *   an absolute maximum, whichever comes first.
 */

const isProduction = process.env.NODE_ENV === "production";

// "__Host-" cookies must be Secure, so only use the prefix over HTTPS (production).
export const SESSION_COOKIE = isProduction ? "__Host-sitecore_session" : "sitecore_session";

const IDLE_MS = Number(process.env.SESSION_IDLE_HOURS ?? 8) * 60 * 60 * 1000;
const ABSOLUTE_MS = Number(process.env.SESSION_MAX_DAYS ?? 7) * 24 * 60 * 60 * 1000;
// Only write "last seen" to the database at most this often.
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function createSession(
  userId: string,
  meta: { ipAddress?: string | null; userAgent?: string | null },
): Promise<{ token: string; absoluteExpiresAt: Date }> {
  const token = generateToken();
  const now = Date.now();
  const absoluteExpiresAt = new Date(now + ABSOLUTE_MS);
  await db.session.create({
    data: {
      id: hashToken(token),
      userId,
      expiresAt: new Date(Math.min(now + IDLE_MS, absoluteExpiresAt.getTime())),
      absoluteExpiresAt,
      ipAddress: meta.ipAddress ?? null,
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
    },
  });
  return { token, absoluteExpiresAt };
}

export type SessionWithUser = NonNullable<Awaited<ReturnType<typeof findSession>>>;

function findSession(id: string) {
  return db.session.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          username: true,
          role: true,
          isActive: true,
          mustChangePassword: true,
          permissions: { select: { permission: true } },
        },
      },
    },
  });
}

/** Returns the session and its user, or null if the token is unknown or expired. */
export async function validateSessionToken(token: string): Promise<SessionWithUser | null> {
  const id = hashToken(token);
  const session = await findSession(id);
  if (!session) return null;

  const now = Date.now();
  const expired = now >= session.expiresAt.getTime() || now >= session.absoluteExpiresAt.getTime();
  if (expired || !session.user.isActive) {
    await db.session.deleteMany({ where: { id } });
    return null;
  }

  if (now - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    const expiresAt = new Date(Math.min(now + IDLE_MS, session.absoluteExpiresAt.getTime()));
    await db.session.update({ where: { id }, data: { lastSeenAt: new Date(now), expiresAt } });
    session.expiresAt = expiresAt;
  }
  return session;
}

export async function invalidateSession(sessionId: string): Promise<void> {
  await db.session.deleteMany({ where: { id: sessionId } });
}

export async function invalidateUserSessions(userId: string, exceptSessionId?: string): Promise<number> {
  const result = await db.session.deleteMany({
    where: { userId, ...(exceptSessionId ? { NOT: { id: exceptSessionId } } : {}) },
  });
  return result.count;
}

/** Removes expired sessions. Called opportunistically on login. */
export async function deleteExpiredSessions(): Promise<void> {
  const now = new Date();
  await db.session.deleteMany({
    where: { OR: [{ expiresAt: { lt: now } }, { absoluteExpiresAt: { lt: now } }] },
  });
}

export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function deleteSessionCookie(): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function readSessionCookie(): Promise<string | null> {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}
