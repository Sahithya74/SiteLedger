import "server-only";
import type { EngineerFormInput } from "@/features/engineers/schemas";
import type { EngineerTaskKind, WorkStatus } from "@/generated/prisma/enums";
import { addMonths, endOfMonth, financialYear, fromDbDate, fromDbDateOrNull, startOfMonth, todayIST, toDbDate } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { can } from "@/lib/permissions";
import type { CurrentUser } from "@/server/auth/current-user";
import { audit, describeChanges } from "@/server/audit";
import { db } from "@/server/db";
import { ForbiddenError, NotFoundError } from "@/server/errors";
import { accessibleProjectIds, projectWhere } from "@/server/scope";
import { nextCode } from "@/server/services/sequence";

export async function listEngineers(user: CurrentUser, options: { q?: string; showInactive?: boolean } = {}) {
  const q = options.q?.trim();
  const today = toDbDate(todayIST());
  const engineers = await db.engineer.findMany({
    where: {
      deletedAt: null,
      ...(options.showInactive ? {} : { isActive: true }),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { phone: { contains: q } },
              { role: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      phone: true,
      role: true,
      qualification: true,
      isActive: true,
      payFrequency: true,
      salaryPaise: true,
      dailyWagePaise: true,
      projects: {
        where: { project: { ...projectWhere(user), archivedAt: null } },
        select: { project: { select: { id: true, name: true, status: true } } },
      },
      workItems: {
        where: { deletedAt: null, status: { not: "COMPLETED" }, project: projectWhere(user) },
        select: { id: true, expectedEndDate: true },
      },
    },
  });
  const showPay = can(user, "wages.view");
  return engineers.map((e) => ({
    id: e.id,
    code: e.code,
    name: e.name,
    phone: e.phone,
    role: e.role,
    qualification: e.qualification,
    isActive: e.isActive,
    payFrequency: e.payFrequency,
    salaryPaise: showPay ? e.salaryPaise : null,
    dailyWagePaise: showPay ? e.dailyWagePaise : null,
    projects: e.projects.map((p) => p.project),
    openWork: e.workItems.length,
    overdueWork: e.workItems.filter((w) => w.expectedEndDate && w.expectedEndDate < today).length,
  }));
}

export async function getEngineer(user: CurrentUser, id: string) {
  const engineer = await db.engineer.findFirst({
    where: { id, deletedAt: null },
    include: {
      projects: {
        where: { project: projectWhere(user) },
        include: { project: { select: { id: true, name: true, status: true, city: true } } },
      },
      workItems: {
        where: { deletedAt: null, project: projectWhere(user) },
        orderBy: [{ status: "asc" }, { expectedEndDate: "asc" }],
        select: {
          id: true,
          name: true,
          status: true,
          priority: true,
          percentComplete: true,
          expectedEndDate: true,
          project: { select: { id: true, name: true } },
          parent: { select: { name: true } },
        },
      },
    },
  });
  if (!engineer) return null;
  const showPay = can(user, "wages.view");
  return {
    ...engineer,
    joiningDate: fromDbDateOrNull(engineer.joiningDate),
    salaryPaise: showPay ? engineer.salaryPaise : null,
    dailyWagePaise: showPay ? engineer.dailyWagePaise : null,
    workItems: engineer.workItems.map((w) => ({ ...w, expectedEndDate: fromDbDateOrNull(w.expectedEndDate) })),
  };
}

export type EngineerDetail = NonNullable<Awaited<ReturnType<typeof getEngineer>>>;

function engineerData(input: EngineerFormInput) {
  const { projectIds: _projectIds, joiningDate, ...rest } = input;
  return { ...rest, joiningDate: joiningDate ? toDbDate(joiningDate) : null };
}

/** Keeps only project ids the user is allowed to see. */
async function allowedProjectIds(user: CurrentUser, ids: string[]): Promise<string[]> {
  const scope = await accessibleProjectIds(user);
  const unique = [...new Set(ids)];
  const existing = await db.project.findMany({
    where: { id: { in: unique }, deletedAt: null },
    select: { id: true },
  });
  return existing.map((p) => p.id).filter((id) => scope === null || scope.includes(id));
}

export async function createEngineer(actor: CurrentUser, input: EngineerFormInput): Promise<{ id: string }> {
  if (!can(actor, "engineers.manage")) throw new ForbiddenError();
  const data = engineerData(input);
  if (!can(actor, "wages.view")) {
    data.salaryPaise = 0n;
    data.dailyWagePaise = 0n;
  }
  const projectIds = await allowedProjectIds(actor, input.projectIds);
  return db.$transaction(async (tx) => {
    const code = await nextCode(tx, "engineer");
    const engineer = await tx.engineer.create({
      data: { ...data, code, projects: { create: projectIds.map((projectId) => ({ projectId })) } },
    });
    await audit(tx, {
      actor,
      action: "CREATE",
      entityType: "Engineer",
      entityId: engineer.id,
      summary: `added engineer ${engineer.name}${engineer.role ? ` (${engineer.role})` : ""}`,
      after: engineer,
    });
    return { id: engineer.id };
  });
}

const ENGINEER_FIELDS = [
  { key: "name", label: "Name" },
  { key: "phone", label: "Phone" },
  { key: "altPhone", label: "Other phone" },
  { key: "email", label: "Email" },
  { key: "qualification", label: "Qualification" },
  { key: "role", label: "Role" },
  { key: "joiningDate", label: "Joining date", format: (v: unknown) => (v instanceof Date ? fromDbDateOrNull(v)! : "blank") },
  { key: "payFrequency", label: "Payment frequency" },
  { key: "salaryPaise", label: "Monthly salary", format: (v: unknown) => formatINR(v as bigint) },
  { key: "dailyWagePaise", label: "Daily wage", format: (v: unknown) => formatINR(v as bigint) },
  { key: "responsibilities", label: "Responsibilities" },
  { key: "notes", label: "Notes" },
] as const;

export async function updateEngineer(actor: CurrentUser, id: string, input: EngineerFormInput): Promise<void> {
  if (!can(actor, "engineers.manage")) throw new ForbiddenError();
  const existing = await db.engineer.findFirst({
    where: { id, deletedAt: null },
    include: { projects: { select: { projectId: true } } },
  });
  if (!existing) throw new NotFoundError("engineer");
  const data = engineerData(input);
  if (!can(actor, "wages.view")) {
    data.salaryPaise = existing.salaryPaise;
    data.dailyWagePaise = existing.dailyWagePaise;
  }

  // Only change assignments for projects this user can see; leave the rest alone.
  const scope = await accessibleProjectIds(actor);
  const wanted = await allowedProjectIds(actor, input.projectIds);
  const current = existing.projects.map((p) => p.projectId);
  const visibleCurrent = current.filter((pid) => scope === null || scope.includes(pid));
  const toAdd = wanted.filter((pid) => !current.includes(pid));
  const toRemove = visibleCurrent.filter((pid) => !wanted.includes(pid));

  const changes = describeChanges(existing, data, [...ENGINEER_FIELDS]);
  if (!changes.changed && toAdd.length === 0 && toRemove.length === 0) return;

  const projectNames = await db.project.findMany({
    where: { id: { in: [...toAdd, ...toRemove] } },
    select: { id: true, name: true },
  });
  const nameOf = (pid: string) => projectNames.find((p) => p.id === pid)?.name ?? "a project";
  const parts = [changes.text];
  if (toAdd.length) parts.push(`assigned to ${toAdd.map(nameOf).join(", ")}`);
  if (toRemove.length) parts.push(`removed from ${toRemove.map(nameOf).join(", ")}`);

  await db.$transaction(async (tx) => {
    await tx.engineer.update({ where: { id }, data });
    if (toRemove.length) await tx.engineerProject.deleteMany({ where: { engineerId: id, projectId: { in: toRemove } } });
    if (toAdd.length) await tx.engineerProject.createMany({ data: toAdd.map((projectId) => ({ engineerId: id, projectId })) });
    await audit(tx, {
      actor,
      action: "UPDATE",
      entityType: "Engineer",
      entityId: id,
      summary: `changed engineer ${existing.name}: ${parts.filter(Boolean).join("; ")}`,
      before: { ...changes.before, projectIds: current },
      after: { ...changes.after, projectIds: [...current.filter((p) => !toRemove.includes(p)), ...toAdd] },
    });
  });
}

export async function setEngineerActive(actor: CurrentUser, id: string, active: boolean): Promise<void> {
  if (!can(actor, "engineers.manage")) throw new ForbiddenError();
  const existing = await db.engineer.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new NotFoundError("engineer");
  if (existing.isActive === active) return;
  await db.$transaction(async (tx) => {
    await tx.engineer.update({ where: { id }, data: { isActive: active } });
    await audit(tx, {
      actor,
      action: "STATUS_CHANGE",
      entityType: "Engineer",
      entityId: id,
      summary: `${active ? "re-activated" : "marked as no longer working"} engineer ${existing.name}`,
    });
  });
}

export async function engineerOptions(projectId?: string) {
  const engineers = await db.engineer.findMany({
    where: { deletedAt: null, isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, role: true, projects: projectId ? { where: { projectId }, select: { projectId: true } } : false },
  });
  // Engineers already on the project are listed first.
  return engineers
    .map((e) => ({ id: e.id, name: e.name, role: e.role, onProject: Array.isArray(e.projects) && e.projects.length > 0 }))
    .sort((a, b) => Number(b.onProject) - Number(a.onProject) || a.name.localeCompare(b.name));
}

// ─────────────────────────────────────────────────────────────────────────────
// Tasks, site visits and pay (Stage 2)
// ─────────────────────────────────────────────────────────────────────────────

export async function listEngineerTasks(user: CurrentUser, filter: { engineerId?: string; projectId?: string; openOnly?: boolean } = {}) {
  const rows = await db.engineerTask.findMany({
    where: {
      ...(filter.engineerId ? { engineerId: filter.engineerId } : {}),
      ...(filter.projectId ? { projectId: filter.projectId } : {}),
      ...(filter.openOnly ? { status: { not: "COMPLETED" } } : {}),
      project: projectWhere(user),
    },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }],
    include: { engineer: { select: { id: true, name: true, phone: true } }, project: { select: { id: true, name: true } }, workItem: { select: { name: true } } },
  });
  const today = todayIST();
  return rows.map((t) => {
    const due = fromDbDateOrNull(t.dueDate);
    return { ...t, dueDate: due, completedOn: fromDbDateOrNull(t.completedOn), overdue: t.status !== "COMPLETED" && due !== null && due < today };
  });
}

