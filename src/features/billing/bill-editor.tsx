"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { MoneyField, NativeSelect, SelectField, TextField } from "@/components/app/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { billTotals } from "@/lib/bill-totals";
import { amountInWords, formatINR, paiseToInput, parseRupees } from "@/lib/money";

export type EditorLine = { section: string; description: string; quantity: string; unit: string; rate: string; hsnSac: string };

const EMPTY: EditorLine = { section: "", description: "", quantity: "1", unit: "lot", rate: "", hsnSac: "" };

const UNITS = ["lot", "sqft", "sqm", "rft", "cft", "cum", "nos", "kg", "tonne", "bag", "day", "month", "job"];

/**
 * Line items for a quotation or client bill, with live totals, GST and
 * amount in words. Field names follow "items.N.field".
 */
export function BillEditor({
  initial,
  initialTax = { mode: "NONE", percent: "18" },
  initialDiscount,
  showSections,
  showDiscount,
  showRetention,
  initialRetention = "0",
}: {
  initial?: EditorLine[];
  initialTax?: { mode: string; percent: string };
  initialDiscount?: string;
  showSections?: boolean;
  showDiscount?: boolean;
  showRetention?: boolean;
  initialRetention?: string;
}) {
  const [lines, setLines] = useState<(EditorLine & { key: number })[]>((initial?.length ? initial : [EMPTY]).map((l, i) => ({ ...l, key: i })));
  const [nextKey, setNextKey] = useState(1000);
  const [taxMode, setTaxMode] = useState(initialTax.mode);
  const [taxPercent, setTaxPercent] = useState(initialTax.percent);
  const [discount, setDiscount] = useState(initialDiscount ?? "");
  const [retention, setRetention] = useState(initialRetention);

  const totals = billTotals({
    lines: lines.map((l) => ({ quantity: /^\d+(\.\d{1,3})?$/.test(l.quantity.replace(/,/g, "")) ? l.quantity.replace(/,/g, "") : "0", ratePaise: parseRupees(l.rate) ?? 0n })),
    discountPaise: showDiscount ? (parseRupees(discount) ?? 0n) : 0n,
    taxMode: taxMode as "NONE" | "CGST_SGST" | "IGST",
    taxPercent: /^\d{1,2}(\.\d{1,2})?$/.test(taxPercent) ? taxPercent : "0",
    retentionPercent: showRetention && /^\d{1,2}(\.\d{1,2})?$/.test(retention) ? retention : undefined,
  });

  const set = (key: number, patch: Partial<EditorLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  return (
    <div className="flex flex-col gap-3">
      <datalist id="bill-units">
        {UNITS.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>
      {lines.map((l, i) => (
        <div key={l.key} className="grid grid-cols-6 gap-2 rounded-lg border p-2 md:grid-cols-[minmax(0,3fr)_0.8fr_0.8fr_1fr_1fr_auto] md:items-start">
          <div className="col-span-6 flex flex-col gap-1 md:col-span-1">
            {showSections && (
              <Input name={`items.${i}.section`} value={l.section} onChange={(e) => set(l.key, { section: e.target.value })} placeholder="Heading (optional), e.g. Foundation" className="h-8 text-xs" aria-label={`Line ${i + 1} heading`} />
            )}
            <Input name={`items.${i}.description`} value={l.description} onChange={(e) => set(l.key, { description: e.target.value })} placeholder="Description of work" className="h-10" aria-label={`Line ${i + 1} description`} required />
          </div>
          <Input name={`items.${i}.quantity`} value={l.quantity} onChange={(e) => set(l.key, { quantity: e.target.value })} inputMode="decimal" placeholder="Qty" className="col-span-2 h-10 md:col-span-1" aria-label={`Line ${i + 1} quantity`} required />
          <Input name={`items.${i}.unit`} value={l.unit} onChange={(e) => set(l.key, { unit: e.target.value })} list="bill-units" placeholder="Unit" className="col-span-2 h-10 md:col-span-1" aria-label={`Line ${i + 1} unit`} required />
          <div className="relative col-span-2 md:col-span-1">
            <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-sm text-muted-foreground">₹</span>
            <Input name={`items.${i}.ratePaise`} value={l.rate} onChange={(e) => set(l.key, { rate: e.target.value })} inputMode="decimal" placeholder="Rate" className="h-10 pl-6" aria-label={`Line ${i + 1} rate`} />
          </div>
          <div className="tabular col-span-3 flex h-10 items-center justify-end text-sm font-medium md:col-span-1">{formatINR(totals.lineAmounts[i] ?? 0n)}</div>
          <div className="col-span-3 flex justify-end md:col-span-1">
            <input type="hidden" name={`items.${i}.hsnSac`} value={l.hsnSac} />
            <Button type="button" variant="ghost" size="icon" aria-label={`Remove line ${i + 1}`} onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : ls))}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        className="w-fit"
        onClick={() => {
          setLines((ls) => [...ls, { ...EMPTY, section: ls.at(-1)?.section ?? "", key: nextKey }]);
          setNextKey((k) => k + 1);
        }}
      >
        <Plus className="size-4" /> Add line
      </Button>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid grid-cols-2 content-start gap-3">
          <SelectField
            label="GST"
            name="taxMode"
            value={taxMode}
            onChange={(e) => setTaxMode(e.target.value)}
            options={[
              { value: "NONE", label: "No GST" },
              { value: "CGST_SGST", label: "CGST + SGST (same state)" },
              { value: "IGST", label: "IGST (other state)" },
            ]}
          />
          <TextField label="GST %" name="taxPercent" value={taxPercent} onChange={(e) => setTaxPercent(e.target.value)} inputMode="decimal" disabled={taxMode === "NONE"} />
          {showDiscount && <MoneyField label="Discount" name="discountPaise" value={discount} onChange={(e) => setDiscount(e.target.value)} />}
          {showRetention && <TextField label="Retention held by client %" name="retentionPercent" value={retention} onChange={(e) => setRetention(e.target.value)} inputMode="decimal" />}
          {taxMode === "NONE" && <input type="hidden" name="taxPercent" value="0" />}
        </div>
        <dl className="grid grid-cols-[1fr_auto] content-start gap-x-4 gap-y-1.5 rounded-lg bg-muted/40 p-3 text-sm">
          <dt className="text-muted-foreground">Subtotal</dt>
          <dd className="tabular text-right">{formatINR(totals.subtotalPaise)}</dd>
          {showDiscount && totals.discountPaise > 0n && (
            <>
              <dt className="text-muted-foreground">Discount</dt>
              <dd className="tabular text-right">−{formatINR(totals.discountPaise)}</dd>
            </>
          )}
          {taxMode === "CGST_SGST" && (
            <>
              <dt className="text-muted-foreground">CGST {Number(taxPercent) / 2}%</dt>
              <dd className="tabular text-right">{formatINR(totals.cgstPaise)}</dd>
              <dt className="text-muted-foreground">SGST {Number(taxPercent) / 2}%</dt>
              <dd className="tabular text-right">{formatINR(totals.sgstPaise)}</dd>
            </>
          )}
          {taxMode === "IGST" && (
            <>
              <dt className="text-muted-foreground">IGST {taxPercent}%</dt>
              <dd className="tabular text-right">{formatINR(totals.igstPaise)}</dd>
            </>
          )}
          <dt className="border-t pt-1.5 font-semibold">Total</dt>
          <dd className="tabular border-t pt-1.5 text-right text-base font-semibold">{formatINR(totals.totalPaise)}</dd>
          {showRetention && totals.retentionPaise > 0n && (
            <>
              <dt className="text-muted-foreground">Retention held</dt>
              <dd className="tabular text-right">−{formatINR(totals.retentionPaise)}</dd>
              <dt className="font-medium">Payable now</dt>
              <dd className="tabular text-right font-medium">{formatINR(totals.netReceivablePaise)}</dd>
            </>
          )}
          <dd className="col-span-2 pt-1 text-xs text-muted-foreground italic">{amountInWords(totals.totalPaise)}</dd>
        </dl>
      </div>
    </div>
  );
}

export function toEditorLines(items: { section?: string | null; description: string; quantity: { toString(): string }; unit: string; ratePaise: bigint; hsnSac: string | null }[]): EditorLine[] {
  return items.map((i) => ({
    section: i.section ?? "",
    description: i.description,
    quantity: i.quantity.toString(),
    unit: i.unit,
    rate: paiseToInput(i.ratePaise),
    hsnSac: i.hsnSac ?? "",
  }));
}

export { NativeSelect };
