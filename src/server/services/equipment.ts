import "server-only";
import type { EquipmentStatus, EquipmentType, Ownership, RentalUnit } from "@/generated/prisma/enums";
import { formatDate, fromDbDate, fromDbDateOrNull, todayIST, toDbDate, type ISODate } from "@/lib/dates";
import { EQUIPMENT_STATUS } from "@/lib/labels";
import { formatINR, sumPaise, type Paise } from "@/lib/money";
import { can } from "@/lib/permissions";
import type { CurrentUser } from "@/server/auth/current-user";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { AppError, ForbiddenError, NotFoundError } from "@/server/errors";
import { accessibleProjectIds, assertProjectAccess } from "@/server/scope";
import { nextCode } from "@/server/services/sequence";

type Actor = Pick<CurrentUser, "id" | "name" | "role" | "permissions">;

export async function listEquipment(user: Actor & { id: string }, filter: { status?: EquipmentStatus; projectId?: string; q?: string } = {}) {
  const ids = await accessibleProjectIds(user);
  const rows = await db.equipment.findMany({
    where: {
      deletedAt: null,
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.projectId ? { currentProjectId: filter.projectId } : {}),
      ...(filter.q ? { OR: [{ name: { contains: filter.q, mode: "insensitive" as const } }, { code: { contains: filter.q, mode: "insensitive" as const } }] } : {}),
    },
    orderBy: [{ status: "asc" }, { name: "asc" }],
    include: {
      currentProject: { select: { id: true, name: true } },
      supplier: { select: { id: true, name: true } },
      maintenance: { where: { nextDueDate: { not: null } }, orderBy: { date: "desc" }, take: 1, select: { nextDueDate: true } },
    },
  });
  const today = todayIST();
  return rows
    .filter((e) => ids === null || !e.currentProjectId || ids.includes(e.currentProjectId))
    .map((e) => {
      const nextService = fromDbDateOrNull(e.maintenance[0]?.nextDueDate);
      return { ...e, purchaseDate: fromDbDateOrNull(e.purchaseDate), nextService, serviceDue: nextService !== null && nextService <= today };
    });
}

export type EquipmentRow = Awaited<ReturnType<typeof listEquipment>>[number];

export async function equipmentOptions() {
  return db.equipment.findMany({ where: { deletedAt: null, status: { not: "RETURNED" } }, orderBy: { name: "asc" }, select: { id: true, name: true, code: true } });
}

export async function getEquipment(user: Actor & { id: string }, id: string) {
  const e = await db.equipment.findFirst({
    where: { id, deletedAt: null },
    include: {
      currentProject: { select: { id: true, name: true } },
      supplier: { select: { id: true, name: true, phone: true } },
      usage: { orderBy: { date: "desc" }, take: 60, include: { project: { select: { id: true, name: true } } } },
      maintenance: { orderBy: { date: "desc" } },
      expenses: { orderBy: { date: "desc" }, take: 60, include: { category: { select: { name: true } }, project: { select: { name: true } } } },
    },
  });
  if (!e) return null;
  const ids = await accessibleProjectIds(user);
  if (ids !== null && e.currentProjectId && !ids.includes(e.currentProjectId)) return null;
  const totalHours = e.usage.reduce((s, u) => s + Number(u.hours ?? 0), 0);
  const totalFuel = e.usage.reduce((s, u) => s + Number(u.fuelLitres ?? 0), 0);
  return {
    ...e,
    purchaseDate: fromDbDateOrNull(e.purchaseDate),
    usage: e.usage.map((u) => ({ ...u, date: fromDbDate(u.date), hours: u.hours?.toString() ?? null, fuelLitres: u.fuelLitres?.toString() ?? null })),
    maintenance: e.maintenance.map((m) => ({ ...m, date: fromDbDate(m.date), nextDueDate: fromDbDateOrNull(m.nextDueDate) })),
    expenses: e.expenses.map((x) => ({ ...x, date: fromDbDate(x.date) })),
    totals: { hours: totalHours, fuelLitres: totalFuel, costPaise: sumPaise(e.expenses.map((x) => x.amountPaise)) },
  };
}

export type EquipmentInput = {
  name: string;
  type: EquipmentType;
  ownership: Ownership;
  supplierId: string | null;
  rentalRatePaise: Paise | null;
  rentalUnit: RentalUnit | null;
  registrationNo: string | null;
  purchaseDate: ISODate | null;
  purchaseCostPaise: Paise | null;
  operatorName: string | null;
  notes: string | null;
};

function equipmentData(input: EquipmentInput) {
  const rented = input.ownership === "RENTED";
  return {
    ...input,
    supplierId: rented ? input.supplierId : null,
    rentalRatePaise: rented ? input.rentalRatePaise : null,
    rentalUnit: rented ? input.rentalUnit : null,
    purchaseDate: !rented && input.purchaseDate ? toDbDate(input.purchaseDate) : null,
    purchaseCostPaise: rented ? null : input.purchaseCostPaise,
  };
}

export async function createEquipment(actor: Actor & { id: string }, input: EquipmentInput): Promise<{ id: string }> {
  if (!can(actor, "equipment.manage")) throw new ForbiddenError();
  if (input.ownership === "RENTED" && !input.rentalRatePaise) throw new AppError("Enter the rent.", { rentalRatePaise: "Enter the rent." });
  return db.$transaction(async (tx) => {
    const e = await tx.equipment.create({ data: { ...equipmentData(input), code: await nextCode(tx, "equipment") } });
    await audit(tx, {
      actor,
      action: "CREATE",
      entityType: "Equipment",
      entityId: e.id,
      summary: `added ${input.ownership === "RENTED" ? "rented" : "own"} equipment ${e.code} "${e.name}"${e.rentalRatePaise ? ` at ${formatINR(e.rentalRatePaise, { paise: false })} per ${e.rentalUnit?.toLowerCase()}` : ""}`,
    });
    return { id: e.id };
  });
}

