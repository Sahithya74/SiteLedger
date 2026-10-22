import { z } from "zod";
import { LabourCategory, PaymentMethod, WorkOrderType } from "@/generated/prisma/enums";
import { zDate, zEnum, zId, zMoney, zOptionalDate, zOptionalId, zOptionalMoney, zOptionalPhone, zOptionalText, zText } from "@/lib/validation";

export const workerSchema = z.object({
  name: zText("Name", 120),
  phone: zOptionalPhone(),
  category: zEnum(LabourCategory, "Type of work"),
  contractorId: zOptionalId(),
  dailyWagePaise: zMoney("Daily wage", { allowZero: false }),
  overtimeRatePaise: zMoney("Overtime rate"),
  address: zOptionalText(500),
  emergencyContact: zOptionalText(150),
  upiId: zOptionalText(100),
  joinedOn: zOptionalDate("Joined on"),
  notes: zOptionalText(1000),
});

export const contractorSchema = z.object({
  name: zText("Name", 120),
  phone: zOptionalPhone(),
  trade: z.preprocess((v) => (v === "" ? null : v), z.enum(LabourCategory).nullable()),
  address: zOptionalText(500),
  pan: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim().toUpperCase() : null), z.string().regex(/^[A-Z]{5}\d{4}[A-Z]$/, "PAN should look like ABCDE1234F.").nullable()),
  gstin: z.preprocess(
    (v) => (typeof v === "string" && v.trim() ? v.trim().toUpperCase() : null),
    z.string().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, "GSTIN should be 15 characters.").nullable(),
  ),
  notes: zOptionalText(1000),
});

const percent = (label: string) =>
  z.preprocess((v) => (v === "" || v === undefined ? "0" : v), z.string().regex(/^\d{1,2}(\.\d{1,2})?$/, `Enter ${label} like 5`));

export const workOrderSchema = z.object({
  contractorId: zId("Contractor"),
  projectId: zId("Project"),
  workItemId: zOptionalId(),
  title: zText("Work", 200),
  description: zOptionalText(1000),
  type: zEnum(WorkOrderType, "Type of rate"),
  unit: zOptionalText(20),
  quantity: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.replace(/,/g, "").trim() : null), z.string().regex(/^\d+(\.\d{1,3})?$/, "Enter a number.").nullable()),
  ratePaise: zOptionalMoney("Rate"),
  lumpSumPaise: zOptionalMoney("Lump sum"),
  retentionPercent: percent("retention %"),
  tdsPercent: percent("TDS %"),
  startDate: zOptionalDate("Start date"),
  endDate: zOptionalDate("End date"),
});

export const contractorBillSchema = z.object({
  contractorId: zId("Contractor"),
  projectId: zId("Project"),
  workOrderId: zOptionalId(),
  billDate: zDate("Bill date"),
  periodFrom: zOptionalDate("From"),
  periodTo: zOptionalDate("To"),
  quantity: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.replace(/,/g, "").trim() : null), z.string().regex(/^\d+(\.\d{1,3})?$/, "Enter a number.").nullable()),
  grossPaise: zOptionalMoney("Bill amount"),
  retentionPercent: percent("retention %"),
  tdsPercent: percent("TDS %"),
  otherDeductionPaise: zMoney("Other deductions"),
  deductionNote: zOptionalText(300),
  notes: zOptionalText(1000),
});

export const attendanceSchema = z.object({
  projectId: zId("Project"),
  date: zDate("Date"),
});

export const attendanceRowSchema = z.object({
  personType: z.enum(["LABOUR", "ENGINEER"]),
  personId: z.string().min(1).max(50),
  status: z.enum(["PRESENT", "HALF_DAY", "ABSENT", ""]),
  overtimeHours: z.preprocess((v) => (v === "" || v === undefined ? "0" : v), z.string().regex(/^\d{1,2}(\.\d{1,2})?$/, "Overtime hours must be a number.")),
});

export const wagePaymentSchema = z.object({
  from: zDate("From"),
  to: zDate("To"),
  projectId: zOptionalId(),
  date: zDate("Payment date"),
  method: zEnum(PaymentMethod, "Paid by"),
  accountId: zId("Account"),
  reference: zOptionalText(120),
  notes: zOptionalText(500),
});
