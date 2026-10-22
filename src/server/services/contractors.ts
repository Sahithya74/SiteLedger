import "server-only";
import Decimal from "decimal.js";
import type { LabourCategory, WorkOrderStatus, WorkOrderType } from "@/generated/prisma/enums";
import { formatDate, fromDbDate, fromDbDateOrNull, toDbDate, type ISODate } from "@/lib/dates";
import { formatINR, multiplyQtyRate, percentOf, sumPaise, type Paise } from "@/lib/money";
import { can } from "@/lib/permissions";
import type { CurrentUser } from "@/server/auth/current-user";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { AppError, ForbiddenError, NotFoundError } from "@/server/errors";
import { accessibleProjectIds, assertProjectAccess } from "@/server/scope";
import { nextCode } from "@/server/services/sequence";

type Actor = Pick<CurrentUser, "id" | "name" | "role" | "permissions">;

/** Contractor balance = approved bills (net of retention/TDS) − payments (incl. advances). */
async function contractorBalances(ids?: string[]) {
  const where = ids ? { contractorId: { in: ids } } : {};
  const [billed, paid] = await Promise.all([
    db.contractorBill.groupBy({ by: ["contractorId"], where: { ...where, status: "APPROVED" }, _sum: { netPaise: true, grossPaise: true, retentionPaise: true } }),
    db.payment.groupBy({ by: ["contractorId"], where: { ...where, payeeType: "CONTRACTOR" }, _sum: { amountPaise: true } }),
  ]);
  const map = new Map<string, { billedPaise: Paise; retentionHeldPaise: Paise; paidPaise: Paise; owedPaise: Paise }>();
  for (const b of billed) {
    map.set(b.contractorId, { billedPaise: b._sum.netPaise ?? 0n, retentionHeldPaise: b._sum.retentionPaise ?? 0n, paidPaise: 0n, owedPaise: 0n });
  }
  for (const p of paid) {
    if (!p.contractorId) continue;
    const e = map.get(p.contractorId) ?? { billedPaise: 0n, retentionHeldPaise: 0n, paidPaise: 0n, owedPaise: 0n };
    e.paidPaise = p._sum.amountPaise ?? 0n;
    map.set(p.contractorId, e);
  }
  for (const e of map.values()) e.owedPaise = e.billedPaise - e.paidPaise;
  return map;
}

const EMPTY = { billedPaise: 0n, retentionHeldPaise: 0n, paidPaise: 0n, owedPaise: 0n };

export async function listContractors(filter: { q?: string; showInactive?: boolean } = {}) {
  const rows = await db.labourContractor.findMany({
    where: {
      deletedAt: null,
      ...(filter.showInactive ? {} : { isActive: true }),
      ...(filter.q ? { OR: [{ name: { contains: filter.q, mode: "insensitive" as const } }, { phone: { contains: filter.q } }] } : {}),
    },
    orderBy: { name: "asc" },
    include: { _count: { select: { workers: { where: { isActive: true, deletedAt: null } }, workOrders: { where: { status: "OPEN" } } } } },
  });
  const balances = await contractorBalances(rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, balance: balances.get(r.id) ?? EMPTY }));
}

export async function contractorOptions() {
  return db.labourContractor.findMany({ where: { deletedAt: null, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } });
}

export async function getContractor(user: Actor & { id: string }, id: string) {
  const contractor = await db.labourContractor.findFirst({
    where: { id, deletedAt: null },
    include: { workers: { where: { deletedAt: null }, orderBy: { name: "asc" } } },
  });
  if (!contractor) return null;
  const ids = await accessibleProjectIds(user);
  const scope = ids === null ? {} : { projectId: { in: ids } };
  const [workOrders, bills, payments, balances] = await Promise.all([
    db.workOrder.findMany({
      where: { contractorId: id, ...scope },
      orderBy: { createdAt: "desc" },
      include: { project: { select: { id: true, name: true } }, workItem: { select: { name: true } }, bills: { where: { status: "APPROVED" }, select: { grossPaise: true, quantity: true } } },
    }),
    db.contractorBill.findMany({
      where: { contractorId: id, ...scope },
      orderBy: { billDate: "desc" },
      include: { project: { select: { id: true, name: true } }, workOrder: { select: { number: true, title: true } }, payments: { select: { amountPaise: true } } },
    }),
    db.payment.findMany({ where: { contractorId: id }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 100, include: { account: { select: { name: true } }, contractorBill: { select: { number: true } } } }),
    contractorBalances([id]),
  ]);
  return {
    ...contractor,
    balance: balances.get(id) ?? EMPTY,
    workOrders: workOrders.map((w) => ({
      ...w,
      startDate: fromDbDateOrNull(w.startDate),
      endDate: fromDbDateOrNull(w.endDate),
      valuePaise: w.type === "LUMP_SUM" ? (w.lumpSumPaise ?? 0n) : w.quantity && w.ratePaise ? multiplyQtyRate(w.quantity.toString(), w.ratePaise) : null,
      billedPaise: sumPaise(w.bills.map((b) => b.grossPaise)),
      billedQty: w.bills.reduce((s, b) => s.plus(b.quantity?.toString() ?? "0"), new Decimal(0)).toString(),
    })),
    bills: bills.map((b) => ({ ...b, billDate: fromDbDate(b.billDate), paidPaise: sumPaise(b.payments.map((p) => p.amountPaise)) })),
    payments: payments.map((p) => ({ ...p, date: fromDbDate(p.date) })),
  };
}