export async function updateEquipment(actor: Actor & { id: string }, id: string, input: EquipmentInput): Promise<void> {
  if (!can(actor, "equipment.manage")) throw new ForbiddenError();
  const before = await db.equipment.findFirst({ where: { id, deletedAt: null } });
  if (!before) throw new NotFoundError("equipment");
  await db.$transaction(async (tx) => {
    const after = await tx.equipment.update({ where: { id }, data: equipmentData(input) });
    await audit(tx, { actor, action: "UPDATE", entityType: "Equipment", entityId: id, summary: `updated equipment ${before.code} "${after.name}"`, before, after });
  });
}

/** Move to a site, mark in repair, send back a rented machine… */
export async function setEquipmentStatus(actor: Actor & { id: string }, id: string, input: { status: EquipmentStatus; projectId: string | null; note: string | null }): Promise<void> {
  if (!can(actor, "equipment.manage")) throw new ForbiddenError();
  const e = await db.equipment.findFirst({ where: { id, deletedAt: null } });
  if (!e) throw new NotFoundError("equipment");
  if (input.status === "IN_USE" && !input.projectId) throw new AppError("Choose the site where it is being used.", { projectId: "Choose a site." });
  if (input.projectId) await assertProjectAccess(actor, input.projectId);
  const projectId = input.status === "IN_USE" ? input.projectId : input.status === "RETURNED" ? null : (input.projectId ?? e.currentProjectId);
  await db.$transaction(async (tx) => {
    await tx.equipment.update({ where: { id }, data: { status: input.status, currentProjectId: projectId } });
    const project = projectId ? await tx.project.findUnique({ where: { id: projectId }, select: { name: true } }) : null;
    await audit(tx, {
      actor,
      action: "STATUS_CHANGE",
      entityType: "Equipment",
      entityId: id,
      projectId,
      summary: `marked ${e.code} "${e.name}" as ${EQUIPMENT_STATUS[input.status].label.toLowerCase()}${project ? ` at ${project.name}` : ""}${input.note ? ` — "${input.note}"` : ""}`,
    });
  });
}

export async function recordUsage(
  actor: Actor & { id: string },
  input: { equipmentId: string; projectId: string; date: ISODate; hours: string | null; fuelLitres: string | null; operatorName: string | null; notes: string | null },
): Promise<void> {
  if (!can(actor, "equipment.manage")) throw new ForbiddenError();
  await assertProjectAccess(actor, input.projectId);
  const e = await db.equipment.findFirst({ where: { id: input.equipmentId, deletedAt: null } });
  if (!e) throw new NotFoundError("equipment");
  if (!input.hours && !input.fuelLitres) throw new AppError("Enter the hours used or the fuel filled.", { hours: "Enter hours or fuel." });
  if (input.date > todayIST()) throw new AppError("Usage cannot be in the future.", { date: "Choose today or earlier." });
  await db.$transaction(async (tx) => {
    await tx.equipmentUsage.create({ data: { ...input, date: toDbDate(input.date) } });
    await audit(tx, {
      actor,
      action: "CREATE",
      entityType: "EquipmentUsage",
      entityId: input.equipmentId,
      projectId: input.projectId,
      summary: `logged ${[input.hours && `${input.hours} hours`, input.fuelLitres && `${input.fuelLitres} L fuel`].filter(Boolean).join(" and ")} for ${e.name} on ${formatDate(input.date)}`,
    });
  });
}

export async function recordMaintenance(
  actor: Actor & { id: string },
  input: { equipmentId: string; date: ISODate; description: string; nextDueDate: ISODate | null; notes: string | null },
): Promise<void> {
  if (!can(actor, "equipment.manage")) throw new ForbiddenError();
  const e = await db.equipment.findFirst({ where: { id: input.equipmentId, deletedAt: null } });
  if (!e) throw new NotFoundError("equipment");
  if (input.nextDueDate && input.nextDueDate <= input.date) throw new AppError("The next service must be after this one.", { nextDueDate: "Choose a later date." });
  await db.$transaction(async (tx) => {
    await tx.equipmentMaintenance.create({ data: { ...input, date: toDbDate(input.date), nextDueDate: input.nextDueDate ? toDbDate(input.nextDueDate) : null } });
    await audit(tx, {
      actor,
      action: "CREATE",
      entityType: "EquipmentMaintenance",
      entityId: input.equipmentId,
      summary: `recorded service of ${e.name}: "${input.description}"${input.nextDueDate ? `, next due ${formatDate(input.nextDueDate)}` : ""}`,
    });
  });
}

/** Equipment used at a site on one day — for the daily report. */
export async function usageOn(projectId: string, date: ISODate) {
  const rows = await db.equipmentUsage.findMany({ where: { projectId, date: toDbDate(date) }, include: { equipment: { select: { name: true } } } });
  return rows.map((u) => `${u.equipment.name}${u.hours ? ` (${u.hours.toString()} h)` : ""}${u.fuelLitres ? ` · ${u.fuelLitres.toString()} L fuel` : ""}`);
}
