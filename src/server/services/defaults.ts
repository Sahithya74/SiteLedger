import "server-only";
import type { CostGroup, MaterialKind } from "@/generated/prisma/enums";
import { todayIST, toDbDate } from "@/lib/dates";
import type { Tx } from "@/server/db";

/**
 * Starting configuration every installation needs (not demo data).
 * Safe to run many times — existing rows are left alone.
 */
export const DEFAULT_MATERIAL_CATEGORIES: { name: string; kind: MaterialKind }[] = [
  { name: "Aggregates (sand, jelly, metal)", kind: "AGGREGATE" },
  { name: "Cement", kind: "CEMENT" },
  { name: "Steel", kind: "STEEL" },
  { name: "Bricks & blocks", kind: "BRICK_BLOCK" },
  { name: "Stone & granite", kind: "STONE_GRANITE" },
  { name: "Tiles", kind: "TILES" },
  { name: "Electrical", kind: "ELECTRICAL" },
  { name: "Plumbing", kind: "PLUMBING" },
  { name: "Paint", kind: "PAINT" },
  { name: "Wood & doors", kind: "WOOD" },
  { name: "Hardware", kind: "HARDWARE" },
  { name: "Other materials", kind: "OTHER" },
];

export const DEFAULT_EXPENSE_CATEGORIES: { name: string; group: CostGroup; isWelfare?: boolean }[] = [
  { name: "Small materials", group: "MATERIALS" },
  { name: "Labour (lump sum)", group: "LABOUR" },
  { name: "Engineer expenses", group: "ENGINEERS" },
  { name: "Transport / lorry hire", group: "TRANSPORT" },
  { name: "Breakfast", group: "FOOD_WELFARE", isWelfare: true },
  { name: "Lunch", group: "FOOD_WELFARE", isWelfare: true },
  { name: "Dinner", group: "FOOD_WELFARE", isWelfare: true },
  { name: "Tea & snacks", group: "FOOD_WELFARE", isWelfare: true },
  { name: "Drinking water", group: "FOOD_WELFARE", isWelfare: true },
  { name: "Labour accommodation", group: "FOOD_WELFARE", isWelfare: true },
  { name: "Labour travel", group: "FOOD_WELFARE", isWelfare: true },
  { name: "Equipment rent", group: "EQUIPMENT" },
  { name: "Diesel / fuel", group: "EQUIPMENT" },
  { name: "Equipment repair", group: "EQUIPMENT" },
  { name: "Site / office rent", group: "RENT" },
  { name: "Electricity", group: "ELECTRICITY" },
  { name: "Approvals & fees", group: "OTHER" },
  { name: "Office expenses", group: "OTHER" },
  { name: "Other", group: "OTHER" },
];

export async function ensureDefaults(tx: Tx): Promise<void> {
  for (const [i, c] of DEFAULT_MATERIAL_CATEGORIES.entries()) {
    await tx.materialCategory.upsert({
      where: { name: c.name },
      create: { name: c.name, kind: c.kind, sortOrder: i * 10, isSystem: true },
      update: {},
    });
  }
  for (const [i, c] of DEFAULT_EXPENSE_CATEGORIES.entries()) {
    await tx.expenseCategory.upsert({
      where: { name: c.name },
      create: { name: c.name, group: c.group, isWelfare: c.isWelfare ?? false, sortOrder: i * 10, isSystem: true },
      update: {},
    });
  }
  // Every business has a cash box; bank accounts are added by the owner.
  const cash = await tx.bankAccount.findFirst({ where: { kind: "CASH" }, select: { id: true } });
  if (!cash) {
    await tx.bankAccount.create({
      data: { kind: "CASH", name: "Office cash", openingBalancePaise: 0n, openingDate: toDbDate(todayIST()) },
    });
  }
}
