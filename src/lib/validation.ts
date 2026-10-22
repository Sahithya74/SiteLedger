import { z } from "zod";
import { isISODate } from "@/lib/dates";
import { parseRupees } from "@/lib/money";

/**
 * Reusable Zod field types for forms. Each one accepts the raw text a form
 * submits and turns it into a clean value, with plain-English messages.
 */

const blankToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : typeof value === "string" ? value.trim() : value;

/** Required text. */
export function zText(label: string, max = 200) {
  return z.preprocess(
    blankToUndefined,
    z
      .string({ error: `${label} is required.` })
      .min(1, `${label} is required.`)
      .max(max, `${label} is too long (max ${max} characters).`),
  );
}

/** Optional text: blank becomes null. */
export function zOptionalText(max = 2000) {
  return z.preprocess(
    (v) => blankToUndefined(v) ?? null,
    z.string().max(max, `Too long (max ${max} characters).`).nullable(),
  );
}

/** Amount in rupees typed by the user → bigint paise. */
export function zMoney(label: string, options: { allowNegative?: boolean; allowZero?: boolean } = {}) {
  const { allowNegative = false, allowZero = true } = options;
  return z.preprocess(
    (v) => {
      if (typeof v === "bigint") return v;
      if (typeof v === "number") return parseRupees(String(v)) ?? Number.NaN;
      if (typeof v !== "string" || v.trim() === "") return allowZero ? 0n : undefined;
      return parseRupees(v) ?? Number.NaN;
    },
    z
      .bigint({ error: `Enter a valid amount for ${label.toLowerCase()} (for example 1,25,000.50).` })
      .refine((v) => allowNegative || v >= 0n, `${label} cannot be negative.`)
      .refine((v) => allowZero || v !== 0n, `${label} must be more than zero.`)
      .refine((v) => v < 10_000_000_000_000n, `${label} is too large.`),
  );
}

/** Optional amount: blank becomes null. */
export function zOptionalMoney(label: string) {
  return z.preprocess(
    (v) => {
      if (v === null || v === undefined) return null;
      if (typeof v === "bigint") return v;
      if (typeof v !== "string" || v.trim() === "") return null;
      return parseRupees(v) ?? Number.NaN;
    },
    z
      .bigint({ error: `Enter a valid amount for ${label.toLowerCase()}.` })
      .refine((v) => v >= 0n, `${label} cannot be negative.`)
      .nullable(),
  );
}

/** Required calendar date "YYYY-MM-DD". */
export function zDate(label: string) {
  return z.preprocess(
    blankToUndefined,
    z.string({ error: `${label} is required.` }).refine(isISODate, `Enter a valid date for ${label.toLowerCase()}.`),
  );
}

/** Optional calendar date: blank becomes null. */
export function zOptionalDate(label: string) {
  return z.preprocess(
    (v) => blankToUndefined(v) ?? null,
    z.string().refine(isISODate, `Enter a valid date for ${label.toLowerCase()}.`).nullable(),
  );
}

/** Indian phone number: 10 digits, optional +91 / 0 prefix, spaces and dashes allowed. */
export function zOptionalPhone() {
  return z.preprocess(
    (v) => {
      const s = blankToUndefined(v);
      if (typeof s !== "string") return null;
      return s.replace(/[\s-]/g, "");
    },
    z
      .string()
      .regex(/^(?:\+91|0)?[6-9]\d{9}$|^(?:\+?\d{8,15})$/, "Enter a valid phone number (10 digits).")
      .nullable(),
  );
}

export function zOptionalEmail() {
  return z.preprocess(
    (v) => blankToUndefined(v) ?? null,
    z.email("Enter a valid email address.").max(200).nullable(),
  );
}

/** GSTIN: 15 characters, e.g. 33ABCDE1234F1Z5. */
export function zOptionalGstin() {
  return z.preprocess(
    (v) => (typeof v === "string" ? blankToUndefined(v.toUpperCase()) : v) ?? null,
    z
      .string()
      .regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, "GSTIN should look like 33ABCDE1234F1Z5 (15 characters).")
      .nullable(),
  );
}

/** PAN: 10 characters, e.g. ABCDE1234F. */
export function zOptionalPan() {
  return z.preprocess(
    (v) => (typeof v === "string" ? blankToUndefined(v.toUpperCase()) : v) ?? null,
    z.string().regex(/^[A-Z]{5}\d{4}[A-Z]$/, "PAN should look like ABCDE1234F (10 characters).").nullable(),
  );
}

export function zInt(label: string, min: number, max: number) {
  return z.preprocess(
    (v) => (typeof v === "string" && v.trim() !== "" ? Number(v) : v),
    z
      .number({ error: `${label} must be a number.` })
      .int(`${label} must be a whole number.`)
      .min(min, `${label} must be at least ${min}.`)
      .max(max, `${label} must be at most ${max}.`),
  );
}

export function zOptionalCoordinate(kind: "latitude" | "longitude") {
  const limit = kind === "latitude" ? 90 : 180;
  return z.preprocess(
    (v) => {
      const s = blankToUndefined(v);
      if (s === undefined || s === null) return null;
      return typeof s === "string" ? Number(s) : s;
    },
    z
      .number({ error: `Enter a valid ${kind}.` })
      .min(-limit, `Enter a valid ${kind}.`)
      .max(limit, `Enter a valid ${kind}.`)
      .nullable(),
  );
}

/** Checkbox value: "on"/"true" → true, missing → false. */
export function zCheckbox() {
  return z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());
}

export function zEnum<T extends Record<string, string>>(values: T, label: string) {
  return z.enum(values, { error: `Choose a ${label.toLowerCase()}.` });
}

export function zOptionalId() {
  return z.preprocess((v) => blankToUndefined(v) ?? null, z.string().max(50).nullable());
}

export function zId(label: string) {
  return z.preprocess(blankToUndefined, z.string({ error: `Choose a ${label.toLowerCase()}.` }).min(1).max(50));
}
