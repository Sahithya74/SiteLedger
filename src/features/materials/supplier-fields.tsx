"use client";

import { FormGrid, FormSection, SelectField, TextAreaField, TextField } from "@/components/app/form";
import { Checkbox } from "@/components/ui/checkbox";
import { SUPPLIER_CATEGORY } from "@/lib/labels";

export type SupplierValues = {
  name: string;
  categories: string[];
  contactPerson: string;
  phone: string;
  altPhone: string;
  email: string;
  address: string;
  city: string;
  latitude: string;
  longitude: string;
  gstin: string;
  pan: string;
  materialsSupplied: string;
  priceRangeNote: string;
  paymentTerms: string;
  creditDays: string;
  rating: string;
  notes: string;
};

export function SupplierFields({ values }: { values?: Partial<SupplierValues> }) {
  const selected = new Set(values?.categories ?? []);
  return (
    <>
      <FormSection title="Business">
        <FormGrid>
          <TextField label="Business name" name="name" defaultValue={values?.name} required fieldClassName="sm:col-span-2" />
          <div className="flex flex-col gap-2 sm:col-span-2">
            <span className="text-sm font-medium">What do they supply?</span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {Object.entries(SUPPLIER_CATEGORY).map(([value, label]) => (
                <label key={value} className="flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-sm hover:bg-muted">
                  <Checkbox name="categories" value={value} defaultChecked={selected.has(value)} />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <TextField label="Contact person" name="contactPerson" defaultValue={values?.contactPerson} />
          <TextField label="Phone" name="phone" type="tel" defaultValue={values?.phone} />
          <TextField label="Other phone" name="altPhone" type="tel" defaultValue={values?.altPhone} />
          <TextField label="Email" name="email" type="email" defaultValue={values?.email} />
          <TextAreaField label="Materials / services" name="materialsSupplied" defaultValue={values?.materialsSupplied} rows={2} fieldClassName="sm:col-span-2" placeholder="e.g. UltraTech & Ramco cement, TMT 8–25 mm" />
        </FormGrid>
      </FormSection>
      <FormSection title="Location" description="With coordinates, the supplier shows on project maps as 'nearby'.">
        <FormGrid>
          <TextAreaField label="Address" name="address" defaultValue={values?.address} rows={2} fieldClassName="sm:col-span-2" />
          <TextField label="City / town" name="city" defaultValue={values?.city} />
          <div />
          <TextField label="Latitude" name="latitude" defaultValue={values?.latitude} inputMode="decimal" placeholder="e.g. 12.9172" />
          <TextField label="Longitude" name="longitude" defaultValue={values?.longitude} inputMode="decimal" placeholder="e.g. 80.1891" />
        </FormGrid>
      </FormSection>
      <FormSection title="Terms">
        <FormGrid>
          <TextField label="Payment terms" name="paymentTerms" defaultValue={values?.paymentTerms} placeholder="e.g. 15 days credit" />
          <TextField label="Credit days" name="creditDays" defaultValue={values?.creditDays} inputMode="numeric" hint="Used to set the payment due date on new purchases." />
          <TextField label="Typical prices" name="priceRangeNote" defaultValue={values?.priceRangeNote} placeholder="e.g. Cement ₹380–400/bag" fieldClassName="sm:col-span-2" />
          <SelectField
            label="Rating"
            name="rating"
            defaultValue={values?.rating ?? ""}
            placeholder="Not rated"
            options={[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: "★".repeat(n) + "☆".repeat(5 - n) }))}
          />
          <div />
          <TextField label="GSTIN" name="gstin" defaultValue={values?.gstin} className="uppercase" maxLength={15} />
          <TextField label="PAN" name="pan" defaultValue={values?.pan} className="uppercase" maxLength={10} />
          <TextAreaField label="Notes" name="notes" defaultValue={values?.notes} rows={2} fieldClassName="sm:col-span-2" />
        </FormGrid>
      </FormSection>
    </>
  );
}
