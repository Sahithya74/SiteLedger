import "server-only";
import type { ZodError } from "zod";
import { workerSchema } from "@/features/labour/schemas";
import { materialFormSchema, supplierFormSchema } from "@/features/materials/schemas";
import { csvToObjects, parseCsv, toCsv } from "@/lib/csv";
import { LABOUR_CATEGORY, SUPPLIER_CATEGORY } from "@/lib/labels";
import { can, type Permission } from "@/lib/permissions";
import type { CurrentUser } from "@/server/auth/current-user";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { createWorker } from "@/server/services/labour";
import { createMaterial, materialCategories } from "@/server/services/materials";
import { createSupplier } from "@/server/services/suppliers";

/**
 * First-time setup from Excel: workers, materials and suppliers. Each row is
 * checked by the same rules as the normal forms. Nothing is saved unless
 * every row is correct, so a file is never half-imported.
 */

export type ImportType = "workers" | "materials" | "suppliers";
type Column = { key: string; label: string; required?: boolean; example: string };
type Context = { categories: { id: string; name: string }[] };

type ImportDef = {
  title: string;
  permission: Permission;
  columns: Column[];
  /** Turns a spreadsheet row into the same values the form would send. */
  toForm: (row: Record<string, string>, ctx: Context) => { values: Record<string, unknown>; errors: string[] };
  parse: (values: Record<string, unknown>) => unknown;
  duplicate: (parsed: never) => Promise<string | null>;
  create: (user: CurrentUser, parsed: never) => Promise<unknown>;
};

const MAX_ROWS = 1000;

/** "25-03-2024", "25/03/2024" or "2024-03-25" → "2024-03-25". */
function isoDate(value: string): string {
  const v = value.trim();
  const dmy = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  return v;
}

/** Matches "Steel worker", "steel_worker" or "STEEL WORKER" to an enum code. */
function enumFrom<K extends string>(labels: Record<K, string>, value: string): K | null {
  const v = value.trim().toLowerCase().replace(/[_\s]+/g, " ");
  if (!v) return null;
  for (const [code, label] of Object.entries(labels) as [K, string][]) {
    if (label.toLowerCase() === v || code.toLowerCase().replace(/_/g, " ") === v) return code;
  }
  return null;
}

