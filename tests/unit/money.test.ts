import { describe, expect, it } from "vitest";
import {
  amountInWords,
  formatINR,
  formatINRShort,
  groupIndian,
  multiplyQtyRate,
  paiseToInput,
  parseRupees,
  percentOf,
  ratio,
  splitGst,
  sumPaise,
} from "@/lib/money";

describe("Indian number grouping", () => {
  it.each([
    ["0", "0"],
    ["999", "999"],
    ["1000", "1,000"],
    ["125000", "1,25,000"],
    ["12500000", "1,25,00,000"],
    ["1234567890", "1,23,45,67,890"],
  ])("%s → %s", (input, expected) => {
    expect(groupIndian(input)).toBe(expected);
  });
});

describe("formatINR", () => {
  it("formats with rupee symbol and paise", () => {
    expect(formatINR(12_500_000n)).toBe("₹1,25,000.00");
    expect(formatINR(12_500_050n)).toBe("₹1,25,000.50");
    expect(formatINR(5n)).toBe("₹0.05");
  });
  it("handles negatives and null", () => {
    expect(formatINR(-50_000_00n)).toBe("-₹50,000.00");
    expect(formatINR(null)).toBe("₹0.00");
  });
  it("can drop paise (rounding to nearest rupee)", () => {
    expect(formatINR(12_500_049n, { paise: false })).toBe("₹1,25,000");
    expect(formatINR(12_500_050n, { paise: false })).toBe("₹1,25,001");
  });
});

describe("formatINRShort", () => {
  it("uses crore and lakh", () => {
    expect(formatINRShort(2_80_00_000_00n)).toBe("₹2.8 Cr");
    expect(formatINRShort(90_00_000_00n)).toBe("₹90 L");
    expect(formatINRShort(4_50_000_00n)).toBe("₹4.5 L");
    expect(formatINRShort(1_25_50_000_00n)).toBe("₹1.26 Cr");
  });
  it("shows small amounts in full", () => {
    expect(formatINRShort(45_000_00n)).toBe("₹45,000");
    expect(formatINRShort(-45_000_00n)).toBe("-₹45,000");
  });
});

describe("parseRupees", () => {
  it.each([
    ["125000", 12_500_000n],
    ["1,25,000.50", 12_500_050n],
    ["₹ 1,25,000", 12_500_000n],
    ["Rs. 500", 50_000n],
    ["0.5", 50n],
    [".75", 75n],
    ["-200", -20_000n],
  ])("%s → %s paise", (input, expected) => {
    expect(parseRupees(input)).toBe(expected);
  });
  it.each(["", "abc", "12.345", "1.2.3", "-", null])("rejects %s", (input) => {
    expect(parseRupees(input as string | null)).toBeNull();
  });
  it("round-trips with paiseToInput", () => {
    for (const value of [0n, 5n, 12_500_050n, -20_000n, 99_99_99_999n]) {
      expect(parseRupees(paiseToInput(value))).toBe(value);
    }
  });
});

describe("arithmetic", () => {
  it("sums exactly (no floating point drift)", () => {
    // 0.1 + 0.2 style values that break floats
    expect(sumPaise([10n, 20n, null, undefined, 30n])).toBe(60n);
    const many = Array.from({ length: 1000 }, () => 1n);
    expect(sumPaise(many)).toBe(1000n);
  });
  it("multiplies quantity × rate with half-up rounding", () => {
    // 12.5 tonnes × ₹62,500.00
    expect(multiplyQtyRate("12.5", 6_250_000n)).toBe(78_125_000n);
    // 3.333 × ₹10.00 = ₹33.33
    expect(multiplyQtyRate("3.333", 1000n)).toBe(3333n);
    // 0.005 × ₹1.00 = 0.5 paise → rounds up to 1 paisa
    expect(multiplyQtyRate("0.005", 100n)).toBe(1n);
  });
  it("calculates percentages (GST/TDS) rounded to paise", () => {
    expect(percentOf(10_000_000n, 18)).toBe(1_800_000n);
    expect(percentOf(10_001n, "2.5")).toBe(250n); // 250.025 → 250
    expect(percentOf(10_002n, "2.5")).toBe(250n); // 250.05 → 250
    expect(percentOf(10_020n, "2.5")).toBe(251n); // 250.5 → 251
  });
  it("splits GST so halves add back to the total", () => {
    expect(splitGst(1_800_001n)).toEqual({ cgst: 900_000n, sgst: 900_001n });
    const { cgst, sgst } = splitGst(12_345n);
    expect(cgst + sgst).toBe(12_345n);
  });
  it("computes ratio clamped to 0..1", () => {
    expect(ratio(50n, 200n)).toBe(0.25);
    expect(ratio(300n, 200n)).toBe(1);
    expect(ratio(10n, 0n)).toBe(0);
  });
});

describe("amountInWords", () => {
  it.each([
    [0n, "Rupees Zero Only"],
    [100n, "Rupees One Only"],
    [12_500_000n, "Rupees One Lakh Twenty-Five Thousand Only"],
    [12_500_050n, "Rupees One Lakh Twenty-Five Thousand and Fifty Paise Only"],
    [2_70_00_000_00n, "Rupees Two Crore Seventy Lakh Only"],
    [1_11_11_111_00n, "Rupees One Crore Eleven Lakh Eleven Thousand One Hundred Eleven Only"],
    [1_25_00_00_000_00n, "Rupees One Hundred Twenty-Five Crore Only"],
    [99_999n, "Rupees Nine Hundred Ninety-Nine and Ninety-Nine Paise Only"],
  ])("%s paise → %s", (value, expected) => {
    expect(amountInWords(value)).toBe(expected);
  });
});
