import "server-only";
import { formatINR } from "@/lib/money";
import { can } from "@/lib/permissions";
import type { CurrentUser } from "@/server/auth/current-user";
import { seesAllProjects } from "@/server/scope";
import { listInvoices, receivables } from "@/server/services/billing";
import { contractorOptions } from "@/server/services/contractors";
import { engineerOptions } from "@/server/services/engineers";
import { workerOptions } from "@/server/services/labour";
import { accountOptions } from "@/server/services/ledger";
import { expenseCategories } from "@/server/services/money-lists";
import { projectOptions } from "@/server/services/projects";
import { supplierOptions } from "@/server/services/suppliers";

/** Dropdown data for the "Add client payment" dialog. */
export async function clientPaymentDialogData(user: CurrentUser) {
  const [projects, rec, invoices, accounts] = await Promise.all([
    projectOptions(user),
    receivables(user),
    listInvoices(user, { status: "ISSUED", outstandingOnly: true }),
    accountOptions(user),
  ]);
  return {
    projects: projects.map((p) => {
      const r = rec.find((x) => x.id === p.id);
      return { value: p.id, label: `${p.name} — ${p.client.name}`, pending: r ? formatINR(r.pendingPaise, { paise: false }) : undefined };
    }),
    invoices: invoices.map((i) => ({
      value: i.id,
      label: `${i.number}${i.raNumber ? ` (RA-${i.raNumber})` : ""} — due ${formatINR(i.outstandingPaise, { paise: false })}`,
      projectId: i.projectId,
    })),
    accounts,
  };
}

/** Dropdown data for the expense dialog. */
export async function expenseDialogData(user: CurrentUser) {
  const [categories, projects, accounts] = await Promise.all([expenseCategories(), projectOptions(user), accountOptions(user)]);
  return {
    categories: categories.map((c) => ({ value: c.id, label: c.name, group: c.group, isWelfare: c.isWelfare })),
    projects: projects.map((p) => ({ value: p.id, label: p.name })),
    accounts,
    allowOffice: seesAllProjects(user) && can(user, "projects.viewMoney"),
  };
}

/** Dropdown data for the general "Record payment" dialog. */
export async function paymentDialogData(user: CurrentUser) {
  const [accounts, projects, suppliers, workers, engineers, contractors] = await Promise.all([
    accountOptions(user),
    projectOptions(user),
    supplierOptions(),
    workerOptions(),
    engineerOptions(),
    contractorOptions(),
  ]);
  const opt = (rows: { id: string; name: string }[]) => rows.map((r) => ({ value: r.id, label: r.name }));
  return {
    accounts,
    projects: projects.map((p) => ({ value: p.id, label: p.name })),
    people: { SUPPLIER: opt(suppliers), LABOUR: opt(workers), ENGINEER: opt(engineers), CONTRACTOR: opt(contractors) },
  };
}