const IMPORTS: Record<ImportType, ImportDef> = {
  workers: {
    title: "Workers",
    permission: "labour.manage",
    columns: [
      { key: "name", label: "Name", required: true, example: "Murugan S" },
      { key: "phone", label: "Phone", example: "9876543210" },
      { key: "category", label: "Type of work", required: true, example: "Mason" },
      { key: "dailyWage", label: "Daily wage", required: true, example: "900" },
      { key: "overtimeRate", label: "Overtime rate per hour", example: "120" },
      { key: "address", label: "Address", example: "Ambattur, Chennai" },
      { key: "emergencyContact", label: "Emergency contact", example: "Wife - 9876500000" },
      { key: "upiId", label: "UPI ID", example: "murugan@okaxis" },
      { key: "joinedOn", label: "Joined on", example: "01-04-2026" },
      { key: "notes", label: "Notes", example: "" },
    ],
    toForm(r) {
      const errors: string[] = [];
      const category = enumFrom(LABOUR_CATEGORY, r.category ?? "");
      if (!category) errors.push(`Type of work "${r.category ?? ""}" is not known. Use one of: ${Object.values(LABOUR_CATEGORY).join(", ")}.`);
      return {
        errors,
        values: {
          name: r.name ?? "",
          phone: r.phone ?? "",
          category: category ?? "",
          contractorId: "",
          dailyWagePaise: r.dailyWage ?? "",
          overtimeRatePaise: r.overtimeRate ?? "",
          address: r.address ?? "",
          emergencyContact: r.emergencyContact ?? "",
          upiId: r.upiId ?? "",
          joinedOn: r.joinedOn ? isoDate(r.joinedOn) : "",
          notes: r.notes ?? "",
        },
      };
    },
    parse: (v) => workerSchema.parse(v),
    async duplicate(p: { name: string; phone: string | null }) {
      const clash = await db.labour.findFirst({ where: { deletedAt: null, name: { equals: p.name, mode: "insensitive" }, ...(p.phone ? { phone: p.phone } : {}) } });
      return clash ? `A worker called "${p.name}"${p.phone ? ` with this phone` : ""} already exists.` : null;
    },
    create: (user, p) => createWorker(user, p),
  },
  materials: {
    title: "Materials",
    permission: "materials.manage",
    columns: [
      { key: "name", label: "Name", required: true, example: "OPC 53 Grade Cement" },
      { key: "category", label: "Category", required: true, example: "Cement" },
      { key: "unit", label: "Unit", required: true, example: "bag" },
      { key: "reorderLevel", label: "Reorder level", example: "50" },
      { key: "rate", label: "Usual rate", example: "420" },
      { key: "brand", label: "Brand", example: "UltraTech" },
      { key: "grade", label: "Grade", example: "53" },
      { key: "size", label: "Size", example: "" },
      { key: "colour", label: "Colour", example: "" },
      { key: "thickness", label: "Thickness", example: "" },
      { key: "finish", label: "Finish", example: "" },
      { key: "notes", label: "Notes", example: "" },
    ],
    toForm(r, ctx) {
      const errors: string[] = [];
      const category = ctx.categories.find((c) => c.name.toLowerCase() === (r.category ?? "").trim().toLowerCase());
      if (!category) errors.push(`Category "${r.category ?? ""}" does not exist. Use one of: ${ctx.categories.map((c) => c.name).join(", ")} — or add it under Materials first.`);
      return {
        errors,
        values: {
          name: r.name ?? "",
          categoryId: category?.id ?? "",
          unit: r.unit ?? "",
          reorderLevel: r.reorderLevel || "0",
          defaultRatePaise: r.rate ?? "",
          brand: r.brand ?? "",
          grade: r.grade ?? "",
          size: r.size ?? "",
          colour: r.colour ?? "",
          thickness: r.thickness ?? "",
          finish: r.finish ?? "",
          notes: r.notes ?? "",
        },
      };
    },
    parse: (v) => materialFormSchema.parse(v),
    async duplicate(p: { name: string }) {
      const clash = await db.material.findFirst({ where: { deletedAt: null, name: { equals: p.name, mode: "insensitive" } } });
      return clash ? `A material called "${p.name}" already exists.` : null;
    },
    create: (user, p) => createMaterial(user, p),
  },
  suppliers: {
    title: "Suppliers",
    permission: "materials.manage",
    columns: [
      { key: "name", label: "Business name", required: true, example: "Sri Murugan Hardwares" },
      { key: "categories", label: "Supplies (comma separated)", example: "Hardware, Paint" },
      { key: "contactPerson", label: "Contact person", example: "Ravi" },
      { key: "phone", label: "Phone", example: "9840012345" },
      { key: "altPhone", label: "Other phone", example: "" },
      { key: "email", label: "Email", example: "" },
      { key: "address", label: "Address", example: "12, Main Road" },
      { key: "city", label: "City", example: "Chennai" },
      { key: "gstin", label: "GSTIN", example: "" },
      { key: "pan", label: "PAN", example: "" },
      { key: "materialsSupplied", label: "Materials supplied", example: "Nails, binding wire, paint" },
      { key: "paymentTerms", label: "Payment terms", example: "15 days credit" },
      { key: "creditDays", label: "Credit days", example: "15" },
      { key: "notes", label: "Notes", example: "" },
    ],
    toForm(r) {
      const errors: string[] = [];
      const categories: string[] = [];
      for (const part of (r.categories ?? "").split(/[,;/]/).map((s) => s.trim()).filter(Boolean)) {
        const code = enumFrom(SUPPLIER_CATEGORY, part);
        if (code) categories.push(code);
        else errors.push(`"${part}" is not a known supply type. Use: ${Object.values(SUPPLIER_CATEGORY).join(", ")}.`);
      }
      return {
        errors,
        values: {
          name: r.name ?? "",
          categories,
          contactPerson: r.contactPerson ?? "",
          phone: r.phone ?? "",
          altPhone: r.altPhone ?? "",
          email: r.email ?? "",
          address: r.address ?? "",
          city: r.city ?? "",
          latitude: "",
          longitude: "",
          gstin: r.gstin ?? "",
          pan: r.pan ?? "",
          materialsSupplied: r.materialsSupplied ?? "",
          priceRangeNote: "",
          paymentTerms: r.paymentTerms ?? "",
          creditDays: r.creditDays ?? "",
          rating: "",
          notes: r.notes ?? "",
        },
      };
    },
    parse: (v) => supplierFormSchema.parse(v),
    async duplicate(p: { name: string }) {
      const clash = await db.supplier.findFirst({ where: { deletedAt: null, name: { equals: p.name, mode: "insensitive" } } });
      return clash ? `A supplier called "${p.name}" already exists.` : null;
    },
    create: (user, p) => createSupplier(user, p),
  },
};

