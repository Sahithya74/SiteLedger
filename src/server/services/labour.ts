import "server-only";
import Decimal from "decimal.js";
import type { LabourCategory } from "@/generated/prisma/enums";
import { addDays, fromDbDate, fromDbDateOrNull, todayIST, toDbDate, type ISODate } from "@/lib/dates";
import { LABOUR_CATEGORY } from "@/lib/labels";
import { formatINR, type Paise } from "@/lib/money";
import { can } from "@/lib/permissions";
import { dayFraction, workerBalance } from "@/lib/wages";
import type { CurrentUser } from "@/server/auth/current-user";
import { audit, describeChanges } from "@/server/audit";
import { db } from "@/server/db";
import { AppError, ForbiddenError, NotFoundError } from "@/server/errors";
import { accessibleProjectIds, assertProjectAccess, seesAllProjects } from "@/server/scope";
import { recordPayment } from "@/server/services/ledger";
import { nextCode } from "@/server/services/sequence";

type Actor = Pick<CurrentUser, "id" | "name" | "role" | "permissions">;

export type WorkerBalance = {
  earnedPaise: Paise;
  wagesPaidPaise: Paise;
  advancesPaise: Paise;
  balancePaise: Paise;
  pendingWagesPaise: Paise;
  advanceOutstandingPaise: Paise;
  daysWorked: string;
};

/** Earned (attendance) − wages paid − advances, per worker. */
export async function workerBalances(labourIds?: string[]): Promise<Map<string, WorkerBalance>> {
  const where = labourIds ? { labourId: { in: labourIds } } : { labourId: { not: null } };
  const [earned, paid, days] = await Promise.all([
    db.attendance.groupBy({ by: ["labourId"], where, _sum: { wagePaise: true, adjustmentPaise: true } }),
    db.payment.groupBy({ by: ["labourId", "purpose"], where: { ...where, purpose: { in: ["WAGES", "ADVANCE"] } }, _sum: { amountPaise: true } }),
    db.attendance.groupBy({ by: ["labourId", "status"], where: { ...where, status: { in: ["PRESENT", "HALF_DAY"] } }, _count: { _all: true } }),
  ]);
  const map = new Map<string, WorkerBalance>();
  const ids = new Set<string>([...earned.map((e) => e.labourId!), ...paid.map((p) => p.labourId!)].filter(Boolean));
  for (const id of ids) {
    const e = earned.find((x) => x.labourId === id);
    const earnedPaise = (e?._sum.wagePaise ?? 0n) + (e?._sum.adjustmentPaise ?? 0n);
    const wagesPaidPaise = paid.find((p) => p.labourId === id && p.purpose === "WAGES")?._sum.amountPaise ?? 0n;
    const advancesPaise = paid.find((p) => p.labourId === id && p.purpose === "ADVANCE")?._sum.amountPaise ?? 0n;
    const full = days.find((d) => d.labourId === id && d.status === "PRESENT")?._count._all ?? 0;
    const half = days.find((d) => d.labourId === id && d.status === "HALF_DAY")?._count._all ?? 0;
    map.set(id, {
      earnedPaise,
      wagesPaidPaise,
      advancesPaise,
      ...workerBalance({ earnedPaise, wagesPaidPaise, advancesPaise }),
      daysWorked: new Decimal(full).plus(new Decimal(half).times(0.5)).toString(),
    });
  }
  return map;
}

const EMPTY_BALANCE: WorkerBalance = {
  earnedPaise: 0n,
  wagesPaidPaise: 0n,
  advancesPaise: 0n,
  balancePaise: 0n,
  pendingWagesPaise: 0n,
  advanceOutstandingPaise: 0n,
  daysWorked: "0",
};

