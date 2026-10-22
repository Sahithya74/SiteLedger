import { describe, expect, it } from "vitest";
import { billTotals } from "@/lib/bill-totals";

describe("billTotals", () => {
  it("adds lines, applies discount then GST split into CGST + SGST", () => {
    const t = billTotals({
      lines: [
        { quantity: "1200", ratePaise: 450_00n }, // 1,200 sqft × ₹450 = ₹5,40,000
        { quantity: "2.5", ratePaise: 6_000_00n }, // 2.5 cum × ₹6,000 = ₹15,000
      ],
      discountPaise: 5_000_00n,
      taxMode: "CGST_SGST",
      taxPercent: "18",
    });
    expect(t.subtotalPaise).toBe(5_55_000_00n);
    expect(t.taxablePaise).toBe(5_50_000_00n);
    expect(t.taxPaise).toBe(99_000_00n);
    expect(t.cgstPaise + t.sgstPaise).toBe(t.taxPaise);
    expect(t.totalPaise).toBe(6_49_000_00n);
  });

  it("supports IGST and no GST", () => {
    expect(billTotals({ lines: [{ quantity: "1", ratePaise: 100_00n }], taxMode: "IGST", taxPercent: "18" }).igstPaise).toBe(18_00n);
    expect(billTotals({ lines: [{ quantity: "1", ratePaise: 100_00n }], taxMode: "NONE", taxPercent: "18" }).taxPaise).toBe(0n);
  });

  it("works out retention held by the client", () => {
    const t = billTotals({ lines: [{ quantity: "1", ratePaise: 18_00_000_00n }], taxMode: "NONE", taxPercent: "0", retentionPercent: "5" });
    expect(t.retentionPaise).toBe(90_000_00n);
    expect(t.netReceivablePaise).toBe(17_10_000_00n);
  });
});
