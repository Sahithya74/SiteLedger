import { describe, expect, it } from "vitest";
import { addDays, todayIST, toDbDate } from "@/lib/dates";
import { db } from "@/server/db";
import { AppError, ForbiddenError } from "@/server/errors";
import { accountBalance, recordClientPayment, recordExpense, recordPayment, reversePayment } from "@/server/services/ledger";
import { deleteProject, FINANCIAL_DELETE_MESSAGE } from "@/server/services/projects";
import { loadProjectMoney } from "@/server/services/project-money";
import { makeBankAccount, makeProject, makeUser } from "./helpers";

const L = 100_000_00n;

describe("client payments and the ledger", () => {
  it("records the payment, its ledger entry and an audit line together", async () => {
    const owner = await makeUser("ADMIN");
    const { projectId } = await makeProject(owner, { contractLakhs: 10 });
    const bank = await makeBankAccount();
    await recordClientPayment(owner, {
      date: todayIST(),
      projectId,
      amountPaise: 4n * L,
      method: "BANK_TRANSFER",
      accountId: bank.id,
      reference: "UTR123",
    });
    expect(await accountBalance(bank.id)).toBe(4n * L);
    const money = (await loadProjectMoney([projectId])).get(projectId)!.money;
    expect(money.receivedPaise).toBe(4n * L);
    expect(money.pendingFromClientPaise).toBe(6n * L);
    expect(await db.auditLog.count({ where: { entityType: "ClientPayment" } })).toBe(1);
  });

  it("asks for confirmation before accepting more than the pending amount", async () => {
    const owner = await makeUser("ADMIN");
    const { projectId } = await makeProject(owner, { contractLakhs: 1 });
    const bank = await makeBankAccount();
    const input = { date: todayIST(), projectId, amountPaise: 2n * L, method: "UPI" as const, accountId: bank.id };
    await expect(recordClientPayment(owner, input)).rejects.toBeInstanceOf(AppError);
    await expect(recordClientPayment(owner, { ...input, confirmOverpayment: true })).resolves.toBeTruthy();
  });

  it("refuses entries in a locked month", async () => {
    const owner = await makeUser("ADMIN");
    const { projectId } = await makeProject(owner);
    const bank = await makeBankAccount();
    await db.periodLock.create({ data: { lockedUpTo: toDbDate(addDays(todayIST(), -1)), lockedById: owner.id } });
    await expect(
      recordClientPayment(owner, { date: addDays(todayIST(), -5), projectId, amountPaise: L, method: "CASH", accountId: bank.id }),
    ).rejects.toThrow(/locked/);
    await expect(
      recordClientPayment(owner, { date: todayIST(), projectId, amountPaise: L, method: "CASH", accountId: bank.id }),
    ).resolves.toBeTruthy();
  });
});

describe("financial history is protected", () => {
  async function paidSupplier() {
    const owner = await makeUser("ADMIN");
    const { projectId } = await makeProject(owner);
    const bank = await makeBankAccount();
    const supplier = await db.supplier.create({ data: { code: "SUP-T1", name: "Test Supplier" } });
    const payment = await recordPayment(owner, {
      date: todayIST(),
      amountPaise: 50_000_00n,
      payeeType: "SUPPLIER",
      supplierId: supplier.id,
      purpose: "PURCHASE",
      projectId,
      method: "BANK_TRANSFER",
      accountId: bank.id,
    });
    return { owner, projectId, bank, payment };
  }

  it("the database refuses to delete or change a saved payment", async () => {
    const { payment } = await paidSupplier();
    await expect(db.$executeRawUnsafe(`DELETE FROM "Payment" WHERE id = '${payment.id}'`)).rejects.toThrow(/cannot be deleted/);
    await expect(db.payment.update({ where: { id: payment.id }, data: { amountPaise: 1n } })).rejects.toThrow(/cannot be changed/);
    await expect(db.$executeRawUnsafe(`DELETE FROM "BankTransaction"`)).rejects.toThrow(/cannot be deleted/);
    // Notes may still be corrected.
    await expect(db.payment.update({ where: { id: payment.id }, data: { notes: "Paid by NEFT" } })).resolves.toBeTruthy();
  });

  it("the audit log cannot be edited", async () => {
    await paidSupplier();
    const entry = await db.auditLog.findFirstOrThrow();
    await expect(db.auditLog.update({ where: { id: entry.id }, data: { summary: "changed" } })).rejects.toThrow(/cannot be changed/);
  });

  it("a reversal cancels the payment exactly once, and only the owner can do it", async () => {
    const { owner, bank, payment } = await paidSupplier();
    expect(await accountBalance(bank.id)).toBe(-50_000_00n);
    const manager = await makeUser("MANAGER", { permissions: ["payments.record"] });
    await expect(reversePayment(manager, payment.id, "Entered twice by mistake", todayIST())).rejects.toBeInstanceOf(ForbiddenError);
    await reversePayment(owner, payment.id, "Entered twice by mistake", todayIST());
    expect(await accountBalance(bank.id)).toBe(0n);
    expect(await db.payment.count()).toBe(2);
    await expect(reversePayment(owner, payment.id, "Again by mistake", todayIST())).rejects.toThrow(/already been reversed/);
  });

  it("a project with money records cannot be permanently deleted", async () => {
    const { owner, projectId } = await paidSupplier();
    await expect(deleteProject(owner, projectId)).rejects.toThrow(FINANCIAL_DELETE_MESSAGE);
  });

  it("an empty project can be deleted by the owner", async () => {
    const owner = await makeUser("ADMIN");
    const { projectId } = await makeProject(owner);
    await deleteProject(owner, projectId);
    const project = await db.project.findUniqueOrThrow({ where: { id: projectId } });
    expect(project.deletedAt).not.toBeNull();
  });
});

describe("project costs", () => {
  it("counts expenses as costs but not payments that settle wages or purchases", async () => {
    const owner = await makeUser("ADMIN");
    const { projectId } = await makeProject(owner, { contractLakhs: 10 });
    const bank = await makeBankAccount();
    const category = await db.expenseCategory.findFirstOrThrow({ where: { name: "Lunch" } });
    await recordExpense(owner, {
      date: todayIST(),
      projectId,
      categoryId: category.id,
      description: "Lunch for 20 workers",
      amountPaise: 2_000_00n,
      method: "CASH",
      accountId: bank.id,
    });
    const worker = await db.labour.create({ data: { code: "LB-T1", name: "Worker", category: "HELPER", dailyWagePaise: 700_00n } });
    await recordPayment(owner, {
      date: todayIST(),
      amountPaise: 3_000_00n,
      payeeType: "LABOUR",
      labourId: worker.id,
      purpose: "WAGES",
      projectId,
      method: "UPI",
      accountId: bank.id,
    });
    const result = (await loadProjectMoney([projectId])).get(projectId)!;
    expect(result.costs.foodWelfare).toBe(2_000_00n);
    expect(result.money.spentPaise).toBe(2_000_00n);
  });
});
