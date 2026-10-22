import "server-only";
import { randomUUID } from "node:crypto";
import Decimal from "decimal.js";
import type { Prisma } from "@/generated/prisma/client";
import type { InventoryTxnType, MaterialKind } from "@/generated/prisma/enums";
import { formatDate, fromDbDate, toDbDate, type ISODate } from "@/lib/dates";
import { formatQuantity } from "@/lib/format";
import { formatINR, multiplyQtyRate, type Paise } from "@/lib/money";
import { can } from "@/lib/permissions";
import type { CurrentUser } from "@/server/auth/current-user";
import { audit, describeChanges } from "@/server/audit";
import { db } from "@/server/db";
import { AppError, ForbiddenError, NotFoundError } from "@/server/errors";
import { accessibleProjectIds } from "@/server/scope";
import { nextCode } from "@/server/services/sequence";
import { availableQuantity, recordMaterialUsage, stockLevels, type StockRow } from "@/server/services/stock";

type Actor = Pick<CurrentUser, "id" | "name" | "role" | "permissions">;

export const STORE = "store";

export async function materialCategories() {
  return db.materialCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
}

export async function materialOptions() {
  const rows = await db.material.findMany({
    where: { deletedAt: null, isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, unit: true, defaultRatePaise: true, category: { select: { name: true } } },
  });
  return rows.map((m) => ({ id: m.id, name: m.name, unit: m.unit, ratePaise: m.defaultRatePaise?.toString() ?? "", category: m.category.name }));
}

export type MaterialOption = Awaited<ReturnType<typeof materialOptions>>[number];

