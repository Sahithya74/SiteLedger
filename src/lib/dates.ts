/**
 * Date helpers. Business dates (attendance day, payment date, due date…) are
 * plain calendar dates written as "YYYY-MM-DD" and always mean India time.
 * In the database they are stored as DATE (midnight UTC in JS Date objects).
 */

export const APP_TIME_ZONE = "Asia/Kolkata";

/** A calendar date "YYYY-MM-DD". */
export type ISODate = string;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(value: unknown): value is ISODate {
  if (typeof value !== "string" || !ISO_DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

const istDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's date in India, e.g. "2026-10-21". */
export function todayIST(now: Date = new Date()): ISODate {
  return istDateFormatter.format(now);
}

/** "YYYY-MM-DD" → Date at UTC midnight (what Prisma expects for @db.Date). */
export function toDbDate(date: ISODate): Date {
  if (!isISODate(date)) throw new Error(`Invalid date: ${date}`);
  return new Date(`${date}T00:00:00.000Z`);
}

/** Date from a @db.Date column → "YYYY-MM-DD". */
export function fromDbDate(date: Date): ISODate {
  return date.toISOString().slice(0, 10);
}

export function fromDbDateOrNull(date: Date | null | undefined): ISODate | null {
  return date ? fromDbDate(date) : null;
}

export function addDays(date: ISODate, days: number): ISODate {
  const d = toDbDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromDbDate(d);
}

export function addMonths(date: ISODate, months: number): ISODate {
  const d = toDbDate(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return fromDbDate(d);
}

/** Whole calendar days from `from` to `to` (negative when `to` is earlier). */
export function diffDays(to: ISODate, from: ISODate): number {
  return Math.round((toDbDate(to).getTime() - toDbDate(from).getTime()) / 86_400_000);
}

export function startOfMonth(date: ISODate): ISODate {
  return `${date.slice(0, 7)}-01`;
}

export function endOfMonth(date: ISODate): ISODate {
  return addDays(addMonths(startOfMonth(date), 1), -1);
}

/**
 * Indian financial year (1 April – 31 March) containing `date`.
 * 2026-10-21 → { label: "2026-27", start: "2026-04-01", end: "2027-03-31" }
 */
export function financialYear(date: ISODate): { label: string; start: ISODate; end: ISODate } {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const startYear = month >= 4 ? year : year - 1;
  return {
    label: `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`,
    start: `${startYear}-04-01`,
    end: `${startYear + 1}-03-31`,
  };
}

/**
 * The 7-day wage week that ends on `weekEndsOn` (0 = Sunday … 6 = Saturday)
 * and contains `date`. Default: Sunday–Saturday, paid on Saturday.
 */
export function wageWeek(date: ISODate, weekEndsOn = 6): { start: ISODate; end: ISODate } {
  const weekday = toDbDate(date).getUTCDay();
  const daysUntilEnd = (weekEndsOn - weekday + 7) % 7;
  const end = addDays(date, daysUntilEnd);
  return { start: addDays(end, -6), end };
}

// ─────────────────────────────────────────────────────────────────────────────
// Display
// ─────────────────────────────────────────────────────────────────────────────

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function asISO(value: ISODate | Date): ISODate {
  return typeof value === "string" ? value : fromDbDate(value);
}

/** "2026-10-21" → "21-10-2026" */
export function formatDate(value: ISODate | Date | null | undefined): string {
  if (!value) return "—";
  const iso = asISO(value);
  return `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;
}

/** "2026-10-21" → "21 Oct 2026" */
export function formatDateLong(value: ISODate | Date | null | undefined): string {
  if (!value) return "—";
  const iso = asISO(value);
  return `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
}

/** "2026-10" → "Oct 2026" */
export function formatMonth(yearMonth: string): string {
  return `${MONTHS[Number(yearMonth.slice(5, 7)) - 1]} ${yearMonth.slice(0, 4)}`;
}

const istDateTimeFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: APP_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** A timestamp in India time: "21/10/2026, 10:30 am" */
export function formatDateTime(value: Date | null | undefined): string {
  if (!value) return "—";
  return istDateTimeFormatter.format(value).replace(/\//g, "-");
}

/** "today", "tomorrow", "in 3 days", "2 days late" — relative to today in India. */
export function describeDue(due: ISODate, today: ISODate = todayIST()): string {
  const days = diffDays(due, today);
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days > 1) return `${days} days left`;
  if (days === -1) return "1 day late";
  return `${-days} days late`;
}
