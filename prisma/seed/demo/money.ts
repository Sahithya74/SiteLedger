import type { PaymentMethod } from "@/generated/prisma/enums";
import { addDays, toDbDate, wageWeek, type ISODate } from "@/lib/dates";
import { percentOf } from "@/lib/money";
import { db } from "@/server/db";
import {
  recordClientPayment,
  recordExpense,
  recordOtherIncome,
  recordPayment,
  recordTransfer,
} from "@/server/services/ledger";
import { nextCode } from "@/server/services/sequence";
import { lakhs, log, rupees, type SeedContext } from "./context";

export async function seedAccounts(ctx: SeedContext) {
  const opening = toDbDate(ctx.day(-210));
  const hdfc = await db.bankAccount.create({
    data: {
      kind: "BANK",
      name: "HDFC Current",
      bankName: "HDFC Bank",
      accountHolderName: "Sunrise Builders",
      accountType: "Current",
      accountNumberLast4: "4521",
      ifsc: "HDFC0001234",
      branch: "Velachery",
      openingBalancePaise: lakhs(40),
      openingDate: opening,
    },
  });
  const sbi = await db.bankAccount.create({
    data: {
      kind: "BANK",
      name: "SBI Savings",
      bankName: "State Bank of India",
      accountHolderName: "Sunrise Builders",
      accountType: "Savings",
      accountNumberLast4: "7788",
      ifsc: "SBIN0004567",
      branch: "Saravanampatti",
      openingBalancePaise: lakhs(12),
      openingDate: opening,
    },
  });
  const cash = await db.bankAccount.findFirstOrThrow({ where: { kind: "CASH" } });
  await db.bankAccount.update({ where: { id: cash.id }, data: { openingBalancePaise: rupees(75_000), openingDate: opening } });
  ctx.ids.hdfc = hdfc.id;
  ctx.ids.sbi = sbi.id;
  ctx.ids.cash = cash.id;
  log("2 bank accounts and office cash");
}

async function invoice(
  ctx: SeedContext,
  args: { project: string; client: string; ra: number; daysAgo: number; dueIn: number; description: string; amountLakhs: number; retentionPct?: number; kind?: "RUNNING" | "FINAL" },
) {
  const total = lakhs(args.amountLakhs);
  return db.$transaction(async (tx) =>
    tx.invoice.create({
      data: {
        number: await nextCode(tx, "invoice"),
        kind: args.kind ?? "RUNNING",
        raNumber: args.ra,
        projectId: ctx.ids[args.project],
        clientId: ctx.ids[args.client],
        date: toDbDate(ctx.day(-args.daysAgo)),
        dueDate: toDbDate(ctx.day(args.dueIn)),
        milestone: args.description,
        subtotalPaise: total,
        totalPaise: total,
        retentionPaise: args.retentionPct ? percentOf(total, args.retentionPct) : 0n,
        status: "ISSUED",
        createdById: ctx.owner.id,
        items: { create: [{ description: args.description, quantity: "1", unit: "lot", ratePaise: total, amountPaise: total }] },
      },
    }),
  );
}

