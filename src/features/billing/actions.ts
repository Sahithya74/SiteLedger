"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { billItemSchema, billSchema } from "@/features/money/schemas";
import { InvoiceKind, VariationStatus } from "@/generated/prisma/enums";
import { formatINR } from "@/lib/money";
import { zDate, zId, zMoney, zOptionalText, zText } from "@/lib/validation";
import { formToObject, indexedRows, runAction, type ActionResult } from "@/server/action";
import { requireActionUser } from "@/server/auth/current-user";
import { AppError } from "@/server/errors";
import {
  cancelInvoice,
  createInvoice,
  createQuotation,
  deleteDraftQuotation,
  issueInvoice,
  reviseQuotation,
  setQuotationStatus,
  updateQuotation,
  type BillLine,
} from "@/server/services/billing";
import { createVariation, decideVariation, setBudgets } from "@/server/services/variations";

type Result = ActionResult<unknown>;

function lines(values: Record<string, string | string[]>): BillLine[] {
  return indexedRows(values, "items").map((r, i) => {
    const parsed = billItemSchema.safeParse(r);
    if (!parsed.success) throw new AppError(`Line ${i + 1}: ${parsed.error.issues[0].message}`);
    return parsed.data;
  });
}

export async function saveQuotationAction(id: string | null, _prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("quotations.manage");
    const values = formToObject(formData);
    const input = billSchema.parse(values);
    if (!input.clientId) throw new AppError("Choose a client.", { clientId: "Choose a client." });
    const data = {
      clientId: input.clientId,
      projectId: input.projectId,
      title: input.title ?? "Quotation",
      date: input.date,
      validUntil: input.validUntil,
      taxMode: input.taxMode,
      taxPercent: input.taxPercent,
      discountPaise: input.discountPaise,
      terms: input.terms,
      notes: input.notes,
      lines: lines(values),
    };
    if (id) {
      await updateQuotation(user, id, data);
      redirect(`/clients/quotations/${id}`);
    }
    const created = await createQuotation(user, data);
    redirect(`/clients/quotations/${created.id}`);
  });
}

export async function quotationStatusAction(id: string, status: "SENT" | "ACCEPTED" | "REJECTED"): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("quotations.manage");
    await setQuotationStatus(user, id, z.enum(["SENT", "ACCEPTED", "REJECTED"]).parse(status));
    refresh();
    return { ok: true, message: "Quotation updated." };
  });
}

export async function reviseQuotationAction(id: string): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("quotations.manage");
    const { id: newId } = await reviseQuotation(user, id);
    redirect(`/clients/quotations/${newId}/edit`);
  });
}

export async function deleteQuotationAction(id: string): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("quotations.manage");
    await deleteDraftQuotation(user, id);
    redirect("/clients/quotations");
  });
}

export async function createInvoiceAction(_prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("quotations.manage");
    const values = formToObject(formData);
    const input = billSchema.parse(values);
    if (!input.projectId) throw new AppError("Choose a project.", { projectId: "Choose a project." });
    const { id } = await createInvoice(user, {
      projectId: input.projectId,
      kind: z.enum(InvoiceKind).catch("RUNNING").parse(input.kind),
      date: input.date,
      dueDate: input.dueDate,
      periodFrom: null,
      periodTo: null,
      milestone: input.milestone,
      taxMode: input.taxMode,
      taxPercent: input.taxPercent,
      retentionPercent: input.retentionPercent,
      notes: input.notes,
      issueNow: values.issueNow === "on" || values.issueNow === "true",
      lines: lines(values),
    });
    redirect(`/clients/bills/${id}`);
  });
}

export async function issueInvoiceAction(id: string): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("quotations.manage");
    await issueInvoice(user, id);
    refresh();
    return { ok: true, message: "Bill issued." };
  });
}

export async function cancelInvoiceAction(id: string, reason: string): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("quotations.manage");
    await cancelInvoice(user, id, reason ?? "");
    refresh();
    return { ok: true, message: "Bill cancelled." };
  });
}

const variationSchema = z.object({
  projectId: zId("Project"),
  title: zText("Extra work", 200),
  description: zOptionalText(1000),
  amountPaise: zMoney("Amount", { allowNegative: true, allowZero: false }),
  requestedOn: zDate("Date"),
});

export async function createVariationAction(_prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("quotations.manage");
    const input = variationSchema.parse(formToObject(formData));
    await createVariation(user, input);
    refresh();
    return { ok: true, message: `Extra work of ${formatINR(input.amountPaise)} recorded.` };
  });
}

export async function decideVariationAction(id: string, status: string, note: string): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("quotations.manage");
    await decideVariation(user, id, z.enum(VariationStatus).parse(status), note?.trim() || null);
    refresh();
    return { ok: true, message: "Saved." };
  });
}

export async function setBudgetsAction(projectId: string, _prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("projects.viewMoney");
    const values = formToObject(formData);
    const budgets = Object.entries(values)
      .filter(([k]) => k.startsWith("budget."))
      .map(([k, v]) => ({ group: k.slice(7), amountPaise: zMoney("Budget").parse(Array.isArray(v) ? v[0] : v) }));
    await setBudgets(user, projectId, budgets);
    refresh();
    return { ok: true, message: "Budget saved." };
  });
}
