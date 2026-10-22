"use client";

import Link from "next/link";
import {
  FormError,
  FormGrid,
  FormSection,
  SubmitButton,
  TextAreaField,
  TextField,
  useActionForm,
  type FormAction,
} from "@/components/app/form";
import { Button } from "@/components/ui/button";
import type { ClientFormValues } from "./form-values";

export function ClientForm({
  action,
  values,
  submitLabel,
  cancelHref,
  returnTo,
}: {
  action: FormAction;
  values: ClientFormValues;
  submitLabel: string;
  cancelHref: string;
  returnTo?: string;
}) {
  const { onSubmit, pending, fieldErrors: e, formError } = useActionForm(action);
  return (
    <form onSubmit={onSubmit} className="flex max-w-3xl flex-col gap-5">
      {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
      <FormError message={Object.keys(e).length ? "Please check the fields marked in red." : formError} />
      <FormSection title="Client details">
        <FormGrid>
          <TextField label="Client name" name="name" defaultValue={values.name} required error={e.name} fieldClassName="sm:col-span-2" placeholder="Person or company name" autoFocus />
          <TextField label="Phone" name="phone" type="tel" defaultValue={values.phone} error={e.phone} placeholder="98400 12345" />
          <TextField label="Other phone" name="altPhone" type="tel" defaultValue={values.altPhone} error={e.altPhone} />
          <TextField label="Email" name="email" type="email" defaultValue={values.email} error={e.email} />
          <TextField label="City / town" name="city" defaultValue={values.city} error={e.city} />
          <TextAreaField label="Address" name="address" defaultValue={values.address} error={e.address} rows={2} fieldClassName="sm:col-span-2" />
        </FormGrid>
      </FormSection>
      <FormSection title="Tax details" description="Optional. Needed for GST bills.">
        <FormGrid>
          <TextField label="GSTIN" name="gstin" defaultValue={values.gstin} error={e.gstin} placeholder="33ABCDE1234F1Z5" className="uppercase" maxLength={15} />
          <TextField label="PAN" name="pan" defaultValue={values.pan} error={e.pan} placeholder="ABCDE1234F" className="uppercase" maxLength={10} />
        </FormGrid>
      </FormSection>
      <TextAreaField label="Notes" name="notes" defaultValue={values.notes} error={e.notes} rows={3} placeholder="Preferences, how they like to be contacted, family members involved…" />
      <div className="flex flex-wrap gap-2">
        <SubmitButton pending={pending}>{submitLabel}</SubmitButton>
        <Button asChild variant="outline" size="lg">
          <Link href={cancelHref}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
