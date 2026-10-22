import { z } from "zod";
import { CostGroup, PayeeType, PaymentMethod, PaymentPurpose, TaxMode } from "@/generated/prisma/enums";
import { zDate, zEnum, zId, zMoney, zOptionalDate, zOptionalId, zOptionalText, zText } from "@/lib/validation";

const confirmFlag = z.preprocess((v) => v === "true" || v === "on", z.boolean()).optional();

/** Fields every "money paid / received" form shares. */
export const moneyMovementFields = {
  date: zDate("Date"),
  amountPaise: zMoney("Amount", { allowZero: false }),
  method: zEnum(PaymentMethod, "Payment method"),
  accountId: zId("Bank or cash account"),
  reference: zOptionalText(120),
  notes: zOptionalText(1000),
};

export const outgoingPaymentSchema = z.object({
  ...moneyMovementFields,
  payeeType: zEnum(PayeeType, "Paid to"),
  supplierId: zOptionalId(),
  labourId: zOptionalId(),
  engineerId: zOptionalId(),
  contractorId: zOptionalId(),
  payeeName: zOptionalText(150),
  purpose: zEnum(PaymentPurpose, "Purpose"),
  projectId: zOptionalId(),
  purchaseId: zOptionalId(),
  contractorBillId: zOptionalId(),
});

export const clientPaymentSchema = z.object({
  date: zDate("Date"),
  projectId: zId("Project"),
  amountPaise: zMoney("Amount received"),
  tdsDeductedPaise: zMoney("TDS deducted by client"),
  invoiceId: zOptionalId(),
  milestone: zOptionalText(200),
  method: zEnum(PaymentMethod, "Payment method"),
  accountId: zId("Bank or cash account"),
  reference: zOptionalText(120),
  notes: zOptionalText(1000),
  confirmOverpayment: confirmFlag,
});

export const expenseSchema = z.object({
  date: zDate("Date"),
  projectId: zOptionalId(),
  categoryId: zId("Category"),
  description: zText("What was it for", 300),
  amountPaise: zMoney("Amount", { allowZero: false }),
  quantity: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : null), z.string().regex(/^\d+(\.\d{1,3})?$/, "Enter a number.").nullable()),
  unit: zOptionalText(30),
  method: zEnum(PaymentMethod, "Payment method"),
  accountId: zId("Bank or cash account"),
  paidTo: zOptionalText(150),
  reference: zOptionalText(120),
  workItemId: zOptionalId(),
  equipmentId: zOptionalId(),
  notes: zOptionalText(1000),
});

export const otherIncomeSchema = z.object({
  ...moneyMovementFields,
  source: zText("Received from / for", 200),
  projectId: zOptionalId(),
});

export const transferSchema = z
  .object({
    date: zDate("Date"),
    fromAccountId: zId("From account"),
    toAccountId: zId("To account"),
    amountPaise: zMoney("Amount", { allowZero: false }),
    reference: zOptionalText(120),
    notes: zOptionalText(500),
  })
  .refine((v) => v.fromAccountId !== v.toAccountId, { path: ["toAccountId"], message: "Choose a different account." });

export const reversalSchema = z.object({
  reason: zText("Reason", 500),
  date: zDate("Reversal date"),
});

export const expenseCategorySchema = z.object({
  name: zText("Category name", 80),
  group: zEnum(CostGroup, "Cost head"),
  isWelfare: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
});

export const billSchema = z.object({
  clientId: zOptionalId(),
  projectId: zOptionalId(),
  title: zOptionalText(200),
  date: zDate("Date"),
  validUntil: zOptionalDate("Valid until"),
  dueDate: zOptionalDate("Due date"),
  milestone: zOptionalText(200),
  taxMode: zEnum(TaxMode, "GST"),
  taxPercent: z.preprocess((v) => (v === "" || v === undefined ? "0" : v), z.string().regex(/^\d{1,2}(\.\d{1,2})?$/, "Enter GST % like 18")),
  discountPaise: zMoney("Discount"),
  retentionPercent: z.preprocess((v) => (v === "" || v === undefined ? "0" : v), z.string().regex(/^\d{1,2}(\.\d{1,2})?$/, "Enter retention % like 5")),
  terms: zOptionalText(4000),
  notes: zOptionalText(2000),
  kind: z.string().optional(),
});

export const billItemSchema = z.object({
  section: zOptionalText(100),
  description: zText("Description", 500),
  quantity: z.preprocess(
    (v) => (typeof v === "string" ? v.replace(/,/g, "").trim() : v),
    z.string().regex(/^\d+(\.\d{1,3})?$/, "Enter a quantity."),
  ),
  unit: zText("Unit", 20),
  ratePaise: zMoney("Rate"),
  hsnSac: zOptionalText(20),
});

export const bankAccountSchema = z.object({
  kind: z.enum(["BANK", "CASH", "SITE_CASH"]),
  name: zText("Account name", 100),
  bankName: zOptionalText(100),
  accountHolderName: zOptionalText(150),
  accountType: zOptionalText(40),
  accountNumberLast4: z.preprocess(
    (v) => (typeof v === "string" && v.trim() ? v.replace(/\D/g, "").slice(-4) : null),
    z.string().regex(/^\d{4}$/, "Enter at least the last 4 digits.").nullable(),
  ),
  ifsc: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim().toUpperCase() : null), z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "IFSC looks like HDFC0001234.").nullable()),
  branch: zOptionalText(100),
  upiId: zOptionalText(100),
  holderUserId: zOptionalId(),
  projectId: zOptionalId(),
  openingBalancePaise: zMoney("Opening balance", { allowNegative: true }),
  openingDate: zDate("Opening balance date"),
  notes: zOptionalText(500),
});
