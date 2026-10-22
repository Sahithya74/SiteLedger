import "server-only";
import type { LedgerSource, PayeeType, PaymentPurpose } from "@/generated/prisma/enums";
import { fromDbDate, toDbDate, type ISODate } from "@/lib/dates";
import { sumPaise } from "@/lib/money";
import { can } from "@/lib/permissions";
import type { CurrentUser } from "@/server/auth/current-user";
import { db } from "@/server/db";
import { ForbiddenError } from "@/server/errors";
import { accessibleProjectIds, seesAllProjects } from "@/server/scope";

type Actor = Pick<CurrentUser, "id" | "name" | "role" | "permissions">;
type Period = { from?: ISODate | null; to?: ISODate | null };

function dateWhere(p: Period) {
  if (!p.from && !p.to) return {};
  return { date: { ...(p.from ? { gte: toDbDate(p.from) } : {}), ...(p.to ? { lte: toDbDate(p.to) } : {}) } };
}

async function projectScope(user: Actor & { id: string }) {
  const ids = await accessibleProjectIds(user);
  // Records without a project (office expenses…) are company-level: owner / all-project users only.
  return ids === null ? {} : { projectId: { in: ids } };
}

export async function listClientPayments(user: Actor & { id: string }, filter: Period & { projectId?: string; clientId?: string } = {}) {
  if (!can(user, "projects.viewMoney") && !can(user, "clientPayments.record")) throw new ForbiddenError();
  const rows = await db.clientPayment.findMany({
    where: { ...(await projectScope(user)), ...dateWhere(filter), ...(filter.projectId ? { projectId: filter.projectId } : {}), ...(filter.clientId ? { clientId: filter.clientId } : {}) },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 500,
    include: {
      client: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
      account: { select: { name: true } },
      invoice: { select: { id: true, number: true } },
      reversedBy: { select: { id: true } },
      createdBy: { select: { name: true } },
    },
  });
  return rows.map((r) => ({ ...r, date: fromDbDate(r.date) }));
}

export async function listPaymentsMade(
  user: Actor & { id: string },
  filter: Period & { projectId?: string; payeeType?: PayeeType; purpose?: PaymentPurpose } = {},
) {
  if (!can(user, "payments.record") && !can(user, "bank.viewBalances")) throw new ForbiddenError();
  const rows = await db.payment.findMany({
    where: {
      ...(seesAllProjects(user) ? {} : await projectScope(user)),
      ...dateWhere(filter),
      ...(filter.projectId ? { projectId: filter.projectId } : {}),
      ...(filter.payeeType ? { payeeType: filter.payeeType } : {}),
      ...(filter.purpose ? { purpose: filter.purpose } : {}),
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 500,
    include: {
      supplier: { select: { id: true, name: true } },
      labour: { select: { id: true, name: true } },
      engineer: { select: { id: true, name: true } },
      contractor: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
      account: { select: { name: true } },
      reversedBy: { select: { id: true } },
    },
  });
  return rows.map((r) => ({
    ...r,
    date: fromDbDate(r.date),
    payee: r.supplier?.name ?? r.labour?.name ?? r.engineer?.name ?? r.contractor?.name ?? r.payeeName ?? "—",
    payeeHref: r.supplier ? `/materials/suppliers/${r.supplier.id}` : r.labour ? `/labour/${r.labour.id}` : r.engineer ? `/engineers/${r.engineer.id}` : r.contractor ? `/labour/contractors/${r.contractor.id}` : null,
  }));
}

export async function listExpenses(user: Actor & { id: string }, filter: Period & { projectId?: string; categoryId?: string; office?: boolean } = {}) {
  const canSeeAll = seesAllProjects(user);
  const rows = await db.expense.findMany({
    where: {
      ...(canSeeAll ? {} : await projectScope(user)),
      ...dateWhere(filter),
      ...(filter.office ? { projectId: null } : filter.projectId ? { projectId: filter.projectId } : {}),
      ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
      // Managers without "see project money" only see expenses they recorded.
      ...(can(user, "projects.viewMoney") ? {} : { createdById: user.id }),
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 500,
    include: {
      category: { select: { name: true, group: true, isWelfare: true } },
      project: { select: { id: true, name: true } },
      account: { select: { name: true } },
      reversedBy: { select: { id: true } },
      createdBy: { select: { name: true } },
    },
  });
  return rows.map((r) => ({ ...r, date: fromDbDate(r.date) }));
}

export async function expenseCategories(includeInactive = false) {
  return db.expenseCategory.findMany({ where: includeInactive ? {} : { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
}

export async function listOtherIncome(user: Actor & { id: string }, filter: Period = {}) {
  if (!can(user, "projects.viewMoney") && !can(user, "clientPayments.record")) throw new ForbiddenError();
  const rows = await db.otherIncome.findMany({
    where: { ...(seesAllProjects(user) ? {} : await projectScope(user)), ...dateWhere(filter) },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: { project: { select: { id: true, name: true } }, account: { select: { name: true } }, reversedBy: { select: { id: true } } },
  });
  return rows.map((r) => ({ ...r, date: fromDbDate(r.date) }));
}

/** Every ledger entry, newest first, optionally for one account. */
export async function ledgerEntries(user: Actor & { id: string }, filter: Period & { accountId?: string; source?: LedgerSource; projectId?: string; unreconciledOnly?: boolean } = {}) {
  if (!can(user, "bank.viewBalances")) throw new ForbiddenError();
  const rows = await db.bankTransaction.findMany({
    where: {
      ...dateWhere(filter),
      ...(filter.accountId ? { accountId: filter.accountId } : {}),
      ...(filter.source ? { source: filter.source } : {}),
      ...(filter.projectId ? { projectId: filter.projectId } : {}),
      ...(filter.unreconciledOnly ? { reconciledAt: null } : {}),
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 1000,
    include: { account: { select: { id: true, name: true } }, createdBy: { select: { name: true } } },
  });
  return rows.map((r) => ({ ...r, date: fromDbDate(r.date) }));
}

export function totals<T extends { amountPaise: bigint }>(rows: T[]) {
  return sumPaise(rows.map((r) => r.amountPaise));
}

/** One client payment with what is needed to print its receipt. */
export async function getClientPaymentReceipt(user: Actor & { id: string }, id: string) {
  if (!can(user, "projects.viewMoney") && !can(user, "clientPayments.record")) throw new ForbiddenError();
  const p = await db.clientPayment.findUnique({
    where: { id },
    include: {
      client: true,
      project: { select: { id: true, name: true, address: true, city: true } },
      invoice: { select: { number: true, raNumber: true } },
      account: { select: { name: true } },
      createdBy: { select: { name: true } },
    },
  });
  if (!p) return null;
  const ids = await accessibleProjectIds(user);
  if (ids !== null && !ids.includes(p.projectId)) return null;
  return { ...p, date: fromDbDate(p.date) };
}
