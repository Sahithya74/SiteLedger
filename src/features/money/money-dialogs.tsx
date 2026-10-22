"use client";

import { useState } from "react";
import { ArrowLeftRight, Banknote, CircleDollarSign, Landmark, Plus, Receipt, Ticket } from "lucide-react";
import { DialogForm, FormGrid, MoneyField, SelectField, TextAreaField, TextField } from "@/components/app/form";
import { Button } from "@/components/ui/button";
import { todayIST } from "@/lib/dates";
import { ACCOUNT_KIND, PAYEE_TYPE, PAYMENT_METHOD, PAYMENT_PURPOSE } from "@/lib/labels";
import {
  clearChequeAction,
  createAccountAction,
  depositChequeAction,
  recordChequeAction,
  recordClientPaymentAction,
  recordExpenseAction,
  recordOtherIncomeAction,
  recordPaymentAction,
  transferAction,
} from "./actions";
import { PaymentFields, type AccountOption } from "./payment-fields";

type Opt = { value: string; label: string };

const methods = Object.entries(PAYMENT_METHOD).map(([value, label]) => ({ value, label }));

export function ClientPaymentDialog({
  projects,
  invoices,
  accounts,
  defaultProjectId,
  label = "Add client payment",
}: {
  projects: (Opt & { pending?: string })[];
  invoices: (Opt & { projectId: string })[];
  accounts: AccountOption[];
  defaultProjectId?: string;
  label?: string;
}) {
  const [projectId, setProjectId] = useState(defaultProjectId ?? "");
  const pending = projects.find((p) => p.value === projectId)?.pending;
  return (
    <DialogForm
      trigger={
        <Button size="lg">
          <Plus className="size-4" /> {label}
        </Button>
      }
      title="Add client payment"
      description="Money received from a client. It goes into the chosen account and reduces what the client owes."
      action={recordClientPaymentAction}
      submitLabel="Save payment"
      wide
    >
      <FormGrid>
        <SelectField label="Project" name="projectId" value={projectId} onChange={(e) => setProjectId(e.target.value)} options={projects} placeholder="Choose…" required hint={pending ? `Still to receive: ${pending}` : undefined} />
        <SelectField label="Against bill (optional)" name="invoiceId" options={invoices.filter((i) => i.projectId === projectId)} placeholder="General / advance" />
        <TextField label="Date received" name="date" type="date" defaultValue={todayIST()} required />
        <MoneyField label="Amount received" name="amountPaise" required />
        <MoneyField label="TDS deducted by client" name="tdsDeductedPaise" hint="If the client deducted TDS, enter it here — it counts as paid." />
        <TextField label="Milestone / for" name="milestone" placeholder="e.g. Slab completion" />
        <SelectField label="Received by" name="method" defaultValue="BANK_TRANSFER" options={methods} required />
        <SelectField label="Into account" name="accountId" options={accounts.map((a) => ({ value: a.id, label: a.name }))} defaultValue={accounts[0]?.id} required />
        <TextField label="Reference (UTR / UPI / cheque no.)" name="reference" />
        <TextField label="Note" name="notes" />
      </FormGrid>
    </DialogForm>
  );
}