export async function listWorkers(
  user: Actor & { id: string },
  filter: { q?: string; category?: LabourCategory; projectId?: string; contractorId?: string; showInactive?: boolean; pendingOnly?: boolean } = {},
) {
  const ids = await accessibleProjectIds(user);
  const since = toDbDate(addDays(todayIST(), -45));
  const recent = await db.attendance.findMany({
    where: { labourId: { not: null }, date: { gte: since }, ...(ids === null ? {} : { projectId: { in: ids } }) },
    distinct: ["labourId"],
    orderBy: { date: "desc" },
    select: { labourId: true, projectId: true, date: true, project: { select: { name: true } } },
  });
  const lastSite = new Map(recent.map((r) => [r.labourId!, { projectId: r.projectId, name: r.project.name, date: fromDbDate(r.date) }]));
  const workers = await db.labour.findMany({
    where: {
      deletedAt: null,
      ...(filter.showInactive ? {} : { isActive: true }),
      ...(filter.category ? { category: filter.category } : {}),
      ...(filter.contractorId ? { contractorId: filter.contractorId } : {}),
      ...(filter.q ? { OR: [{ name: { contains: filter.q, mode: "insensitive" as const } }, { phone: { contains: filter.q } }, { code: { contains: filter.q, mode: "insensitive" as const } }] } : {}),
    },
    orderBy: { name: "asc" },
    include: { contractor: { select: { id: true, name: true } } },
  });
  // Managers who see only some projects see workers who worked there recently (or never worked anywhere yet).
  const visible = workers.filter((w) => seesAllProjects(user) || lastSite.has(w.id) || !recent.some((r) => r.labourId === w.id));
  const balances = await workerBalances(visible.map((w) => w.id));
  const showWages = can(user, "wages.view");
  return visible
    .map((w) => ({
      ...w,
      lastSite: lastSite.get(w.id) ?? null,
      balance: showWages ? (balances.get(w.id) ?? EMPTY_BALANCE) : null,
    }))
    .filter((w) => !filter.projectId || w.lastSite?.projectId === filter.projectId)
    .filter((w) => !filter.pendingOnly || (w.balance?.pendingWagesPaise ?? 0n) > 0n);
}

export type WorkerRow = Awaited<ReturnType<typeof listWorkers>>[number];

export async function workerOptions() {
  return db.labour.findMany({
    where: { deletedAt: null, isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, category: true, dailyWagePaise: true },
  });
}

export async function getWorker(user: Actor & { id: string }, id: string) {
  const worker = await db.labour.findFirst({ where: { id, deletedAt: null }, include: { contractor: { select: { id: true, name: true } } } });
  if (!worker) return null;
  const ids = await accessibleProjectIds(user);
  const [attendance, payments, balances] = await Promise.all([
    db.attendance.findMany({
      where: { labourId: id, ...(ids === null ? {} : { projectId: { in: ids } }) },
      orderBy: { date: "desc" },
      take: 90,
      include: { project: { select: { id: true, name: true } } },
    }),
    can(user, "wages.view")
      ? db.payment.findMany({ where: { labourId: id }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 100, include: { account: { select: { name: true } } } })
      : Promise.resolve([]),
    workerBalances([id]),
  ]);
  return {
    ...worker,
    joinedOn: fromDbDateOrNull(worker.joinedOn),
    attendance: attendance.map((a) => ({ ...a, date: fromDbDate(a.date) })),
    payments: payments.map((p) => ({ ...p, date: fromDbDate(p.date) })),
    balance: can(user, "wages.view") ? (balances.get(id) ?? EMPTY_BALANCE) : null,
  };
}

export type WorkerDetail = NonNullable<Awaited<ReturnType<typeof getWorker>>>;

type WorkerInput = {
  name: string;
  phone: string | null;
  category: LabourCategory;
  contractorId: string | null;
  dailyWagePaise: Paise;
  overtimeRatePaise: Paise;
  address: string | null;
  emergencyContact: string | null;
  upiId: string | null;
  joinedOn: ISODate | null;
  notes: string | null;
};