export type ContractorDetail = NonNullable<Awaited<ReturnType<typeof getContractor>>>;

type ContractorInput = { name: string; phone: string | null; trade: LabourCategory | null; address: string | null; pan: string | null; gstin: string | null; notes: string | null };

export async function createContractor(actor: Actor, input: ContractorInput): Promise<{ id: string }> {
  if (!can(actor, "labour.manage")) throw new ForbiddenError();
  return db.$transaction(async (tx) => {
    const c = await tx.labourContractor.create({ data: { ...input, code: await nextCode(tx, "contractor") } });
    await audit(tx, { actor, action: "CREATE", entityType: "LabourContractor", entityId: c.id, summary: `added labour contractor ${c.name}` });
    return { id: c.id };
  });
}

export async function updateContractor(actor: Actor, id: string, input: ContractorInput): Promise<void> {
  if (!can(actor, "labour.manage")) throw new ForbiddenError();
  const existing = await db.labourContractor.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new NotFoundError("contractor");
  await db.$transaction(async (tx) => {
    await tx.labourContractor.update({ where: { id }, data: input });
    await audit(tx, { actor, action: "UPDATE", entityType: "LabourContractor", entityId: id, summary: `updated labour contractor ${existing.name}` });
  });
}

export async function createWorkOrder(
  actor: Actor & { id: string },
  input: {
    contractorId: string;
    projectId: string;
    workItemId: string | null;
    title: string;
    description: string | null;
    type: WorkOrderType;
    unit: string | null;
    quantity: string | null;
    ratePaise: Paise | null;
    lumpSumPaise: Paise | null;
    retentionPercent: string;
    tdsPercent: string;
    startDate: ISODate | null;
    endDate: ISODate | null;
  },
): Promise<{ id: string }> {
  if (!can(actor, "labour.manage")) throw new ForbiddenError();
  await assertProjectAccess(actor, input.projectId);
  if (input.type === "LUMP_SUM" && !input.lumpSumPaise) throw new AppError("Enter the lump-sum amount.", { lumpSumPaise: "Required for lump sum." });
  if (input.type !== "LUMP_SUM" && !input.ratePaise) throw new AppError("Enter the rate.", { ratePaise: "Required." });
  const contractor = await db.labourContractor.findFirst({ where: { id: input.contractorId, deletedAt: null } });
  if (!contractor) throw new NotFoundError("contractor");
  return db.$transaction(async (tx) => {
    const wo = await tx.workOrder.create({
      data: {
        ...input,
        number: await nextCode(tx, "workOrder"),
        startDate: input.startDate ? toDbDate(input.startDate) : null,
        endDate: input.endDate ? toDbDate(input.endDate) : null,
      },
    });
    await audit(tx, {
      actor,
      action: "CREATE",
      entityType: "WorkOrder",
      entityId: wo.id,
      projectId: input.projectId,
      summary: `gave work order ${wo.number} "${wo.title}" to ${contractor.name}${input.lumpSumPaise ? ` for ${formatINR(input.lumpSumPaise, { paise: false })}` : input.ratePaise ? ` at ${formatINR(input.ratePaise)}/${input.unit ?? "unit"}` : ""}`,
    });
    return { id: wo.id };
  });
}

export async function setWorkOrderStatus(actor: Actor, id: string, status: WorkOrderStatus): Promise<void> {
  if (!can(actor, "labour.manage")) throw new ForbiddenError();
  const wo = await db.workOrder.findUnique({ where: { id } });
  if (!wo) throw new NotFoundError("work order");
  await db.$transaction(async (tx) => {
    await tx.workOrder.update({ where: { id }, data: { status } });
    await audit(tx, { actor, action: "STATUS_CHANGE", entityType: "WorkOrder", entityId: id, projectId: wo.projectId, summary: `marked work order ${wo.number} as ${status.toLowerCase()}` });
  });
}

/**
 * Records a contractor's bill. Gross comes from the typed amount, or from
 * quantity × the work order's rate. Retention and TDS are worked out from
 * the percentages. Bills are approved straight away by someone who can make
 * payments; otherwise they wait as drafts for approval.
 */