export function ExpenseDialog({
  projects,
  categories,
  accounts,
  defaultProjectId,
  allowOffice,
  label = "Record expense",
  equipmentId,
}: {
  projects: Opt[];
  categories: { value: string; label: string; group: string; isWelfare: boolean }[];
  accounts: AccountOption[];
  defaultProjectId?: string;
  allowOffice: boolean;
  label?: string;
  equipmentId?: string;
}) {
  const [categoryId, setCategoryId] = useState("");
  const welfare = categories.find((c) => c.value === categoryId)?.isWelfare;
  return (
    <DialogForm
      trigger={
        <Button size="lg">
          <Receipt className="size-4" /> {label}
        </Button>
      }
      title="Record an expense"
      description="Transport, labour food and water, rent, electricity, fuel… anything paid that is not a material bill or wages."
      action={recordExpenseAction}
      submitLabel="Save expense"
      wide
    >
      {equipmentId && <input type="hidden" name="equipmentId" value={equipmentId} />}
      <FormGrid>
        <SelectField
          label="For"
          name="projectId"
          options={projects}
          defaultValue={defaultProjectId ?? ""}
          placeholder={allowOffice ? "Office / company (no project)" : "Choose project…"}
          required={!allowOffice}
        />
        <SelectField label="Category" name="categoryId" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} options={categories} placeholder="Choose…" required />
        <TextField label="What was it for" name="description" required placeholder="e.g. Lunch for 14 workers" fieldClassName="sm:col-span-2" />
        <TextField label="Date" name="date" type="date" defaultValue={todayIST()} required />
        <MoneyField label="Amount" name="amountPaise" required />
        {welfare && (
          <>
            <TextField label="Quantity" name="quantity" inputMode="decimal" placeholder="e.g. 14" />
            <TextField label="Unit" name="unit" placeholder="meals, cans, nights…" />
          </>
        )}
        <TextField label="Paid to" name="paidTo" placeholder="Hotel, shop, person…" />
        <SelectField label="Paid by" name="method" defaultValue="CASH" options={methods} required />
        <SelectField label="From account" name="accountId" options={accounts.map((a) => ({ value: a.id, label: a.balance ? `${a.name} (${a.balance})` : a.name }))} defaultValue={accounts.find((a) => a.kind === "SITE_CASH")?.id ?? accounts.find((a) => a.kind === "CASH")?.id ?? accounts[0]?.id} required />
        <TextField label="Reference / bill no." name="reference" />
        <TextAreaField label="Note" name="notes" rows={2} fieldClassName="sm:col-span-2" />
      </FormGrid>
    </DialogForm>
  );
}

/** Pay anyone — supplier, worker, engineer, contractor, or someone else. */
export function RecordPaymentDialog({
  accounts,
  projects,
  people,
}: {
  accounts: AccountOption[];
  projects: Opt[];
  people: { SUPPLIER: Opt[]; LABOUR: Opt[]; ENGINEER: Opt[]; CONTRACTOR: Opt[] };
}) {
  const [payeeType, setPayeeType] = useState<"SUPPLIER" | "LABOUR" | "ENGINEER" | "CONTRACTOR" | "OTHER">("SUPPLIER");
  const purposes: Record<string, string[]> = {
    SUPPLIER: ["PURCHASE", "OTHER"],
    LABOUR: ["WAGES", "ADVANCE"],
    ENGINEER: ["SALARY", "WAGES", "ADVANCE", "OTHER"],
    CONTRACTOR: ["CONTRACTOR_BILL", "ADVANCE"],
    OTHER: ["OTHER"],
  };
  const idField = { SUPPLIER: "supplierId", LABOUR: "labourId", ENGINEER: "engineerId", CONTRACTOR: "contractorId", OTHER: "" }[payeeType];
  return (
    <DialogForm
      trigger={
        <Button size="lg">
          <Banknote className="size-4" /> Record payment
        </Button>
      }
      title="Record a payment made"
      action={recordPaymentAction}
      submitLabel="Save payment"
      wide
    >
      <FormGrid>
        <SelectField label="Paid to" name="payeeType" value={payeeType} onChange={(e) => setPayeeType(e.target.value as typeof payeeType)} options={Object.entries(PAYEE_TYPE).map(([value, label]) => ({ value, label }))} required />
        {payeeType === "OTHER" ? (
          <TextField label="Name" name="payeeName" required placeholder="e.g. Architect, municipality" />
        ) : (
          <SelectField key={payeeType} label="Who" name={idField} options={people[payeeType]} placeholder="Choose…" required />
        )}
        <SelectField key={`p-${payeeType}`} label="What for" name="purpose" options={purposes[payeeType].map((p) => ({ value: p, label: PAYMENT_PURPOSE[p as keyof typeof PAYMENT_PURPOSE] }))} required />
        <SelectField label="Charge to project" name="projectId" options={projects} placeholder="No project" />
      </FormGrid>
      <PaymentFields accounts={accounts} />
    </DialogForm>
  );
}