export function importTypesFor(user: CurrentUser): { type: ImportType; title: string }[] {
  return (Object.entries(IMPORTS) as [ImportType, ImportDef][]).filter(([, d]) => can(user, d.permission)).map(([type, d]) => ({ type, title: d.title }));
}

export function importDef(type: string): ImportDef | null {
  return type in IMPORTS ? IMPORTS[type as ImportType] : null;
}

/** An empty spreadsheet with the right headings and one example row. */
export function importTemplate(type: ImportType): string {
  const def = IMPORTS[type];
  return toCsv(
    def.columns.map((c) => (c.required ? `${c.label} *` : c.label)),
    [def.columns.map((c) => c.example)],
  );
}

export type RowCheck = { line: number; label: string; errors: string[] };

function zodMessages(error: ZodError): string[] {
  return error.issues.map((i) => i.message);
}

/** Checks every row. Returns the rows (with problems) and the parsed values ready to save. */
async function checkFile(user: CurrentUser, type: ImportType, text: string) {
  const def = IMPORTS[type];
  if (!can(user, def.permission)) throw new AppError("You don't have permission to import these.");
  // Headings may carry " *" for required columns; match on the label.
  const byLabel = new Map(def.columns.map((c) => [c.label.toLowerCase(), c.key]));
  const raw = csvToObjects(parseCsv(text));
  if (raw.length === 0) throw new AppError("The file has no rows. Fill in the template below the heading row.");
  if (raw.length > MAX_ROWS) throw new AppError(`Up to ${MAX_ROWS} rows at a time, please split the file.`);
  const ctx: Context = { categories: type === "materials" ? await materialCategories() : [] };
  const seen = new Set<string>();
  const rows: RowCheck[] = [];
  const parsed: unknown[] = [];
  for (const [i, original] of raw.entries()) {
    const r: Record<string, string> = {};
    for (const [heading, value] of Object.entries(original)) {
      const key = byLabel.get(heading.replace(/\*\s*$/, "").trim().toLowerCase());
      if (key) r[key] = (value ?? "").trim();
    }
    if (Object.values(r).every((v) => !v) || (i === 0 && def.columns.every((c) => (r[c.key] ?? "") === c.example))) continue; // blank or untouched example row
    const { values, errors } = def.toForm(r, ctx);
    const result = (() => {
      try {
        return { ok: true as const, data: def.parse(values) };
      } catch (e) {
        return { ok: false as const, errors: zodMessages(e as ZodError) };
      }
    })();
    if (!result.ok) errors.push(...result.errors);
    const name = String(values.name ?? "").trim();
    if (name) {
      if (seen.has(name.toLowerCase())) errors.push(`"${name}" appears twice in the file.`);
      seen.add(name.toLowerCase());
    }
    if (result.ok && errors.length === 0) {
      const dup = await def.duplicate(result.data as never);
      if (dup) errors.push(dup);
      else parsed.push(result.data);
    }
    rows.push({ line: i + 2, label: name || "(no name)", errors: [...new Set(errors)] });
  }
  return { rows, parsed };
}

export async function previewImport(user: CurrentUser, type: ImportType, text: string) {
  const { rows } = await checkFile(user, type, text);
  return { total: rows.length, problems: rows.filter((r) => r.errors.length > 0) };
}

export async function runImport(user: CurrentUser, type: ImportType, text: string): Promise<number> {
  const { rows, parsed } = await checkFile(user, type, text);
  if (rows.some((r) => r.errors.length) || parsed.length === 0) throw new AppError("Fix the rows marked in red first — nothing was imported.");
  const def = IMPORTS[type];
  let done = 0;
  for (const p of parsed) {
    try {
      await def.create(user, p as never);
    } catch (e) {
      // Rows were checked first, so this is rare (e.g. someone added the same name meanwhile).
      const why = e instanceof AppError ? e.message : "an unexpected error";
      const name = (p as { name?: string }).name ?? "a row";
      throw new AppError(
        `Imported ${done} of ${parsed.length}, then stopped at "${name}": ${why} Upload the file again — rows already imported will show as "already exists"; remove them and import the rest.`,
      );
    }
    done++;
  }
  return done;
}
