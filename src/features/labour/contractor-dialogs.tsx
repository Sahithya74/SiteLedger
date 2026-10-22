"use client";

import { useState } from "react";
import { FilePlus2, Hammer, Pencil, Plus } from "lucide-react";
import { DialogForm, FormGrid, MoneyField, SelectField, TextAreaField, TextField } from "@/components/app/form";
import { Button } from "@/components/ui/button";
import { addDays, todayIST } from "@/lib/dates";
import { LABOUR_CATEGORY, options, WORK_ORDER_TYPE } from "@/lib/labels";
import { createContractorAction, createContractorBillAction, createWorkOrderAction, updateContractorAction } from "./actions";

type Opt = { value: string; label: string };

export type ContractorValues = { name: string; phone: string; trade: string; address: string; pan: string; gstin: string; notes: string };

function ContractorFields({ values }: { values?: Partial<ContractorValues> }) {
  return (
    <FormGrid>
      <TextField label="Name" name="name" defaultValue={values?.name} required placeholder="e.g. Murugesan (mestri)" />
      <TextField label="Phone" name="phone" type="tel" defaultValue={values?.phone} />
      <SelectField label="Main trade" name="trade" defaultValue={values?.trade ?? ""} options={options(LABOUR_CATEGORY)} placeholder="—" />
      <TextField label="PAN (for TDS)" name="pan" defaultValue={values?.pan} className="uppercase" maxLength={10} />
      <TextField label="GSTIN" name="gstin" defaultValue={values?.gstin} className="uppercase" maxLength={15} />
      <TextAreaField label="Address" name="address" defaultValue={values?.address} rows={2} fieldClassName="sm:col-span-2" />
      <TextAreaField label="Notes" name="notes" defaultValue={values?.notes} rows={2} fieldClassName="sm:col-span-2" />
    </FormGrid>
  );
}

export function AddContractorDialog() {
  return (
    <DialogForm
      trigger={
        <Button size="lg">
          <Plus className="size-4" /> Add contractor
        </Button>
      }
      title="Add a labour contractor"
      description="A mestri or gang leader who brings workers and is paid by bills."
      action={createContractorAction}
      submitLabel="Save"
      wide
    >
      <ContractorFields />
    </DialogForm>
  );
}

export function EditContractorDialog({ id, values }: { id: string; values: ContractorValues }) {
  return (
    <DialogForm
      trigger={
        <Button variant="outline" size="lg">
          <Pencil className="size-4" /> Edit
        </Button>
      }
      title={`Edit ${values.name}`}
      action={updateContractorAction.bind(null, id)}
      submitLabel="Save"
      wide
    >
      <ContractorFields values={values} />
    </DialogForm>
  );
}

export function WorkOrderDialog({ contractorId, projects, workItems }: { contractorId: string; projects: Opt[]; workItems?: Opt[] }) {
  const [type, setType] = useState("PIECE_RATE");
  return (
    <DialogForm
      trigger={
        <Button variant="outline" size="lg">
          <Hammer className="size-4" /> New work order
        </Button>
      }
      title="Give a work order"
      description="What the contractor will do, and at what rate."
      action={createWorkOrderAction}
      submitLabel="Create work order"
      wide
    >
      <input type="hidden" name="contractorId" value={contractorId} />
      <FormGrid>
        <SelectField label="Project" name="projectId" options={projects} placeholder="Choose…" required />
        {workItems && workItems.length > 0 && <SelectField label="Work item (optional)" name="workItemId" options={workItems} placeholder="—" />}
        <TextField label="Work" name="title" required placeholder="e.g. Brickwork – first floor" fieldClassName="sm:col-span-2" />
        <SelectField label="Rate type" name="type" value={type} onChange={(e) => setType(e.target.value)} options={options(WORK_ORDER_TYPE)} required />
        {type === "LUMP_SUM" ? (
          <MoneyField label="Lump-sum amount" name="lumpSumPaise" required />
        ) : (
          <>
            <MoneyField label={type === "DAILY_RATE" ? "Rate per day" : "Rate per unit"} name="ratePaise" required />
            <TextField label="Unit" name="unit" placeholder={type === "DAILY_RATE" ? "day" : "sqft, cum, nos…"} />
            <TextField label="Estimated quantity" name="quantity" inputMode="decimal" placeholder="Optional" />
          </>
        )}
        <TextField label="Retention %" name="retentionPercent" defaultValue="5" inputMode="decimal" help="Part of each bill held back until the work is complete." />
        <TextField label="TDS %" name="tdsPercent" defaultValue="1" inputMode="decimal" help="Income tax deducted at source (194C): usually 1% for individuals, 2% for firms." />
        <TextField label="Start" name="startDate" type="date" defaultValue={todayIST()} />
        <TextField label="Finish by" name="endDate" type="date" defaultValue={addDays(todayIST(), 30)} />
        <TextAreaField label="Description" name="description" rows={2} fieldClassName="sm:col-span-2" />
      </FormGrid>
    </DialogForm>
  );
}

export function ContractorBillDialog({
  contractorId,
  projects,
  workOrders,
}: {
  contractorId: string;
  projects: Opt[];
  workOrders: (Opt & { projectId: string; retention: string; tds: string; perUnit: boolean })[];
}) {
  const [woId, setWoId] = useState("");
  const wo = workOrders.find((w) => w.value === woId);
  return (
    <DialogForm
      trigger={
        <Button size="lg">
          <FilePlus2 className="size-4" /> Record bill
        </Button>
      }
      title="Record a contractor bill"
      description="For piece-rate work, enter the measured quantity and the amount is worked out from the rate."
      action={createContractorBillAction}
      submitLabel="Save bill"
      wide
    >
      <input type="hidden" name="contractorId" value={contractorId} />
      <FormGrid>
        <SelectField label="Work order" name="workOrderId" value={woId} onChange={(e) => setWoId(e.target.value)} options={workOrders} placeholder="No work order" />
        {wo ? <input type="hidden" name="projectId" value={wo.projectId} /> : <SelectField label="Project" name="projectId" options={projects} placeholder="Choose…" required />}
        <TextField label="Bill date" name="billDate" type="date" defaultValue={todayIST()} required />
        <TextField label="Work from" name="periodFrom" type="date" />
        <TextField label="Work to" name="periodTo" type="date" />
        {wo?.perUnit && <TextField label="Measured quantity" name="quantity" inputMode="decimal" hint="Amount = quantity × work-order rate" />}
        <MoneyField label={wo?.perUnit ? "Bill amount (leave empty to use quantity × rate)" : "Bill amount"} name="grossPaise" required={!wo?.perUnit} />
        <TextField key={`r-${woId}`} label="Retention %" name="retentionPercent" defaultValue={wo?.retention ?? "5"} inputMode="decimal" />
        <TextField key={`t-${woId}`} label="TDS %" name="tdsPercent" defaultValue={wo?.tds ?? "1"} inputMode="decimal" />
        <MoneyField label="Other deductions" name="otherDeductionPaise" hint="e.g. material given, damages" />
        <TextField label="Deduction reason" name="deductionNote" />
        <TextAreaField label="Notes" name="notes" rows={2} fieldClassName="sm:col-span-2" />
      </FormGrid>
    </DialogForm>
  );
}
