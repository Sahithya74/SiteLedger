import "server-only";
import { formatDate } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { resolvePeriod, type Period } from "@/lib/period";
import type { ReportColumn, ReportDef, ReportParams, ReportValue } from "./registry";

/** Display text for a cell on screen and in print. */
export function displayValue(value: ReportValue | undefined, type: ReportColumn["type"]): string {
  if (value === null || value === undefined || value === "") return "—";
  if (type === "money") return formatINR(typeof value === "bigint" ? value : BigInt(value));
  if (type === "date") return formatDate(String(value));
  if (type === "number") return Number(value).toLocaleString("en-IN");
  return String(value);
}

/** Plain values for CSV: rupees with 2 decimals (no ₹ or commas) so Excel can add them up. */
export function csvValue(value: ReportValue | undefined, type: ReportColumn["type"]): string {
  if (value === null || value === undefined) return "";
  if (type === "money") {
    const p = typeof value === "bigint" ? value : BigInt(value);
    const neg = p < 0n;
    const abs = neg ? -p : p;
    return `${neg ? "-" : ""}${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}`;
  }
  if (type === "date") return formatDate(String(value));
  return String(value);
}

type Params = Record<string, string | string[] | undefined>;

/** Reads the filters a report uses from the URL. */
export function reportParams(def: ReportDef, sp: Params): { params: ReportParams; period: Period | null } {
  const period = def.period ? resolvePeriod(sp, def.defaultPeriod ?? "this-month") : null;
  const project = typeof sp.project === "string" && sp.project ? sp.project : undefined;
  return { params: { from: period?.from ?? null, to: period?.to ?? null, projectId: def.project ? project : undefined }, period };
}