export async function seedClientMoney(ctx: SeedContext) {
  const pay = (project: string, daysAgo: number, amount: bigint, method: PaymentMethod, opts: { invoiceId?: string; milestone?: string; reference?: string; tds?: bigint } = {}) =>
    recordClientPayment(ctx.owner, {
      date: ctx.day(-daysAgo),
      projectId: ctx.ids[project],
      amountPaise: amount,
      tdsDeductedPaise: opts.tds ?? 0n,
      invoiceId: opts.invoiceId ?? null,
      milestone: opts.milestone ?? null,
      method,
      accountId: method === "CASH" ? ctx.ids.cash : project === "complex" ? ctx.ids.sbi : ctx.ids.hdfc,
      reference: opts.reference ?? null,
      confirmOverpayment: true,
    });

  // Green Valley Villa: second running bill partly paid and now 12 days overdue.
  await pay("villa", 118, lakhs(10), "BANK_TRANSFER", { milestone: "Advance on signing", reference: "UTR HDFCN2026051234" });
  const villaRa1 = await invoice(ctx, { project: "villa", client: "arun", ra: 1, daysAgo: 75, dueIn: -60, description: "RA-1: Foundation complete", amountLakhs: 25 });
  await pay("villa", 58, lakhs(25), "CHEQUE", { invoiceId: villaRa1.id, reference: "Cheque 004512" });
  // Payments are applied oldest bill first (the advance included), so ₹4.5 L of RA-2 is still due.
  const villaRa2 = await invoice(ctx, { project: "villa", client: "arun", ra: 2, daysAgo: 27, dueIn: -12, description: "RA-2: Ground floor columns and beams", amountLakhs: 30 });
  await pay("villa", 10, lakhs(15.5), "BANK_TRANSFER", { invoiceId: villaRa2.id, reference: "UTR ICICN2026093321" });

  // Lakshmi Commercial Complex: client deducts 1% TDS.
  await pay("complex", 195, lakhs(40), "BANK_TRANSFER", { milestone: "Mobilisation advance", reference: "UTR SBINR2026040011" });
  const cRa1 = await invoice(ctx, { project: "complex", client: "lakshmi", ra: 1, daysAgo: 150, dueIn: -135, description: "RA-1: Foundation and plinth", amountLakhs: 60 });
  await pay("complex", 133, lakhs(59.4), "BANK_TRANSFER", { invoiceId: cRa1.id, tds: lakhs(0.6), reference: "UTR SBINR2026061102" });
  const cRa2 = await invoice(ctx, { project: "complex", client: "lakshmi", ra: 2, daysAgo: 90, dueIn: -75, description: "RA-2: Ground floor structure", amountLakhs: 50 });
  await pay("complex", 70, lakhs(49.5), "BANK_TRANSFER", { invoiceId: cRa2.id, tds: lakhs(0.5), reference: "UTR SBINR2026081415" });
  const cRa3 = await invoice(ctx, { project: "complex", client: "lakshmi", ra: 3, daysAgo: 20, dueIn: 5, description: "RA-3: First floor structure", amountLakhs: 65 });
  await pay("complex", 1, lakhs(20), "BANK_TRANSFER", { invoiceId: cRa3.id, reference: "UTR SBINR2026101987" });
  // Post-dated cheque for the rest of RA-3, dated today.
  await db.cheque.create({
    data: {
      direction: "RECEIVED",
      chequeNumber: "118842",
      bankName: "Indian Bank",
      chequeDate: toDbDate(ctx.today),
      amountPaise: lakhs(5),
      status: "RECEIVED",
      partyName: "Lakshmi Traders (P) Ltd",
      clientId: ctx.ids.lakshmi,
      projectId: ctx.ids.complex,
      notes: "Post-dated cheque against RA-3",
    },
  });

  // Renovation: finished; 5% retention held by the client.
  await pay("renovation", 148, lakhs(5), "UPI", { milestone: "Advance", reference: "UPI 4402917733" });
  const rFinal = await invoice(ctx, { project: "renovation", client: "ramesh", ra: 1, daysAgo: 24, dueIn: -10, description: "Final bill — renovation complete", amountLakhs: 18, retentionPct: 5, kind: "FINAL" });
  await pay("renovation", 20, lakhs(12.1), "BANK_TRANSFER", { invoiceId: rFinal.id, reference: "UTR KKBKN2026100345" });

  log("client bills, client payments (one overdue) and a post-dated cheque");
}

