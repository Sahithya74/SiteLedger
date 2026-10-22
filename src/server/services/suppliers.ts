import "server-only";
import type { SupplierCategory } from "@/generated/prisma/enums";
import { fromDbDate, fromDbDateOrNull } from "@/lib/dates";
import { sumPaise, type Paise } from "@/lib/money";
import { can } from "@/lib/permissions";
import type { CurrentUser } from "@/server/auth/current-user";
import { audit, describeChanges } from "@/server/audit";
import { db } from "@/server/db";
import { AppError, ForbiddenError, NotFoundError } from "@/server/errors";
import { nextCode } from "@/server/services/sequence";

type Actor = Pick<CurrentUser, "id" | "name" | "role" | "permissions">;

export type SupplierInput = {
  name: string;
  categories: SupplierCategory[];
  contactPerson: string | null;
  phone: string | null;
  altPhone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  gstin: string | null;
  pan: string | null;
  materialsSupplied: string | null;
  priceRangeNote: string | null;
  paymentTerms: string | null;
  creditDays: number | null;
  rating: number | null;
  notes: string | null;
};

/** Amount owed to each supplier: purchases (not cancelled) minus every payment to them. */
async function supplierBalances(supplierIds?: string[]) {
  const where = supplierIds ? { supplierId: { in: supplierIds } } : {};
  const [bought, paid, last] = await Promise.all([
    db.purchase.groupBy({ by: ["supplierId"], where: { ...where, cancelledAt: null }, _sum: { totalPaise: true } }),
    db.payment.groupBy({ by: ["supplierId"], where: { ...where, payeeType: "SUPPLIER" }, _sum: { amountPaise: true } }),
    db.purchase.groupBy({ by: ["supplierId"], where: { ...where, cancelledAt: null }, _max: { purchaseDate: true } }),
  ]);
  const map = new Map<string, { boughtPaise: Paise; paidPaise: Paise; outstandingPaise: Paise; lastPurchase: string | null }>();
  for (const b of bought) {
    map.set(b.supplierId, { boughtPaise: b._sum.totalPaise ?? 0n, paidPaise: 0n, outstandingPaise: 0n, lastPurchase: null });
  }
  for (const p of paid) {
    if (!p.supplierId) continue;
    const e = map.get(p.supplierId) ?? { boughtPaise: 0n, paidPaise: 0n, outstandingPaise: 0n, lastPurchase: null };
    e.paidPaise = p._sum.amountPaise ?? 0n;
    map.set(p.supplierId, e);
  }
  for (const l of last) {
    const e = map.get(l.supplierId);
    if (e) e.lastPurchase = fromDbDateOrNull(l._max.purchaseDate);
  }
  for (const e of map.values()) e.outstandingPaise = e.boughtPaise - e.paidPaise;
  return map;
}

