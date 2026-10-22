"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { NativeSelect } from "@/components/app/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatINR, multiplyQtyRate, paiseToInput, parseRupees, percentOf, sumPaise } from "@/lib/money";

type MaterialOption = { id: string; name: string; unit: string; ratePaise: string; category: string };

type Row = { key: number; materialId: string; quantity: string; rate: string; taxPercent: string; weightKg: string };

const safeQty = (v: string) => (/^\d+(\.\d{1,3})?$/.test(v.replace(/,/g, "")) ? v.replace(/,/g, "") : "0");

/**
 * Material lines for a purchase, with live totals. Field names follow the
 * "items.N.field" convention read by indexedRows() on the server.
 */
export function PurchaseItemsEditor({
  materials,
  initial,
  showTotals = true,
  extras,
}: {
  materials: MaterialOption[];
  initial?: { materialId: string; quantity: string }[];
  showTotals?: boolean;
  extras?: { transport?: string; other?: string; discount?: string };
}) {
  const [nextKey, setNextKey] = useState(100);
  const [rows, setRows] = useState<Row[]>(
    (initial?.length ? initial : [{ materialId: "", quantity: "" }]).map((r, i) => {
      const m = materials.find((x) => x.id === r.materialId);
      return { key: i, materialId: r.materialId, quantity: r.quantity, rate: m?.ratePaise ? paiseToInput(BigInt(m.ratePaise)) : "", taxPercent: "", weightKg: "" };
    }),
  );
  const [transport, setTransport] = useState(extras?.transport ?? "");
  const [other, setOther] = useState(extras?.other ?? "");
  const [discount, setDiscount] = useState(extras?.discount ?? "");

  function update(key: number, patch: Partial<Row>) {
    setRows((rs) =>
      rs.map((r) => {
        if (r.key !== key) return r;
        const next = { ...r, ...patch };
        if (patch.materialId && !r.rate) {
          const m = materials.find((x) => x.id === patch.materialId);
          if (m?.ratePaise) next.rate = paiseToInput(BigInt(m.ratePaise));
        }
        return next;
      }),
    );
  }

  const lines = rows.map((r) => {
    const amount = multiplyQtyRate(safeQty(r.quantity), parseRupees(r.rate) ?? 0n);
    const tax = percentOf(amount, /^\d{1,2}(\.\d{1,2})?$/.test(r.taxPercent) ? r.taxPercent : "0");
    return { ...r, amount, tax };
  });
  const subtotal = sumPaise(lines.map((l) => l.amount));
  const taxTotal = sumPaise(lines.map((l) => l.tax));
  const total = subtotal + taxTotal + (parseRupees(transport) ?? 0n) + (parseRupees(other) ?? 0n) - (parseRupees(discount) ?? 0n);

  return (
    <div className="flex flex-col gap-3">
      <div className="hidden grid-cols-[minmax(0,2.5fr)_1fr_1fr_0.7fr_1fr_auto] gap-2 px-1 text-xs font-medium text-muted-foreground md:grid">
        <span>Material</span>
        <span>Quantity</span>
        <span>Rate (₹ per unit)</span>
        <span>GST %</span>
        <span className="text-right">Amount</span>
        <span className="w-8" />
      </div>
      {lines.map((r, i) => {
        const unit = materials.find((m) => m.id === r.materialId)?.unit;
        return (
          <div key={r.key} className="grid grid-cols-2 gap-2 rounded-lg border p-2 md:grid-cols-[minmax(0,2.5fr)_1fr_1fr_0.7fr_1fr_auto] md:items-center md:border-0 md:p-0">
            <NativeSelect
              name={`items.${i}.materialId`}
              value={r.materialId}
              onChange={(e) => update(r.key, { materialId: e.target.value })}
              className="col-span-2 md:col-span-1"
              aria-label={`Line ${i + 1} material`}
              required
            >
              <option value="">Choose material…</option>
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.unit})
                </option>
              ))}
            </NativeSelect>
            <div className="relative">
              <Input name={`items.${i}.quantity`} value={r.quantity} onChange={(e) => update(r.key, { quantity: e.target.value })} inputMode="decimal" placeholder="Qty" aria-label={`Line ${i + 1} quantity`} className="h-10 pr-12" required />
              {unit && <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-muted-foreground">{unit}</span>}
            </div>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-sm text-muted-foreground">₹</span>
              <Input name={`items.${i}.ratePaise`} value={r.rate} onChange={(e) => update(r.key, { rate: e.target.value })} inputMode="decimal" placeholder="Rate" aria-label={`Line ${i + 1} rate`} className="h-10 pl-6" />
            </div>
            <Input name={`items.${i}.taxPercent`} value={r.taxPercent} onChange={(e) => update(r.key, { taxPercent: e.target.value })} inputMode="decimal" placeholder="0" aria-label={`Line ${i + 1} GST percent`} className="h-10" />
            <div className="tabular flex h-10 items-center justify-end text-sm font-medium">{formatINR(r.amount + r.tax)}</div>
            <Button type="button" variant="ghost" size="icon" aria-label={`Remove line ${i + 1}`} onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.key !== r.key) : rs))}>
              <Trash2 className="size-4" />
            </Button>
            <input type="hidden" name={`items.${i}.weightKg`} value={r.weightKg} />
          </div>
        );
      })}
      <Button
        type="button"
        variant="outline"
        className="w-fit"
        onClick={() => {
          setRows((rs) => [...rs, { key: nextKey, materialId: "", quantity: "", rate: "", taxPercent: "", weightKg: "" }]);
          setNextKey((k) => k + 1);
        }}
      >
        <Plus className="size-4" /> Add another material
      </Button>

      {showTotals && (
        <div className="ml-auto grid w-full max-w-sm grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 rounded-lg bg-muted/40 p-3 text-sm">
          <span className="text-muted-foreground">Materials</span>
          <span className="tabular text-right">{formatINR(subtotal)}</span>
          <span className="text-muted-foreground">GST</span>
          <span className="tabular text-right">{formatINR(taxTotal)}</span>
          <label htmlFor="transportPaise" className="text-muted-foreground">Transport / unloading</label>
          <Input id="transportPaise" name="transportPaise" value={transport} onChange={(e) => setTransport(e.target.value)} inputMode="decimal" className="tabular h-9 w-32 text-right" placeholder="0" />
          <label htmlFor="otherChargesPaise" className="text-muted-foreground">Other charges</label>
          <Input id="otherChargesPaise" name="otherChargesPaise" value={other} onChange={(e) => setOther(e.target.value)} inputMode="decimal" className="tabular h-9 w-32 text-right" placeholder="0" />
          <label htmlFor="discountPaise" className="text-muted-foreground">Discount</label>
          <Input id="discountPaise" name="discountPaise" value={discount} onChange={(e) => setDiscount(e.target.value)} inputMode="decimal" className="tabular h-9 w-32 text-right" placeholder="0" />
          <span className="border-t pt-2 font-semibold">Bill total</span>
          <span className="tabular border-t pt-2 text-right text-base font-semibold">{formatINR(total)}</span>
        </div>
      )}
    </div>
  );
}

