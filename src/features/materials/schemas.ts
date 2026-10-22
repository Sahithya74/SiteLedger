import { z } from "zod";
import { MaterialKind, Priority, SupplierCategory } from "@/generated/prisma/enums";
import {
  zDate,
  zEnum,
  zId,
  zMoney,
  zOptionalCoordinate,
  zOptionalDate,
  zOptionalEmail,
  zOptionalGstin,
  zOptionalId,
  zOptionalMoney,
  zOptionalPan,
  zOptionalPhone,
  zOptionalText,
  zText,
} from "@/lib/validation";

/** A positive quantity typed by a person ("12.5", "1,200"). Kept as a string for exact decimals. */
export function zQuantity(label: string, options: { allowZero?: boolean; allowNegative?: boolean } = {}) {
  return z.preprocess(
    (v) => (typeof v === "string" ? v.replace(/,/g, "").trim() : v),
    z
      .string({ error: `${label} is required.` })
      .regex(/^-?\d+(\.\d{1,3})?$/, `Enter ${label.toLowerCase()} as a number (up to 3 decimals).`)
      .refine((v) => options.allowNegative || !v.startsWith("-"), `${label} cannot be negative.`)
      .refine((v) => options.allowZero || Number(v) !== 0, `${label} must be more than zero.`),
  );
}

export function zOptionalQuantity(label: string) {
  return z.preprocess(
    (v) => (typeof v === "string" ? v.replace(/,/g, "").trim() || null : (v ?? null)),
    z.string().regex(/^\d+(\.\d{1,3})?$/, `Enter ${label.toLowerCase()} as a number.`).nullable(),
  );
}

const list = (v: unknown) => (v === undefined || v === "" ? [] : Array.isArray(v) ? v : [v]);

export const materialFormSchema = z.object({
  name: zText("Material name", 150),
  categoryId: zId("Category"),
  unit: zText("Unit", 20),
  reorderLevel: zQuantity("Reorder level", { allowZero: true }),
  defaultRatePaise: zOptionalMoney("Usual rate"),
  brand: zOptionalText(80),
  grade: zOptionalText(80),
  size: zOptionalText(80),
  colour: zOptionalText(80),
  thickness: zOptionalText(40),
  finish: zOptionalText(80),
  notes: zOptionalText(2000),
});

export const categoryFormSchema = z.object({
  name: zText("Category name", 80),
  kind: zEnum(MaterialKind, "Type"),
});

export const stockMovementSchema = z.object({
  kind: z.enum(["USAGE", "DAMAGE", "RETURN", "ADJUSTMENT", "OPENING"]),
  date: zDate("Date"),
  materialId: zId("Material"),
  location: z.string().max(50), // project id, or "store" for the main store
  quantity: zQuantity("Quantity", { allowNegative: true }),
  unitCostPaise: zOptionalMoney("Rate"),
  workItemId: zOptionalId(),
  notes: zOptionalText(500),
  confirmShortage: z.preprocess((v) => v === "true" || v === "on", z.boolean()).optional(),
});

export const stockTransferSchema = z
  .object({
    date: zDate("Date"),
    materialId: zId("Material"),
    from: z.string().min(1).max(50),
    to: z.string().min(1).max(50),
    quantity: zQuantity("Quantity"),
    notes: zOptionalText(500),
    confirmShortage: z.preprocess((v) => v === "true" || v === "on", z.boolean()).optional(),
  })
  .refine((v) => v.from !== v.to, { path: ["to"], message: "Choose a different place to move the material to." });

export const supplierFormSchema = z.object({
  name: zText("Business name", 150),
  categories: z.preprocess(list, z.array(z.enum(SupplierCategory)).max(13)),
  contactPerson: zOptionalText(100),
  phone: zOptionalPhone(),
  altPhone: zOptionalPhone(),
  email: zOptionalEmail(),
  address: zOptionalText(500),
  city: zOptionalText(100),
  latitude: zOptionalCoordinate("latitude"),
  longitude: zOptionalCoordinate("longitude"),
  gstin: zOptionalGstin(),
  pan: zOptionalPan(),
  materialsSupplied: zOptionalText(1000),
  priceRangeNote: zOptionalText(500),
  paymentTerms: zOptionalText(300),
  creditDays: z.preprocess((v) => (v === "" || v === undefined ? null : Number(v)), z.number().int().min(0).max(365).nullable()),
  rating: z.preprocess((v) => (v === "" || v === undefined ? null : Number(v)), z.number().int().min(1).max(5).nullable()),
  notes: zOptionalText(2000),
});

export const purchaseFormSchema = z.object({
  supplierId: zId("Supplier"),
  location: z.string().max(50),
  purchaseDate: zDate("Purchase date"),
  invoiceNumber: zOptionalText(60),
  invoiceDate: zOptionalDate("Bill date"),
  dueDate: zOptionalDate("Payment due date"),
  expectedDelivery: zOptionalDate("Expected delivery"),
  receivedNow: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
  transportPaise: zMoney("Transport"),
  otherChargesPaise: zMoney("Other charges"),
  discountPaise: zMoney("Discount"),
  notes: zOptionalText(2000),
  materialRequestId: zOptionalId(),
  // optional "paid now"
  paidNowPaise: zOptionalMoney("Amount paid now"),
  paidMethod: z.string().optional(),
  paidAccountId: zOptionalId(),
  paidReference: zOptionalText(100),
});

export const purchaseItemSchema = z.object({
  materialId: zId("Material"),
  quantity: zQuantity("Quantity"),
  ratePaise: zMoney("Rate"),
  taxPercent: z.preprocess((v) => (v === "" || v === undefined ? "0" : v), z.string().regex(/^\d{1,2}(\.\d{1,2})?$/, "Enter GST % like 18")),
  weightKg: zOptionalQuantity("Weight"),
});

export const materialRequestSchema = z.object({
  projectId: zId("Project"),
  neededBy: zOptionalDate("Needed by"),
  priority: zEnum(Priority, "Priority"),
  notes: zOptionalText(1000),
});

export const requestItemSchema = z.object({
  materialId: zId("Material"),
  quantity: zQuantity("Quantity"),
  notes: zOptionalText(200),
});
