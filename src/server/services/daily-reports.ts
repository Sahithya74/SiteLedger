import "server-only";
import type { Weather } from "@/generated/prisma/enums";
import { addDays, formatDate, fromDbDate, todayIST, toDbDate, type ISODate } from "@/lib/dates";
import { formatQuantity } from "@/lib/format";
import { can } from "@/lib/permissions";
import type { CurrentUser } from "@/server/auth/current-user";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { AppError, ForbiddenError } from "@/server/errors";
import { accessibleProjectIds, assertProjectAccess } from "@/server/scope";
import { usageOn } from "@/server/services/equipment";

type Actor = Pick<CurrentUser, "id" | "name" | "role" | "permissions">;

export async function listDailyReports(user: Actor & { id: string }, filter: { projectId?: string; from?: ISODate | null; to?: ISODate | null } = {}) {
  const ids = await accessibleProjectIds(user);
  const rows = await db.dailyReport.findMany({
    where: {
      ...(ids === null ? {} : { projectId: { in: ids } }),
      ...(filter.projectId ? { projectId: filter.projectId } : {}),
      ...(filter.from || filter.to ? { date: { ...(filter.from ? { gte: toDbDate(filter.from) } : {}), ...(filter.to ? { lte: toDbDate(filter.to) } : {}) } } : {}),
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 300,
    include: { project: { select: { id: true, name: true } }, site: { select: { name: true } }, submittedBy: { select: { name: true } } },
  });
  return rows.map((r) => ({ ...r, date: fromDbDate(r.date) }));
}

export async function getDailyReport(user: Actor & { id: string }, id: string) {
  const r = await db.dailyReport.findUnique({
    where: { id },
    include: {
      project: { select: { id: true, name: true, address: true, city: true, client: { select: { name: true } } } },
      site: { select: { id: true, name: true } },
      submittedBy: { select: { name: true } },
    },
  });
  if (!r) return null;
  const ids = await accessibleProjectIds(user);
  if (ids !== null && !ids.includes(r.projectId)) return null;
  return { ...r, date: fromDbDate(r.date) };
}

export type DailyReportDetail = NonNullable<Awaited<ReturnType<typeof getDailyReport>>>;

/** Start of an IST calendar day as an instant (for timestamp columns). */
function istDayStart(date: ISODate): Date {
  return new Date(`${date}T00:00:00+05:30`);
}

/**
 * What the records already say about a site on a day — attendance, deliveries,
 * material used, equipment and work updates — so the report starts filled in.
 */
export async function prefillDailyReport(user: Actor & { id: string }, projectId: string, date: ISODate) {
  await assertProjectAccess(user, projectId);
  const day = toDbDate(date);
  const [labour, engineers, inventory, equipment, workUpdates] = await Promise.all([
    db.attendance.count({ where: { projectId, date: day, labourId: { not: null }, status: { not: "ABSENT" } } }),
    db.attendance.count({ where: { projectId, date: day, engineerId: { not: null }, status: { not: "ABSENT" } } }),
    db.inventoryTransaction.findMany({
      where: { projectId, date: day, type: { in: ["PURCHASE", "TRANSFER_IN", "USAGE", "DAMAGE"] } },
      include: { material: { select: { name: true, unit: true } } },
    }),
    usageOn(projectId, date),
    db.auditLog.findMany({
      where: { projectId, entityType: { in: ["WorkItem", "Phase"] }, createdAt: { gte: istDayStart(date), lt: istDayStart(addDays(date, 1)) } },
      orderBy: { createdAt: "asc" },
      select: { summary: true },
      take: 30,
    }),
  ]);
  const describe = (types: string[]) =>
    inventory
      .filter((t) => types.includes(t.type))
      .map((t) => `${t.material.name}: ${formatQuantity(t.quantity.abs().toString(), t.material.unit)}${t.type === "DAMAGE" ? " (damaged)" : ""}`)
      .join("\n");
  return {
    labourPresent: labour,
    engineersPresent: engineers,
    materialsReceived: describe(["PURCHASE", "TRANSFER_IN"]),
    materialsUsed: describe(["USAGE", "DAMAGE"]),
    equipmentUsed: equipment.join("\n"),
    workCompleted: workUpdates.map((w) => `• ${w.summary.charAt(0).toUpperCase()}${w.summary.slice(1)}`).join("\n"),
  };
}

export type DailyReportInput = {
  projectId: string;
  siteId: string;
  date: ISODate;
  weather: Weather;
  weatherNote: string | null;
  labourPresent: number;
  engineersPresent: number;
  workCompleted: string;
  materialsReceived: string | null;
  materialsUsed: string | null;
  equipmentUsed: string | null;
  issues: string | null;
  safetyObservations: string | null;
  notes: string | null;
};

/** One report per site per day; saving again updates it. */
export async function saveDailyReport(actor: Actor & { id: string }, input: DailyReportInput): Promise<{ id: string; updated: boolean }> {
  if (!can(actor, "dailyReports.manage")) throw new ForbiddenError();
  await assertProjectAccess(actor, input.projectId);
  if (input.date > todayIST()) throw new AppError("A report cannot be for a future date.", { date: "Choose today or earlier." });
  const site = await db.site.findFirst({ where: { id: input.siteId, projectId: input.projectId } });
  if (!site) throw new AppError("Choose a site of this project.", { siteId: "Choose a site." });
  const existing = await db.dailyReport.findUnique({ where: { siteId_date: { siteId: input.siteId, date: toDbDate(input.date) } } });
  return db.$transaction(async (tx) => {
    const data = { ...input, date: toDbDate(input.date) };
    const r = existing
      ? await tx.dailyReport.update({ where: { id: existing.id }, data })
      : await tx.dailyReport.create({ data: { ...data, submittedById: actor.id } });
    await audit(tx, {
      actor,
      action: existing ? "UPDATE" : "CREATE",
      entityType: "DailyReport",
      entityId: r.id,
      projectId: input.projectId,
      summary: `${existing ? "updated" : "submitted"} the daily report for ${site.name} on ${formatDate(input.date)} (${input.labourPresent} workers present)`,
    });
    return { id: r.id, updated: Boolean(existing) };
  });
}

/** Projects with work going on that have no report for a day. */
export async function missingReports(user: Actor & { id: string }, date: ISODate) {
  const ids = await accessibleProjectIds(user);
  const projects = await db.project.findMany({
    where: { deletedAt: null, archivedAt: null, status: { in: ["ACTIVE", "DELAYED"] }, ...(ids === null ? {} : { id: { in: ids } }) },
    select: { id: true, name: true, dailyReports: { where: { date: toDbDate(date) }, select: { id: true } } },
    orderBy: { name: "asc" },
  });
  return projects.filter((p) => p.dailyReports.length === 0).map((p) => ({ id: p.id, name: p.name }));
}
