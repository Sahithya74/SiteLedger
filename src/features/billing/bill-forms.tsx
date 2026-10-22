"use client";

import { useState } from "react";
import { ActionForm, FormGrid, FormSection, SelectField, TextAreaField, TextField, type FormAction } from "@/components/app/form";
import { addDays, todayIST } from "@/lib/dates";
import { BillEditor, type EditorLine } from "./bill-editor";

type Opt = { value: string; label: string };

export type QuotationFormValues = {
  clientId: string;
  projectId: string;
  title: string;
  date: string;
  validUntil: string;
  taxMode: string;
  taxPercent: string;
  discount: string;
  terms: string;
  notes: string;
  lines: EditorLine[];
};

const DEFAULT_TERMS = [
  "1. Rates are valid for 30 days from the date of this quotation.",
  "2. Payment: 10% advance, balance in stages as work progresses.",
  "3. Any extra work beyond this scope will be charged separately after approval.",
  "4. Electricity and water at site to be provided by the client.",
].join("\n");

export function QuotationForm({
  action,
  clients,
  projects,
  initial,
  cancelHref,
  submitLabel,
}: {
  action: FormAction;
  clients: Opt[];
  projects: (Opt & { clientId: string })[];
  initial?: Partial<QuotationFormValues>;
  cancelHref: string;
  submitLabel: string;
}) {
  const [clientId, setClientId] = useState(initial?.clientId ?? "");
  return (
    <ActionForm action={action} submitLabel={submitLabel} cancelHref={cancelHref} className="max-w-5xl">
      <FormSection title="Quotation for">
        <FormGrid>
          <SelectField label="Client" name="clientId" value={clientId} onChange={(e) => setClientId(e.target.value)} options={clients} placeholder="Choose client…" required />
          <SelectField
            key={clientId}
            label="Project (optional)"
            name="projectId"
            defaultValue={initial?.projectId ?? ""}
            options={projects.filter((p) => p.clientId === clientId)}
            placeholder="Not linked to a project yet"
            hint="Leave empty for a new enquiry — link it when the project is created."
          />
          <TextField label="Title" name="title" defaultValue={initial?.title ?? ""} placeholder="e.g. Construction of G+1 residence" required fieldClassName="sm:col-span-2" />
          <TextField label="Date" name="date" type="date" defaultValue={initial?.date ?? todayIST()} required />
          <TextField label="Valid until" name="validUntil" type="date" defaultValue={initial?.validUntil ?? addDays(todayIST(), 30)} />
        </FormGrid>
      </FormSection>
      <FormSection title="Items" description="Use headings like Foundation, Structure, Finishing to group lines. Amounts are calculated as you type.">
        <BillEditor
          initial={initial?.lines}
          initialTax={{ mode: initial?.taxMode ?? "NONE", percent: initial?.taxPercent ?? "18" }}
          initialDiscount={initial?.discount}
          showSections
          showDiscount
        />
      </FormSection>
      <FormSection title="Terms and notes">
        <div className="flex flex-col gap-4">
          <TextAreaField label="Terms and conditions" name="terms" rows={5} defaultValue={initial?.terms ?? DEFAULT_TERMS} />
          <TextAreaField label="Internal note (not printed)" name="notes" rows={2} defaultValue={initial?.notes ?? ""} />
        </div>
      </FormSection>
    </ActionForm>
  );
}

export function InvoiceForm({
  action,
  projects,
  defaultProjectId,
  nextRa,
  initialLines,
}: {
  action: FormAction;
  projects: (Opt & { client: string; gstState?: string })[];
  defaultProjectId?: string;
  nextRa: Record<string, number>;
  initialLines?: EditorLine[];
}) {
  const [projectId, setProjectId] = useState(defaultProjectId ?? "");
  const [kind, setKind] = useState("RUNNING");
  const client = projects.find((p) => p.value === projectId)?.client;
  return (
    <ActionForm action={action} submitLabel="Save bill" cancelHref="/clients/bills" className="max-w-5xl">
      <FormSection title="Bill">
        <FormGrid>
          <SelectField label="Project" name="projectId" value={projectId} onChange={(e) => setProjectId(e.target.value)} options={projects} placeholder="Choose project…" required hint={client ? `Bill to: ${client}` : undefined} />
          <SelectField
            label="Type of bill"
            name="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            options={[
              { value: "RUNNING", label: projectId ? `Running bill (RA-${nextRa[projectId] ?? 1})` : "Running bill (RA)" },
              { value: "ADVANCE", label: "Advance request" },
              { value: "FINAL", label: "Final bill" },
              { value: "RETENTION_RELEASE", label: "Retention release" },
            ]}
          />
          <TextField label="Bill date" name="date" type="date" defaultValue={todayIST()} required />
          <TextField label="Payment due by" name="dueDate" type="date" defaultValue={addDays(todayIST(), 15)} hint="Used to show the bill as overdue." />
          <TextField label="Milestone / stage" name="milestone" placeholder="e.g. First floor slab completed" fieldClassName="sm:col-span-2" />
        </FormGrid>
      </FormSection>
      <FormSection title="Work billed" description="Quantities × rates. Retention is the part the client keeps until the end (if agreed).">
        <BillEditor initial={initialLines} initialTax={{ mode: "NONE", percent: "18" }} showRetention initialRetention="0" />
      </FormSection>
      <FormSection title="Send">
        <div className="flex flex-col gap-4">
          <TextAreaField label="Note on the bill" name="notes" rows={2} />
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" name="issueNow" defaultChecked className="size-4 accent-stone-800" />
            Issue now (counts as billed). Untick to keep it as a draft.
          </label>
        </div>
      </FormSection>
    </ActionForm>
  );
}
