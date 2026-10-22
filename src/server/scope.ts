import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { can, type PermissionHolder } from "@/lib/permissions";
import { db } from "@/server/db";
import { NotFoundError } from "@/server/errors";

type ScopedUser = PermissionHolder & { id: string };

/** True when the user may see every project (owner, or manager with "see all projects"). */
export function seesAllProjects(user: ScopedUser): boolean {
  return user.role === "ADMIN" || can(user, "projects.viewAll");
}

/**
 * Prisma filter for the projects this user may see. Managers only see the
 * projects assigned to them unless they were given "see all projects".
 */
export function projectWhere(user: ScopedUser): Prisma.ProjectWhereInput {
  if (seesAllProjects(user)) return { deletedAt: null };
  return { deletedAt: null, assignments: { some: { userId: user.id } } };
}

/** null means "all projects". */
export async function accessibleProjectIds(user: ScopedUser): Promise<string[] | null> {
  if (seesAllProjects(user)) return null;
  const rows = await db.projectAssignment.findMany({ where: { userId: user.id }, select: { projectId: true } });
  return rows.map((r) => r.projectId);
}

/** Throws "not found" (rather than "forbidden") so project existence is not revealed. */
export async function assertProjectAccess(user: ScopedUser, projectId: string): Promise<void> {
  const found = await db.project.findFirst({ where: { id: projectId, ...projectWhere(user) }, select: { id: true } });
  if (!found) throw new NotFoundError("project");
}

/** Builds a `projectId IN (...)` filter for related tables, or {} for all. */
export function projectIdFilter(ids: string[] | null): { projectId?: { in: string[] } } {
  return ids === null ? {} : { projectId: { in: ids } };
}
