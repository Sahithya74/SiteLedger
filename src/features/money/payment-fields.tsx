"use client";

import { FormGrid, MoneyField, SelectField, TextField } from "@/components/app/form";
import { PAYMENT_METHOD } from "@/lib/labels";
import { todayIST } from "@/lib/dates";

export type AccountOption = { id: string; name: string; kind: string; balance?: string };

/** Date, amount, method, account, reference — the fields every payment form shares. */
export function PaymentFields({
  accounts,
  defaultAmount,
  amountLabel = "Amount",
  defaultMethod = "BANK_TRANSFER",
  hideNotes,
}: {
  accounts: AccountOption[];
  defaultAmount?: string;
  amountLabel?: string;
  defaultMethod?: string;
  hideNotes?: boolean;
}) {
  return (
    <FormGrid>
      <TextField label="Date" name="date" type="date" defaultValue={todayIST()} required />
      <MoneyField label={amountLabel} name="amountPaise" defaultValue={defaultAmount} required />
      <SelectField
        label="Paid by"
        name="method"
        defaultValue={defaultMethod}
        options={Object.entries(PAYMENT_METHOD).map(([value, label]) => ({ value, label }))}
        required
      />
      <SelectField
        label="From / into account"
        name="accountId"
        defaultValue={accounts[0]?.id ?? ""}
        placeholder={accounts.length ? undefined : "No accounts yet — add one in Accounts"}
        options={accounts.map((a) => ({ value: a.id, label: a.balance ? `${a.name} (balance ${a.balance})` : a.name }))}
        required
      />
      <TextField label="Reference (UTR / UPI / cheque no.)" name="reference" placeholder="Optional" />
      {!hideNotes && <TextField label="Note" name="notes" placeholder="Optional" />}
    </FormGrid>
  );
}
