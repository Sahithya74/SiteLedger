import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { addMonths, fromDbDate, startOfMonth, todayIST, toDbDate, type ISODate } from "@/lib/dates";
import { sumPaise, type Paise } from "@/lib/money";
import { can } from "@/lib/permissions";
import type { CurrentUser } from "@/server/auth/current-user";
import { db } from "@/server/db";
import { ForbiddenError } from "@/server/errors";
import { accessibleProjectIds } from "@/server/scope";
import { receivables } from "@/server/services/billing";
import { accountBalances } from "@/server/services/ledger";
import { contractorPayables, pendingWagesSummary, supplierPayables } from "@/server/services/payables";
import { loadProjectMoney } from "@/server/services/project-money";

type Actor = Pick<CurrentUser, "id" | "name" | "role" | "permissions">;

/** Money in / out by month for a range (cash basis, transfers excluded). */
export async function monthlyInOut(from: ISODate, to: ISODate) {
  const rows = await db.$queryRaw<{ month: string; inflow: bigint | null; outflow: bigint | null }[]>`
    SELECT to_char("date", 'YYYY-MM') AS month,
           SUM(CASE WHEN "amountPaise" > 0 THEN "amountPaise" ELSE 0 END)::bigint AS inflow,
           SUM(CASE WHEN "amountPaise" < 0 THEN -"amountPaise" ELSE 0 END)::bigint AS outflow
    FROM "BankTransaction"
    WHERE "date" BETWEEN ${toDbDate(from)}::date AND ${toDbDate(to)}::date AND "source" <> 'TRANSFER'
    GROUP BY 1 ORDER BY 1`;
  const months: { month: string; inPaise: Paise; outPaise: Paise }[] = [];
  for (let m = startOfMonth(from); m <= to; m = addMonths(m, 1)) {
    const r = rows.find((x) => x.month === m.slice(0, 7));
    months.push({ month: m.slice(0, 7), inPaise: BigInt(r?.inflow ?? 0n), outPaise: BigInt(r?.outflow ?? 0n) });
    if (months.length > 36) break;
  }
  return months;
}

/** Ledger totals by source for a period: what came in and went out, and why. */
async function bySource(from: ISODate | null, to: ISODate | null) {
  const rows = await db.bankTransaction.groupBy({
    by: ["source"],
    where: {
      source: { not: "TRANSFER" },
      ...(from || to ? { date: { ...(from ? { gte: toDbDate(from) } : {}), ...(to ? { lte: toDbDate(to) } : {}) } } : {}),
    },
    _sum: { amountPaise: true },
  });
  const get = (s: string) => rows.find((r) => r.source === s)?._sum.amountPaise ?? 0n;
  return {
    clientPaymentsPaise: get("CLIENT_PAYMENT"),
    otherIncomePaise: get("OTHER_INCOME"),
    paymentsPaise: -get("PAYMENT"),
    expensesPaise: -get("EXPENSE"),
  };
}

/** Expenses by cost head for the period (accrual: what was spent, not when paid). */
async function expensesByGroup(from: ISODate | null, to: ISODate | null) {
  const rows = await db.$queryRaw<{ group: string; total: bigint | null }[]>`
    SELECT c."group"::text AS "group", SUM(e."amountPaise")::bigint AS total
    FROM "Expense" e JOIN "ExpenseCategory" c ON c."id" = e."categoryId"
    WHERE (${from}::date IS NULL OR e."date" >= ${from ?? null}::date) AND (${to}::date IS NULL OR e."date" <= ${to ?? null}::date)
    GROUP BY 1 ORDER BY 2 DESC`;
  return rows.map((r) => ({ group: r.group, totalPaise: BigInt(r.total ?? 0n) }));
}

