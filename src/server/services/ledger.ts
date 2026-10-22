import "server-only";
import type { PayeeType, PaymentMethod, PaymentPurpose } from "@/generated/prisma/enums";
import { formatDate, fromDbDate, toDbDate, type ISODate } from "@/lib/dates";
import { PAYMENT_METHOD } from "@/lib/labels";
import { formatINR, type Paise } from "@/lib/money";
import { can } from "@/lib/permissions";
import type { CurrentUser } from "@/server/auth/current-user";
import { audit } from "@/server/audit";
import { db, type Tx } from "@/server/db";
import { AppError, ForbiddenError, NotFoundError } from "@/server/errors";
import { nextCode } from "@/server/services/sequence";

/**
 * The money ledger. Every function here writes the business record AND its
 * ledger entry AND an audit entry in one database transaction, so they can
 * never disagree. Nothing is ever edited or deleted — mistakes are corrected
 * with a reversal (see reverse*).
 */

type Actor = Pick<CurrentUser, "id" | "name" | "role" | "permissions">;

/** Refuses entries dated inside a month the owner has locked. */
export async function assertPeriodOpen(tx: Tx, date: ISODate): Promise<void> {
  const lock = await tx.periodLock.findFirst({ orderBy: { createdAt: "desc" } });
  if (lock && toDbDate(date) <= lock.lockedUpTo) {
    throw new AppError(
      `Entries up to ${formatDate(lock.lockedUpTo)} are locked because that period is closed. Ask the owner if this must be changed.`,
    );
  }
}

async function loadAccount(tx: Tx, accountId: string) {
  const account = await tx.bankAccount.findUnique({ where: { id: accountId } });
  if (!account || !account.isActive || account.closedAt) {
    throw new AppError("Choose an active bank or cash account.", { accountId: "Choose an active bank or cash account." });
  }
  return account;
}

export async function accountBalance(accountId: string, client: Tx | typeof db = db): Promise<Paise> {
  const [account, sum] = await Promise.all([
    client.bankAccount.findUnique({ where: { id: accountId }, select: { openingBalancePaise: true } }),
    client.bankTransaction.aggregate({ where: { accountId }, _sum: { amountPaise: true } }),
  ]);
  if (!account) throw new NotFoundError("account");
  return account.openingBalancePaise + (sum._sum.amountPaise ?? 0n);
}