/** Simple material + quantity lines for a material request. */
export function RequestItemsEditor({ materials }: { materials: MaterialOption[] }) {
  const [keys, setKeys] = useState([0]);
  return (
    <div className="flex flex-col gap-2">
      {keys.map((key, i) => (
        <div key={key} className="grid grid-cols-[minmax(0,2fr)_1fr_minmax(0,1.5fr)_auto] items-center gap-2">
          <NativeSelect name={`items.${i}.materialId`} defaultValue="" aria-label={`Line ${i + 1} material`} required>
            <option value="">Choose material…</option>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.unit})
              </option>
            ))}
          </NativeSelect>
          <Input name={`items.${i}.quantity`} inputMode="decimal" placeholder="Quantity" aria-label={`Line ${i + 1} quantity`} className="h-10" required />
          <Input name={`items.${i}.notes`} placeholder="Note (optional)" aria-label={`Line ${i + 1} note`} className="h-10" />
          <Button type="button" variant="ghost" size="icon" aria-label="Remove line" onClick={() => setKeys((ks) => (ks.length > 1 ? ks.filter((k) => k !== key) : ks))}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" className="w-fit" onClick={() => setKeys((ks) => [...ks, Math.max(...ks) + 1])}>
        <Plus className="size-4" /> Add another material
      </Button>
    </div>
  );
}
