/**
 * Totals for quotations and client bills (pure, unit tested).
 *   subtotal  = Σ quantity × rate
 *   taxable   = subtotal − discount
 *   GST       = taxable × rate%  (split CGST + SGST for intra-state, or IGST)
 *   total     = taxable + GST
 *   retention = total × retention%  (held back by the client until handover)
 */
import { multiplyQtyRate, percentOf, splitGst, sumPaise, type Paise } from "@/lib/money";

export type LineInput = { quantity: string; ratePaise: Paise };

export function billTotals(input: {
  lines: LineInput[];
  discountPaise?: Paise;
  taxMode: "NONE" | "CGST_SGST" | "IGST";
  taxPercent: string;
  retentionPercent?: string;
}) {
  const lineAmounts = input.lines.map((l) => multiplyQtyRate(l.quantity || "0", l.ratePaise));
  const subtotalPaise = sumPaise(lineAmounts);
  const discountPaise = input.discountPaise ?? 0n;
  const taxablePaise = subtotalPaise - discountPaise;
  const taxPaise = input.taxMode === "NONE" ? 0n : percentOf(taxablePaise, input.taxPercent || "0");
  const split = input.taxMode === "CGST_SGST" ? splitGst(taxPaise) : null;
  const totalPaise = taxablePaise + taxPaise;
  const retentionPaise = input.retentionPercent ? percentOf(totalPaise, input.retentionPercent) : 0n;
  return {
    lineAmounts,
    subtotalPaise,
    discountPaise,
    taxablePaise,
    taxPaise,
    cgstPaise: split?.cgst ?? 0n,
    sgstPaise: split?.sgst ?? 0n,
    igstPaise: input.taxMode === "IGST" ? taxPaise : 0n,
    totalPaise,
    retentionPaise,
    netReceivablePaise: totalPaise - retentionPaise,
  };
}
