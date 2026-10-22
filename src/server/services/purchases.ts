import "server-only";
import Decimal from "decimal.js";
import { formatDate, fromDbDate, fromDbDateOrNull, toDbDate, type ISODate } from "@/lib/dates";
import { formatQuantity } from "@/lib/format";
import { formatINR, multiplyQtyRate, percentOf, sumPaise, type Paise } from "@/lib/money";
import { can } from "@/lib/permissions";
import type { CurrentUser } from "@/server/auth/current-user";
import { audit } from "@/server/audit";
import { db, type Tx } from "@/server/db";
import { AppError, ForbiddenError, NotFoundError } from "@/server/errors";
import { assertPeriodOpen } from "@/server/services/ledger";
import { accessibleProjectIds } from "@/server/scope";
import { nextCode } from "@/server/services/sequence";
import { purchasePayStatus } from "@/server/services/suppliers";

type Actor = Pick<CurrentUser, "id" | "name" | "role" | "permissions">;

export type PurchaseItemInput = {
  materialId: string;
  quantity: string;
  ratePaise: Paise;
  taxPercent?: string;
  weightKg?: string | null;
  hsnCode?: string | null;
};

export type PurchaseInput = {
  supplierId: string;
  projectId: string | null; // null = main store
  siteId?: string | null;
  purchaseDate: ISODate;
  expectedDelivery?: ISODate | null;
  dueDate?: ISODate | null;
  invoiceNumber?: string | null;
  invoiceDate?: ISODate | null;
  transportPaise?: Paise;
  otherChargesPaise?: Paise;
  discountPaise?: Paise;
  items: PurchaseItemInput[];
  /** Material arrived on the same day it was bought. */
  receivedOn?: ISODate | null;
  materialRequestId?: string | null;
  notes?: string | null;
};

/** Line and bill totals for a purchase (exported for tests and previews). */
export function purchaseTotals(input: Pick<PurchaseInput, "items" | "transportPaise" | "otherChargesPaise" | "discountPaise">) {
  const lines = input.items.map((item) => {
    const amountPaise = multiplyQtyRate(item.quantity, item.ratePaise);
    const taxPaise = percentOf(amountPaise, item.taxPercent ?? "0");
    return { ...item, amountPaise, taxPaise };
  });
  const subtotalPaise = sumPaise(lines.map((l) => l.amountPaise));
  const taxPaise = sumPaise(lines.map((l) => l.taxPaise));
  const totalPaise =
    subtotalPaise + taxPaise + (input.transportPaise ?? 0n) + (input.otherChargesPaise ?? 0n) - (input.discountPaise ?? 0n);
  return { lines, subtotalPaise, taxPaise, totalPaise };
}

async function receiveItems(
  tx: Tx,
  actor: Actor,
  purchase: { id: string; projectId: string | null; siteId: string | null },
  items: { id: string; materialId: string; quantity: Decimal.Value; ratePaise: Paise }[],
  date: ISODate,
) {
  for (const item of items) {
    await tx.inventoryTransaction.create({
      data: {
        date: toDbDate(date),
        materialId: item.materialId,
        projectId: purchase.projectId,
        siteId: purchase.siteId,
        type: "PURCHASE",
        quantity: new Decimal(item.quantity).toString(),
        unitCostPaise: item.ratePaise,
        purchaseItemId: item.id,
        recordedById: actor.id,
      },
    });
    await tx.purchaseItem.update({ where: { id: item.id }, data: { receivedQuantity: new Decimal(item.quantity).toString() } });
  }
}

