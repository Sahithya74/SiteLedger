import Decimal from "decimal.js";
import { groupIndian } from "@/lib/money";

/** Units that read naturally with an "s" when there is more than one. */
const COUNTABLE_UNITS = new Set(["bag", "box", "load", "trip", "unit", "roll", "sheet", "drum", "can", "meal", "piece"]);

/**
 * A quantity with its unit, in plain words: "40 bags", "1 bag", "1,200 cft",
 * "12.5 tonne". Indian digit grouping, no trailing zeros.
 */
export function formatQuantity(value: Decimal.Value, unit: string): string {
  const d = new Decimal(value).toDecimalPlaces(3);
  const [whole, fraction] = d.abs().toFixed().split(".");
  const number = `${d.isNegative() ? "-" : ""}${groupIndian(whole)}${fraction ? `.${fraction}` : ""}`;
  const plural = COUNTABLE_UNITS.has(unit) && !d.abs().eq(1) ? `${unit}s` : unit;
  return `${number} ${plural}`;
}