/** Places stock can be: the main store plus every project the user can see. */
export async function stockLocations(user: Actor & { id: string }) {
  const ids = await accessibleProjectIds(user);
  const projects = await db.project.findMany({
    where: { deletedAt: null, archivedAt: null, ...(ids === null ? {} : { id: { in: ids } }), status: { notIn: ["CANCELLED"] } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return [{ value: STORE, label: "Main store / godown" }, ...projects.map((p) => ({ value: p.id, label: p.name }))];
}

export type InventoryFilter = { location?: string; status?: string; categoryId?: string; q?: string };

/** Stock per material per place, filtered for the inventory screen. */
export async function inventory(user: Actor & { id: string }, filter: InventoryFilter = {}): Promise<StockRow[]> {
  const ids = await accessibleProjectIds(user);
  let rows = await stockLevels(ids);
  if (ids !== null) rows = rows.filter((r) => r.projectId === null || ids.includes(r.projectId));
  if (filter.location) rows = rows.filter((r) => (filter.location === STORE ? r.projectId === null : r.projectId === filter.location));
  if (filter.status) rows = rows.filter((r) => r.status === filter.status);
  if (filter.categoryId) {
    const materials = await db.material.findMany({ where: { categoryId: filter.categoryId }, select: { id: true } });
    const set = new Set(materials.map((m) => m.id));
    rows = rows.filter((r) => set.has(r.materialId));
  }
  if (filter.q) {
    const q = filter.q.toLowerCase();
    rows = rows.filter((r) => r.materialName.toLowerCase().includes(q) || r.projectName.toLowerCase().includes(q));
  }
  return rows;
}

export async function listMaterials(filter: { q?: string; categoryId?: string } = {}) {
  const [materials, levels] = await Promise.all([
    db.material.findMany({
      where: {
        deletedAt: null,
        ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
        ...(filter.q ? { name: { contains: filter.q, mode: "insensitive" as const } } : {}),
      },
      orderBy: { name: "asc" },
      include: { category: { select: { name: true } } },
    }),
    stockLevels(null),
  ]);
  return materials.map((m) => {
    const rows = levels.filter((l) => l.materialId === m.id);
    const total = rows.reduce((s, r) => s.plus(r.remaining), new Decimal(0));
    return {
      id: m.id,
      code: m.code,
      name: m.name,
      unit: m.unit,
      category: m.category.name,
      isActive: m.isActive,
      reorderLevel: m.reorderLevel.toString(),
      defaultRatePaise: m.defaultRatePaise,
      totalStock: total.toString(),
      valuePaise: rows.reduce((s, r) => s + r.valuePaise, 0n),
      lowAt: rows.filter((r) => r.status !== "AVAILABLE" && new Decimal(r.reorderLevel).gt(0)).length,
    };
  });
}

export async function getMaterial(user: Actor & { id: string }, id: string) {
  const material = await db.material.findFirst({ where: { id, deletedAt: null }, include: { category: true } });
  if (!material) return null;
  const ids = await accessibleProjectIds(user);
  const scope: Prisma.InventoryTransactionWhereInput = ids === null ? {} : { OR: [{ projectId: null }, { projectId: { in: ids } }] };
  const [levels, movements, prices] = await Promise.all([
    inventory(user).then((rows) => rows.filter((r) => r.materialId === id)),
    db.inventoryTransaction.findMany({
      where: { materialId: id, ...scope },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 100,
      include: { project: { select: { name: true } }, recordedBy: { select: { name: true } }, workItem: { select: { name: true } } },
    }),
    db.purchaseItem.findMany({
      where: { materialId: id, purchase: { cancelledAt: null } },
      orderBy: { purchase: { purchaseDate: "desc" } },
      take: 50,
      include: { purchase: { select: { id: true, number: true, purchaseDate: true, supplier: { select: { id: true, name: true } } } } },
    }),
  ]);
  return {
    ...material,
    specs: (material.specs ?? {}) as Record<string, string>,
    levels,
    movements: movements.map((m) => ({
      id: m.id,
      date: fromDbDate(m.date),
      type: m.type,
      quantity: m.quantity.toString(),
      place: m.project?.name ?? "Main store",
      workItem: m.workItem?.name ?? null,
      notes: m.notes,
      by: m.recordedBy.name,
    })),
    prices: prices.map((p) => ({
      id: p.id,
      date: fromDbDate(p.purchase.purchaseDate),
      purchaseId: p.purchase.id,
      purchaseNumber: p.purchase.number,
      supplierId: p.purchase.supplier.id,
      supplier: p.purchase.supplier.name,
      quantity: p.quantity.toString(),
      ratePaise: p.ratePaise,
    })),
  };
}

export type MaterialDetail = NonNullable<Awaited<ReturnType<typeof getMaterial>>>;

type MaterialInput = {
  name: string;
  categoryId: string;
  unit: string;
  reorderLevel: string;
  defaultRatePaise: Paise | null;
  brand: string | null;
  grade: string | null;
  size: string | null;
  colour: string | null;
  thickness: string | null;
  finish: string | null;
  notes: string | null;
};

function specsOf(input: MaterialInput) {
  const specs: Record<string, string> = {};
  for (const key of ["brand", "grade", "size", "colour", "thickness", "finish"] as const) {
    if (input[key]) specs[key] = input[key]!;
  }
  return specs;
}

export async function createMaterial(actor: Actor, input: MaterialInput): Promise<{ id: string }> {
  if (!can(actor, "materials.manage")) throw new ForbiddenError();
  const clash = await db.material.findFirst({ where: { name: { equals: input.name, mode: "insensitive" }, deletedAt: null } });
  if (clash) throw new AppError("A material with this name already exists.", { name: "Already exists." });
  return db.$transaction(async (tx) => {
    const material = await tx.material.create({
      data: {
        code: await nextCode(tx, "material"),
        name: input.name,
        categoryId: input.categoryId,
        unit: input.unit,
        reorderLevel: input.reorderLevel,
        defaultRatePaise: input.defaultRatePaise,
        specs: specsOf(input),
        notes: input.notes,
      },
    });
    await audit(tx, { actor, action: "CREATE", entityType: "Material", entityId: material.id, summary: `added material ${material.name} (${material.unit})` });
    return { id: material.id };
  });
}

export async function updateMaterial(actor: Actor, id: string, input: MaterialInput): Promise<void> {
  if (!can(actor, "materials.manage")) throw new ForbiddenError();
  const existing = await db.material.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new NotFoundError("material");
  const data = {
    name: input.name,
    categoryId: input.categoryId,
    unit: input.unit,
    reorderLevel: input.reorderLevel,
    defaultRatePaise: input.defaultRatePaise,
    specs: specsOf(input),
    notes: input.notes,
  };
  const changes = describeChanges({ ...existing, reorderLevel: existing.reorderLevel.toString() }, data, [
    { key: "name", label: "Name" },
    { key: "unit", label: "Unit" },
    { key: "reorderLevel", label: "Reorder level" },
    { key: "categoryId", label: "Category" },
  ]);
  await db.$transaction(async (tx) => {
    await tx.material.update({ where: { id }, data });
    await audit(tx, {
      actor,
      action: "UPDATE",
      entityType: "Material",
      entityId: id,
      summary: `updated material ${existing.name}${changes.changed ? `: ${changes.text}` : ""}`,
    });
  });
}

export async function createCategory(actor: Actor, input: { name: string; kind: MaterialKind }): Promise<void> {
  if (!can(actor, "materials.manage")) throw new ForbiddenError();
  const clash = await db.materialCategory.findUnique({ where: { name: input.name } });
  if (clash) throw new AppError("This category already exists.", { name: "Already exists." });
  await db.$transaction(async (tx) => {
    const max = await tx.materialCategory.aggregate({ _max: { sortOrder: true } });
    await tx.materialCategory.create({ data: { ...input, sortOrder: (max._max.sortOrder ?? 0) + 10 } });
    await audit(tx, { actor, action: "CREATE", entityType: "MaterialCategory", summary: `added material category "${input.name}"` });
  });
}

async function locationProject(user: Actor & { id: string }, location: string) {
  if (location === STORE) return null;
  const ids = await accessibleProjectIds(user);
  if (ids !== null && !ids.includes(location)) throw new NotFoundError("project");
  const project = await db.project.findFirst({
    where: { id: location, deletedAt: null },
    select: { id: true, name: true, sites: { where: { isDefault: true }, select: { id: true } } },
  });
  if (!project) throw new NotFoundError("project");
  return project;
}

/** Weighted average purchase rate, used to value transfers and stock corrections. */
export async function averageCost(materialId: string): Promise<Paise> {
  const rows = await db.$queryRaw<{ qty: string | null; value: string | null }[]>`
    SELECT SUM("quantity")::text AS qty, SUM("quantity" * COALESCE("unitCostPaise", 0))::text AS value
    FROM "InventoryTransaction"
    WHERE "materialId" = ${materialId} AND "type" IN ('OPENING', 'PURCHASE') AND "unitCostPaise" IS NOT NULL`;
  const qty = new Decimal(rows[0]?.qty ?? "0");
  if (qty.lte(0)) return 0n;
  return BigInt(new Decimal(rows[0].value ?? "0").dividedBy(qty).toDecimalPlaces(0).toFixed(0));
}

const MOVEMENT_TEXT: Record<"DAMAGE" | "RETURN" | "ADJUSTMENT" | "OPENING", string> = {
  DAMAGE: "recorded damaged / wasted",
  RETURN: "recorded returned to supplier",
  ADJUSTMENT: "corrected stock of",
  OPENING: "entered opening stock of",
};

export async function recordStockMovement(
  actor: Actor & { id: string },
  input: {
    kind: "USAGE" | "DAMAGE" | "RETURN" | "ADJUSTMENT" | "OPENING";
    date: ISODate;
    materialId: string;
    location: string;
    quantity: string;
    unitCostPaise: Paise | null;
    workItemId: string | null;
    notes: string | null;
    confirmShortage?: boolean;
  },
): Promise<void> {
  if (!can(actor, "materials.record")) throw new ForbiddenError();
  const project = await locationProject(actor, input.location);
  const qty = new Decimal(input.quantity);
  if (input.kind !== "ADJUSTMENT" && qty.lte(0)) throw new AppError("Quantity must be more than zero.", { quantity: "Must be more than zero." });

  if (input.kind === "USAGE") {
    if (!project) throw new AppError("Material is used at a project site, not in the store.", { location: "Choose a project." });
    await recordMaterialUsage(actor, {
      date: input.date,
      materialId: input.materialId,
      projectId: project.id,
      siteId: project.sites[0]?.id ?? null,
      quantity: input.quantity,
      workItemId: input.workItemId,
      notes: input.notes,
      confirmShortage: input.confirmShortage,
    });
    return;
  }

  const kind = input.kind; // narrowed: not USAGE from here on
  const material = await db.material.findFirst({ where: { id: input.materialId, deletedAt: null } });
  if (!material) throw new NotFoundError("material");
  if ((input.kind === "DAMAGE" || input.kind === "RETURN") && !input.confirmShortage) {
    const available = await availableQuantity(material.id, project?.id ?? null);
    if (qty.gt(available)) {
      throw new AppError(
        `Only ${formatQuantity(available, material.unit)} of ${material.name} is recorded there. Check the quantity, or confirm to save anyway.`,
        { confirmShortage: "needs-confirmation" },
      );
    }
  }
  const unitCost = input.kind === "OPENING" ? (input.unitCostPaise ?? material.defaultRatePaise ?? (await averageCost(material.id))) : null;
  await db.$transaction(async (tx) => {
    const row = await tx.inventoryTransaction.create({
      data: {
        date: toDbDate(input.date),
        materialId: material.id,
        projectId: project?.id ?? null,
        siteId: project?.sites[0]?.id ?? null,
        type: kind as InventoryTxnType,
        quantity: qty.toString(),
        unitCostPaise: unitCost,
        notes: input.notes,
        recordedById: actor.id,
      },
    });
    await audit(tx, {
      actor,
      action: "CREATE",
      entityType: "InventoryTransaction",
      entityId: row.id,
      projectId: project?.id ?? null,
      summary: `${MOVEMENT_TEXT[kind]} ${formatQuantity(qty, material.unit)} ${material.name} at ${project?.name ?? "the main store"} on ${formatDate(input.date)}${input.notes ? ` — ${input.notes}` : ""}`,
    });
  });
}

/** Moves stock between the store and sites, valued at the average purchase rate. */
export async function transferStock(
  actor: Actor & { id: string },
  input: { date: ISODate; materialId: string; from: string; to: string; quantity: string; notes: string | null; confirmShortage?: boolean },
): Promise<void> {
  if (!can(actor, "materials.record")) throw new ForbiddenError();
  const [from, to] = await Promise.all([locationProject(actor, input.from), locationProject(actor, input.to)]);
  const material = await db.material.findFirst({ where: { id: input.materialId, deletedAt: null } });
  if (!material) throw new NotFoundError("material");
  const qty = new Decimal(input.quantity);
  if (!input.confirmShortage) {
    const available = await availableQuantity(material.id, from?.id ?? null);
    if (qty.gt(available)) {
      throw new AppError(
        `Only ${formatQuantity(available, material.unit)} of ${material.name} is recorded at ${from?.name ?? "the main store"}. Check the quantity, or confirm to move it anyway.`,
        { confirmShortage: "needs-confirmation" },
      );
    }
  }
  const unitCost = await averageCost(material.id);
  const group = randomUUID();
  await db.$transaction(async (tx) => {
    const common = { date: toDbDate(input.date), materialId: material.id, quantity: qty.toString(), unitCostPaise: unitCost, transferGroupId: group, notes: input.notes, recordedById: actor.id };
    await tx.inventoryTransaction.create({ data: { ...common, type: "TRANSFER_OUT", projectId: from?.id ?? null, siteId: from?.sites[0]?.id ?? null } });
    await tx.inventoryTransaction.create({ data: { ...common, type: "TRANSFER_IN", projectId: to?.id ?? null, siteId: to?.sites[0]?.id ?? null } });
    await audit(tx, {
      actor,
      action: "CREATE",
      entityType: "InventoryTransaction",
      projectId: to?.id ?? from?.id ?? null,
      summary: `moved ${formatQuantity(qty, material.unit)} ${material.name} from ${from?.name ?? "the main store"} to ${to?.name ?? "the main store"}${unitCost > 0n ? ` (worth about ${formatINR(multiplyQtyRate(qty, unitCost), { paise: false })})` : ""}`,
    });
  });
}
