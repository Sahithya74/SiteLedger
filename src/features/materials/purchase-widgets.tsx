"use client";

import { useState } from "react";
import { IndianRupee } from "lucide-react";
import { DialogForm, FormGrid, FormSection, MoneyField, SelectField, TextAreaField, TextField } from "@/components/app/form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { PaymentFields, type AccountOption } from "@/features/money/payment-fields";
import { addDays, todayIST } from "@/lib/dates";
import { PAYMENT_METHOD } from "@/lib/labels";
import { paySupplierAction } from "./actions";
import { PurchaseItemsEditor } from "./items-editor";

type Opt = { value: string; label: string };

export function PaySupplierDialog({
  supplierId,
  supplierName,
  accounts,
  purchases,
  fixedPurchaseId,
  defaultAmount,
  label = "Pay supplier",
}: {
  supplierId: string;
  supplierName: string;
  accounts: AccountOption[];
  purchases?: Opt[];
  fixedPurchaseId?: string;
  defaultAmount?: string;
  label?: string;
}) {
  return (
    <DialogForm
      trigger={
        <Button size="lg">
          <IndianRupee className="size-4" /> {label}
        </Button>
      }
      title={`Pay ${supplierName}`}
      description="Records money paid to the supplier and takes it out of the chosen account."
      action={paySupplierAction}
      submitLabel="Save payment"
      wide
    >
      <input type="hidden" name="supplierId" value={supplierId} />
      {fixedPurchaseId ? (
        <input type="hidden" name="purchaseId" value={fixedPurchaseId} />
      ) : (
        purchases &&
        purchases.length > 0 && (
          <SelectField label="Against which bill (optional)" name="purchaseId" options={purchases} placeholder="General payment (no specific bill)" />
        )
      )}
      <PaymentFields accounts={accounts} defaultAmount={defaultAmount} />
    </DialogForm>
  );
}

/** The fields of the "new purchase" form (used inside an ActionForm). */
export function PurchaseFormFields({
  suppliers,
  locations,
  materials,
  accounts,
  defaults,
}: {
  suppliers: { id: string; name: string; city: string | null; creditDays: number | null }[];
  locations: Opt[];
  materials: { id: string; name: string; unit: string; ratePaise: string; category: string }[];
  accounts: AccountOption[];
  defaults: { location?: string; materialRequestId?: string; items?: { materialId: string; quantity: string }[] };
}) {
  const today = todayIST();
  const [supplierId, setSupplierId] = useState("");
  const [received, setReceived] = useState(true);
  const [paidNow, setPaidNow] = useState(false);
  const credit = suppliers.find((s) => s.id === supplierId)?.creditDays;
  return (
    <>
      {defaults.materialRequestId && <input type="hidden" name="materialRequestId" value={defaults.materialRequestId} />}
      <FormSection title="Bill details">
        <FormGrid>
          <SelectField
            label="Supplier"
            name="supplierId"
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            options={suppliers.map((s) => ({ value: s.id, label: s.city ? `${s.name} (${s.city})` : s.name }))}
            placeholder="Choose supplier…"
            required
          />
          <SelectField label="For which site" name="location" options={locations} defaultValue={defaults.location ?? locations[1]?.value ?? "store"} required />
          <TextField label="Purchase date" name="purchaseDate" type="date" defaultValue={today} required />
          <TextField label="Supplier bill number" name="invoiceNumber" placeholder="Optional" />
          <TextField label="Bill date" name="invoiceDate" type="date" placeholder="Optional" />
          <TextField
            key={credit ?? "none"}
            label="Payment due by"
            name="dueDate"
            type="date"
            defaultValue={credit ? addDays(today, credit) : ""}
            hint={credit ? `${credit} days credit from this supplier` : "Optional — you get a reminder when it is due."}
          />
        </FormGrid>
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Checkbox id="receivedNow" checked={received} onCheckedChange={(c) => setReceived(c === true)} />
            <Label htmlFor="receivedNow" className="font-normal">The material has already arrived (add it to stock now)</Label>
            {received && <input type="hidden" name="receivedNow" value="on" />}
          </div>
          {!received && <TextField label="Expected delivery date" name="expectedDelivery" type="date" defaultValue={addDays(today, 1)} fieldClassName="max-w-xs" />}
        </div>
      </FormSection>

      <FormSection title="Materials">
        <PurchaseItemsEditor materials={materials} initial={defaults.items} />
      </FormSection>

      <FormSection title="Payment">
        <div className="flex items-center gap-2">
          <Checkbox id="paidNow" checked={paidNow} onCheckedChange={(c) => setPaidNow(c === true)} />
          <Label htmlFor="paidNow" className="font-normal">I paid (part of) this bill already</Label>
        </div>
        {paidNow && (
          <FormGrid className="mt-4">
            <MoneyField label="Amount paid" name="paidNowPaise" required />
            <SelectField label="Paid by" name="paidMethod" defaultValue="UPI" options={Object.entries(PAYMENT_METHOD).map(([value, label]) => ({ value, label }))} />
            <SelectField label="From account" name="paidAccountId" options={accounts.map((a) => ({ value: a.id, label: a.name }))} defaultValue={accounts[0]?.id} required />
            <TextField label="Reference" name="paidReference" placeholder="UTR / UPI / cheque no." />
          </FormGrid>
        )}
      </FormSection>

      <TextAreaField label="Notes" name="notes" rows={2} />
    </>
  );
}
