"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  categoryFormSchema,
  materialFormSchema,
  materialRequestSchema,
  purchaseFormSchema,
  purchaseItemSchema,
  requestItemSchema,
  stockMovementSchema,
  stockTransferSchema,
  supplierFormSchema,
} from "@/features/materials/schemas";
import { outgoingPaymentSchema } from "@/features/money/schemas";
import { PaymentMethod } from "@/generated/prisma/enums";
import { todayIST } from "@/lib/dates";
import { formToObject, indexedRows, runAction, type ActionResult } from "@/server/action";
import { requireActionUser } from "@/server/auth/current-user";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { recordPayment } from "@/server/services/ledger";
import { cancelMaterialRequest, createMaterialRequest, decideMaterialRequest } from "@/server/services/material-requests";
import { createCategory, createMaterial, recordStockMovement, STORE, transferStock, updateMaterial } from "@/server/services/materials";
import { cancelPurchase, receivePurchase, recordPurchase } from "@/server/services/purchases";
import { createSupplier, setSupplierActive, updateSupplier } from "@/server/services/suppliers";

type Result = ActionResult<unknown>;

export async function createMaterialAction(_prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("materials.manage");
    const { id } = await createMaterial(user, materialFormSchema.parse(formToObject(formData)));
    redirect(`/materials/${id}`);
  });
}

export async function updateMaterialAction(id: string, _prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("materials.manage");
    await updateMaterial(user, id, materialFormSchema.parse(formToObject(formData)));
    refresh();
    return { ok: true, message: "Material saved." };
  });
}

export async function createCategoryAction(_prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("materials.manage");
    await createCategory(user, categoryFormSchema.parse(formToObject(formData)));
    refresh();
    return { ok: true, message: "Category added." };
  });
}

export async function stockMovementAction(_prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("materials.record");
    const input = stockMovementSchema.parse(formToObject(formData));
    await recordStockMovement(user, input);
    refresh();
    return { ok: true, message: "Stock updated." };
  });
}

export async function stockTransferAction(_prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("materials.record");
    await transferStock(user, stockTransferSchema.parse(formToObject(formData)));
    refresh();
    return { ok: true, message: "Material moved." };
  });
}

export async function createSupplierAction(_prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("materials.manage");
    const { id } = await createSupplier(user, supplierFormSchema.parse(formToObject(formData)));
    redirect(`/materials/suppliers/${id}`);
  });
}

export async function updateSupplierAction(id: string, _prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("materials.manage");
    await updateSupplier(user, id, supplierFormSchema.parse(formToObject(formData)));
    redirect(`/materials/suppliers/${id}`);
  });
}

export async function setSupplierActiveAction(id: string, active: boolean): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("materials.manage");
    await setSupplierActive(user, id, active === true);
    refresh();
    return { ok: true, message: active ? "Supplier re-activated." : "Supplier hidden from lists." };
  });
}

export async function createPurchaseAction(_prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("purchases.record");
    const values = formToObject(formData);
    const input = purchaseFormSchema.parse(values);
    const rows = indexedRows(values, "items");
    if (rows.length === 0) throw new AppError("Add at least one material.", { items: "Add at least one material." });
    const items = rows.map((r, i) => {
      const parsed = purchaseItemSchema.safeParse(r);
      if (!parsed.success) throw new AppError(`Line ${i + 1}: ${parsed.error.issues[0].message}`);
      return parsed.data;
    });
    const { id } = await recordPurchase(user, {
      supplierId: input.supplierId,
      projectId: input.location === STORE ? null : input.location,
      purchaseDate: input.purchaseDate,
      invoiceNumber: input.invoiceNumber,
      invoiceDate: input.invoiceDate,
      dueDate: input.dueDate,
      expectedDelivery: input.receivedNow ? null : input.expectedDelivery,
      receivedOn: input.receivedNow ? input.purchaseDate : null,
      transportPaise: input.transportPaise,
      otherChargesPaise: input.otherChargesPaise,
      discountPaise: input.discountPaise,
      notes: input.notes,
      materialRequestId: input.materialRequestId,
      items: items.map((i) => ({ materialId: i.materialId, quantity: i.quantity, ratePaise: i.ratePaise, taxPercent: i.taxPercent, weightKg: i.weightKg })),
    });
    if (input.paidNowPaise && input.paidNowPaise > 0n) {
      if (!input.paidAccountId) throw new AppError("Choose the account the payment was made from.", { paidAccountId: "Choose an account." });
      const method = z.enum(PaymentMethod).safeParse(input.paidMethod).data ?? "CASH";
      await recordPayment(user, {
        date: input.purchaseDate,
        amountPaise: input.paidNowPaise,
        payeeType: "SUPPLIER",
        supplierId: input.supplierId,
        purpose: "PURCHASE",
        projectId: input.location === STORE ? null : input.location,
        purchaseId: id,
        method,
        accountId: input.paidAccountId,
        reference: input.paidReference,
      });
    }
    redirect(`/materials/purchases/${id}`);
  });
}

export async function receivePurchaseAction(id: string): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("materials.record");
    await receivePurchase(user, id, todayIST());
    refresh();
    return { ok: true, message: "Delivery received and added to stock." };
  });
}

export async function cancelPurchaseAction(id: string, reason: string): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("purchases.record");
    await cancelPurchase(user, id, reason);
    refresh();
    return { ok: true, message: "Purchase cancelled." };
  });
}

/** Pay a supplier (optionally against one purchase). */
export async function paySupplierAction(_prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("payments.record");
    const input = outgoingPaymentSchema.parse({ ...formToObject(formData), payeeType: "SUPPLIER", purpose: "PURCHASE" });
    if (!input.supplierId) throw new AppError("Choose a supplier.");
    if (input.purchaseId) {
      const purchase = await db.purchase.findUnique({ where: { id: input.purchaseId }, select: { supplierId: true, projectId: true } });
      if (!purchase || purchase.supplierId !== input.supplierId) throw new AppError("That bill belongs to another supplier.");
      input.projectId = purchase.projectId;
    }
    await recordPayment(user, input);
    refresh();
    return { ok: true, message: "Payment recorded." };
  });
}

export async function createMaterialRequestAction(_prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("materials.record");
    const values = formToObject(formData);
    const input = materialRequestSchema.parse(values);
    const items = indexedRows(values, "items").map((r, i) => {
      const parsed = requestItemSchema.safeParse(r);
      if (!parsed.success) throw new AppError(`Line ${i + 1}: ${parsed.error.issues[0].message}`);
      return parsed.data;
    });
    await createMaterialRequest(user, { ...input, items });
    redirect("/materials/requests");
  });
}

export async function decideMaterialRequestAction(id: string, approve: boolean, note: string): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("purchases.record");
    await decideMaterialRequest(user, id, approve === true, note?.trim() || null);
    refresh();
    return { ok: true, message: approve ? "Request approved." : "Request rejected." };
  });
}

export async function cancelMaterialRequestAction(id: string): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser();
    await cancelMaterialRequest(user, id);
    refresh();
    return { ok: true, message: "Request cancelled." };
  });
}
