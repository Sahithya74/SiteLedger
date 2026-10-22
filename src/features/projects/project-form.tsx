"use client";

import Link from "next/link";
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
import { ProjectStatus, ProjectType } from "@/generated/prisma/enums";
import { PROJECT_STATUS, PROJECT_TYPE } from "@/lib/labels";
import type { ProjectFormValues } from "./form-values";

export function ProjectForm({
  action,
  values,
  clients,
  showMoney,
  canChangeStatus,
  submitLabel,
  cancelHref,
}: {
  action: FormAction;
  values: ProjectFormValues;
  clients: { id: string; name: string; city: string | null }[];
  showMoney: boolean;
  canChangeStatus: boolean;
  submitLabel: string;
  cancelHref: string;
}) {
  const { onSubmit, pending, fieldErrors: e, formError } = useActionForm(action);
  const hasFieldErrors = Object.keys(e).length > 0;

  return (
    <form onSubmit={onSubmit} className="flex max-w-4xl flex-col gap-5">
      <FormError message={hasFieldErrors ? "Please check the fields marked in red." : formError} />

      <FormSection title="Project details">
        <FormGrid>
          <TextField label="Project name" name="name" defaultValue={values.name} required error={e.name} placeholder="e.g. Green Villa – Phase 1" fieldClassName="sm:col-span-2" />
          <div className="flex flex-col gap-1.5">
            <SelectField
              label="Client"
              name="clientId"
              required
              defaultValue={values.clientId}
              error={e.clientId}
              placeholder={clients.length ? "Choose the client" : "No clients yet"}
              options={clients.map((c) => ({ value: c.id, label: c.city ? `${c.name} (${c.city})` : c.name }))}
            />
            <Link href="/clients/new?returnTo=/projects/new" className="text-xs text-muted-foreground underline-offset-2 hover:underline">
              Client not in the list? Add a new client first
            </Link>
          </div>
          <SelectField
            label="Project type"
            name="type"
            required
            defaultValue={values.type}
            error={e.type}
            options={Object.values(ProjectType).map((t) => ({ value: t, label: PROJECT_TYPE[t] }))}
          />
          {canChangeStatus ? (
            <SelectField
              label="Status"
              name="status"
              required
              defaultValue={values.status}
              error={e.status}
              help="Planning = not started yet. Active = work on site. On hold = paused."
              options={Object.values(ProjectStatus).map((s) => ({ value: s, label: PROJECT_STATUS[s].label }))}
            />
          ) : (
            <input type="hidden" name="status" value={values.status} />
          )}
          <TextField label="Status note" name="statusNote" defaultValue={values.statusNote} error={e.statusNote} placeholder="e.g. Waiting for client approval of elevation" hint="Optional. Shown with the status." />
          <TextAreaField label="Description" name="description" defaultValue={values.description} error={e.description} rows={3} fieldClassName="sm:col-span-2" placeholder="Scope of work, floors, built-up area…" />
        </FormGrid>
      </FormSection>

      <FormSection title="Location" description="Used for the project map and to find nearby suppliers.">
        <FormGrid>
          <TextAreaField label="Site address" name="address" defaultValue={values.address} error={e.address} rows={2} fieldClassName="sm:col-span-2" />
          <TextField label="City / town" name="city" defaultValue={values.city} error={e.city} />
          <TextField label="State" name="state" defaultValue={values.state} error={e.state} />
          <TextField label="PIN code" name="pincode" defaultValue={values.pincode} error={e.pincode} inputMode="numeric" maxLength={6} />
          <TextField label="Google Maps link" name="mapUrl" defaultValue={values.mapUrl} error={e.mapUrl} placeholder="https://maps.app.goo.gl/…" hint="Optional. Paste the link shared from Google Maps." />
          <TextField label="Latitude" name="latitude" defaultValue={values.latitude} error={e.latitude} inputMode="decimal" placeholder="e.g. 13.0827" hint="You can also set the pin on the Map tab." />
          <TextField label="Longitude" name="longitude" defaultValue={values.longitude} error={e.longitude} inputMode="decimal" placeholder="e.g. 80.2707" />
        </FormGrid>
      </FormSection>

      <FormSection title="Dates">
        <FormGrid className="sm:grid-cols-3">
          <TextField label="Start date" name="startDate" type="date" defaultValue={values.startDate} error={e.startDate} />
          <TextField label="Expected completion" name="expectedEndDate" type="date" defaultValue={values.expectedEndDate} error={e.expectedEndDate} />
          <TextField label="Actual completion" name="actualEndDate" type="date" defaultValue={values.actualEndDate} error={e.actualEndDate} hint="Fill in when finished." />
        </FormGrid>
      </FormSection>

      {showMoney ? (
        <FormSection title="Money" description="Amounts in rupees. Payments, expenses and profit are calculated automatically from the records.">
          <FormGrid>
            <MoneyField label="Quoted amount" name="quotedPaise" defaultValue={values.quoted} error={e.quotedPaise} hint="What you quoted the client." />
            <MoneyField label="Final contract amount" name="contractPaise" defaultValue={values.contract} error={e.contractPaise} hint="The agreed amount. Extra work is added separately." />
          </FormGrid>
        </FormSection>
      ) : (
        <>
          <input type="hidden" name="quotedPaise" value={values.quoted} />
          <input type="hidden" name="contractPaise" value={values.contract} />
        </>
      )}

      <div className="flex flex-wrap gap-2">
        <SubmitButton pending={pending}>{submitLabel}</SubmitButton>
        <Button asChild variant="outline" size="lg">
          <Link href={cancelHref}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
