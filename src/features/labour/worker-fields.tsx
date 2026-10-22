"use client";

import { FormGrid, FormSection, MoneyField, SelectField, TextAreaField, TextField } from "@/components/app/form";
import { LABOUR_CATEGORY, options } from "@/lib/labels";

export type WorkerValues = {
  name: string;
  phone: string;
  category: string;
  contractorId: string;
  dailyWage: string;
  overtimeRate: string;
  address: string;
  emergencyContact: string;
  upiId: string;
  joinedOn: string;
  notes: string;
};

export function WorkerFields({
  values,
  contractors,
  showWages,
}: {
  values?: Partial<WorkerValues>;
  contractors: { value: string; label: string }[];
  showWages: boolean;
}) {
  return (
    <>
      <FormSection title="Worker">
        <FormGrid>
          <TextField label="Name" name="name" defaultValue={values?.name} required />
          <TextField label="Phone" name="phone" type="tel" defaultValue={values?.phone} />
          <SelectField label="Type of work" name="category" defaultValue={values?.category ?? "HELPER"} options={options(LABOUR_CATEGORY)} required />
          <SelectField label="Comes with contractor (mestri)" name="contractorId" defaultValue={values?.contractorId ?? ""} options={contractors} placeholder="No — hired directly" />
          <TextField label="Joined on" name="joinedOn" type="date" defaultValue={values?.joinedOn} />
          <TextField label="UPI ID (for paying wages)" name="upiId" defaultValue={values?.upiId} placeholder="e.g. 98xxxxxx@upi" />
          <TextField label="Emergency contact" name="emergencyContact" defaultValue={values?.emergencyContact} placeholder="Name and phone" />
          <TextAreaField label="Native place / address" name="address" defaultValue={values?.address} rows={2} />
        </FormGrid>
      </FormSection>
      {showWages ? (
        <FormSection title="Wages" description="Changing the wage applies from the next attendance — days already marked keep their old rate.">
          <FormGrid>
            <MoneyField label="Daily wage" name="dailyWagePaise" defaultValue={values?.dailyWage} required />
            <MoneyField label="Overtime rate (per hour)" name="overtimeRatePaise" defaultValue={values?.overtimeRate} />
          </FormGrid>
        </FormSection>
      ) : (
        <>
          <input type="hidden" name="dailyWagePaise" value={values?.dailyWage || "1"} />
          <input type="hidden" name="overtimeRatePaise" value={values?.overtimeRate ?? ""} />
        </>
      )}
      <TextAreaField label="Notes" name="notes" defaultValue={values?.notes} rows={2} />
    </>
  );
}