export async function recordPurchase(actor: Actor, input: PurchaseInput): Promise<{ id: string; number: string }> {
  if (!can(actor, "purchases.record")) throw new ForbiddenError();
  if (input.items.length === 0) throw new AppError("Add at least one material.");
  for (const item of input.items) {
    const q = new Decimal(item.quantity);
    if (!q.isFinite() || q.lte(0)) throw new AppError("Every material needs a quantity more than zero.");
    if (item.ratePaise < 0n) throw new AppError("Rates cannot be negative.");
  }
  const totals = purchaseTotals(input);
  if (totals.totalPaise < 0n) throw new AppError("The discount is larger than the bill.");

  return db.$transaction(async (tx) => {
    await assertPeriodOpen(tx, input.purchaseDate);
    const supplier = await tx.supplier.findFirst({ where: { id: input.supplierId, deletedAt: null } });
    if (!supplier) throw new NotFoundError("supplier");
    const project = input.projectId
      ? await tx.project.findFirst({ where: { id: input.projectId, deletedAt: null }, include: { sites: { where: { isDefault: true } } } })
      : null;
    if (input.projectId && !project) throw new NotFoundError("project");
    const materials = await tx.material.findMany({ where: { id: { in: input.items.map((i) => i.materialId) } } });
    const unitOf = new Map(materials.map((m) => [m.id, m.unit]));
    if (materials.length !== new Set(input.items.map((i) => i.materialId)).size) throw new AppError("Choose materials from the list.");

    const number = await nextCode(tx, "purchase");
    const siteId = input.siteId ?? project?.sites[0]?.id ?? null;
    const purchase = await tx.purchase.create({
      data: {
        number,
        supplierId: supplier.id,
        projectId: project?.id ?? null,
        siteId,
        materialRequestId: input.materialRequestId ?? null,
        purchaseDate: toDbDate(input.purchaseDate),
        expectedDelivery: input.expectedDelivery ? toDbDate(input.expectedDelivery) : null,
        actualDelivery: input.receivedOn ? toDbDate(input.receivedOn) : null,
        deliveryStatus: input.receivedOn ? "DELIVERED" : "ORDERED",
        dueDate: input.dueDate ? toDbDate(input.dueDate) : null,
        invoiceNumber: input.invoiceNumber ?? null,
        invoiceDate: input.invoiceDate ? toDbDate(input.invoiceDate) : null,
        subtotalPaise: totals.subtotalPaise,
        taxPaise: totals.taxPaise,
        transportPaise: input.transportPaise ?? 0n,
        otherChargesPaise: input.otherChargesPaise ?? 0n,
        discountPaise: input.discountPaise ?? 0n,
        totalPaise: totals.totalPaise,
        notes: input.notes ?? null,
        createdById: actor.id,
        items: {
          create: totals.lines.map((l) => ({
            materialId: l.materialId,
            quantity: new Decimal(l.quantity).toString(),
            unit: unitOf.get(l.materialId)!,
            weightKg: l.weightKg ?? null,
            ratePaise: l.ratePaise,
            taxPercent: l.taxPercent ?? "0",
            taxPaise: l.taxPaise,
            amountPaise: l.amountPaise,
            hsnCode: l.hsnCode ?? null,
          })),
        },
      },
      include: { items: true },
    });
    if (input.receivedOn) {
      await receiveItems(tx, actor, purchase, purchase.items, input.receivedOn);
    }
    if (input.materialRequestId) {
      await tx.materialRequest.updateMany({
        where: { id: input.materialRequestId, status: { in: ["APPROVED", "PENDING"] } },
        data: { status: input.receivedOn ? "RECEIVED" : "ORDERED" },
      });
    }
    if (project) {
      // Remember which suppliers serve which project.
      await tx.supplierProject.upsert({
        where: { supplierId_projectId: { supplierId: supplier.id, projectId: project.id } },
        create: { supplierId: supplier.id, projectId: project.id },
        update: {},
      });
    }
    await audit(tx, {
      actor,
      action: "CREATE",
      entityType: "Purchase",
      entityId: purchase.id,
      projectId: project?.id ?? null,
      summary: `recorded purchase ${number} of ${formatINR(totals.totalPaise)} from ${supplier.name}${project ? ` for ${project.name}` : " for the main store"} (${materials
        .map((m) => m.name)
        .join(", ")})`,
      after: { ...purchase, items: purchase.items },
    });
    return { id: purchase.id, number };
  });
}

