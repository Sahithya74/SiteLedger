import "server-only";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import type { ActionResult } from "@/server/action-types";
import { AppError } from "@/server/errors";

export type { ActionResult };

/** Turns a Zod error into { fieldName: "message" } for the form. */
export function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    out[key] ??= issue.message;
  }
  return out;
}

function databaseMessage(error: unknown): string | null {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return "This already exists. Please use a different value.";
    if (error.code === "P2003") return "This is linked to other records, so it can't be changed this way.";
    if (error.code === "P2025") return "This record could not be found. It may have been removed.";
  }
  const text = error instanceof Error ? error.message : String(error);
  // Raised by the database guards in prisma/migrations/*_integrity_guards.
  const guard = /SITECORE: (.+?)(?:\n|$)/.exec(text);
  if (guard) return guard[1];
  return null;
}

/**
 * Runs the body of a server action and converts any failure into a result the
 * form can show. Framework signals (redirect, notFound) are re-thrown.
 */
export async function runAction<T>(body: () => Promise<T | ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    const value = await body();
    if (value && typeof value === "object" && "ok" in value) return value as ActionResult<T>;
    return { ok: true, data: value as T };
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof z.ZodError) {
      return { ok: false, error: "Please check the highlighted fields.", fieldErrors: zodFieldErrors(error) };
    }
    if (error instanceof AppError) {
      return { ok: false, error: error.message, fieldErrors: error.fieldErrors };
    }
    const known = databaseMessage(error);
    if (known) return { ok: false, error: known };
    console.error("[action] unexpected error", error);
    return { ok: false, error: "Something went wrong while saving. Please try again." };
  }
}

/** FormData → plain object (repeated keys become arrays). */
export function formToObject(formData: FormData): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("$ACTION")) continue;
    if (typeof value !== "string") continue;
    const existing = out[key];
    if (existing === undefined) out[key] = value;
    else out[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
  }
  return out;
}

/**
 * Repeated rows from a form, e.g. fields named "items.0.materialId",
 * "items.0.quantity", "items.1.materialId"… → [{materialId, quantity}, …].
 * Rows with every field blank are dropped.
 */
export function indexedRows(values: Record<string, string | string[]>, prefix: string): Record<string, string>[] {
  const rows = new Map<number, Record<string, string>>();
  const re = new RegExp(String.raw`^${prefix}\.(\d+)\.(.+)$`);
  for (const [key, raw] of Object.entries(values)) {
    const m = re.exec(key);
    if (!m) continue;
    const index = Number(m[1]);
    const row = rows.get(index) ?? {};
    row[m[2]] = Array.isArray(raw) ? raw[0] : raw;
    rows.set(index, row);
  }
  return [...rows.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, r]) => r)
    .filter((r) => Object.values(r).some((v) => v.trim() !== ""));
}