export type EngineerTaskRow = Awaited<ReturnType<typeof listEngineerTasks>>[number];

export async function createEngineerTask(
  actor: CurrentUser,
  input: { engineerId: string; projectId: string; workItemId: string | null; kind: EngineerTaskKind; title: string; description: string | null; dueDate: string | null },
): Promise<void> {
  if (!can(actor, "engineers.manage")) throw new ForbiddenError();
  const scope = await accessibleProjectIds(actor);
  if (scope !== null && !scope.includes(input.projectId)) throw new NotFoundError("project");
  const engineer = await db.engineer.findFirst({ where: { id: input.engineerId, deletedAt: null } });
  if (!engineer) throw new NotFoundError("engineer");
  await db.$transaction(async (tx) => {
    const task = await tx.engineerTask.create({ data: { ...input, dueDate: input.dueDate ? toDbDate(input.dueDate) : null } });
    await audit(tx, {
      actor,
      action: "CREATE",
      entityType: "EngineerTask",
      entityId: task.id,
      projectId: input.projectId,
      summary: `gave ${engineer.name} a ${input.kind === "SITE_VISIT" ? "site visit" : input.kind.toLowerCase()}: "${input.title}"${input.dueDate ? ` by ${input.dueDate}` : ""}`,
    });
  });
}

