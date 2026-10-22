import "server-only";
import Decimal from "decimal.js";
import type { InventoryTxnType } from "@/generated/prisma/enums";
import { formatDate, toDbDate, type ISODate } from "@/lib/dates";
import { multiplyQtyRate, type Paise } from "@/lib/money";
import { can } from "@/lib/permissions";
import type { CurrentUser } from "@/server/auth/current-user";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { AppError, ForbiddenError, NotFoundError } from "@/server/errors";

/**
 * Material stock is never stored as a number that gets overwritten — it is
 * always the sum of the stock ledger (InventoryTransaction). That gives a
 * full history of every bag and every tonne.
 */

const INCOMING: InventoryTxnType[] = ["OPENING", "PURCHASE", "TRANSFER_IN"];
const OUTGOING: InventoryTxnType[] = ["USAGE", "TRANSFER_OUT", "DAMAGE", "RETURN"];

export type StockStatus = "AVAILABLE" | "LOW_STOCK" | "OUT_OF_STOCK";

export function stockStatus(remaining: Decimal, reorderLevel: Decimal): StockStatus {
  if (remaining.lte(0)) return "OUT_OF_STOCK";
  if (reorderLevel.gt(0) && remaining.lte(reorderLevel)) return "LOW_STOCK";
  return "AVAILABLE";
}

export type StockRow = {
  materialId: string;
  materialName: string;
  unit: string;
  category: string;
  projectId: string | null;
  projectName: string;
  opening: string;
  purchased: string;
  used: string;
  transferredNet: string;
  damaged: string;
  remaining: string;
  reorderLevel: string;
  valuePaise: Paise;
  status: StockStatus;
};

/**
 * Current stock per material per location (project, or the main store).
 * `projectIds` null = everything.
 */
export async function stockLevels(projectIds: string[] | null): Promise<StockRow[]> {
  const scope = projectIds === null ? {} : { projectId: { in: projectIds } };
  const [sums, costs, materials, projects] = await Promise.all([
    db.inventoryTransaction.groupBy({ by: ["materialId", "projectId", "type"], where: scope, _sum: { quantity: true } }),
    // Weighted average cost per material from everything ever bought / opened.
    db.$queryRaw<{ materialId: string; qty: string; value: string }[]>`
      SELECT "materialId", SUM("quantity")::text AS qty, SUM("quantity" * COALESCE("unitCostPaise", 0))::text AS value
      FROM "InventoryTransaction"
      WHERE "type" IN ('OPENING', 'PURCHASE') AND "unitCostPaise" IS NOT NULL
      GROUP BY "materialId"`,
    db.material.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, unit: true, reorderLevel: true, category: { select: { name: true } } },
    }),
    db.project.findMany({ where: projectIds === null ? {} : { id: { in: projectIds } }, select: { id: true, name: true } }),
  ]);

  const avgCost = new Map(
    costs.map((c) => {
      const qty = new Decimal(c.qty);
      return [c.materialId, qty.gt(0) ? new Decimal(c.value).dividedBy(qty) : new Decimal(0)];
    }),
  );
  const materialById = new Map(materials.map((m) => [m.id, m]));
  const projectName = new Map(projects.map((p) => [p.id, p.name]));

  type Acc = { opening: Decimal; purchased: Decimal; used: Decimal; tIn: Decimal; tOut: Decimal; damaged: Decimal; returned: Decimal; adjust: Decimal };
  const acc = new Map<string, Acc>();
  for (const s of sums) {
    const key = `${s.materialId}|${s.projectId ?? ""}`;
    const a =
      acc.get(key) ??
      ({ opening: new Decimal(0), purchased: new Decimal(0), used: new Decimal(0), tIn: new Decimal(0), tOut: new Decimal(0), damaged: new Decimal(0), returned: new Decimal(0), adjust: new Decimal(0) } as Acc);
    const q = new Decimal(s._sum.quantity?.toString() ?? "0");
    switch (s.type) {
      case "OPENING": a.opening = a.opening.plus(q); break;
      case "PURCHASE": a.purchased = a.purchased.plus(q); break;
      case "USAGE": a.used = a.used.plus(q); break;
      case "TRANSFER_IN": a.tIn = a.tIn.plus(q); break;
      case "TRANSFER_OUT": a.tOut = a.tOut.plus(q); break;
      case "DAMAGE": a.damaged = a.damaged.plus(q); break;
      case "RETURN": a.returned = a.returned.plus(q); break;
      case "ADJUSTMENT": a.adjust = a.adjust.plus(q); break;
    }
    acc.set(key, a);
  }

  const rows: StockRow[] = [];
  for (const [key, a] of acc) {
    const [materialId, projectId] = key.split("|");
    const material = materialById.get(materialId);
    if (!material) continue;
    const remaining = a.opening.plus(a.purchased).plus(a.tIn).plus(a.adjust).minus(a.used).minus(a.tOut).minus(a.damaged).minus(a.returned);
    const reorder = new Decimal(material.reorderLevel.toString());
    const cost = avgCost.get(materialId) ?? new Decimal(0);
    rows.push({
      materialId,
      materialName: material.name,
      unit: material.unit,
      category: material.category.name,
      projectId: projectId || null,
      projectName: projectId ? (projectName.get(projectId) ?? "Project") : "Main store",
      opening: a.opening.toString(),
      purchased: a.purchased.toString(),
      used: a.used.toString(),
      transferredNet: a.tIn.minus(a.tOut).toString(),
      damaged: a.damaged.toString(),
      remaining: remaining.toString(),
      reorderLevel: reorder.toString(),
      valuePaise: remaining.gt(0) ? multiplyQtyRate(remaining, BigInt(cost.toDecimalPlaces(0).toFixed(0))) : 0n,
      status: stockStatus(remaining, reorder),
    });
  }
  return rows.sort((x, y) => x.projectName.localeCompare(y.projectName) || x.materialName.localeCompare(y.materialName));
}