/** Marks an ordered purchase as delivered and adds the material to stock. */
export async function receivePurchase(actor: Actor, purchaseId: string, date: ISODate): Promise<void> {
  if (!can(actor, "materials.record")) throw new ForbiddenError();
  await db.$transaction(async (tx) => {
    const purchase = await tx.purchase.findUnique({ where: { id: purchaseId }, include: { items: true, supplier: true } });
    if (!purchase || purchase.cancelledAt) throw new NotFoundError("purchase");
    if (purchase.deliveryStatus === "DELIVERED") throw new AppError("This delivery has already been received.");
    await receiveItems(tx, actor, purchase, purchase.items, date);
    await tx.purchase.update({ where: { id: purchaseId }, data: { deliveryStatus: "DELIVERED", actualDelivery: toDbDate(date) } });
    if (purchase.materialRequestId) {
      await tx.materialRequest.updateMany({ where: { id: purchase.materialRequestId }, data: { status: "RECEIVED" } });
    }
    await audit(tx, {
      actor,
      action: "STATUS_CHANGE",
      entityType: "Purchase",
      entityId: purchaseId,
      projectId: purchase.projectId,
      summary: `received delivery for ${purchase.number} from ${purchase.supplier.name} on ${formatDate(date)}`,
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Listing and detail
// ─────────────────────────────────────────────────────────────────────────────

export type PurchaseFilter = {
  from?: ISODate | null;
  to?: ISODate | null;
  location?: string; // project id or "store"
  supplierId?: string;
  payStatus?: "PAID" | "PARTIALLY_PAID" | "PENDING";
  delivery?: "ORDERED" | "PARTIALLY_DELIVERED" | "DELIVERED" | "CANCELLED";
};

export async function listPurchases(user: Actor & { id: string }, filter: PurchaseFilter = {}) {
  const ids = await accessibleProjectIds(user);
  const scope = ids === null ? {} : { projectId: { in: ids } };
  const rows = await db.purchase.findMany({
    where: {
      ...scope,
      ...(filter.location ? { projectId: filter.location === "store" ? null : filter.location } : {}),
      ...(filter.supplierId ? { supplierId: filter.supplierId } : {}),
      ...(filter.delivery === "CANCELLED" ? { cancelledAt: { not: null } } : filter.delivery ? { deliveryStatus: filter.delivery, cancelledAt: null } : {}),
      ...(filter.from || filter.to
        ? { purchaseDate: { ...(filter.from ? { gte: toDbDate(filter.from) } : {}), ...(filter.to ? { lte: toDbDate(filter.to) } : {}) } }
        : {}),
    },
    orderBy: [{ purchaseDate: "desc" }, { createdAt: "desc" }],
    take: 500,
    include: {
      supplier: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
      payments: { select: { amountPaise: true } },
      items: { select: { quantity: true, material: { select: { name: true, unit: true } } } },
    },
  });
  return rows
    .map((p) => {
      const paidPaise = sumPaise(p.payments.map((x) => x.amountPaise));
      return {
        id: p.id,
        number: p.number,
        date: fromDbDate(p.purchaseDate),
        supplier: p.supplier,
        project: p.project,
        invoiceNumber: p.invoiceNumber,
        taxPaise: p.taxPaise,
        totalPaise: p.totalPaise,
        paidPaise,
        balancePaise: p.cancelledAt ? 0n : p.totalPaise - paidPaise,
        payStatus: purchasePayStatus(p.totalPaise, paidPaise, Boolean(p.cancelledAt)),
        deliveryStatus: p.cancelledAt ? ("CANCELLED" as const) : p.deliveryStatus,
        dueDate: fromDbDateOrNull(p.dueDate),
        expectedDelivery: fromDbDateOrNull(p.expectedDelivery),
        summary: p.items
          .slice(0, 2)
          .map((i) => `${formatQuantity(i.quantity.toString(), i.material.unit)} ${i.material.name}`)
          .join(", ") + (p.items.length > 2 ? ` +${p.items.length - 2} more` : ""),
      };
    })
    .filter((p) => !filter.payStatus || (p.deliveryStatus !== "CANCELLED" && p.payStatus === filter.payStatus));
}

export async function getPurchase(user: Actor & { id: string }, id: string) {
  const ids = await accessibleProjectIds(user);
  const purchase = await db.purchase.findFirst({
    where: { id, ...(ids === null ? {} : { projectId: { in: ids } }) },
    include: {
      supplier: true,
      project: { select: { id: true, name: true } },
      materialRequest: { select: { id: true, number: true } },
      createdBy: { select: { name: true } },
      items: { include: { material: { select: { id: true, name: true, unit: true } } } },
      payments: { orderBy: { date: "asc" }, include: { account: { select: { name: true } } } },
    },
  });
  if (!purchase) return null;
  const paidPaise = sumPaise(purchase.payments.map((p) => p.amountPaise));
  return {
    ...purchase,
    purchaseDate: fromDbDate(purchase.purchaseDate),
    dueDate: fromDbDateOrNull(purchase.dueDate),
    expectedDelivery: fromDbDateOrNull(purchase.expectedDelivery),
    actualDelivery: fromDbDateOrNull(purchase.actualDelivery),
    invoiceDate: fromDbDateOrNull(purchase.invoiceDate),
    paidPaise,
    balancePaise: purchase.cancelledAt ? 0n : purchase.totalPaise - paidPaise,
    payStatus: purchasePayStatus(purchase.totalPaise, paidPaise, Boolean(purchase.cancelledAt)),
    payments: purchase.payments.map((p) => ({ ...p, date: fromDbDate(p.date) })),
  };
}

export type PurchaseDetail = NonNullable<Awaited<ReturnType<typeof getPurchase>>>;

/** Cancelling is only allowed before delivery and before any payment. */
export async function cancelPurchase(actor: Actor, id: string, reason: string): Promise<void> {
  if (!can(actor, "purchases.record")) throw new ForbiddenError();
  const purchase = await db.purchase.findUnique({ where: { id }, include: { payments: true, supplier: true } });
  if (!purchase || purchase.cancelledAt) throw new NotFoundError("purchase");
  if (purchase.deliveryStatus !== "ORDERED") throw new AppError("Material from this purchase has already arrived, so it cannot be cancelled. Record a return instead.");
  if (purchase.payments.length > 0) throw new AppError("This purchase already has payments. Reverse the payments first.");
  if (reason.trim().length < 3) throw new AppError("Please write why it is being cancelled.");
  await db.$transaction(async (tx) => {
    await tx.purchase.update({ where: { id }, data: { cancelledAt: new Date(), cancelReason: reason.trim(), deliveryStatus: "CANCELLED" } });
    if (purchase.materialRequestId) {
      await tx.materialRequest.updateMany({ where: { id: purchase.materialRequestId }, data: { status: "APPROVED" } });
    }
    await audit(tx, {
      actor,
      action: "STATUS_CHANGE",
      entityType: "Purchase",
      entityId: id,
      projectId: purchase.projectId,
      summary: `cancelled purchase ${purchase.number} from ${purchase.supplier.name} — "${reason.trim()}"`,
    });
  });
}
