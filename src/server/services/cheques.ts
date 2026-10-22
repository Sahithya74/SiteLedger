import "server-only";
import type { ChequeStatus } from "@/generated/prisma/enums";
import { formatDate, fromDbDate, fromDbDateOrNull, todayIST, toDbDate, type ISODate } from "@/lib/dates";
import { formatINR, type Paise } from "@/lib/money";
import { can } from "@/lib/permissions";
import type { CurrentUser } from "@/server/auth/current-user";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { AppError, ForbiddenError, NotFoundError } from "@/server/errors";
import { accessibleProjectIds } from "@/server/scope";
import { recordClientPayment, recordPayment } from "@/server/services/ledger";

type Actor = Pick<CurrentUser, "id" | "name" | "role" | "permissions">;

export async function listCheques(user: Actor & { id: string }, filter: { status?: ChequeStatus; direction?: "RECEIVED" | "ISSUED" } = {}) {
  const ids = await accessibleProjectIds(user);
  const rows = await db.cheque.findMany({
    where: {
      ...(ids === null ? {} : { OR: [{ projectId: { in: ids } }, { projectId: null }] }),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.direction ? { direction: filter.direction } : {}),
    },
    orderBy: [{ chequeDate: "desc" }],
    include: { project: { select: { id: true, name: true } }, account: { select: { name: true } } },
  });
  const today = todayIST();
  return rows.map((c) => {
    const date = fromDbDate(c.chequeDate);
    return { ...c, chequeDate: date, depositedOn: fromDbDateOrNull(c.depositedOn), clearedOn: fromDbDateOrNull(c.clearedOn), postDated: date > today, canDeposit: c.status === "RECEIVED" && date <= today };
  });
}

export async function recordCheque(
  actor: Actor & { id: string },
  input: {
    direction: "RECEIVED" | "ISSUED";
    chequeNumber: string;
    bankName: string | null;
    chequeDate: ISODate;
    amountPaise: Paise;
    projectId: string | null;
    clientId: string | null;
    supplierId: string | null;
    contractorId: string | null;
    partyName: string;
    notes: string | null;
  },
): Promise<void> {
  if (!can(actor, input.direction === "RECEIVED" ? "clientPayments.record" : "payments.record")) throw new ForbiddenError();
  if (input.amountPaise <= 0n) throw new AppError("Enter the cheque amount.");
  await db.$transaction(async (tx) => {
    const cheque = await tx.cheque.create({ data: { ...input, chequeDate: toDbDate(input.chequeDate), status: input.direction === "RECEIVED" ? "RECEIVED" : "RECEIVED" } });
    await audit(tx, {
      actor,
      action: "CREATE",
      entityType: "Cheque",
      entityId: cheque.id,
      projectId: input.projectId,
      summary: `${input.direction === "RECEIVED" ? "received" : "issued"} cheque ${input.chequeNumber} for ${formatINR(input.amountPaise)} ${input.direction === "RECEIVED" ? "from" : "to"} ${input.partyName}, dated ${formatDate(input.chequeDate)}`,
    });
  });
}

export async function depositCheque(actor: Actor, id: string, accountId: string, date: ISODate): Promise<void> {
  if (!can(actor, "clientPayments.record")) throw new ForbiddenError();
  const c = await db.cheque.findUnique({ where: { id } });
  if (!c) throw new NotFoundError("cheque");
  if (c.status !== "RECEIVED") throw new AppError("Only cheques in hand can be deposited.");
  if (fromDbDate(c.chequeDate) > date) throw new AppError(`This cheque is dated ${formatDate(c.chequeDate)} — it can only be deposited from that day.`);
  await db.$transaction(async (tx) => {
    await tx.cheque.update({ where: { id }, data: { status: "DEPOSITED", accountId, depositedOn: toDbDate(date) } });
    await audit(tx, { actor, action: "STATUS_CHANGE", entityType: "Cheque", entityId: id, projectId: c.projectId, summary: `deposited cheque ${c.chequeNumber} (${formatINR(c.amountPaise)}) from ${c.partyName}` });
  });
}

/**
 * The cheque has been cleared by the bank: the money is now real, so the
 * client payment (or our payment, for an issued cheque) is recorded now.
 */
export async function clearCheque(actor: Actor & { id: string }, id: string, date: ISODate, accountId: string | null): Promise<void> {
  const c = await db.cheque.findUnique({ where: { id } });
  if (!c) throw new NotFoundError("cheque");
  if (!["RECEIVED", "DEPOSITED"].includes(c.status)) throw new AppError("This cheque is already settled.");
  const account = accountId ?? c.accountId;
  if (!account) throw new AppError("Choose the bank account.", { accountId: "Choose an account." });
  if (c.direction === "RECEIVED") {
    if (!c.projectId) throw new AppError("Link the cheque to a project before clearing it.");
    await recordClientPayment(actor, {
      date,
      projectId: c.projectId,
      amountPaise: c.amountPaise,
      method: "CHEQUE",
      accountId: account,
      reference: `Cheque ${c.chequeNumber}${c.bankName ? ` (${c.bankName})` : ""}`,
      chequeId: c.id,
      confirmOverpayment: true,
    });
  } else {
    await recordPayment(actor, {
      date,
      amountPaise: c.amountPaise,
      payeeType: c.supplierId ? "SUPPLIER" : c.contractorId ? "CONTRACTOR" : "OTHER",
      supplierId: c.supplierId,
      contractorId: c.contractorId,
      payeeName: c.supplierId || c.contractorId ? null : c.partyName,
      purpose: c.supplierId ? "PURCHASE" : c.contractorId ? "CONTRACTOR_BILL" : "OTHER",
      projectId: c.projectId,
      method: "CHEQUE",
      accountId: account,
      reference: `Cheque ${c.chequeNumber}`,
      chequeId: c.id,
    });
  }
  await db.$transaction(async (tx) => {
    await tx.cheque.update({ where: { id }, data: { status: "CLEARED", clearedOn: toDbDate(date), accountId: account } });
    await audit(tx, { actor, action: "STATUS_CHANGE", entityType: "Cheque", entityId: id, projectId: c.projectId, summary: `cheque ${c.chequeNumber} (${formatINR(c.amountPaise)}) cleared` });
  });
}

export async function bounceCheque(actor: Actor, id: string, reason: string): Promise<void> {
  if (!can(actor, "clientPayments.record") && !can(actor, "payments.record")) throw new ForbiddenError();
  const c = await db.cheque.findUnique({ where: { id } });
  if (!c) throw new NotFoundError("cheque");
  if (c.status === "CLEARED") throw new AppError("This cheque was already cleared. If the bank reversed it, reverse the payment instead.");
  if (reason.trim().length < 3) throw new AppError("Please write the bounce reason.");
  await db.$transaction(async (tx) => {
    await tx.cheque.update({ where: { id }, data: { status: "BOUNCED", bouncedOn: toDbDate(todayIST()), bounceReason: reason.trim() } });
    await audit(tx, { actor, action: "STATUS_CHANGE", entityType: "Cheque", entityId: id, projectId: c.projectId, summary: `cheque ${c.chequeNumber} from ${c.partyName} BOUNCED (${formatINR(c.amountPaise)}) — "${reason.trim()}"` });
  });
}