export async function seedSupplierPayments(
  ctx: SeedContext,
  purchases: { villaBuys: { id: string }[]; complexBuys: { id: string }[]; renovationBuys: { id: string }[] },
) {
  const all = [...purchases.villaBuys, ...purchases.complexBuys, ...purchases.renovationBuys];
  const rows = await db.purchase.findMany({ where: { id: { in: all.map((p) => p.id) } }, include: { supplier: true } });
  for (const p of rows) {
    const isLastVillaBuy = p.id === purchases.villaBuys.at(-1)!.id;
    const amount = isLastVillaBuy ? p.totalPaise / 2n : p.totalPaise;
    const paidOn = addDays(p.purchaseDate.toISOString().slice(0, 10), Math.min(p.supplier.creditDays ?? 0, 20));
    await recordPayment(ctx.owner, {
      date: paidOn,
      amountPaise: amount,
      payeeType: "SUPPLIER",
      supplierId: p.supplierId,
      purpose: "PURCHASE",
      projectId: p.projectId,
      purchaseId: p.id,
      method: amount > lakhs(2) ? "BANK_TRANSFER" : "UPI",
      accountId: p.projectId === ctx.ids.complex ? ctx.ids.sbi : ctx.ids.hdfc,
      reference: `NEFT ${p.number}`,
    });
  }
  log(`${rows.length} supplier payments (one part-paid, one steel bill still due)`);
}

export async function seedContractorAndStaffPay(ctx: SeedContext) {
  // Labour contractor: work orders, bills and payments.
  const contractorId = ctx.ids.contractor;
  const bills: { project: string; title: string; gross: number; paid: number; daysAgo: number }[] = [
    { project: "villa", title: "Foundation masonry and PCC (lump sum)", gross: 6.5, paid: 6.5, daysAgo: 80 },
    { project: "villa", title: "Columns and beams labour — ground floor", gross: 4.2, paid: 3.6, daysAgo: 25 },
    { project: "complex", title: "Brickwork — ground floor (piece rate)", gross: 3.2, paid: 2.5, daysAgo: 12 },
  ];
  for (const b of bills) {
    const gross = lakhs(b.gross);
    const retention = percentOf(gross, 5);
    const tds = percentOf(gross, 1);
    const net = gross - retention - tds;
    const bill = await db.$transaction(async (tx) => {
      const wo = await tx.workOrder.create({
        data: {
          number: await nextCode(tx, "workOrder"),
          contractorId,
          projectId: ctx.ids[b.project],
          title: b.title,
          type: "LUMP_SUM",
          lumpSumPaise: gross,
          retentionPercent: "5",
          tdsPercent: "1",
          startDate: toDbDate(ctx.day(-b.daysAgo - 30)),
          status: b.paid >= b.gross ? "COMPLETED" : "OPEN",
        },
      });
      return tx.contractorBill.create({
        data: {
          number: await nextCode(tx, "contractorBill"),
          contractorId,
          projectId: ctx.ids[b.project],
          workOrderId: wo.id,
          billDate: toDbDate(ctx.day(-b.daysAgo)),
          grossPaise: gross,
          retentionPaise: retention,
          tdsPaise: tds,
          netPaise: net,
          status: "APPROVED",
          createdById: ctx.owner.id,
        },
      });
    });
    const paid = b.paid >= b.gross ? net : lakhs(b.paid);
    await recordPayment(ctx.owner, {
      date: ctx.day(-b.daysAgo + 3),
      amountPaise: paid,
      payeeType: "CONTRACTOR",
      contractorId,
      purpose: "CONTRACTOR_BILL",
      projectId: ctx.ids[b.project],
      contractorBillId: bill.id,
      method: "BANK_TRANSFER",
      accountId: ctx.ids.hdfc,
    });
  }

  // Monthly salaries charged to the project each engineer works on.
  const salaries: [string, string, number, number][] = [
    ["karthik", "villa", 45_000, 4],
    ["priya", "complex", 52_000, 6],
  ];
  for (const [engineer, project, amount, months] of salaries) {
    for (let m = months; m >= 1; m--) {
      await recordPayment(ctx.owner, {
        date: ctx.day(-30 * m + 1),
        amountPaise: rupees(amount),
        payeeType: "ENGINEER",
        engineerId: ctx.ids[engineer],
        purpose: "SALARY",
        projectId: ctx.ids[project],
        method: "BANK_TRANSFER",
        accountId: ctx.ids.hdfc,
        notes: "Monthly salary",
      });
    }
  }
  // Structural consultant paid per visit.
  for (const daysAgo of [150, 95, 40]) {
    await recordPayment(ctx.owner, {
      date: ctx.day(-daysAgo),
      amountPaise: rupees(25_000),
      payeeType: "ENGINEER",
      engineerId: ctx.ids.abdul,
      purpose: "OTHER",
      projectId: ctx.ids.complex,
      method: "BANK_TRANSFER",
      accountId: ctx.ids.sbi,
      notes: "Structural inspection visit fee",
    });
  }
  log("labour contractor bills, salaries and consultant fees");
}