export async function accountBalances() {
  const [accounts, sums] = await Promise.all([
    db.bankAccount.findMany({ where: { closedAt: null }, orderBy: [{ kind: "asc" }, { name: "asc" }] }),
    db.bankTransaction.groupBy({ by: ["accountId"], _sum: { amountPaise: true } }),
  ]);
  const byId = new Map(sums.map((s) => [s.accountId, s._sum.amountPaise ?? 0n]));
  return accounts.map((a) => ({ ...a, balancePaise: a.openingBalancePaise + (byId.get(a.id) ?? 0n) }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Money in
// ─────────────────────────────────────────────────────────────────────────────

export type ClientPaymentInput = {
  date: ISODate;
  projectId: string;
  amountPaise: Paise;
  tdsDeductedPaise?: Paise;
  invoiceId?: string | null;
  milestone?: string | null;
  method: PaymentMethod;
  accountId: string;
  reference?: string | null;
  chequeId?: string | null;
  notes?: string | null;
  /** The person confirmed a payment larger than the amount still pending. */
  confirmOverpayment?: boolean;
};

export async function recordClientPayment(actor: Actor, input: ClientPaymentInput): Promise<{ id: string; receiptNumber: string }> {
  if (!can(actor, "clientPayments.record")) throw new ForbiddenError();
  if (input.amountPaise < 0n || (input.tdsDeductedPaise ?? 0n) < 0n) throw new AppError("Amounts cannot be negative.");
  if (input.amountPaise + (input.tdsDeductedPaise ?? 0n) <= 0n) throw new AppError("Enter the amount received.");

  return db.$transaction(async (tx) => {
    await assertPeriodOpen(tx, input.date);
    const project = await tx.project.findFirst({
      where: { id: input.projectId, deletedAt: null },
      select: { id: true, name: true, clientId: true, contractPaise: true, quotedPaise: true },
    });
    if (!project) throw new NotFoundError("project");
    const account = await loadAccount(tx, input.accountId);

    if (!input.confirmOverpayment) {
      const [received, variations] = await Promise.all([
        tx.clientPayment.aggregate({ where: { projectId: project.id }, _sum: { amountPaise: true, tdsDeductedPaise: true } }),
        tx.variation.aggregate({ where: { projectId: project.id, status: "APPROVED" }, _sum: { amountPaise: true } }),
      ]);
      const value = (project.contractPaise > 0n ? project.contractPaise : project.quotedPaise) + (variations._sum.amountPaise ?? 0n);
      const pending = value - (received._sum.amountPaise ?? 0n) - (received._sum.tdsDeductedPaise ?? 0n);
      if (value > 0n && input.amountPaise + (input.tdsDeductedPaise ?? 0n) > pending) {
        throw new AppError(
          `This payment is more than the ${formatINR(pending > 0n ? pending : 0n)} still pending for ${project.name}. Please check the amount, or confirm to save it anyway.`,
          { confirmOverpayment: "needs-confirmation" },
        );
      }
    }

    const receiptNumber = await nextCode(tx, "receipt");
    const payment = await tx.clientPayment.create({
      data: {
        receiptNumber,
        date: toDbDate(input.date),
        amountPaise: input.amountPaise,
        tdsDeductedPaise: input.tdsDeductedPaise ?? 0n,
        clientId: project.clientId,
        projectId: project.id,
        invoiceId: input.invoiceId ?? null,
        milestone: input.milestone ?? null,
        method: input.method,
        accountId: account.id,
        reference: input.reference ?? null,
        chequeId: input.chequeId ?? null,
        notes: input.notes ?? null,
        createdById: actor.id,
      },
    });
    if (input.amountPaise > 0n) {
      await tx.bankTransaction.create({
        data: {
          accountId: account.id,
          date: payment.date,
          amountPaise: input.amountPaise,
          source: "CLIENT_PAYMENT",
          description: `Client payment ${receiptNumber} — ${project.name}${input.milestone ? ` (${input.milestone})` : ""}`,
          reference: input.reference ?? null,
          clientPaymentId: payment.id,
          projectId: project.id,
          createdById: actor.id,
        },
      });
    }
    await audit(tx, {
      actor,
      action: "CREATE",
      entityType: "ClientPayment",
      entityId: payment.id,
      projectId: project.id,
      summary: `recorded ${formatINR(input.amountPaise)} client payment for ${project.name} by ${PAYMENT_METHOD[input.method]} into ${account.name}${
        input.tdsDeductedPaise ? ` (plus ${formatINR(input.tdsDeductedPaise)} TDS deducted by client)` : ""
      }`,
      after: payment,
    });
    return { id: payment.id, receiptNumber };
  });
}

export type OtherIncomeInput = {
  date: ISODate;
  amountPaise: Paise;
  source: string;
  projectId?: string | null;
  method: PaymentMethod;
  accountId: string;
  reference?: string | null;
  notes?: string | null;
};

export async function recordOtherIncome(actor: Actor, input: OtherIncomeInput): Promise<{ id: string }> {
  if (!can(actor, "clientPayments.record")) throw new ForbiddenError();
  if (input.amountPaise <= 0n) throw new AppError("Enter the amount received.");
  return db.$transaction(async (tx) => {
    await assertPeriodOpen(tx, input.date);
    const account = await loadAccount(tx, input.accountId);
    const number = await nextCode(tx, "income");
    const income = await tx.otherIncome.create({
      data: { ...input, number, date: toDbDate(input.date), createdById: actor.id },
    });
    await tx.bankTransaction.create({
      data: {
        accountId: account.id,
        date: income.date,
        amountPaise: input.amountPaise,
        source: "OTHER_INCOME",
        description: `Income ${number} — ${input.source}`,
        reference: input.reference ?? null,
        otherIncomeId: income.id,
        projectId: input.projectId ?? null,
        createdById: actor.id,
      },
    });
    await audit(tx, {
      actor,
      action: "CREATE",
      entityType: "OtherIncome",
      entityId: income.id,
      projectId: input.projectId ?? null,
      summary: `recorded ${formatINR(input.amountPaise)} income from ${input.source}`,
      after: income,
    });
    return { id: income.id };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Money out
// ─────────────────────────────────────────────────────────────────────────────

export type PaymentInput = {
  date: ISODate;
  amountPaise: Paise;
  payeeType: PayeeType;
  supplierId?: string | null;
  labourId?: string | null;
  engineerId?: string | null;
  contractorId?: string | null;
  payeeName?: string | null;
  purpose: PaymentPurpose;
  projectId?: string | null;
  purchaseId?: string | null;
  contractorBillId?: string | null;
  wageSettlementLineId?: string | null;
  method: PaymentMethod;
  accountId: string;
  reference?: string | null;
  chequeId?: string | null;
  notes?: string | null;
};

async function payeeDisplayName(tx: Tx, input: PaymentInput): Promise<string> {
  switch (input.payeeType) {
    case "SUPPLIER": {
      const s = input.supplierId ? await tx.supplier.findUnique({ where: { id: input.supplierId }, select: { name: true } }) : null;
      if (!s) throw new AppError("Choose a supplier.");
      return s.name;
    }
    case "LABOUR": {
      const l = input.labourId ? await tx.labour.findUnique({ where: { id: input.labourId }, select: { name: true } }) : null;
      if (!l) throw new AppError("Choose a worker.");
      return l.name;
    }
    case "ENGINEER": {
      const e = input.engineerId ? await tx.engineer.findUnique({ where: { id: input.engineerId }, select: { name: true } }) : null;
      if (!e) throw new AppError("Choose an engineer.");
      return e.name;
    }
    case "CONTRACTOR": {
      const c = input.contractorId
        ? await tx.labourContractor.findUnique({ where: { id: input.contractorId }, select: { name: true } })
        : null;
      if (!c) throw new AppError("Choose a labour contractor.");
      return c.name;
    }
    default:
      if (!input.payeeName?.trim()) throw new AppError("Enter who was paid.");
      return input.payeeName.trim();
  }
}

const PURPOSE_TEXT: Record<PaymentPurpose, string> = {
  PURCHASE: "material payment",
  WAGES: "wages",
  SALARY: "salary",
  ADVANCE: "advance",
  CONTRACTOR_BILL: "contractor bill payment",
  OTHER: "payment",
};

export async function recordPayment(actor: Actor, input: PaymentInput): Promise<{ id: string; number: string }> {
  if (!can(actor, "payments.record")) throw new ForbiddenError();
  if (input.amountPaise <= 0n) throw new AppError("Enter the amount paid.");
  return db.$transaction(async (tx) => {
    await assertPeriodOpen(tx, input.date);
    const account = await loadAccount(tx, input.accountId);
    const payee = await payeeDisplayName(tx, input);
    const number = await nextCode(tx, "payment");
    const payment = await tx.payment.create({
      data: {
        number,
        date: toDbDate(input.date),
        amountPaise: input.amountPaise,
        payeeType: input.payeeType,
        supplierId: input.payeeType === "SUPPLIER" ? input.supplierId : null,
        labourId: input.payeeType === "LABOUR" ? input.labourId : null,
        engineerId: input.payeeType === "ENGINEER" ? input.engineerId : null,
        contractorId: input.payeeType === "CONTRACTOR" ? input.contractorId : null,
        payeeName: input.payeeType === "OTHER" ? payee : null,
        purpose: input.purpose,
        projectId: input.projectId ?? null,
        purchaseId: input.purchaseId ?? null,
        contractorBillId: input.contractorBillId ?? null,
        wageSettlementLineId: input.wageSettlementLineId ?? null,
        method: input.method,
        accountId: account.id,
        reference: input.reference ?? null,
        chequeId: input.chequeId ?? null,
        notes: input.notes ?? null,
        createdById: actor.id,
      },
    });
    await tx.bankTransaction.create({
      data: {
        accountId: account.id,
        date: payment.date,
        amountPaise: -input.amountPaise,
        source: "PAYMENT",
        description: `${number} — ${PURPOSE_TEXT[input.purpose]} to ${payee}`,
        reference: input.reference ?? null,
        paymentId: payment.id,
        projectId: input.projectId ?? null,
        createdById: actor.id,
      },
    });
    await audit(tx, {
      actor,
      action: "CREATE",
      entityType: "Payment",
      entityId: payment.id,
      projectId: input.projectId ?? null,
      summary: `paid ${formatINR(input.amountPaise)} ${PURPOSE_TEXT[input.purpose]} to ${payee} by ${PAYMENT_METHOD[input.method]} from ${account.name}`,
      after: payment,
    });
    return { id: payment.id, number };
  });
}

export type ExpenseInput = {
  date: ISODate;
  projectId?: string | null;
  siteId?: string | null;
  categoryId: string;
  description: string;
  amountPaise: Paise;
  quantity?: string | null;
  unit?: string | null;
  method: PaymentMethod;
  accountId: string;
  paidTo?: string | null;
  reference?: string | null;
  workItemId?: string | null;
  equipmentId?: string | null;
  notes?: string | null;
};

export async function recordExpense(actor: Actor, input: ExpenseInput): Promise<{ id: string; number: string }> {
  if (!can(actor, "expenses.record")) throw new ForbiddenError();
  if (input.amountPaise <= 0n) throw new AppError("Enter the amount spent.");
  return db.$transaction(async (tx) => {
    await assertPeriodOpen(tx, input.date);
    const account = await loadAccount(tx, input.accountId);
    const category = await tx.expenseCategory.findUnique({ where: { id: input.categoryId } });
    if (!category || !category.isActive) throw new AppError("Choose an expense category.", { categoryId: "Choose a category." });
    const project = input.projectId
      ? await tx.project.findFirst({ where: { id: input.projectId, deletedAt: null }, select: { id: true, name: true } })
      : null;
    if (input.projectId && !project) throw new NotFoundError("project");
    const number = await nextCode(tx, "expense");
    const expense = await tx.expense.create({
      data: {
        number,
        date: toDbDate(input.date),
        projectId: project?.id ?? null,
        siteId: input.siteId ?? null,
        categoryId: category.id,
        description: input.description,
        amountPaise: input.amountPaise,
        quantity: input.quantity ?? null,
        unit: input.unit ?? null,
        method: input.method,
        accountId: account.id,
        paidTo: input.paidTo ?? null,
        reference: input.reference ?? null,
        workItemId: input.workItemId ?? null,
        equipmentId: input.equipmentId ?? null,
        notes: input.notes ?? null,
        createdById: actor.id,
      },
    });
    await tx.bankTransaction.create({
      data: {
        accountId: account.id,
        date: expense.date,
        amountPaise: -input.amountPaise,
        source: "EXPENSE",
        description: `${number} — ${category.name}: ${input.description}`,
        reference: input.reference ?? null,
        expenseId: expense.id,
        projectId: project?.id ?? null,
        createdById: actor.id,
      },
    });
    await audit(tx, {
      actor,
      action: "CREATE",
      entityType: "Expense",
      entityId: expense.id,
      projectId: project?.id ?? null,
      summary: `recorded ${formatINR(input.amountPaise)} ${category.name.toLowerCase()} expense${project ? ` for ${project.name}` : ""} — ${input.description}`,
      after: expense,
    });
    return { id: expense.id, number };
  });
}

export async function recordTransfer(
  actor: Actor,
  input: { date: ISODate; fromAccountId: string; toAccountId: string; amountPaise: Paise; reference?: string | null; notes?: string | null },
): Promise<{ id: string }> {
  if (!can(actor, "bank.manage")) throw new ForbiddenError();
  if (input.amountPaise <= 0n) throw new AppError("Enter the amount to move.");
  if (input.fromAccountId === input.toAccountId) throw new AppError("Choose two different accounts.");
  return db.$transaction(async (tx) => {
    await assertPeriodOpen(tx, input.date);
    const from = await loadAccount(tx, input.fromAccountId);
    const to = await loadAccount(tx, input.toAccountId);
    const transfer = await tx.accountTransfer.create({
      data: { ...input, date: toDbDate(input.date), createdById: actor.id },
    });
    const description = `Transfer from ${from.name} to ${to.name}`;
    await tx.bankTransaction.createMany({
      data: [
        { accountId: from.id, date: transfer.date, amountPaise: -input.amountPaise, source: "TRANSFER", description, reference: input.reference ?? null, transferId: transfer.id, createdById: actor.id },
        { accountId: to.id, date: transfer.date, amountPaise: input.amountPaise, source: "TRANSFER", description, reference: input.reference ?? null, transferId: transfer.id, createdById: actor.id },
      ],
    });
    await audit(tx, {
      actor,
      action: "CREATE",
      entityType: "AccountTransfer",
      entityId: transfer.id,
      summary: `moved ${formatINR(input.amountPaise)} from ${from.name} to ${to.name}`,
      after: transfer,
    });
    return { id: transfer.id };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Reversals — the only way to correct saved money records
// ─────────────────────────────────────────────────────────────────────────────

function requireReason(reason: string): string {
  const r = reason.trim();
  if (r.length < 5) throw new AppError("Please write why this entry is being reversed.", { reason: "Write a short reason." });
  return r;
}

export async function reverseClientPayment(actor: Actor, id: string, reason: string, date: ISODate): Promise<void> {
  if (!can(actor, "finance.reverse")) throw new ForbiddenError("Only the owner can reverse saved payments.");
  const why = requireReason(reason);
  await db.$transaction(async (tx) => {
    await assertPeriodOpen(tx, date);
    const original = await tx.clientPayment.findUnique({ where: { id }, include: { reversedBy: true, project: true } });
    if (!original) throw new NotFoundError("payment");
    if (original.reversalOfId) throw new AppError("This entry is itself a reversal and cannot be reversed again.");
    if (original.reversedBy) throw new AppError("This payment has already been reversed.");
    const receiptNumber = await nextCode(tx, "receipt");
    const reversal = await tx.clientPayment.create({
      data: {
        receiptNumber,
        date: toDbDate(date),
        amountPaise: -original.amountPaise,
        tdsDeductedPaise: -original.tdsDeductedPaise,
        clientId: original.clientId,
        projectId: original.projectId,
        invoiceId: original.invoiceId,
        milestone: original.milestone,
        method: original.method,
        accountId: original.accountId,
        reference: original.reference,
        reversalOfId: original.id,
        reversalReason: why,
        createdById: actor.id,
      },
    });
    if (original.amountPaise > 0n) {
      await tx.bankTransaction.create({
        data: {
          accountId: original.accountId,
          date: reversal.date,
          amountPaise: -original.amountPaise,
          source: "CLIENT_PAYMENT",
          description: `Reversal of ${original.receiptNumber} — ${why}`,
          clientPaymentId: reversal.id,
          projectId: original.projectId,
          createdById: actor.id,
        },
      });
    }
    await audit(tx, {
      actor,
      action: "REVERSE",
      entityType: "ClientPayment",
      entityId: original.id,
      projectId: original.projectId,
      summary: `reversed client payment ${original.receiptNumber} of ${formatINR(original.amountPaise)} for ${original.project.name} dated ${formatDate(fromDbDate(original.date))} — "${why}"`,
      before: original,
      after: reversal,
    });
  });
}

export async function reversePayment(actor: Actor, id: string, reason: string, date: ISODate): Promise<void> {
  if (!can(actor, "finance.reverse")) throw new ForbiddenError("Only the owner can reverse saved payments.");
  const why = requireReason(reason);
  await db.$transaction(async (tx) => {
    await assertPeriodOpen(tx, date);
    const original = await tx.payment.findUnique({ where: { id }, include: { reversedBy: true } });
    if (!original) throw new NotFoundError("payment");
    if (original.reversalOfId) throw new AppError("This entry is itself a reversal and cannot be reversed again.");
    if (original.reversedBy) throw new AppError("This payment has already been reversed.");
    const number = await nextCode(tx, "payment");
    const reversal = await tx.payment.create({
      data: {
        number,
        date: toDbDate(date),
        amountPaise: -original.amountPaise,
        payeeType: original.payeeType,
        supplierId: original.supplierId,
        labourId: original.labourId,
        engineerId: original.engineerId,
        contractorId: original.contractorId,
        payeeName: original.payeeName,
        purpose: original.purpose,
        projectId: original.projectId,
        purchaseId: original.purchaseId,
        contractorBillId: original.contractorBillId,
        wageSettlementLineId: original.wageSettlementLineId,
        method: original.method,
        accountId: original.accountId,
        reference: original.reference,
        reversalOfId: original.id,
        reversalReason: why,
        createdById: actor.id,
      },
    });
    await tx.bankTransaction.create({
      data: {
        accountId: original.accountId,
        date: reversal.date,
        amountPaise: original.amountPaise,
        source: "PAYMENT",
        description: `Reversal of ${original.number} — ${why}`,
        paymentId: reversal.id,
        projectId: original.projectId,
        createdById: actor.id,
      },
    });
    await audit(tx, {
      actor,
      action: "REVERSE",
      entityType: "Payment",
      entityId: original.id,
      projectId: original.projectId,
      summary: `reversed payment ${original.number} of ${formatINR(original.amountPaise)} — "${why}"`,
      before: original,
      after: reversal,
    });
  });
}

export async function reverseExpense(actor: Actor, id: string, reason: string, date: ISODate): Promise<void> {
  if (!can(actor, "finance.reverse")) throw new ForbiddenError("Only the owner can reverse saved expenses.");
  const why = requireReason(reason);
  await db.$transaction(async (tx) => {
    await assertPeriodOpen(tx, date);
    const original = await tx.expense.findUnique({ where: { id }, include: { reversedBy: true } });
    if (!original) throw new NotFoundError("expense");
    if (original.reversalOfId) throw new AppError("This entry is itself a reversal and cannot be reversed again.");
    if (original.reversedBy) throw new AppError("This expense has already been reversed.");
    const number = await nextCode(tx, "expense");
    const reversal = await tx.expense.create({
      data: {
        number,
        date: toDbDate(date),
        projectId: original.projectId,
        siteId: original.siteId,
        categoryId: original.categoryId,
        description: `Reversal of ${original.number}: ${original.description}`,
        amountPaise: -original.amountPaise,
        quantity: original.quantity,
        unit: original.unit,
        method: original.method,
        accountId: original.accountId,
        paidTo: original.paidTo,
        reference: original.reference,
        workItemId: original.workItemId,
        equipmentId: original.equipmentId,
        reversalOfId: original.id,
        reversalReason: why,
        createdById: actor.id,
      },
    });
    await tx.bankTransaction.create({
      data: {
        accountId: original.accountId,
        date: reversal.date,
        amountPaise: original.amountPaise,
        source: "EXPENSE",
        description: `Reversal of ${original.number} — ${why}`,
        expenseId: reversal.id,
        projectId: original.projectId,
        createdById: actor.id,
      },
    });
    await audit(tx, {
      actor,
      action: "REVERSE",
      entityType: "Expense",
      entityId: original.id,
      projectId: original.projectId,
      summary: `reversed expense ${original.number} of ${formatINR(original.amountPaise)} — "${why}"`,
      before: original,
      after: reversal,
    });
  });
}

/** Accounts for payment forms. Balances are shown only to people allowed to see them. */
export async function accountOptions(user: Pick<CurrentUser, "id" | "role" | "permissions">) {
  const accounts = await accountBalances();
  const showBalance = can(user, "bank.viewBalances");
  return accounts
    .filter((a) => a.isActive)
    // Managers see the office cash, bank accounts and their own site cash.
    .filter((a) => a.kind !== "SITE_CASH" || user.role === "ADMIN" || a.holderUserId === user.id || can(user, "bank.viewBalances"))
    .map((a) => ({ id: a.id, name: a.name, kind: a.kind, balance: showBalance ? formatINR(a.balancePaise, { paise: false }) : undefined }));
}
