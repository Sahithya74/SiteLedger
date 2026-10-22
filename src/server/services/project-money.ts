import "server-only";
import Decimal from "decimal.js";
import { Prisma } from "@/generated/prisma/client";
import { fromDbDateOrNull, todayIST } from "@/lib/dates";
import { sumPaise, type Paise } from "@/lib/money";
import {
  isOverdue,
  leafItems,
  overallProgress,
  scheduleHealth,
  type ProgressItem,
  type ScheduleHealth,
} from "@/lib/progress";
import { computeProjectMoney, EMPTY_MONEY_INPUT, type ProjectMoney, type ProjectMoneyInput } from "@/lib/project-finance";
import { db } from "@/server/db";

export type CostBreakdown = {
  materials: Paise;
  labour: Paise;
  engineers: Paise;
  contractors: Paise;
  transport: Paise;
  foodWelfare: Paise;
  equipment: Paise;
  other: Paise; // rent, electricity, misc
};

export type ProjectMoneyResult = {
  input: ProjectMoneyInput;
  money: ProjectMoney;
  costs: CostBreakdown;
};

const emptyCosts = (): CostBreakdown => ({
  materials: 0n,
  labour: 0n,
  engineers: 0n,
  contractors: 0n,
  transport: 0n,
  foodWelfare: 0n,
  equipment: 0n,
  other: 0n,
});

/**
 * Loads everything needed to work out each project's money position.
 * One grouped query per source table, regardless of how many projects.
 */
export async function loadProjectMoney(projectIds: string[]): Promise<Map<string, ProjectMoneyResult>> {
  const result = new Map<string, ProjectMoneyResult>();
  if (projectIds.length === 0) return result;
  const inProjects = { projectId: { in: projectIds } };

  const [
    projects,
    variations,
    invoices,
    clientPayments,
    purchases,
    labourWages,
    engineerWages,
    salaryPayments,
    contractorBills,
    expenses,
    categories,
    budgets,
    workItems,
    stockMoves,
  ] = await Promise.all([
    db.project.findMany({
      where: { id: { in: projectIds } },
      select: { id: true, quotedPaise: true, contractPaise: true },
    }),
    db.variation.groupBy({ by: ["projectId"], where: { ...inProjects, status: "APPROVED" }, _sum: { amountPaise: true } }),
    db.invoice.groupBy({ by: ["projectId"], where: { ...inProjects, status: "ISSUED" }, _sum: { totalPaise: true } }),
    db.clientPayment.groupBy({
      by: ["projectId"],
      where: inProjects,
      _sum: { amountPaise: true, tdsDeductedPaise: true },
    }),
    db.purchase.groupBy({ by: ["projectId"], where: { ...inProjects, cancelledAt: null }, _sum: { totalPaise: true } }),
    db.attendance.groupBy({
      by: ["projectId"],
      where: { ...inProjects, labourId: { not: null } },
      _sum: { wagePaise: true, adjustmentPaise: true },
    }),
    db.attendance.groupBy({
      by: ["projectId"],
      where: { ...inProjects, engineerId: { not: null } },
      _sum: { wagePaise: true, adjustmentPaise: true },
    }),
    // Salaries are charged to a project when paid. Wages, advances and bill
    // payments only settle costs already counted elsewhere.
    db.payment.groupBy({
      by: ["projectId", "payeeType"],
      where: { ...inProjects, purpose: { in: ["SALARY", "OTHER"] } },
      _sum: { amountPaise: true },
    }),
    db.contractorBill.groupBy({ by: ["projectId"], where: { ...inProjects, status: "APPROVED" }, _sum: { grossPaise: true } }),
    db.expense.groupBy({ by: ["projectId", "categoryId"], where: inProjects, _sum: { amountPaise: true } }),
    db.expenseCategory.findMany({ select: { id: true, group: true } }),
    db.projectBudget.groupBy({ by: ["projectId"], where: inProjects, _sum: { budgetPaise: true } }),
    db.workItem.findMany({
      where: { ...inProjects, deletedAt: null },
      select: { id: true, projectId: true, parentId: true, estimatedCostPaise: true, status: true, percentComplete: true },
    }),
    // Material moved in from the store (or opening stock at a site) is a cost of that
    // site; material moved out is credited back. Valued at the recorded rate.
    db.$queryRaw<{ projectId: string; value: string | null }[]>`
      SELECT "projectId",
             SUM(CASE WHEN "type" = 'TRANSFER_OUT' THEN -1 ELSE 1 END * "quantity" * COALESCE("unitCostPaise", 0))::text AS value
      FROM "InventoryTransaction"
      WHERE "projectId" IN (${Prisma.join(projectIds)}) AND "type" IN ('TRANSFER_IN', 'TRANSFER_OUT', 'OPENING')
      GROUP BY "projectId"`,
  ]);

  const groupOf = new Map(categories.map((c) => [c.id, c.group]));

  for (const p of projects) {
    result.set(p.id, {
      input: { ...EMPTY_MONEY_INPUT, quotedPaise: p.quotedPaise, contractPaise: p.contractPaise },
      money: computeProjectMoney(EMPTY_MONEY_INPUT),
      costs: emptyCosts(),
    });
  }
  const get = (id: string | null) => (id ? result.get(id) : undefined);

  for (const v of variations) {
    const r = get(v.projectId);
    if (r) r.input.approvedVariationsPaise = v._sum.amountPaise ?? 0n;
  }
  for (const i of invoices) {
    const r = get(i.projectId);
    if (r) r.input.billedPaise = i._sum.totalPaise ?? 0n;
  }
  for (const c of clientPayments) {
    const r = get(c.projectId);
    if (r) {
      r.input.receivedCashPaise = c._sum.amountPaise ?? 0n;
      r.input.clientTdsPaise = c._sum.tdsDeductedPaise ?? 0n;
    }
  }
  for (const pu of purchases) {
    const r = get(pu.projectId);
    if (r) r.costs.materials += pu._sum.totalPaise ?? 0n;
  }
  for (const m of stockMoves) {
    const r = get(m.projectId);
    if (r && m.value) r.costs.materials += BigInt(new Decimal(m.value).toDecimalPlaces(0).toFixed(0));
  }
  for (const a of labourWages) {
    const r = get(a.projectId);
    if (r) r.costs.labour += (a._sum.wagePaise ?? 0n) + (a._sum.adjustmentPaise ?? 0n);
  }
  for (const a of engineerWages) {
    const r = get(a.projectId);
    if (r) r.costs.engineers += (a._sum.wagePaise ?? 0n) + (a._sum.adjustmentPaise ?? 0n);
  }
  for (const pay of salaryPayments) {
    const r = get(pay.projectId);
    if (!r) continue;
    const amount = pay._sum.amountPaise ?? 0n;
    if (pay.payeeType === "ENGINEER") r.costs.engineers += amount;
    else if (pay.payeeType === "CONTRACTOR") r.costs.contractors += amount;
    else if (pay.payeeType === "LABOUR") r.costs.labour += amount;
    else if (pay.payeeType === "SUPPLIER") r.costs.materials += amount;
    else r.costs.other += amount;
  }
  for (const b of contractorBills) {
    const r = get(b.projectId);
    if (r) r.costs.contractors += b._sum.grossPaise ?? 0n;
  }
  for (const e of expenses) {
    const r = get(e.projectId);
    if (!r) continue;
    const amount = e._sum.amountPaise ?? 0n;
    switch (groupOf.get(e.categoryId)) {
      case "MATERIALS":
        r.costs.materials += amount;
        break;
      case "LABOUR":
        r.costs.labour += amount;
        break;
      case "ENGINEERS":
        r.costs.engineers += amount;
        break;
      case "CONTRACTORS":
        r.costs.contractors += amount;
        break;
      case "TRANSPORT":
        r.costs.transport += amount;
        break;
      case "FOOD_WELFARE":
        r.costs.foodWelfare += amount;
        break;
      case "EQUIPMENT":
        r.costs.equipment += amount;
        break;
      default:
        r.costs.other += amount;
    }
  }

  const budgetByProject = new Map(budgets.map((b) => [b.projectId, b._sum.budgetPaise ?? 0n]));
  const itemsByProject = new Map<string, typeof workItems>();
  for (const w of workItems) {
    const list = itemsByProject.get(w.projectId) ?? [];
    list.push(w);
    itemsByProject.set(w.projectId, list);
  }

  for (const [id, r] of result) {
    const budget = budgetByProject.get(id) ?? 0n;
    const leaves = leafItems(itemsByProject.get(id) ?? []);
    r.input.estimatedCostPaise = budget > 0n ? budget : sumPaise(leaves.map((w) => w.estimatedCostPaise));
    r.input.materialsPaise = r.costs.materials;
    r.input.labourPaise = r.costs.labour;
    r.input.engineersPaise = r.costs.engineers;
    r.input.contractorsPaise = r.costs.contractors;
    r.input.expensesPaise = sumPaise([r.costs.transport, r.costs.foodWelfare, r.costs.equipment, r.costs.other]);
    r.money = computeProjectMoney(r.input);
  }
  return result;
}