/** Wages for every finished week (Sunday–Saturday), paid on Saturday. The current week stays pending. */
export async function seedWagePayments(ctx: SeedContext) {
  const currentWeekStart = wageWeek(ctx.today).start;
  const earliest = ctx.day(-29);
  let weekStart = wageWeek(earliest).start;
  let count = 0;
  while (weekStart < currentWeekStart) {
    const weekEnd = addDays(weekStart, 6);
    const earned = await db.attendance.groupBy({
      by: ["labourId", "engineerId", "projectId"],
      where: { date: { gte: toDbDate(weekStart), lte: toDbDate(weekEnd) } },
      _sum: { wagePaise: true, adjustmentPaise: true },
    });
    for (const row of earned) {
      const amount = (row._sum.wagePaise ?? 0n) + (row._sum.adjustmentPaise ?? 0n);
      if (amount <= 0n) continue;
      await recordPayment(ctx.owner, {
        date: weekEnd > ctx.today ? ctx.today : (weekEnd as ISODate),
        amountPaise: amount,
        payeeType: row.labourId ? "LABOUR" : "ENGINEER",
        labourId: row.labourId,
        engineerId: row.engineerId,
        purpose: "WAGES",
        projectId: row.projectId,
        method: "UPI",
        accountId: ctx.ids.hdfc,
        notes: `Wages ${weekStart} to ${weekEnd}`,
      });
      count++;
    }
    weekStart = addDays(weekStart, 7);
  }
  // Two advances given in cash this week.
  const advanceTo = await db.labour.findMany({ where: { name: { in: ["Selvam P", "Kannan S"] } }, select: { id: true, name: true } });
  for (const [i, w] of advanceTo.entries()) {
    await recordPayment(ctx.owner, {
      date: ctx.day(-(2 + i * 2)),
      amountPaise: rupees(i === 0 ? 3_000 : 2_000),
      payeeType: "LABOUR",
      labourId: w.id,
      purpose: "ADVANCE",
      projectId: ctx.ids.villa,
      method: "CASH",
      accountId: ctx.ids.cash,
      notes: "Advance for family function",
    });
  }
  log(`${count} weekly wage payments and 2 advances (current week left pending)`);
}