export async function availableQuantity(materialId: string, projectId: string | null): Promise<Decimal> {
  const rows = await db.inventoryTransaction.groupBy({
    by: ["type"],
    where: { materialId, projectId },
    _sum: { quantity: true },
  });
  let total = new Decimal(0);
  for (const r of rows) {
    const q = new Decimal(r._sum.quantity?.toString() ?? "0");
    if (INCOMING.includes(r.type) || r.type === "ADJUSTMENT") total = total.plus(q);
    else if (OUTGOING.includes(r.type)) total = total.minus(q);
  }
  return total;
}

export async function recordMaterialUsage(
  actor: Pick<CurrentUser, "id" | "name" | "role" | "permissions">,
  input: {
    date: ISODate;
    materialId: string;
    projectId: string;
    siteId?: string | null;
    quantity: string;
    workItemId?: string | null;
    notes?: string | null;
    confirmShortage?: boolean;
  },
): Promise<{ id: string }> {
  if (!can(actor, "materials.record")) throw new ForbiddenError();
  const qty = new Decimal(input.quantity);
  if (!qty.isFinite() || qty.lte(0)) throw new AppError("Enter the quantity used.", { quantity: "Enter the quantity used." });
  const material = await db.material.findFirst({ where: { id: input.materialId, deletedAt: null } });
  if (!material) throw new NotFoundError("material");
  const project = await db.project.findFirst({ where: { id: input.projectId, deletedAt: null }, select: { id: true, name: true } });
  if (!project) throw new NotFoundError("project");

  if (!input.confirmShortage) {
    const available = await availableQuantity(material.id, project.id);
    if (qty.gt(available)) {
      throw new AppError(
        `Only ${available.toString()} ${material.unit} of ${material.name} is recorded at ${project.name}. Check the quantity, or confirm to save anyway.`,
        { confirmShortage: "needs-confirmation" },
      );
    }
  }
  return db.$transaction(async (tx) => {
    const row = await tx.inventoryTransaction.create({
      data: {
        date: toDbDate(input.date),
        materialId: material.id,
        projectId: project.id,
        siteId: input.siteId ?? null,
        type: "USAGE",
        quantity: qty.toString(),
        workItemId: input.workItemId ?? null,
        notes: input.notes ?? null,
        recordedById: actor.id,
      },
    });
    await audit(tx, {
      actor,
      action: "CREATE",
      entityType: "InventoryTransaction",
      entityId: row.id,
      projectId: project.id,
      summary: `recorded use of ${qty.toString()} ${material.unit} ${material.name} at ${project.name} on ${formatDate(input.date)}`,
    });
    return { id: row.id };
  });
}