export function OtherIncomeDialog({ accounts, projects }: { accounts: AccountOption[]; projects: Opt[] }) {
  return (
    <DialogForm
      trigger={
        <Button variant="outline" size="lg">
          <CircleDollarSign className="size-4" /> Other income
        </Button>
      }
      title="Record other income"
      description="Money received that is not a client payment — scrap sale, equipment hire to others, refunds…"
      action={recordOtherIncomeAction}
      submitLabel="Save"
      wide
    >
      <FormGrid>
        <TextField label="Received from / for" name="source" required placeholder="e.g. Scrap steel sale" fieldClassName="sm:col-span-2" />
        <SelectField label="Project (optional)" name="projectId" options={projects} placeholder="No project" />
      </FormGrid>
      <PaymentFields accounts={accounts} defaultMethod="CASH" />
    </DialogForm>
  );
}

export function TransferDialog({ accounts, label = "Move money", defaultTo }: { accounts: AccountOption[]; label?: string; defaultTo?: string }) {
  return (
    <DialogForm
      trigger={
        <Button variant="outline" size="lg">
          <ArrowLeftRight className="size-4" /> {label}
        </Button>
      }
      title="Move money between your accounts"
      description="For example withdraw cash from the bank, or give site cash to the manager. This is not income or expense."
      action={transferAction}
      submitLabel="Move money"
    >
      <FormGrid>
        <SelectField label="From" name="fromAccountId" options={accounts.map((a) => ({ value: a.id, label: a.balance ? `${a.name} (${a.balance})` : a.name }))} defaultValue={accounts.find((a) => a.kind === "BANK")?.id} required />
        <SelectField label="To" name="toAccountId" options={accounts.map((a) => ({ value: a.id, label: a.name }))} defaultValue={defaultTo} placeholder="Choose…" required />
        <TextField label="Date" name="date" type="date" defaultValue={todayIST()} required />
        <MoneyField label="Amount" name="amountPaise" required />
        <TextField label="Reference" name="reference" fieldClassName="sm:col-span-2" />
      </FormGrid>
    </DialogForm>
  );
}

export function AddAccountDialog({ managers, projects }: { managers: Opt[]; projects: Opt[] }) {
  const [kind, setKind] = useState("BANK");
  return (
    <DialogForm
      trigger={
        <Button size="lg">
          <Landmark className="size-4" /> Add account
        </Button>
      }
      title="Add a bank or cash account"
      description="Only the last 4 digits of the account number are kept — never the full number or passwords."
      action={createAccountAction}
      submitLabel="Add account"
      wide
    >
      <FormGrid>
        <SelectField label="Type" name="kind" value={kind} onChange={(e) => setKind(e.target.value)} options={Object.entries(ACCOUNT_KIND).map(([value, label]) => ({ value, label }))} required />
        <TextField label="Name (how you call it)" name="name" required placeholder={kind === "BANK" ? "e.g. HDFC Current" : kind === "CASH" ? "e.g. Office cash" : "e.g. Site cash – Suresh"} />
        {kind === "BANK" && (
          <>
            <TextField label="Bank" name="bankName" placeholder="e.g. HDFC Bank" />
            <TextField label="Account type" name="accountType" placeholder="Current / Savings / OD" />
            <TextField label="Last 4 digits of account no." name="accountNumberLast4" inputMode="numeric" maxLength={20} />
            <TextField label="IFSC" name="ifsc" className="uppercase" maxLength={11} />
            <TextField label="Branch" name="branch" />
            <TextField label="UPI ID" name="upiId" />
            <TextField label="Account holder name" name="accountHolderName" />
          </>
        )}
        {kind === "SITE_CASH" && (
          <>
            <SelectField label="Held by" name="holderUserId" options={managers} placeholder="Choose manager…" required />
            <SelectField label="For project (optional)" name="projectId" options={projects} placeholder="Any site" />
          </>
        )}
        <MoneyField label="Opening balance" name="openingBalancePaise" hint="What is in the account on the date below." />
        <TextField label="Balance as on" name="openingDate" type="date" defaultValue={todayIST()} required />
        <TextField label="Note" name="notes" fieldClassName="sm:col-span-2" />
      </FormGrid>
    </DialogForm>
  );
}

