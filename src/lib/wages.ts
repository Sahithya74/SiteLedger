/**
 * Daily wage calculation (pure, unit tested).
 *
 *   Present  → full daily wage
 *   Half day → half the daily wage (rounded to the paisa)
 *   Absent   → nothing
 *   + overtime hours × overtime rate (per hour)
 *   + manual adjustment (can be negative), which is recorded with a reason
 */
import Decimal from "decimal.js";
import { multiplyQtyRate, type Paise } from "@/lib/money";

export type AttendanceStatusValue = "PRESENT" | "HALF_DAY" | "ABSENT";

export function dayFraction(status: AttendanceStatusValue): Decimal {
  if (status === "PRESENT") return new Decimal(1);
  if (status === "HALF_DAY") return new Decimal(0.5);
  return new Decimal(0);
}

export function calculateDailyWage(input: {
  status: AttendanceStatusValue;
  dailyWagePaise: Paise;
  overtimeHours: Decimal.Value;
  overtimeRatePaise: Paise;
}): Paise {
  const base = multiplyQtyRate(dayFraction(input.status), input.dailyWagePaise);
  const overtime = input.status === "ABSENT" ? 0n : multiplyQtyRate(input.overtimeHours, input.overtimeRatePaise);
  return base + overtime;
}

/**
 * A worker's running balance.
 *   earned  = Σ daily wages (+ adjustments)
 *   balance = earned − wages paid − advances given
 * Positive balance → wages still to pay. Negative → the worker holds an
 * advance that has not yet been recovered.
 */
export function workerBalance(input: { earnedPaise: Paise; wagesPaidPaise: Paise; advancesPaise: Paise }): {
  balancePaise: Paise;
  pendingWagesPaise: Paise;
  advanceOutstandingPaise: Paise;
} {
  const balance = input.earnedPaise - input.wagesPaidPaise - input.advancesPaise;
  return {
    balancePaise: balance,
    pendingWagesPaise: balance > 0n ? balance : 0n,
    advanceOutstandingPaise: balance < 0n ? -balance : 0n,
  };
}