export async function createContractorBill(
  actor: Actor & { id: string },
  input: {
    contractorId: string;
    projectId: string;
    workOrderId: string | null;
    billDate: ISODate;
    periodFrom: ISODate | null;
    periodTo: ISODate | null;
    quantity: string | null;
    grossPaise: Paise | null;
    retentionPercent: string;
    tdsPercent: string;
    otherDeductionPaise: Paise;
    deductionNote: string | null;
    notes: string | null;
  },
): Promise<{ id: string }> {
  if (!can(actor, "labour.manage")) throw new ForbiddenError();
  await assertProjectAccess(actor, input.projectId);
  const contractor = await db.labourContractor.findFirst({ where: { id: input.contractorId, deletedAt: null } });
  if (!contractor) throw new NotFoundError("contractor");
  const wo = input.workOrderId ? await db.workOrder.findFirst({ where: { id: input.workOrderId, contractorId: input.contractorId } }) : null;
  if (input.workOrderId && !wo) throw new AppError("That work order belongs to another contractor.");
  let gross = input.grossPaise ?? 0n;
  if (!input.grossPaise && wo?.ratePaise && input.quantity) gross = multiplyQtyRate(input.quantity, wo.ratePaise);
  if (gross <= 0n) throw new AppError("Enter the bill amount (or a quantity for a piece-rate work order).", { grossPaise: "Required." });
  const retention = percentOf(gross, input.retentionPercent);
  const tds = percentOf(gross, input.tdsPercent);
  const net = gross - retention - tds - input.otherDeductionPaise;
  if (net < 0n) throw new AppError("Deductions are more than the bill amount.");
  const approve = can(actor, "payments.record");
  return db.$transaction(async (tx) => {
    const bill = await tx.contractorBill.create({
      data: {
        number: await nextCode(tx, "contractorBill"),
        contractorId: input.contractorId,
        projectId: input.projectId,
        workOrderId: input.workOrderId,
        billDate: toDbDate(input.billDate),
        periodFrom: input.periodFrom ? toDbDate(input.periodFrom) : null,
        periodTo: input.periodTo ? toDbDate(input.periodTo) : null,
        quantity: input.quantity,
        grossPaise: gross,
        retentionPaise: retention,
        tdsPaise: tds,
        otherDeductionPaise: input.otherDeductionPaise,
        deductionNote: input.deductionNote,
        netPaise: net,
        status: approve ? "APPROVED" : "DRAFT",
        notes: input.notes,
        createdById: actor.id,
      },
    });
    await audit(tx, {
      actor,
      action: "CREATE",
      entityType: "ContractorBill",
      entityId: bill.id,
      projectId: input.projectId,
      summary: `recorded ${approve ? "" : "draft "}bill ${bill.number} from ${contractor.name}: ${formatINR(gross)} (net payable ${formatINR(net)})`,
    });
    return { id: bill.id };
  });
}

export async function approveContractorBill(actor: Actor, id: string): Promise<void> {
  if (!can(actor, "payments.record")) throw new ForbiddenError("Only someone who can make payments approves contractor bills.");
  const bill = await db.contractorBill.findUnique({ where: { id }, include: { contractor: true } });
  if (!bill) throw new NotFoundError("bill");
  if (bill.status !== "DRAFT") throw new AppError("Only draft bills can be approved.");
  await db.$transaction(async (tx) => {
    await tx.contractorBill.update({ where: { id }, data: { status: "APPROVED" } });
    await audit(tx, { actor, action: "STATUS_CHANGE", entityType: "ContractorBill", entityId: id, projectId: bill.projectId, summary: `approved bill ${bill.number} from ${bill.contractor.name} (${formatINR(bill.netPaise)} payable)` });
  });
}

export async function cancelContractorBill(actor: Actor, id: string, reason: string): Promise<void> {
  if (!can(actor, "payments.record")) throw new ForbiddenError();
  const bill = await db.contractorBill.findUnique({ where: { id }, include: { contractor: true, payments: true } });
  if (!bill) throw new NotFoundError("bill");
  if (bill.payments.length) throw new AppError("This bill has payments. Reverse them first.");
  if (bill.status === "CANCELLED") return;
  await db.$transaction(async (tx) => {
    await tx.contractorBill.update({ where: { id }, data: { status: "CANCELLED", notes: [bill.notes, `Cancelled: ${reason}`].filter(Boolean).join("\n") } });
    await audit(tx, { actor, action: "STATUS_CHANGE", entityType: "ContractorBill", entityId: id, projectId: bill.projectId, summary: `cancelled bill ${bill.number} from ${bill.contractor.name} — "${reason}"` });
  });
}

export function describeBillPeriod(b: { periodFrom: Date | null; periodTo: Date | null }) {
  if (!b.periodFrom && !b.periodTo) return null;
  return `${formatDate(b.periodFrom)} – ${formatDate(b.periodTo)}`;
}