export async function createWorker(actor: Actor, input: WorkerInput): Promise<{ id: string }> {
  if (!can(actor, "labour.manage")) throw new ForbiddenError();
  return db.$transaction(async (tx) => {
    const worker = await tx.labour.create({
      data: { ...input, joinedOn: input.joinedOn ? toDbDate(input.joinedOn) : null, code: await nextCode(tx, "labour") },
    });
    await audit(tx, {
      actor,
      action: "CREATE",
      entityType: "Labour",
      entityId: worker.id,
      summary: `added worker ${worker.name} (${LABOUR_CATEGORY[worker.category]}, ${formatINR(worker.dailyWagePaise, { paise: false })}/day)`,
    });
    return { id: worker.id };
  });
}

export async function updateWorker(actor: Actor, id: string, input: WorkerInput): Promise<void> {
  if (!can(actor, "labour.manage")) throw new ForbiddenError();
  const existing = await db.labour.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new NotFoundError("worker");
  const data = { ...input, joinedOn: input.joinedOn ? toDbDate(input.joinedOn) : null };
  // Wage changes are owner/wage-viewer business.
  if (!can(actor, "wages.view")) {
    data.dailyWagePaise = existing.dailyWagePaise;
    data.overtimeRatePaise = existing.overtimeRatePaise;
  }
  const changes = describeChanges(existing, data, [
    { key: "name", label: "Name" },
    { key: "phone", label: "Phone" },
    { key: "category", label: "Type of work", format: (v) => LABOUR_CATEGORY[v as LabourCategory] },
    { key: "dailyWagePaise", label: "Daily wage", format: (v) => formatINR(v as bigint) },
    { key: "overtimeRatePaise", label: "Overtime rate", format: (v) => formatINR(v as bigint) },
    { key: "contractorId", label: "Contractor" },
  ]);
  await db.$transaction(async (tx) => {
    await tx.labour.update({ where: { id }, data });
    await audit(tx, {
      actor,
      action: "UPDATE",
      entityType: "Labour",
      entityId: id,
      summary: `updated worker ${existing.name}${changes.changed ? `: ${changes.text}` : ""}${changes.before.dailyWagePaise !== undefined ? " (applies from the next attendance; past days keep their old rate)" : ""}`,
      before: changes.before,
      after: changes.after,
    });
  });
}

