"use client";

import Link from "next/link";
import { useState } from "react";
import {
  FormError,
  FormGrid,
  FormSection,
  MoneyField,
  SelectField,
  SubmitButton,
  TextAreaField,
  TextField,
  useActionForm,
  type FormAction,
} from "@/components/app/form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { PayFrequency } from "@/generated/prisma/enums";
import type { EngineerFormValues } from "./form-values";

const PAY_LABELS: Record<PayFrequency, string> = { MONTHLY: "Monthly salary", WEEKLY: "Weekly", DAILY: "Per day" };

export function EngineerForm({
  action,
  values,
  projects,
  showPay,
  submitLabel,
  cancelHref,
}: {
  action: FormAction;
  values: EngineerFormValues;
  projects: { id: string; name: string; code: string }[];
  showPay: boolean;
  submitLabel: string;
  cancelHref: string;
}) {
  const { onSubmit, pending, fieldErrors: e, formError } = useActionForm(action);
  const [frequency, setFrequency] = useState<PayFrequency>(values.payFrequency);
  const [selected, setSelected] = useState<string[]>(values.projectIds);

  return (
    <form onSubmit={onSubmit} className="flex max-w-3xl flex-col gap-5">
      <FormError message={Object.keys(e).length ? "Please check the fields marked in red." : formError} />
      <FormSection title="Engineer details">
        <FormGrid>
          <TextField label="Full name" name="name" defaultValue={values.name} required error={e.name} autoFocus />
          <TextField label="Role" name="role" defaultValue={values.role} error={e.role} placeholder="Site Engineer, Supervisor…" />
          <TextField label="Phone" name="phone" type="tel" defaultValue={values.phone} error={e.phone} />
          <TextField label="Other phone" name="altPhone" type="tel" defaultValue={values.altPhone} error={e.altPhone} />
          <TextField label="Email" name="email" type="email" defaultValue={values.email} error={e.email} />
          <TextField label="Qualification" name="qualification" defaultValue={values.qualification} error={e.qualification} placeholder="e.g. B.E. Civil, Diploma Civil" />
          <TextField label="Joining date" name="joiningDate" type="date" defaultValue={values.joiningDate} error={e.joiningDate} />
          <TextAreaField label="Responsibilities" name="responsibilities" defaultValue={values.responsibilities} error={e.responsibilities} rows={2} fieldClassName="sm:col-span-2" placeholder="e.g. Structural supervision, quality checks, daily reports" />
        </FormGrid>
      </FormSection>

      {showPay ? (
        <FormSection title="Pay" description="Payments to engineers are recorded in Stage 3 (Accounts).">
          <FormGrid>
            <SelectField
              label="How are they paid?"
              name="payFrequency"
              value={frequency}
              onChange={(ev) => setFrequency(ev.target.value as PayFrequency)}
              options={Object.values(PayFrequency).map((f) => ({ value: f, label: PAY_LABELS[f] }))}
            />
            {frequency === "DAILY" ? (
              <>
                <MoneyField label="Daily wage" name="dailyWagePaise" defaultValue={values.dailyWage} error={e.dailyWagePaise} />
                <input type="hidden" name="salaryPaise" value={values.salary} />
              </>
            ) : (
              <>
                <MoneyField label={frequency === "WEEKLY" ? "Weekly pay" : "Monthly salary"} name="salaryPaise" defaultValue={values.salary} error={e.salaryPaise} />
                <input type="hidden" name="dailyWagePaise" value={values.dailyWage} />
              </>
            )}
          </FormGrid>
        </FormSection>
      ) : (
        <>
          <input type="hidden" name="payFrequency" value={values.payFrequency} />
          <input type="hidden" name="salaryPaise" value="" />
          <input type="hidden" name="dailyWagePaise" value="" />
        </>
      )}

      <FormSection title="Projects" description="Tick the projects this engineer works on.">
        {projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">No projects yet.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {projects.map((p) => (
              <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted">
                <Checkbox
                  checked={selected.includes(p.id)}
                  onCheckedChange={(checked) => setSelected((s) => (checked ? [...s, p.id] : s.filter((x) => x !== p.id)))}
                />
                <span>
                  {p.name} <span className="text-xs text-muted-foreground">{p.code}</span>
                </span>
              </label>
            ))}
          </div>
        )}
        {selected.map((id) => (
          <input key={id} type="hidden" name="projectIds" value={id} />
        ))}
      </FormSection>

      <TextAreaField label="Notes" name="notes" defaultValue={values.notes} error={e.notes} rows={2} />
      <div className="flex flex-wrap gap-2">
        <SubmitButton pending={pending}>{submitLabel}</SubmitButton>
        <Button asChild variant="outline" size="lg">
          <Link href={cancelHref}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
