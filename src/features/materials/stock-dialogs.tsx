"use client";

import { useState } from "react";
import { ArrowLeftRight, PackageMinus, SlidersHorizontal } from "lucide-react";
import { DialogForm, FormGrid, MoneyField, SelectField, TextField } from "@/components/app/form";
import { Button } from "@/components/ui/button";
import { todayIST } from "@/lib/dates";
import { stockMovementAction, stockTransferAction } from "./actions";

type Opt = { value: string; label: string };

/** "Record use" — material used at a site today. */
export function RecordUsageDialog({
  materials,
  locations,
  defaultLocation,
  workItems,
}: {
  materials: Opt[];
  locations: Opt[];
  defaultLocation?: string;
  workItems?: Opt[];
}) {
  return (
    <DialogForm
      trigger={
        <Button size="lg">
          <PackageMinus className="size-4" /> Record use
        </Button>
      }
      title="Record material used"
      description="Take material out of stock at a site."
      action={stockMovementAction}
      submitLabel="Save"
    >
      <input type="hidden" name="kind" value="USAGE" />
      <FormGrid>
        <SelectField label="Material" name="materialId" options={materials} placeholder="Choose material…" required fieldClassName="sm:col-span-2" />
        <SelectField label="Site" name="location" options={locations.filter((l) => l.value !== "store")} defaultValue={defaultLocation} placeholder="Choose site…" required />
        <TextField label="Quantity used" name="quantity" inputMode="decimal" required />
        <TextField label="Date" name="date" type="date" defaultValue={todayIST()} required />
        {workItems && workItems.length > 0 && <SelectField label="For which work (optional)" name="workItemId" options={workItems} placeholder="—" />}
        <TextField label="Note" name="notes" placeholder="Optional" fieldClassName="sm:col-span-2" />
      </FormGrid>
    </DialogForm>
  );
}

export function TransferDialog({ materials, locations, defaultFrom }: { materials: Opt[]; locations: Opt[]; defaultFrom?: string }) {
  return (
    <DialogForm
      trigger={
        <Button variant="outline" size="lg">
          <ArrowLeftRight className="size-4" /> Move material
        </Button>
      }
      title="Move material between places"
      description="For example from the godown to a site, or from one site to another."
      action={stockTransferAction}
      submitLabel="Move"
    >
      <FormGrid>
        <SelectField label="Material" name="materialId" options={materials} placeholder="Choose material…" required fieldClassName="sm:col-span-2" />
        <SelectField label="From" name="from" options={locations} defaultValue={defaultFrom ?? "store"} required />
        <SelectField label="To" name="to" options={locations} placeholder="Choose…" required />
        <TextField label="Quantity" name="quantity" inputMode="decimal" required />
        <TextField label="Date" name="date" type="date" defaultValue={todayIST()} required />
        <TextField label="Note" name="notes" placeholder="e.g. vehicle number" fieldClassName="sm:col-span-2" />
      </FormGrid>
    </DialogForm>
  );
}

const KINDS = [
  { value: "DAMAGE", label: "Damaged / wasted" },
  { value: "RETURN", label: "Returned to supplier" },
  { value: "ADJUSTMENT", label: "Correction after counting (+ or −)" },
  { value: "OPENING", label: "Opening stock (already on hand)" },
];

export function OtherStockChangeDialog({ materials, locations, defaultLocation }: { materials: Opt[]; locations: Opt[]; defaultLocation?: string }) {
  const [kind, setKind] = useState("DAMAGE");
  return (
    <DialogForm
      trigger={
        <Button variant="outline" size="lg">
          <SlidersHorizontal className="size-4" /> Other change
        </Button>
      }
      title="Other stock change"
      description="Damage, returns, corrections after a stock count, or stock you already had before using SITECORE."
      action={stockMovementAction}
      submitLabel="Save"
    >
      <FormGrid>
        <SelectField label="What happened" name="kind" value={kind} onChange={(e) => setKind(e.target.value)} options={KINDS} required fieldClassName="sm:col-span-2" />
        <SelectField label="Material" name="materialId" options={materials} placeholder="Choose material…" required fieldClassName="sm:col-span-2" />
        <SelectField label="Place" name="location" options={locations} defaultValue={defaultLocation ?? "store"} required />
        <TextField
          label="Quantity"
          name="quantity"
          inputMode="decimal"
          required
          hint={kind === "ADJUSTMENT" ? "Use a minus sign if there is less than recorded, e.g. -12" : undefined}
        />
        <TextField label="Date" name="date" type="date" defaultValue={todayIST()} required />
        {kind === "OPENING" && <MoneyField label="Rate per unit" name="unitCostPaise" hint="Used to value the stock." />}
        <TextField label="Reason / note" name="notes" required={kind !== "OPENING"} fieldClassName="sm:col-span-2" />
      </FormGrid>
    </DialogForm>
  );
}
