import { addDays, addMonths, endOfMonth, financialYear, formatDate, isISODate, startOfMonth, todayIST, type ISODate } from "@/lib/dates";

/** Date ranges people actually think in. Financial year = April to March. */
export const PERIOD_OPTIONS = [
  { value: "this-month", label: "This month" },
  { value: "last-month", label: "Last month" },
  { value: "last-90", label: "Last 90 days" },
  { value: "this-fy", label: "This financial year" },
  { value: "last-fy", label: "Last financial year" },
  { value: "all", label: "All time" },
] as const;

export type PeriodKey = (typeof PERIOD_OPTIONS)[number]["value"] | "custom";

export type Period = { key: PeriodKey; from: ISODate | null; to: ISODate | null; label: string };

type Params = { period?: string | string[]; from?: string | string[]; to?: string | string[] };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function resolvePeriod(params: Params, fallback: PeriodKey = "this-fy", today: ISODate = todayIST()): Period {
  const from = one(params.from);
  const to = one(params.to);
  if ((from && isISODate(from)) || (to && isISODate(to))) {
    const f = from && isISODate(from) ? from : null;
    const t = to && isISODate(to) ? to : null;
    return { key: "custom", from: f, to: t, label: `${f ? formatDate(f) : "start"} – ${t ? formatDate(t) : "today"}` };
  }
  const key = (PERIOD_OPTIONS.some((o) => o.value === one(params.period)) ? one(params.period) : fallback) as PeriodKey;
  const fy = financialYear(today);
  switch (key) {
    case "this-month":
      return { key, from: startOfMonth(today), to: endOfMonth(today), label: "This month" };
    case "last-month": {
      const start = addMonths(startOfMonth(today), -1);
      return { key, from: start, to: endOfMonth(start), label: "Last month" };
    }
    case "last-90":
      return { key, from: addDays(today, -89), to: today, label: "Last 90 days" };
    case "last-fy": {
      const last = financialYear(addDays(fy.start, -1));
      return { key, from: last.start, to: last.end, label: `FY ${last.label}` };
    }
    case "all":
      return { key, from: null, to: null, label: "All time" };
    default:
      return { key: "this-fy", from: fy.start, to: fy.end, label: `FY ${fy.label}` };
  }
}

/** Prisma `where` fragment for a @db.Date column. */
export function dateRange(period: Period): { gte?: Date; lte?: Date } | undefined {
  if (!period.from && !period.to) return undefined;
  return {
    ...(period.from ? { gte: new Date(`${period.from}T00:00:00.000Z`) } : {}),
    ...(period.to ? { lte: new Date(`${period.to}T00:00:00.000Z`) } : {}),
  };
}
