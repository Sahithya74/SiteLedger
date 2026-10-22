import Decimal from "decimal.js";

/**
 * Money helpers. All amounts are integer PAISE held in `bigint`
 * (₹1 = 100 paise) so there is never any floating-point rounding.
 */
export type Paise = bigint;

const PAISE_PER_RUPEE = 100n;

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

/** Sum any number of paise values. */
export function sumPaise(values: Iterable<Paise | null | undefined>): Paise {
  let total = 0n;
  for (const v of values) if (v != null) total += v;
  return total;
}

export function absPaise(value: Paise): Paise {
  return value < 0n ? -value : value;
}

export function maxPaise(a: Paise, b: Paise): Paise {
  return a > b ? a : b;
}

export function minPaise(a: Paise, b: Paise): Paise {
  return a < b ? a : b;
}

/** Converts a Decimal (in paise) to bigint, rounding half away from zero. */
function decimalToPaise(value: Decimal): Paise {
  return BigInt(value.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(0));
}

/**
 * quantity × rate, rounded to the nearest paisa (half up).
 * `quantity` may be fractional (e.g. 12.5 tonnes), the rate is per unit.
 */
export function multiplyQtyRate(quantity: Decimal.Value, ratePaise: Paise): Paise {
  return decimalToPaise(new Decimal(quantity).times(ratePaise.toString()));
}

/** `percent`% of an amount, rounded to the nearest paisa (GST, TDS, retention). */
export function percentOf(amount: Paise, percent: Decimal.Value): Paise {
  return decimalToPaise(new Decimal(amount.toString()).times(percent).dividedBy(100));
}

/**
 * Splits a GST amount into CGST + SGST. If the amount has an odd paisa,
 * SGST carries it so the two halves always add back to the total.
 */
export function splitGst(taxPaise: Paise): { cgst: Paise; sgst: Paise } {
  const cgst = taxPaise / 2n;
  return { cgst, sgst: taxPaise - cgst };
}

/** part / whole as a number between 0 and 1 (for progress bars only). */
export function ratio(part: Paise, whole: Paise): number {
  if (whole <= 0n) return 0;
  const r = Number((part * 10000n) / whole) / 10000;
  return Math.max(0, Math.min(1, r));
}

// ─────────────────────────────────────────────────────────────────────────────
// Parsing user input
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parses rupees typed by a person: "125000", "1,25,000.50", "₹ 1,25,000",
 * "-500". Returns paise, or null when the text is not a valid amount
 * (letters, more than 2 decimals, empty).
 */
export function parseRupees(input: string | null | undefined): Paise | null {
  if (input == null) return null;
  const cleaned = input.replace(/[₹,\s]/g, "").replace(/^rs\.?/i, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
  const match = /^(-)?(\d+)?(?:\.(\d{0,2}))?$/.exec(cleaned);
  if (!match) return null;
  const [, sign, whole = "0", fraction = ""] = match;
  const paise = BigInt(whole) * PAISE_PER_RUPEE + BigInt(fraction.padEnd(2, "0") || "0");
  return sign ? -paise : paise;
}

/** Paise → plain rupee string for form inputs: 12500050n → "125000.50". */
export function paiseToInput(value: Paise | null | undefined): string {
  if (value == null) return "";
  const negative = value < 0n;
  const abs = absPaise(value);
  const rupees = abs / PAISE_PER_RUPEE;
  const paise = abs % PAISE_PER_RUPEE;
  const text = paise === 0n ? rupees.toString() : `${rupees}.${paise.toString().padStart(2, "0")}`;
  return negative ? `-${text}` : text;
}

// ─────────────────────────────────────────────────────────────────────────────
// Indian formatting
// ─────────────────────────────────────────────────────────────────────────────

/** Groups digits the Indian way: 12500000 → "1,25,00,000". */
export function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  let rest = digits.slice(0, -3);
  const groups: string[] = [];
  while (rest.length > 2) {
    groups.unshift(rest.slice(-2));
    rest = rest.slice(0, -2);
  }
  if (rest) groups.unshift(rest);
  return `${groups.join(",")},${last3}`;
}

export type FormatINROptions = {
  /** Show paise (".00"). Defaults to true. */
  paise?: boolean;
  /** Prefix with ₹. Defaults to true. */
  symbol?: boolean;
};

/** 12500000n → "₹1,25,000.00" */
export function formatINR(value: Paise | null | undefined, options: FormatINROptions = {}): string {
  const { paise = true, symbol = true } = options;
  const v = value ?? 0n;
  const negative = v < 0n;
  const abs = absPaise(v);
  let rupees = abs / PAISE_PER_RUPEE;
  const fraction = abs % PAISE_PER_RUPEE;
  if (!paise && fraction >= 50n) rupees += 1n; // round to nearest rupee
  const body = groupIndian(rupees.toString());
  const decimals = paise ? `.${fraction.toString().padStart(2, "0")}` : "";
  return `${negative ? "-" : ""}${symbol ? "₹" : ""}${body}${decimals}`;
}

function trimDecimal(value: Decimal, places: number): string {
  return value.toDecimalPlaces(places, Decimal.ROUND_HALF_UP).toString();
}

/**
 * Short form used on dashboards: ₹2.8 Cr, ₹90 L, ₹45,000.
 * Values under one lakh are shown in full (without paise).
 */
export function formatINRShort(value: Paise | null | undefined): string {
  const v = value ?? 0n;
  const negative = v < 0n;
  const rupees = new Decimal(absPaise(v).toString()).dividedBy(100);
  let text: string;
  if (rupees.gte(1e7)) text = `₹${trimDecimal(rupees.dividedBy(1e7), 2)} Cr`;
  else if (rupees.gte(1e5)) text = `₹${trimDecimal(rupees.dividedBy(1e5), 2)} L`;
  else text = formatINR(absPaise(v), { paise: false });
  return negative ? `-${text}` : text;
}

// ─────────────────────────────────────────────────────────────────────────────
// Amount in words (Indian system) for quotations, bills and receipts
// ─────────────────────────────────────────────────────────────────────────────

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return o ? `${TENS[t]}-${ONES[o]}` : TENS[t];
}

function wholeInWords(n: bigint): string {
  if (n === 0n) return "Zero";
  const parts: string[] = [];
  const crore = n / 10_000_000n;
  let rest = n % 10_000_000n;
  if (crore > 0n) parts.push(`${wholeInWords(crore)} Crore`);
  const lakh = Number(rest / 100_000n);
  rest %= 100_000n;
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  const thousand = Number(rest / 1000n);
  rest %= 1000n;
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  const hundred = Number(rest / 100n);
  rest %= 100n;
  if (hundred) parts.push(`${ONES[hundred]} Hundred`);
  if (rest > 0n) parts.push(twoDigits(Number(rest)));
  return parts.join(" ");
}

/** 12500050n → "Rupees One Lakh Twenty-Five Thousand and Fifty Paise Only" */
export function amountInWords(value: Paise): string {
  const negative = value < 0n;
  const abs = absPaise(value);
  const rupees = abs / PAISE_PER_RUPEE;
  const paise = Number(abs % PAISE_PER_RUPEE);
  let text = `Rupees ${wholeInWords(rupees)}`;
  if (paise) text += ` and ${twoDigits(paise)} Paise`;
  text += " Only";
  return negative ? `Minus ${text}` : text;
}