export async function setWorkerActive(actor: Actor, id: string, active: boolean): Promise<void> {
  if (!can(actor, "labour.manage")) throw new ForbiddenError();
  const existing = await db.labour.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new NotFoundError("worker");
  await db.$transaction(async (tx) => {
    await tx.labour.update({ where: { id }, data: { isActive: active } });
    await audit(tx, { actor, action: "STATUS_CHANGE", entityType: "Labour", entityId: id, summary: `${active ? "re-activated" : "marked as left"} worker ${existing.name}` });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Attendance sheet
// ─────────────────────────────────────────────────────────────────────────────

export type SheetPerson = {
  type: "LABOUR" | "ENGINEER";
  id: string;
  name: string;
  detail: string;
  dailyWagePaise: Paise;
  status: "PRESENT" | "HALF_DAY" | "ABSENT" | null;
  overtimeHours: string;
  elsewhere: string | null; // marked at another project that day
  regular: boolean; // worked at this project recently
};

export async function attendanceSheet(user: Actor & { id: string }, projectId: string, date: ISODate) {
  await assertProjectAccess(user, projectId);
  const day = toDbDate(date);
  const since = toDbDate(addDays(date, -14));
  const [workers, engineers, marked, recent] = await Promise.all([
    db.labour.findMany({ where: { deletedAt: null, isActive: true }, orderBy: { name: "asc" }, include: { contractor: { select: { name: true } } } }),
    db.engineer.findMany({ where: { deletedAt: null, isActive: true, projects: { some: { projectId } } }, orderBy: { name: "asc" } }),
    db.attendance.findMany({ where: { date: day }, include: { project: { select: { name: true } } } }),
    db.attendance.findMany({ where: { projectId, date: { gte: since, lt: day } }, distinct: ["labourId", "engineerId"], select: { labourId: true, engineerId: true } }),
  ]);
  const recentIds = new Set(recent.flatMap((r) => [r.labourId, r.engineerId]).filter(Boolean) as string[]);
  const markOf = (type: "LABOUR" | "ENGINEER", id: string) => marked.find((m) => (type === "LABOUR" ? m.labourId === id : m.engineerId === id));
  const people: SheetPerson[] = [
    ...engineers.map((e): SheetPerson => {
      const m = markOf("ENGINEER", e.id);
      return {
        type: "ENGINEER",
        id: e.id,
        name: e.name,
        detail: e.role ?? "Engineer",
        dailyWagePaise: e.payFrequency === "DAILY" ? e.dailyWagePaise : 0n,
        status: m && m.projectId === projectId ? m.status : null,
        overtimeHours: m && m.projectId === projectId ? m.overtimeHours.toString() : "0",
        elsewhere: m && m.projectId !== projectId ? m.project.name : null,
        regular: true,
      };
    }),
    ...workers.map((w): SheetPerson => {
      const m = markOf("LABOUR", w.id);
      return {
        type: "LABOUR",
        id: w.id,
        name: w.name,
        detail: `${LABOUR_CATEGORY[w.category]}${w.contractor ? ` · ${w.contractor.name}` : ""}`,
        dailyWagePaise: w.dailyWagePaise,
        status: m && m.projectId === projectId ? m.status : null,
        overtimeHours: m && m.projectId === projectId ? m.overtimeHours.toString() : "0",
        elsewhere: m && m.projectId !== projectId ? m.project.name : null,
        regular: recentIds.has(w.id) || (m?.projectId === projectId),
      };
    }),
  ];
  people.sort((a, b) => Number(b.type === "ENGINEER") - Number(a.type === "ENGINEER") || Number(b.regular) - Number(a.regular) || a.name.localeCompare(b.name));
  return people;
}

/** Days, overtime and wages per worker for a period (weekly / monthly totals). */
export async function attendanceSummary(user: Actor & { id: string }, filter: { from: ISODate; to: ISODate; projectId?: string }) {
  const ids = await accessibleProjectIds(user);
  const rows = await db.attendance.findMany({
    where: {
      labourId: { not: null },
      date: { gte: toDbDate(filter.from), lte: toDbDate(filter.to) },
      ...(filter.projectId ? { projectId: filter.projectId } : ids === null ? {} : { projectId: { in: ids } }),
    },
    include: { labour: { select: { id: true, name: true, category: true } } },
  });
  const byWorker = new Map<string, { id: string; name: string; category: LabourCategory; days: Decimal; overtime: Decimal; wagesPaise: Paise; dates: Record<string, string> }>();
  for (const r of rows) {
    const w = r.labour!;
    const e = byWorker.get(w.id) ?? { id: w.id, name: w.name, category: w.category, days: new Decimal(0), overtime: new Decimal(0), wagesPaise: 0n, dates: {} };
    e.days = e.days.plus(dayFraction(r.status));
    e.overtime = e.overtime.plus(r.overtimeHours.toString());
    e.wagesPaise += r.wagePaise + r.adjustmentPaise;
    e.dates[fromDbDate(r.date)] = r.status;
    byWorker.set(w.id, e);
  }
  return [...byWorker.values()]
    .map((e) => ({ ...e, days: e.days.toString(), overtime: e.overtime.toString() }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ─────────────────────────────────────────────────────────────────────────────
// Wage settlement (weekly pay)
// ─────────────────────────────────────────────────────────────────────────────

export async function wageSheet(user: Actor & { id: string }, filter: { from: ISODate; to: ISODate; projectId?: string }) {
  if (!can(user, "wages.view")) throw new ForbiddenError();
  const summary = await attendanceSummary(user, filter);
  const balances = await workerBalances(summary.map((s) => s.id));
  return summary.map((s) => {
    const b = balances.get(s.id) ?? EMPTY_BALANCE;
    return {
      ...s,
      grossPaise: s.wagesPaise,
      pendingWagesPaise: b.pendingWagesPaise,
      advanceOutstandingPaise: b.advanceOutstandingPaise,
      // Pay what is owed overall: this already nets off any advance given.
      suggestedPaise: b.pendingWagesPaise,
    };
  });
}

export type WageSheetLine = Awaited<ReturnType<typeof wageSheet>>[number];

/**
 * Pays a wage sheet in one go: saves the settlement (who got how much for
 * which period) and records one wage payment per worker.
 */
export async function payWageSheet(
  actor: Actor & { id: string },
  input: {
    from: ISODate;
    to: ISODate;
    projectId: string | null;
    date: ISODate;
    method: "BANK_TRANSFER" | "UPI" | "CHEQUE" | "CASH" | "OTHER";
    accountId: string;
    reference: string | null;
    notes: string | null;
    lines: { labourId: string; amountPaise: Paise }[];
  },
): Promise<{ id: string; count: number; totalPaise: Paise }> {
  if (!can(actor, "payments.record") || !can(actor, "wages.view")) throw new ForbiddenError();
  const sheet = await wageSheet(actor, { from: input.from, to: input.to, projectId: input.projectId ?? undefined });
  const lines = input.lines.filter((l) => l.amountPaise > 0n);
  if (lines.length === 0) throw new AppError("Enter an amount for at least one worker.");
  for (const l of lines) {
    if (!sheet.some((s) => s.id === l.labourId)) throw new AppError("A worker on the sheet did not work in this period.");
  }
  const total = lines.reduce((s, l) => s + l.amountPaise, 0n);
  const account = await db.bankAccount.findUnique({ where: { id: input.accountId } });
  if (!account || !account.isActive || account.closedAt) throw new AppError("Choose an active bank or cash account.", { accountId: "Choose an account." });
  const settlement = await db.$transaction(async (tx) => {
    const created = await tx.wageSettlement.create({
      data: {
        number: await nextCode(tx, "wageSettlement"),
        periodFrom: toDbDate(input.from),
        periodTo: toDbDate(input.to),
        projectId: input.projectId,
        status: "FINALISED",
        totalGrossPaise: sheet.reduce((s, x) => s + x.grossPaise, 0n),
        totalDeductionsPaise: 0n,
        totalNetPaise: total,
        notes: input.notes,
        finalisedAt: new Date(),
        createdById: actor.id,
        lines: {
          create: sheet.map((s) => {
            const paid = lines.find((l) => l.labourId === s.id)?.amountPaise ?? 0n;
            const advanceUsed = s.grossPaise > paid && s.advanceOutstandingPaise > 0n ? s.grossPaise - paid : 0n;
            return {
              labourId: s.id,
              daysPresent: s.days,
              overtimeHours: s.overtime,
              grossPaise: s.grossPaise,
              advanceDeductedPaise: advanceUsed < s.advanceOutstandingPaise ? advanceUsed : s.advanceOutstandingPaise,
              netPaise: paid,
            };
          }),
        },
      },
      include: { lines: true },
    });
    await audit(tx, {
      actor,
      action: "CREATE",
      entityType: "WageSettlement",
      entityId: created.id,
      projectId: input.projectId,
      summary: `settled wages for ${input.from} to ${input.to}: ${formatINR(total)} to ${lines.length} worker${lines.length === 1 ? "" : "s"}`,
    });
    return created;
  });
  for (const l of lines) {
    const line = settlement.lines.find((x) => x.labourId === l.labourId)!;
    await recordPayment(actor, {
      date: input.date,
      amountPaise: l.amountPaise,
      payeeType: "LABOUR",
      labourId: l.labourId,
      purpose: "WAGES",
      projectId: input.projectId,
      wageSettlementLineId: line.id,
      method: input.method,
      accountId: input.accountId,
      reference: input.reference,
      notes: `Wages ${input.from} to ${input.to} (${settlement.number})`,
    });
  }
  return { id: settlement.id, count: lines.length, totalPaise: total };
}

export async function recentSettlements(user: Actor & { id: string }) {
  const ids = await accessibleProjectIds(user);
  return db.wageSettlement.findMany({
    where: ids === null ? {} : { OR: [{ projectId: { in: ids } }, { projectId: null, createdById: user.id }] },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { project: { select: { name: true } }, createdBy: { select: { name: true } }, _count: { select: { lines: true } } },
  });
}