export async function updateEngineerTask(actor: CurrentUser, id: string, input: { status: WorkStatus; notes: string | null }): Promise<void> {
  if (!can(actor, "engineers.manage")) throw new ForbiddenError();
  const task = await db.engineerTask.findUnique({ where: { id }, include: { engineer: { select: { name: true } } } });
  if (!task) throw new NotFoundError("task");
  const scope = await accessibleProjectIds(actor);
  if (scope !== null && !scope.includes(task.projectId)) throw new NotFoundError("task");
  await db.$transaction(async (tx) => {
    await tx.engineerTask.update({
      where: { id },
      data: { status: input.status, notes: input.notes ?? task.notes, completedOn: input.status === "COMPLETED" ? toDbDate(todayIST()) : null },
    });
    await audit(tx, {
      actor,
      action: "STATUS_CHANGE",
      entityType: "EngineerTask",
      entityId: id,
      projectId: task.projectId,
      summary: `marked ${task.engineer.name}'s task "${task.title}" as ${input.status.toLowerCase().replace("_", " ")}`,
    });
  });
}

/**
 * Pay position for an engineer this financial year.
 * Monthly/weekly: expected = salary × completed months (an estimate; month
 * of joining counted from the joining date). Daily: earned from attendance.
 */
export async function engineerPay(id: string) {
  const engineer = await db.engineer.findUniqueOrThrow({ where: { id } });
  const today = todayIST();
  const fy = financialYear(today);
  const [salaryPaid, wagesPaid, earned, recent] = await Promise.all([
    db.payment.aggregate({ where: { engineerId: id, purpose: "SALARY", date: { gte: toDbDate(fy.start) } }, _sum: { amountPaise: true } }),
    db.payment.aggregate({ where: { engineerId: id, purpose: { in: ["WAGES", "ADVANCE"] } }, _sum: { amountPaise: true } }),
    db.attendance.aggregate({ where: { engineerId: id }, _sum: { wagePaise: true, adjustmentPaise: true } }),
    db.payment.findMany({ where: { engineerId: id }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 50, include: { account: { select: { name: true } }, project: { select: { name: true } } } }),
  ]);
  let expectedPaise = 0n;
  let months = 0;
  if (engineer.payFrequency !== "DAILY" && engineer.salaryPaise > 0n) {
    const start = engineer.joiningDate && fromDbDate(engineer.joiningDate) > fy.start ? fromDbDate(engineer.joiningDate) : fy.start;
    // Count whole months that have ended since the start.
    let cursor = startOfMonth(start);
    while (endOfMonth(cursor) < today) {
      months++;
      cursor = addMonths(cursor, 1);
    }
    const perMonth = engineer.payFrequency === "WEEKLY" ? (engineer.salaryPaise * 52n) / 12n : engineer.salaryPaise;
    expectedPaise = perMonth * BigInt(months);
  }
  const salaryPaidPaise = salaryPaid._sum.amountPaise ?? 0n;
  const earnedPaise = (earned._sum.wagePaise ?? 0n) + (earned._sum.adjustmentPaise ?? 0n);
  const wagesPaidPaise = wagesPaid._sum.amountPaise ?? 0n;
  return {
    payFrequency: engineer.payFrequency,
    fyLabel: fy.label,
    months,
    expectedSalaryPaise: expectedPaise,
    salaryPaidPaise,
    salaryDuePaise: expectedPaise > salaryPaidPaise ? expectedPaise - salaryPaidPaise : 0n,
    earnedPaise,
    wagesPaidPaise,
    wagesDuePaise: earnedPaise > wagesPaidPaise ? earnedPaise - wagesPaidPaise : 0n,
    payments: recent.map((p) => ({ ...p, date: fromDbDate(p.date) })),
  };
}