export type WorkStats = {
  progress: number;
  health: ScheduleHealth;
  totalItems: number;
  completedItems: number;
  overdueItems: number;
  delayedItems: number;
};

/** Progress, schedule health and overdue counts per project. */
export async function loadWorkStats(projectIds: string[], today = todayIST()): Promise<Map<string, WorkStats>> {
  const result = new Map<string, WorkStats>();
  if (projectIds.length === 0) return result;
  const items = await db.workItem.findMany({
    where: { projectId: { in: projectIds }, deletedAt: null },
    select: {
      id: true,
      projectId: true,
      parentId: true,
      status: true,
      percentComplete: true,
      estimatedCostPaise: true,
      startDate: true,
      expectedEndDate: true,
    },
  });
  const byProject = new Map<string, ProgressItem[]>();
  for (const i of items) {
    const list = byProject.get(i.projectId) ?? [];
    list.push({
      id: i.id,
      parentId: i.parentId,
      status: i.status,
      percentComplete: i.percentComplete,
      estimatedCostPaise: i.estimatedCostPaise,
      startDate: fromDbDateOrNull(i.startDate),
      expectedEndDate: fromDbDateOrNull(i.expectedEndDate),
    });
    byProject.set(i.projectId, list);
  }
  for (const id of projectIds) {
    const list = byProject.get(id) ?? [];
    const leaves = leafItems(list);
    result.set(id, {
      progress: overallProgress(list),
      health: scheduleHealth(list, today),
      totalItems: leaves.length,
      completedItems: leaves.filter((i) => i.status === "COMPLETED").length,
      overdueItems: leaves.filter((i) => isOverdue(i, today)).length,
      delayedItems: leaves.filter((i) => i.status === "DELAYED").length,
    });
  }
  return result;
}
