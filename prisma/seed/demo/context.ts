import { addDays, todayIST, wageWeek, type ISODate } from "@/lib/dates";
import type { CurrentUser } from "@/server/auth/current-user";

/** Shared helpers for the demo data. All dates are relative to today (IST). */
export type SeedContext = {
  today: ISODate;
  day: (offset: number) => ISODate;
  owner: CurrentUser;
  rand: () => number;
  ids: Record<string, string>;
};

/** Small deterministic random generator so every reset gives the same demo. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createContext(owner: CurrentUser): SeedContext {
  const today = todayIST();
  return { today, day: (offset) => addDays(today, offset), owner, rand: mulberry32(20261021), ids: {} };
}

/** ₹ amount → paise. */
export const rupees = (amount: number): bigint => BigInt(Math.round(amount * 100));
/** Lakhs → paise (1 lakh = ₹1,00,000). */
export const lakhs = (amount: number): bigint => BigInt(Math.round(amount * 100_000 * 100));

export function currentWageWeekStart(today: ISODate): ISODate {
  return wageWeek(today).start;
}

export function log(message: string) {
  console.log(`  • ${message}`);
}