export async function listSuppliers(filter: { q?: string; category?: SupplierCategory; showInactive?: boolean } = {}) {
  const suppliers = await db.supplier.findMany({
    where: {
      deletedAt: null,
      ...(filter.showInactive ? {} : { isActive: true }),
      ...(filter.category ? { categories: { has: filter.category } } : {}),
      ...(filter.q
        ? {
            OR: [
              { name: { contains: filter.q, mode: "insensitive" as const } },
              { city: { contains: filter.q, mode: "insensitive" as const } },
              { phone: { contains: filter.q } },
              { materialsSupplied: { contains: filter.q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
  });
  const balances = await supplierBalances(suppliers.map((s) => s.id));
  return suppliers.map((s) => ({ ...s, ...(balances.get(s.id) ?? { boughtPaise: 0n, paidPaise: 0n, outstandingPaise: 0n, lastPurchase: null }) }));
}

export async function supplierOptions() {
  return db.supplier.findMany({
    where: { deletedAt: null, isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, city: true, creditDays: true },
  });
}

export async function getSupplier(id: string) {
  const supplier = await db.supplier.findFirst({
    where: { id, deletedAt: null },
    include: { projects: { include: { project: { select: { id: true, name: true, status: true } } } } },
  });
  if (!supplier) return null;
  const [balances, purchases, payments, priceRows] = await Promise.all([
    supplierBalances([id]),
    db.purchase.findMany({
      where: { supplierId: id },
      orderBy: { purchaseDate: "desc" },
      take: 50,
      include: { project: { select: { id: true, name: true } }, payments: { select: { amountPaise: true } }, items: { select: { id: true } } },
    }),
    db.payment.findMany({
      where: { supplierId: id },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 50,
      include: { account: { select: { name: true } }, purchase: { select: { number: true } } },
    }),
    db.purchaseItem.findMany({
      where: { purchase: { supplierId: id, cancelledAt: null } },
      orderBy: { purchase: { purchaseDate: "desc" } },
      include: { material: { select: { id: true, name: true, unit: true } }, purchase: { select: { purchaseDate: true } } },
    }),
  ]);
  // Latest rate per material from this supplier.
  const latest = new Map<string, { materialId: string; material: string; unit: string; ratePaise: Paise; date: string }>();
  for (const row of priceRows) {
    if (!latest.has(row.materialId)) {
      latest.set(row.materialId, {
        materialId: row.material.id,
        material: row.material.name,
        unit: row.material.unit,
        ratePaise: row.ratePaise,
        date: fromDbDate(row.purchase.purchaseDate),
      });
    }
  }
  return {
    ...supplier,
    balance: balances.get(id) ?? { boughtPaise: 0n, paidPaise: 0n, outstandingPaise: 0n, lastPurchase: null },
    purchases: purchases.map((p) => {
      const paid = sumPaise(p.payments.map((x) => x.amountPaise));
      return {
        id: p.id,
        number: p.number,
        date: fromDbDate(p.purchaseDate),
        project: p.project,
        totalPaise: p.totalPaise,
        paidPaise: paid,
        status: purchasePayStatus(p.totalPaise, paid, Boolean(p.cancelledAt)),
        deliveryStatus: p.deliveryStatus,
        items: p.items.length,
        cancelled: Boolean(p.cancelledAt),
      };
    }),
    payments: payments.map((p) => ({ ...p, date: fromDbDate(p.date) })),
    prices: [...latest.values()],
  };
}

export type SupplierDetail = NonNullable<Awaited<ReturnType<typeof getSupplier>>>;

export function purchasePayStatus(total: Paise, paid: Paise, cancelled = false): "PAID" | "PARTIALLY_PAID" | "PENDING" {
  if (cancelled || paid >= total) return "PAID";
  return paid > 0n ? "PARTIALLY_PAID" : "PENDING";
}

export async function createSupplier(actor: Actor, input: SupplierInput): Promise<{ id: string }> {
  if (!can(actor, "materials.manage")) throw new ForbiddenError();
  if ((input.latitude === null) !== (input.longitude === null)) throw new AppError("Enter both latitude and longitude, or neither.", { longitude: "Enter both." });
  return db.$transaction(async (tx) => {
    const supplier = await tx.supplier.create({ data: { ...input, code: await nextCode(tx, "supplier") } });
    await audit(tx, { actor, action: "CREATE", entityType: "Supplier", entityId: supplier.id, summary: `added supplier ${supplier.name}` });
    return { id: supplier.id };
  });
}

export async function updateSupplier(actor: Actor, id: string, input: SupplierInput): Promise<void> {
  if (!can(actor, "materials.manage")) throw new ForbiddenError();
  const existing = await db.supplier.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new NotFoundError("supplier");
  const changes = describeChanges(existing, input, [
    { key: "name", label: "Name" },
    { key: "phone", label: "Phone" },
    { key: "address", label: "Address" },
    { key: "paymentTerms", label: "Payment terms" },
    { key: "creditDays", label: "Credit days" },
    { key: "rating", label: "Rating" },
    { key: "gstin", label: "GSTIN" },
  ]);
  await db.$transaction(async (tx) => {
    await tx.supplier.update({ where: { id }, data: input });
    await audit(tx, {
      actor,
      action: "UPDATE",
      entityType: "Supplier",
      entityId: id,
      summary: `updated supplier ${existing.name}${changes.changed ? `: ${changes.text}` : ""}`,
    });
  });
}

export async function setSupplierActive(actor: Actor, id: string, active: boolean): Promise<void> {
  if (!can(actor, "materials.manage")) throw new ForbiddenError();
  const existing = await db.supplier.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new NotFoundError("supplier");
  await db.$transaction(async (tx) => {
    await tx.supplier.update({ where: { id }, data: { isActive: active } });
    await audit(tx, {
      actor,
      action: "STATUS_CHANGE",
      entityType: "Supplier",
      entityId: id,
      summary: `${active ? "re-activated" : "stopped using"} supplier ${existing.name}`,
    });
  });
}

/** Rates paid for one material by every supplier (price comparison). */
export async function priceComparison(materialId: string) {
  const rows = await db.purchaseItem.findMany({
    where: { materialId, purchase: { cancelledAt: null } },
    orderBy: { purchase: { purchaseDate: "desc" } },
    include: { purchase: { select: { purchaseDate: true, supplier: { select: { id: true, name: true } } } } },
  });
  const bySupplier = new Map<string, { supplierId: string; supplier: string; lastRatePaise: Paise; lastDate: string; lowestPaise: Paise; purchases: number }>();
  for (const r of rows) {
    const e = bySupplier.get(r.purchase.supplier.id);
    if (!e) {
      bySupplier.set(r.purchase.supplier.id, {
        supplierId: r.purchase.supplier.id,
        supplier: r.purchase.supplier.name,
        lastRatePaise: r.ratePaise,
        lastDate: fromDbDate(r.purchase.purchaseDate),
        lowestPaise: r.ratePaise,
        purchases: 1,
      });
    } else {
      e.purchases++;
      if (r.ratePaise < e.lowestPaise) e.lowestPaise = r.ratePaise;
    }
  }
  return [...bySupplier.values()].sort((a, b) => (a.lastRatePaise < b.lastRatePaise ? -1 : 1));
}
