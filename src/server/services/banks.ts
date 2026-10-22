import "server-only";
import type { AccountKind } from "@/generated/prisma/enums";
import { formatDate, fromDbDate, toDbDate, type ISODate } from "@/lib/dates";
import { formatINR, type Paise } from "@/lib/money";
import { can } from "@/lib/permissions";
import type { CurrentUser } from "@/server/auth/current-user";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { AppError, ForbiddenError, NotFoundError } from "@/server/errors";
import { accountBalances } from "@/server/services/ledger";

type Actor = Pick<CurrentUser, "id" | "name" | "role" | "permissions">;

export async function listAccounts(user: Actor) {
  if (!can(user, "bank.viewBalances")) throw new ForbiddenError();
  const [accounts, unreconciled] = await Promise.all([
    accountBalances(),
    db.bankTransaction.groupBy({ by: ["accountId"], where: { reconciledAt: null }, _count: { _all: true } }),
  ]);
  const holders = await db.user.findMany({ where: { id: { in: accounts.map((a) => a.holderUserId).filter(Boolean) as string[] } }, select: { id: true, name: true } });
  const projects = await db.project.findMany({ where: { id: { in: accounts.map((a) => a.projectId).filter(Boolean) as string[] } }, select: { id: true, name: true } });
  return accounts.map((a) => ({
    ...a,
    openingDate: fromDbDate(a.openingDate),
    unreconciled: unreconciled.find((u) => u.accountId === a.id)?._count._all ?? 0,
    holder: holders.find((h) => h.id === a.holderUserId)?.name ?? null,
    project: projects.find((p) => p.id === a.projectId)?.name ?? null,
  }));
}

export async function getAccountLedger(user: Actor, id: string, filter: { from?: ISODate | null; to?: ISODate | null } = {}) {
  if (!can(user, "bank.viewBalances")) throw new ForbiddenError();
  const account = await db.bankAccount.findUnique({ where: { id } });
  if (!account) return null;
  const all = await db.bankTransaction.findMany({
    where: { accountId: id },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    include: { createdBy: { select: { name: true } }, reconciledBy: { select: { name: true } } },
  });
  // Running balance over the whole history, then show the requested window.
  let balance = account.openingBalancePaise;
  const withBalance = all.map((t) => {
    balance += t.amountPaise;
    return { ...t, date: fromDbDate(t.date), balancePaise: balance };
  });
  const inWindow = withBalance.filter((t) => (!filter.from || t.date >= filter.from) && (!filter.to || t.date <= filter.to));
  const openingForWindow = filter.from
    ? (withBalance.filter((t) => t.date < filter.from!).at(-1)?.balancePaise ?? account.openingBalancePaise)
    : account.openingBalancePaise;
  return {
    account: { ...account, openingDate: fromDbDate(account.openingDate) },
    entries: inWindow.reverse(),
    openingForWindowPaise: openingForWindow,
    closingPaise: balance,
    inPaise: inWindow.filter((t) => t.amountPaise > 0n).reduce((s, t) => s + t.amountPaise, 0n),
    outPaise: inWindow.filter((t) => t.amountPaise < 0n).reduce((s, t) => s - t.amountPaise, 0n),
  };
}

type AccountInput = {
  kind: AccountKind;
  name: string;
  bankName: string | null;
  accountHolderName: string | null;
  accountType: string | null;
  accountNumberLast4: string | null;
  ifsc: string | null;
  branch: string | null;
  upiId: string | null;
  holderUserId: string | null;
  projectId: string | null;
  openingBalancePaise: Paise;
  openingDate: ISODate;
  notes: string | null;
};

export async function createAccount(actor: Actor, input: AccountInput): Promise<{ id: string }> {
  if (!can(actor, "bank.manage")) throw new ForbiddenError("Only the owner can add bank or cash accounts.");
  if (input.kind === "SITE_CASH" && !input.holderUserId) throw new AppError("Choose who holds the site cash.", { holderUserId: "Choose a person." });
  return db.$transaction(async (tx) => {
    const a = await tx.bankAccount.create({ data: { ...input, openingDate: toDbDate(input.openingDate) } });
    await audit(tx, {
      actor,
      action: "CREATE",
      entityType: "BankAccount",
      entityId: a.id,
      summary: `added ${input.kind === "BANK" ? "bank account" : input.kind === "CASH" ? "cash account" : "site cash account"} "${a.name}" with opening balance ${formatINR(a.openingBalancePaise)} on ${formatDate(input.openingDate)}`,
    });
    return { id: a.id };
  });
}

