"use client";

import { useMemo, useState } from "react";
import { FormGrid, SelectField, SubmitButton, TextField, useActionForm, FormError } from "@/components/app/form";
import { Input } from "@/components/ui/input";
import type { AccountOption } from "@/features/money/payment-fields";
import { todayIST } from "@/lib/dates";
import { PAYMENT_METHOD } from "@/lib/labels";
import { formatINR, paiseToInput, parseRupees } from "@/lib/money";
import { payWageSheetAction } from "./actions";

type Line = {
  id: string;
  name: string;
  category: string;
  days: string;
  overtime: string;
  gross: string; // paise
  pending: string; // paise
  advance: string; // paise
};

export function WagePayForm({
  from,
  to,
  projectId,
  lines,
  accounts,
}: {
  from: string;
  to: string;
  projectId?: string;
  lines: Line[];
  accounts: AccountOption[];
}) {
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(lines.map((l) => [l.id, BigInt(l.pending) > 0n ? paiseToInput(BigInt(l.pending)) : ""])),
  );
  const { onSubmit, pending, formError, fieldErrors } = useActionForm(payWageSheetAction);
  const total = useMemo(() => Object.values(amounts).reduce((s, v) => s + (parseRupees(v) ?? 0n), 0n), [amounts]);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <input type="hidden" name="from" value={from} />
      <input type="hidden" name="to" value={to} />
      {projectId && <input type="hidden" name="projectId" value={projectId} />}
      <FormError message={Object.keys(fieldErrors).length ? "Please check the payment details." : formError} />
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Worker</th>
              <th className="px-3 py-2 text-right">Days</th>
              <th className="hidden px-3 py-2 text-right sm:table-cell">OT</th>
              <th className="px-3 py-2 text-right">Earned this period</th>
              <th className="hidden px-3 py-2 text-right md:table-cell">Total pending</th>
              <th className="px-3 py-2 text-right">Pay now (₹)</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {lines.map((l, i) => (
              <tr key={l.id}>
                <td className="px-3 py-2">
                  <input type="hidden" name={`lines.${i}.labourId`} value={l.id} />
                  <div className="font-medium">{l.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {l.category}
                    {BigInt(l.advance) > 0n && <span className="text-amber-700"> · advance {formatINR(BigInt(l.advance), { paise: false })} still to recover</span>}
                  </div>
                </td>
                <td className="tabular px-3 py-2 text-right">{l.days}</td>
                <td className="tabular hidden px-3 py-2 text-right sm:table-cell">{Number(l.overtime) ? `${l.overtime} h` : "—"}</td>
                <td className="tabular px-3 py-2 text-right">{formatINR(BigInt(l.gross), { paise: false })}</td>
                <td className="tabular hidden px-3 py-2 text-right md:table-cell">{formatINR(BigInt(l.pending), { paise: false })}</td>
                <td className="px-3 py-2 text-right">
                  <Input
                    name={`lines.${i}.amount`}
                    value={amounts[l.id] ?? ""}
                    onChange={(e) => setAmounts((a) => ({ ...a, [l.id]: e.target.value }))}
                    inputMode="decimal"
                    className="tabular ml-auto h-9 w-28 text-right"
                    aria-label={`Amount for ${l.name}`}
                    placeholder="0"
                  />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t bg-muted/30 font-semibold">
            <tr>
              <td className="px-3 py-2" colSpan={3}>
                Total to pay now
              </td>
              <td className="hidden md:table-cell" />
              <td className="hidden sm:table-cell" />
              <td className="tabular px-3 py-2 text-right">{formatINR(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        “Total pending” already subtracts wages paid earlier and any advance given. Change any amount before paying — the rest stays pending.
      </p>
      <FormGrid className="sm:grid-cols-4">
        <TextField label="Payment date" name="date" type="date" defaultValue={todayIST()} required />
        <SelectField label="Paid by" name="method" defaultValue="UPI" options={Object.entries(PAYMENT_METHOD).map(([value, label]) => ({ value, label }))} required />
        <SelectField label="From account" name="accountId" defaultValue={accounts[0]?.id} options={accounts.map((a) => ({ value: a.id, label: a.balance ? `${a.name} (${a.balance})` : a.name }))} required />
        <TextField label="Reference" name="reference" placeholder="Optional" />
      </FormGrid>
      <SubmitButton pending={pending} className="w-fit" disabled={total <= 0n}>
        Pay {formatINR(total, { paise: false })} to {Object.values(amounts).filter((v) => (parseRupees(v) ?? 0n) > 0n).length} workers
      </SubmitButton>
    </form>
  );
}
