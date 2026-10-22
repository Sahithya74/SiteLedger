import "server-only";
import type { AuditAction } from "@/generated/prisma/enums";
import { addDays, isISODate, toDbDate, type ISODate } from "@/lib/dates";
import { can } from "@/lib/permissions";
import type { CurrentUser } from "@/server/auth/current-user";
import { db } from "@/server/db";
import { ForbiddenError } from "@/server/errors";

export const AUDIT_PAGE_SIZE = 50;

export type AuditFilter = {
  userId?: string;
  entityType?: string;
  action?: AuditAction;
  from?: ISODate;
  to?: ISODate;
  q?: string;
  page?: number;
};

/** IST calendar day → UTC instant at India midnight. */
function istMidnight(date: ISODate): Date {
  return new Date(toDbDate(date).getTime() - 330 * 60 * 1000);
}

export async function listAuditLog(user: CurrentUser, filter: AuditFilter) {
  if (!can(user, "audit.view")) throw new ForbiddenError();
  const page = Math.max(1, filter.page ?? 1);
  const where = {
    ...(filter.userId ? { userId: filter.userId } : {}),
    ...(filter.entityType ? { entityType: filter.entityType } : {}),
    ...(filter.action ? { action: filter.action } : {}),
    ...(filter.q ? { summary: { contains: filter.q, mode: "insensitive" as const } } : {}),
    ...(filter.from || filter.to
      ? {
          createdAt: {
            ...(filter.from && isISODate(filter.from) ? { gte: istMidnight(filter.from) } : {}),
            ...(filter.to && isISODate(filter.to) ? { lt: istMidnight(addDays(filter.to, 1)) } : {}),
          },
        }
      : {}),
  };
  const [rows, total, users, entityTypes] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * AUDIT_PAGE_SIZE,
      take: AUDIT_PAGE_SIZE,
      select: {
        id: true,
        createdAt: true,
        userName: true,
        action: true,
        entityType: true,
        entityId: true,
        projectId: true,
        summary: true,
        before: true,
        after: true,
        ipAddress: true,
      },
    }),
    db.auditLog.count({ where }),
    db.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.auditLog.findMany({ distinct: ["entityType"], select: { entityType: true }, orderBy: { entityType: "asc" } }),
  ]);
  return {
    rows,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE)),
    users,
    entityTypes: entityTypes.map((e) => e.entityType),
  };
}

/** Recent activity for one project (project overview page). */
export async function projectActivity(projectId: string, take = 8) {
  return db.auditLog.findMany({
    where: { projectId, action: { notIn: ["LOGIN", "LOGOUT", "LOGIN_FAILED"] } },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, createdAt: true, userName: true, summary: true, action: true },
  });
}
