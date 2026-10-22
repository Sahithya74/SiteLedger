import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Role } from "@/generated/prisma/enums";
import { can, isPermission, type Permission } from "@/lib/permissions";
import { ForbiddenError, UnauthenticatedError } from "@/server/errors";
import { readSessionCookie, validateSessionToken } from "./session";

export type CurrentUser = {
  id: string;
  name: string;
  username: string;
  role: Role;
  permissions: Permission[];
  mustChangePassword: boolean;
  sessionId: string;
};

/**
 * The logged-in user for this request, or null. Memoised per request, so
 * calling it from several components costs one database lookup.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = await readSessionCookie();
  if (!token) return null;
  const session = await validateSessionToken(token);
  if (!session) return null;
  const { user } = session;
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role,
    permissions: user.permissions.map((p) => p.permission).filter(isPermission),
    mustChangePassword: user.mustChangePassword,
    sessionId: session.id,
  };
});

/**
 * For pages and layouts: returns the user or sends them to the login page.
 * Users who must change their password are sent to that screen first.
 */
export async function requireUser(options: { allowPasswordChange?: boolean } = {}): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword && !options.allowPasswordChange) redirect("/change-password");
  return user;
}

/**
 * For server actions and route handlers: returns the user or throws an error
 * that the action wrapper turns into a friendly message.
 */
export async function requireActionUser(permission?: Permission): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthenticatedError();
  if (user.mustChangePassword) throw new ForbiddenError("Please change your password first.");
  if (permission && !can(user, permission)) throw new ForbiddenError();
  return user;
}

export function isAdmin(user: Pick<CurrentUser, "role">): boolean {
  return user.role === "ADMIN";
}

/** Best-effort client IP and browser for audit and rate limiting. */
export async function requestMeta(): Promise<{ ipAddress: string; userAgent: string | null }> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    ipAddress: forwarded || h.get("x-real-ip") || "local",
    userAgent: h.get("user-agent"),
  };
}
