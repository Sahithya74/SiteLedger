"use client";

import { useState } from "react";
import { Clock, MapPin, Wrench } from "lucide-react";
import { ActionForm, DialogForm, FormGrid, FormSection, MoneyField, SelectField, TextAreaField, TextField, type FormAction } from "@/components/app/form";
import { Button } from "@/components/ui/button";
import { todayIST } from "@/lib/dates";
import { EQUIPMENT_STATUS, EQUIPMENT_TYPE } from "@/lib/labels";
import { recordMaintenanceAction, recordUsageAction, setEquipmentStatusAction } from "./actions";

type Opt = { value: string; label: string };

export type EquipmentFormValues = {
  name: string;
  type: string;
  ownership: string;
  supplierId: string;
  rentalRate: string;
  rentalUnit: string;
  registrationNo: string;
  purchaseDate: string;
  purchaseCost: string;
  operatorName: string;
  notes: string;
};

export function EquipmentForm({ action, values, suppliers, cancelHref, submitLabel }: { action: FormAction; values: EquipmentFormValues; suppliers: Opt[]; cancelHref: string; submitLabel: string }) {
  const [ownership, setOwnership] = useState(values.ownership);
  return (
    <ActionForm action={action} submitLabel={submitLabel} cancelHref={cancelHref}>
      <FormSection title="Equipment">
        <FormGrid>
          <TextField label="Name" name="name" defaultValue={values.name} required placeholder="e.g. Concrete mixer 10/7" />
          <SelectField label="Type" name="type" defaultValue={values.type} options={Object.entries(EQUIPMENT_TYPE).map(([value, label]) => ({ value, label }))} required />
          <SelectField label="Own or rented" name="ownership" value={ownership} onChange={(e) => setOwnership(e.target.value)} options={[{ value: "OWNED", label: "Our own" }, { value: "RENTED", label: "Rented" }]} required />
          <TextField label="Registration / serial no." name="registrationNo" defaultValue={values.registrationNo} />
          <TextField label="Usual operator" name="operatorName" defaultValue={values.operatorName} />
        </FormGrid>
      </FormSection>
      {ownership === "RENTED" ? (
        <FormSection title="Rent" description="Rent itself is paid and recorded as an expense against this equipment.">
          <FormGrid>
            <SelectField label="Rented from" name="supplierId" defaultValue={values.supplierId} options={suppliers} placeholder="Choose supplier…" />
            <MoneyField label="Rent" name="rentalRatePaise" defaultValue={values.rentalRate} required />
            <SelectField label="Per" name="rentalUnit" defaultValue={values.rentalUnit || "DAY"} options={[{ value: "HOUR", label: "Hour" }, { value: "DAY", label: "Day" }, { value: "MONTH", label: "Month" }]} />
          </FormGrid>
        </FormSection>
      ) : (
        <FormSection title="Purchase">
          <FormGrid>
            <TextField label="Bought on" name="purchaseDate" type="date" defaultValue={values.purchaseDate} />
            <MoneyField label="Cost" name="purchaseCostPaise" defaultValue={values.purchaseCost} />
          </FormGrid>
        </FormSection>
      )}
      <TextAreaField label="Notes" name="notes" rows={2} defaultValue={values.notes} />
    </ActionForm>
  );
}

export function EquipmentStatusDialog({ id, status, projectId, projects }: { id: string; status: string; projectId: string | null; projects: Opt[] }) {
  const [next, setNext] = useState(status);
  return (
    <DialogForm
      trigger={
        <Button variant="outline" size="lg">
          <MapPin className="size-4" /> Move / status
        </Button>
      }
      title="Where is it and what state is it in?"
      action={setEquipmentStatusAction}
      submitLabel="Save"
    >
      <input type="hidden" name="id" value={id} />
      <SelectField label="Status" name="status" value={next} onChange={(e) => setNext(e.target.value)} options={Object.entries(EQUIPMENT_STATUS).map(([value, s]) => ({ value, label: s.label }))} />
      {next !== "RETURNED" && <SelectField label="At site" name="projectId" options={projects} defaultValue={projectId ?? ""} placeholder="Store / yard" required={next === "IN_USE"} />}
      <TextField label="Note (optional)" name="note" />
    </DialogForm>
  );
}

export function UsageDialog({ equipmentId, projects, defaultProjectId, operator }: { equipmentId: string; projects: Opt[]; defaultProjectId: string | null; operator: string | null }) {
  return (
    <DialogForm
      trigger={
        <Button variant="outline" size="lg">
          <Clock className="size-4" /> Log usage
        </Button>
      }
      title="Log usage"
      description="Hours worked and fuel filled. Fuel bills are recorded separately as expenses."
      action={recordUsageAction}
      submitLabel="Save"
    >
      <input type="hidden" name="equipmentId" value={equipmentId} />
      <FormGrid>
        <SelectField label="Site" name="projectId" options={projects} defaultValue={defaultProjectId ?? ""} placeholder="Choose…" required />
        <TextField label="Date" name="date" type="date" defaultValue={todayIST()} required />
        <TextField label="Hours" name="hours" inputMode="decimal" />
        <TextField label="Fuel (litres)" name="fuelLitres" inputMode="decimal" />
        <TextField label="Operator" name="operatorName" defaultValue={operator ?? ""} />
        <TextField label="Note" name="notes" />
      </FormGrid>
    </DialogForm>
  );
}

export function MaintenanceDialog({ equipmentId }: { equipmentId: string }) {
  return (
    <DialogForm
      trigger={
        <Button variant="outline" size="lg">
          <Wrench className="size-4" /> Record service
        </Button>
      }
      title="Record service or repair"
      description="Repair costs are recorded as an expense against this equipment."
      action={recordMaintenanceAction}
      submitLabel="Save"
    >
      <input type="hidden" name="equipmentId" value={equipmentId} />
      <TextField label="Date" name="date" type="date" defaultValue={todayIST()} required />
      <TextField label="What was done" name="description" required placeholder="e.g. Oil change, belt replaced" />
      <TextField label="Next service due" name="nextDueDate" type="date" hint="You'll see a reminder when it is due." />
      <TextField label="Note" name="notes" />
    </DialogForm>
  );
}