export async function seedExpenses(ctx: SeedContext) {
  const categories = await db.expenseCategory.findMany();
  const cat = (name: string) => {
    const c = categories.find((x) => x.name === name);
    if (!c) throw new Error(`Seed: expense category ${name} missing`);
    return c.id;
  };
  type E = [project: string | null, category: string, description: string, amount: number, daysAgo: number, method: PaymentMethod, qty?: [string, string]];
  const expenses: E[] = [
    ["villa", "Equipment rent", "JCB for excavation (2 days)", 18_000, 117, "BANK_TRANSFER"],
    ["villa", "Diesel / fuel", "Diesel for concrete mixer", 4_500, 60, "CASH"],
    ["villa", "Transport / lorry hire", "Shuttering material shifting", 4_500, 26, "UPI"],
    ["villa", "Electricity", "Temporary EB connection — bill", 3_800, 35, "UPI"],
    ["villa", "Electricity", "Temporary EB connection — bill", 4_100, 5, "UPI"],
    ["complex", "Equipment rent", "Scaffolding hire — monthly", 15_000, 75, "BANK_TRANSFER"],
    ["complex", "Equipment rent", "Scaffolding hire — monthly", 15_000, 45, "BANK_TRANSFER"],
    ["complex", "Equipment rent", "Scaffolding hire — monthly", 15_000, 15, "BANK_TRANSFER"],
    ["complex", "Equipment rent", "Concrete mixer hire", 12_000, 30, "UPI"],
    ["complex", "Labour accommodation", "Labour shed rent", 20_000, 60, "BANK_TRANSFER"],
    ["complex", "Labour accommodation", "Labour shed rent", 20_000, 30, "BANK_TRANSFER"],
    ["complex", "Electricity", "Temporary EB connection — bill", 7_500, 33, "UPI"],
    ["complex", "Approvals & fees", "Fire NOC application fee", 25_000, 100, "BANK_TRANSFER"],
    ["renovation", "Transport / lorry hire", "Debris removal (3 trips)", 6_000, 110, "CASH"],
    [null, "Site / office rent", "Office rent", 25_000, 150, "BANK_TRANSFER"],
    [null, "Site / office rent", "Office rent", 25_000, 120, "BANK_TRANSFER"],
    [null, "Site / office rent", "Office rent", 25_000, 90, "BANK_TRANSFER"],
    [null, "Site / office rent", "Office rent", 25_000, 60, "BANK_TRANSFER"],
    [null, "Site / office rent", "Office rent", 25_000, 30, "BANK_TRANSFER"],
    [null, "Office expenses", "Stationery, printing and internet", 4_200, 20, "UPI"],
  ];
  // Weekly labour lunch and drinking water at both sites (welfare).
  for (let week = 4; week >= 1; week--) {
    expenses.push(["villa", "Lunch", "Lunch for site labour (Saturday)", 3_200, week * 7 - 1, "CASH", ["14", "meals"]]);
    expenses.push(["villa", "Drinking water", "Water cans", 600, week * 7 - 3, "CASH", ["20", "cans"]]);
    expenses.push(["complex", "Lunch", "Lunch for site labour (Saturday)", 5_000, week * 7 - 1, "CASH", ["22", "meals"]]);
    expenses.push(["complex", "Tea & snacks", "Tea and snacks for the week", 1_200, week * 7 - 2, "CASH"]);
  }
  for (const [project, category, description, amount, daysAgo, method, qty] of expenses) {
    await recordExpense(ctx.owner, {
      date: ctx.day(-daysAgo),
      projectId: project ? ctx.ids[project] : null,
      categoryId: cat(category),
      description,
      amountPaise: rupees(amount),
      quantity: qty?.[0] ?? null,
      unit: qty?.[1] ?? null,
      method,
      accountId: method === "CASH" ? ctx.ids.cash : project === "complex" ? ctx.ids.sbi : ctx.ids.hdfc,
      paidTo: null,
    });
  }

  // Keep the cash box topped up and record a scrap sale.
  await recordTransfer(ctx.owner, { date: ctx.day(-60), fromAccountId: ctx.ids.hdfc, toAccountId: ctx.ids.cash, amountPaise: rupees(50_000), reference: "Cash withdrawal" });
  await recordOtherIncome(ctx.owner, {
    date: ctx.day(-15),
    amountPaise: rupees(18_500),
    source: "Scrap steel sale (cut pieces)",
    projectId: ctx.ids.complex,
    method: "CASH",
    accountId: ctx.ids.cash,
  });
  log(`${expenses.length} expenses (incl. labour food & water), a cash transfer and a scrap sale`);
}