export function RecordChequeDialog({ projects, defaultDirection = "RECEIVED" }: { projects: (Opt & { client?: string })[]; defaultDirection?: "RECEIVED" | "ISSUED" }) {
  const [direction, setDirection] = useState(defaultDirection);
  const [projectId, setProjectId] = useState("");
  const client = projects.find((p) => p.value === projectId)?.client;
  return (
    <DialogForm
      trigger={
        <Button variant="outline" size="lg">
          <Ticket className="size-4" /> Record cheque
        </Button>
      }
      title="Record a cheque"
      description="A cheque in hand is not money yet — the payment is recorded when the bank clears it."
      action={recordChequeAction}
      submitLabel="Save cheque"
      wide
    >
      <FormGrid>
        <SelectField label="Cheque" name="direction" value={direction} onChange={(e) => setDirection(e.target.value as "RECEIVED" | "ISSUED")} options={[{ value: "RECEIVED", label: "Received from a client" }, { value: "ISSUED", label: "Given by us" }]} />
        <SelectField label="Project" name="projectId" value={projectId} onChange={(e) => setProjectId(e.target.value)} options={projects} placeholder="—" required={direction === "RECEIVED"} />
        <TextField key={client ?? "x"} label={direction === "RECEIVED" ? "From" : "To"} name="partyName" defaultValue={direction === "RECEIVED" ? client : ""} required />
        <TextField label="Cheque number" name="chequeNumber" inputMode="numeric" required />
        <TextField label="Bank" name="bankName" />
        <TextField label="Cheque date" name="chequeDate" type="date" defaultValue={todayIST()} required hint="A future date = post-dated cheque. You'll be reminded on that day." />
        <MoneyField label="Amount" name="amountPaise" required />
        <TextField label="Note" name="notes" />
      </FormGrid>
    </DialogForm>
  );
}

export function DepositChequeDialog({ id, accounts }: { id: string; accounts: AccountOption[] }) {
  return (
    <DialogForm trigger={<Button size="sm" variant="outline">Deposited</Button>} title="Cheque deposited" action={depositChequeAction} submitLabel="Save">
      <input type="hidden" name="id" value={id} />
      <SelectField label="Into account" name="accountId" options={accounts.filter((a) => a.kind === "BANK").map((a) => ({ value: a.id, label: a.name }))} required />
      <TextField label="Deposited on" name="date" type="date" defaultValue={todayIST()} required />
    </DialogForm>
  );
}

export function ClearChequeDialog({ id, accounts, defaultAccountId }: { id: string; accounts: AccountOption[]; defaultAccountId?: string | null }) {
  return (
    <DialogForm
      trigger={<Button size="sm">Cleared</Button>}
      title="Cheque cleared by the bank"
      description="The payment is recorded now, with the cheque number as reference."
      action={clearChequeAction}
      submitLabel="Record payment"
    >
      <input type="hidden" name="id" value={id} />
      <SelectField label="Bank account" name="accountId" options={accounts.filter((a) => a.kind === "BANK").map((a) => ({ value: a.id, label: a.name }))} defaultValue={defaultAccountId ?? undefined} required />
      <TextField label="Cleared on" name="date" type="date" defaultValue={todayIST()} required />
    </DialogForm>
  );
}
