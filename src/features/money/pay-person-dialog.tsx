"use client";

import { IndianRupee } from "lucide-react";
import { DialogForm, SelectField } from "@/components/app/form";
import { Button } from "@/components/ui/button";
import { payPersonAction } from "@/features/labour/actions";
import { PAYMENT_PURPOSE } from "@/lib/labels";
import { PaymentFields, type AccountOption } from "./payment-fields";

type Opt = { value: string; label: string };

/**
 * One dialog for paying any person: wages / advance to a worker, salary to an
 * engineer, a bill or advance to a labour contractor.
 */
export function PayPersonDialog({
  payeeType,
  personId,
  personName,
  purposes,
  accounts,
  projects,
  defaultProjectId,
  bills,
  defaultAmount,
  label,
  variant = "default",
}: {
  payeeType: "LABOUR" | "ENGINEER" | "CONTRACTOR";
  personId: string;
  personName: string;
  purposes: ("WAGES" | "ADVANCE" | "SALARY" | "CONTRACTOR_BILL" | "OTHER")[];
  accounts: AccountOption[];
  projects?: Opt[];
  defaultProjectId?: string;
  bills?: Opt[];
  defaultAmount?: string;
  label: string;
  variant?: "default" | "outline";
}) {
  const idField = payeeType === "LABOUR" ? "labourId" : payeeType === "ENGINEER" ? "engineerId" : "contractorId";
  return (
    <DialogForm
      trigger={
        <Button variant={variant} size="lg">
          <IndianRupee className="size-4" /> {label}
        </Button>
      }
      title={`${label} — ${personName}`}
      description="Records the payment and takes the money out of the chosen account."
      action={payPersonAction}
      submitLabel="Save payment"
      wide
    >
      <input type="hidden" name="payeeType" value={payeeType} />
      <input type="hidden" name={idField} value={personId} />
      {purposes.length === 1 ? (
        <input type="hidden" name="purpose" value={purposes[0]} />
      ) : (
        <SelectField label="What is it for" name="purpose" options={purposes.map((p) => ({ value: p, label: PAYMENT_PURPOSE[p] }))} defaultValue={purposes[0]} required />
      )}
      {bills && bills.length > 0 && <SelectField label="Against bill (optional)" name="contractorBillId" options={bills} placeholder="Not for a specific bill" />}
      {projects && projects.length > 0 && (
        <SelectField label="Charge to project" name="projectId" options={projects} defaultValue={defaultProjectId} placeholder="Not for a project" />
      )}
      <PaymentFields accounts={accounts} defaultAmount={defaultAmount} defaultMethod="UPI" />
    </DialogForm>
  );
}
