"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import {
  bankAccountSchema,
  clientPaymentSchema,
  expenseCategorySchema,
  expenseSchema,
  otherIncomeSchema,
  outgoingPaymentSchema,
  transferSchema,
} from "@/features/money/schemas";
import { todayIST } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { zDate, zId, zMoney, zOptionalId, zOptionalText, zText } from "@/lib/validation";
import { formToObject, runAction, type ActionResult } from "@/server/action";
import { requireActionUser } from "@/server/auth/current-user";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { createAccount, lockPeriod, setReconciled, updateAccount } from "@/server/services/banks";
import { bounceCheque, clearCheque, depositCheque, recordCheque } from "@/server/services/cheques";
import {
  recordClientPayment,
  recordExpense,
  recordOtherIncome,
  recordPayment,
  recordTransfer,
  reverseClientPayment,
  reverseExpense,
  reversePayment,
} from "@/server/services/ledger";

type Result = ActionResult<unknown>;

export async function recordClientPaymentAction(_prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("clientPayments.record");
    const input = clientPaymentSchema.parse(formToObject(formData));
    const { receiptNumber } = await recordClientPayment(user, input);
    refresh();
    return { ok: true, message: `${formatINR(input.amountPaise)} received — receipt ${receiptNumber}.` };
  });
}

export async function reverseClientPaymentAction(id: string, reason: string): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("finance.reverse");
    await reverseClientPayment(user, id, reason ?? "", todayIST());
    refresh();
    return { ok: true, message: "Payment reversed. Both entries stay on record." };
  });
}

export async function recordOtherIncomeAction(_prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("clientPayments.record");
    await recordOtherIncome(user, otherIncomeSchema.parse(formToObject(formData)));
    refresh();
    return { ok: true, message: "Income recorded." };
  });
}

export async function recordExpenseAction(_prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("expenses.record");
    const input = expenseSchema.parse(formToObject(formData));
    const { number } = await recordExpense(user, input);
    refresh();
    return { ok: true, message: `Expense ${number} of ${formatINR(input.amountPaise)} saved.` };
  });
}

export async function reverseExpenseAction(id: string, reason: string): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("finance.reverse");
    await reverseExpense(user, id, reason ?? "", todayIST());
    refresh();
    return { ok: true, message: "Expense reversed." };
  });
}

export async function recordPaymentAction(_prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("payments.record");
    const input = outgoingPaymentSchema.parse(formToObject(formData));
    await recordPayment(user, input);
    refresh();
    return { ok: true, message: `${formatINR(input.amountPaise)} payment recorded.` };
  });
}

export async function reversePaymentAction(id: string, reason: string): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("finance.reverse");
    await reversePayment(user, id, reason ?? "", todayIST());
    refresh();
    return { ok: true, message: "Payment reversed." };
  });
}

export async function transferAction(_prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("bank.manage");
    const input = transferSchema.parse(formToObject(formData));
    await recordTransfer(user, input);
    refresh();
    return { ok: true, message: `${formatINR(input.amountPaise)} moved.` };
  });
}

export async function createAccountAction(_prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("bank.manage");
    await createAccount(user, bankAccountSchema.parse(formToObject(formData)));
    refresh();
    return { ok: true, message: "Account added." };
  });
}

export async function closeAccountAction(id: string, active: boolean): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("bank.manage");
    await updateAccount(user, id, { isActive: active === true });
    refresh();
    return { ok: true, message: active ? "Account re-opened." : "Account closed." };
  });
}

export async function setReconciledAction(id: string, reconciled: boolean, statementRef: string): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("bank.manage");
    await setReconciled(user, id, reconciled === true, statementRef?.trim() || null);
    refresh();
    return { ok: true, message: reconciled ? "Matched with the statement." : "Un-matched." };
  });
}

export async function lockPeriodAction(_prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("periods.lock");
    const input = z.object({ lockedUpTo: zDate("Lock up to"), reason: zOptionalText(300) }).parse(formToObject(formData));
    if (input.lockedUpTo >= todayIST()) throw new AppError("You can only lock dates before today.", { lockedUpTo: "Choose an earlier date." });
    await lockPeriod(user, input.lockedUpTo, input.reason);
    refresh();
    return { ok: true, message: "Period locked." };
  });
}

export async function unlockPeriodAction(reason: string): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("periods.lock");
    await lockPeriod(user, null, reason?.trim() || null);
    refresh();
    return { ok: true, message: "Month lock removed." };
  });
}

export async function createExpenseCategoryAction(_prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("settings.manage");
    const input = expenseCategorySchema.parse(formToObject(formData));
    const clash = await db.expenseCategory.findUnique({ where: { name: input.name } });
    if (clash) throw new AppError("This category already exists.", { name: "Already exists." });
    await db.$transaction(async (tx) => {
      const max = await tx.expenseCategory.aggregate({ _max: { sortOrder: true } });
      await tx.expenseCategory.create({ data: { ...input, sortOrder: (max._max.sortOrder ?? 0) + 10 } });
      await audit(tx, { actor: user, action: "CREATE", entityType: "ExpenseCategory", summary: `added expense category "${input.name}"` });
    });
    refresh();
    return { ok: true, message: "Category added." };
  });
}

export async function toggleExpenseCategoryAction(id: string, active: boolean): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("settings.manage");
    const c = await db.expenseCategory.update({ where: { id }, data: { isActive: active === true } });
    await audit(db, { actor: user, action: "UPDATE", entityType: "ExpenseCategory", entityId: id, summary: `${active ? "re-enabled" : "hid"} expense category "${c.name}"` });
    refresh();
    return { ok: true, message: "Saved." };
  });
}

const chequeSchema = z.object({
  direction: z.enum(["RECEIVED", "ISSUED"]),
  chequeNumber: zText("Cheque number", 20),
  bankName: zOptionalText(100),
  chequeDate: zDate("Cheque date"),
  amountPaise: zMoney("Amount", { allowZero: false }),
  projectId: zOptionalId(),
  clientId: zOptionalId(),
  supplierId: zOptionalId(),
  contractorId: zOptionalId(),
  partyName: zText("From / to", 150),
  notes: zOptionalText(500),
});

export async function recordChequeAction(_prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser();
    const input = chequeSchema.parse(formToObject(formData));
    if (input.projectId && !input.clientId && input.direction === "RECEIVED") {
      const p = await db.project.findUnique({ where: { id: input.projectId }, select: { clientId: true } });
      input.clientId = p?.clientId ?? null;
    }
    await recordCheque(user, input);
    refresh();
    return { ok: true, message: "Cheque recorded." };
  });
}

export async function depositChequeAction(_prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("clientPayments.record");
    const input = z.object({ id: zId("Cheque"), accountId: zId("Account"), date: zDate("Date") }).parse(formToObject(formData));
    await depositCheque(user, input.id, input.accountId, input.date);
    refresh();
    return { ok: true, message: "Cheque marked as deposited." };
  });
}

export async function clearChequeAction(_prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser();
    const input = z.object({ id: zId("Cheque"), accountId: zOptionalId(), date: zDate("Date") }).parse(formToObject(formData));
    await clearCheque(user, input.id, input.date, input.accountId);
    refresh();
    return { ok: true, message: "Cheque cleared — payment recorded." };
  });
}

export async function bounceChequeAction(id: string, reason: string): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser();
    await bounceCheque(user, id, reason ?? "");
    refresh();
    return { ok: true, message: "Cheque marked as bounced." };
  });
}