/** Name, notes and status only. The opening balance is fixed once there are transactions. */
export async function updateAccount(actor: Actor, id: string, input: Partial<AccountInput> & { isActive?: boolean }): Promise<void> {
  if (!can(actor, "bank.manage")) throw new ForbiddenError();
  const a = await db.bankAccount.findUnique({ where: { id }, include: { _count: { select: { transactions: true } } } });
  if (!a) throw new NotFoundError("account");
  if (a._count.transactions > 0 && input.openingBalancePaise !== undefined && input.openingBalancePaise !== a.openingBalancePaise) {
    throw new AppError("The opening balance cannot be changed after money has moved through this account.");
  }
  await db.$transaction(async (tx) => {
    await tx.bankAccount.update({
      where: { id },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.bankName !== undefined ? { bankName: input.bankName } : {}),
        ...(input.branch !== undefined ? { branch: input.branch } : {}),
        ...(input.upiId !== undefined ? { upiId: input.upiId } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.openingBalancePaise !== undefined && a._count.transactions === 0 ? { openingBalancePaise: input.openingBalancePaise } : {}),
      },
    });
    await audit(tx, { actor, action: "UPDATE", entityType: "BankAccount", entityId: id, summary: `updated account "${a.name}"${input.isActive === false ? " (closed)" : ""}` });
  });
}

/** Tick / untick an entry as matched with the bank statement. */
export async function setReconciled(actor: Actor & { id: string }, transactionId: string, reconciled: boolean, statementRef: string | null): Promise<void> {
  if (!can(actor, "bank.manage")) throw new ForbiddenError("Only the owner can reconcile accounts.");
  const t = await db.bankTransaction.findUnique({ where: { id: transactionId }, include: { account: true } });
  if (!t) throw new NotFoundError("transaction");
  await db.$transaction(async (tx) => {
    await tx.bankTransaction.update({
      where: { id: transactionId },
      data: reconciled ? { reconciledAt: new Date(), reconciledById: actor.id, statementRef } : { reconciledAt: null, reconciledById: null, statementRef: null },
    });
    await audit(tx, {
      actor,
      action: "UPDATE",
      entityType: "BankTransaction",
      entityId: transactionId,
      summary: `${reconciled ? "matched" : "un-matched"} ${formatINR(t.amountPaise)} on ${t.account.name} (${formatDate(t.date)}) ${reconciled ? "with the bank statement" : ""}`,
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Month lock
// ─────────────────────────────────────────────────────────────────────────────

export async function currentLock() {
  const lock = await db.periodLock.findFirst({ orderBy: { createdAt: "desc" }, include: { lockedBy: { select: { name: true } } } });
  return lock ? { ...lock, lockedUpTo: fromDbDate(lock.lockedUpTo) } : null;
}

export async function lockPeriod(actor: Actor & { id: string }, lockedUpTo: ISODate | null, reason: string | null): Promise<void> {
  if (!can(actor, "periods.lock")) throw new ForbiddenError("Only the owner can lock months.");
  const previous = await currentLock();
  await db.$transaction(async (tx) => {
    // An "unlock" is recorded as a lock date far in the past, so history is kept.
    await tx.periodLock.create({ data: { lockedUpTo: toDbDate(lockedUpTo ?? "2000-01-01"), reason, lockedById: actor.id } });
    await audit(tx, {
      actor,
      action: "LOCK_PERIOD",
      entityType: "PeriodLock",
      summary: lockedUpTo
        ? `locked all money entries up to ${formatDate(lockedUpTo)}${reason ? ` — "${reason}"` : ""}`
        : `removed the month lock (was ${previous ? formatDate(previous.lockedUpTo) : "none"})${reason ? ` — "${reason}"` : ""}`,
    });
  });
}