export async function accountsOverview(user: Actor & { id: string }, period: { from: ISODate | null; to: ISODate | null }) {
  if (!can(user, "bank.viewBalances") && !can(user, "reports.view")) throw new ForbiddenError();
  const ids = await accessibleProjectIds(user);
  const today = todayIST();
  const projects = await db.project.findMany({
    where: { deletedAt: null, status: { notIn: ["CANCELLED"] }, ...(ids === null ? {} : { id: { in: ids } }) },
    select: { id: true, name: true, status: true },
    orderBy: { name: "asc" },
  });
  const [accounts, flows, groups, money, receivable, suppliersOwed, contractorsOwed, wages, trend, purchases] = await Promise.all([
    can(user, "bank.viewBalances") ? accountBalances() : Promise.resolve([]),
    bySource(period.from, period.to),
    expensesByGroup(period.from, period.to),
    loadProjectMoney(projects.map((p) => p.id)),
    receivables(user),
    supplierPayables(ids),
    contractorPayables(ids),
    pendingWagesSummary(ids),
    monthlyInOut(addMonths(startOfMonth(today), -11), today),
    db.purchase.aggregate({
      where: {
        cancelledAt: null,
        ...(period.from || period.to ? { purchaseDate: { ...(period.from ? { gte: toDbDate(period.from) } : {}), ...(period.to ? { lte: toDbDate(period.to) } : {}) } } : {}),
      },
      _sum: { totalPaise: true },
    }),
  ]);
  const cash = {
    bankPaise: sumPaise(accounts.filter((a) => a.kind === "BANK").map((a) => a.balancePaise)),
    cashPaise: sumPaise(accounts.filter((a) => a.kind === "CASH").map((a) => a.balancePaise)),
    siteCashPaise: sumPaise(accounts.filter((a) => a.kind === "SITE_CASH").map((a) => a.balancePaise)),
  };
  const profitability = projects.map((p) => {
    const m = money.get(p.id)!;
    return {
      ...p,
      valuePaise: m.money.projectValuePaise,
      receivedPaise: m.money.receivedPaise,
      spentPaise: m.money.spentPaise,
      costs: m.costs,
      profitSoFarPaise: m.money.receivedPaise - m.money.spentPaise,
      estimatedProfitPaise: m.money.estimatedProfitPaise,
      margin: m.money.projectValuePaise > 0n ? Number((m.money.estimatedProfitPaise * 1000n) / m.money.projectValuePaise) / 10 : null,
    };
  });
  return {
    cash,
    accounts,
    flows: { ...flows, inPaise: flows.clientPaymentsPaise + flows.otherIncomePaise, outPaise: flows.paymentsPaise + flows.expensesPaise },
    purchasesPaise: purchases._sum.totalPaise ?? 0n,
    expenseGroups: groups,
    receivablePaise: sumPaise(receivable.map((r) => r.pendingPaise)),
    overdueReceivablePaise: sumPaise(receivable.map((r) => r.overduePaise)),
    billedNotReceivedPaise: sumPaise(receivable.map((r) => r.billedNotReceivedPaise)),
    payables: {
      suppliersPaise: suppliersOwed,
      contractorsPaise: contractorsOwed,
      wagesPaise: wages.totalPaise,
      totalPaise: suppliersOwed + contractorsOwed + wages.totalPaise,
    },
    profitability,
    trend: trend.map((t) => ({ month: t.month, inPaise: t.inPaise.toString(), outPaise: t.outPaise.toString() })),
  };
}

/** Everything the business owes, line by line. */
export async function payablesDetail(user: Actor & { id: string }) {
  if (!can(user, "payments.record") && !can(user, "bank.viewBalances")) throw new ForbiddenError();
  const ids = await accessibleProjectIds(user);
  const scope = ids === null ? Prisma.empty : ids.length ? Prisma.sql`AND p."projectId" IN (${Prisma.join(ids)})` : Prisma.sql`AND FALSE`;
  const [suppliers, contractors, purchasesDue] = await Promise.all([
    db.$queryRaw<{ id: string; name: string; bought: bigint | null; paid: bigint | null }[]>`
      SELECT s."id", s."name",
        (SELECT SUM(p."totalPaise") FROM "Purchase" p WHERE p."supplierId" = s."id" AND p."cancelledAt" IS NULL ${scope})::bigint AS bought,
        (SELECT SUM(p."amountPaise") FROM "Payment" p WHERE p."supplierId" = s."id" ${scope})::bigint AS paid
      FROM "Supplier" s WHERE s."deletedAt" IS NULL`,
    db.$queryRaw<{ id: string; name: string; billed: bigint | null; paid: bigint | null }[]>`
      SELECT c."id", c."name",
        (SELECT SUM(b."netPaise") FROM "ContractorBill" b WHERE b."contractorId" = c."id" AND b."status" = 'APPROVED')::bigint AS billed,
        (SELECT SUM(p."amountPaise") FROM "Payment" p WHERE p."contractorId" = c."id")::bigint AS paid
      FROM "LabourContractor" c WHERE c."deletedAt" IS NULL`,
    db.purchase.findMany({
      where: { cancelledAt: null, dueDate: { not: null }, ...(ids === null ? {} : { projectId: { in: ids } }) },
      select: { id: true, number: true, dueDate: true, totalPaise: true, supplier: { select: { id: true, name: true } }, payments: { select: { amountPaise: true } } },
      orderBy: { dueDate: "asc" },
    }),
  ]);
  return {
    suppliers: suppliers
      .map((s) => ({ id: s.id, name: s.name, owedPaise: BigInt(s.bought ?? 0n) - BigInt(s.paid ?? 0n) }))
      .filter((s) => s.owedPaise > 0n)
      .sort((a, b) => (b.owedPaise > a.owedPaise ? 1 : -1)),
    contractors: contractors
      .map((c) => ({ id: c.id, name: c.name, owedPaise: BigInt(c.billed ?? 0n) - BigInt(c.paid ?? 0n) }))
      .filter((c) => c.owedPaise > 0n),
    billsDue: purchasesDue
      .map((p) => ({ id: p.id, number: p.number, dueDate: fromDbDate(p.dueDate!), supplier: p.supplier, balancePaise: p.totalPaise - sumPaise(p.payments.map((x) => x.amountPaise)) }))
      .filter((p) => p.balancePaise > 0n),
    wages: await pendingWagesSummary(ids),
  };
}
