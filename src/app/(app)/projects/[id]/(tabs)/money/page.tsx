import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Check, Plus, X } from "lucide-react";
import { ToneBadge } from "@/components/app/badges";
import { ConfirmAction } from "@/components/app/confirm-action";
import { Money } from "@/components/app/money";
import { NoAccess } from "@/components/app/no-access";
import { Section } from "@/components/app/page-header";
import { Cell2, SimpleTable } from "@/components/app/simple-table";
import { TableSkeleton } from "@/components/app/skeletons";
import { StatTile } from "@/components/app/stat-tile";
import { Button } from "@/components/ui/button";
import { decideVariationAction } from "@/features/billing/actions";
import { BudgetDialog, VariationDialog } from "@/features/billing/project-money-widgets";
import { clientPaymentDialogData, expenseDialogData } from "@/features/money/dialog-data";
import { ClientPaymentDialog, ExpenseDialog } from "@/features/money/money-dialogs";
import type { CostGroup } from "@/generated/prisma/enums";
import { formatDate } from "@/lib/dates";
import { INVOICE_KIND, VARIATION_STATUS } from "@/lib/labels";
import { formatINR, paiseToInput, sumPaise, type Paise } from "@/lib/money";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/auth/current-user";
import { listInvoices } from "@/server/services/billing";
import { listClientPayments, listExpenses } from "@/server/services/money-lists";
import { loadProjectMoney, type CostBreakdown } from "@/server/services/project-money";
import { getProject } from "@/server/services/projects";
import { getBudgets, listVariations } from "@/server/services/variations";

export const metadata: Metadata = { title: "Project money" };

/** Cost heads as tracked on a project, with the budget groups that feed each one. */
const HEADS: { key: keyof CostBreakdown; label: string; groups: CostGroup[] }[] = [
  { key: "materials", label: "Materials", groups: ["MATERIALS"] },
  { key: "labour", label: "Labour (workers)", groups: ["LABOUR"] },
  { key: "contractors", label: "Labour contractors", groups: ["CONTRACTORS"] },
  { key: "engineers", label: "Engineers", groups: ["ENGINEERS"] },
  { key: "transport", label: "Transport", groups: ["TRANSPORT"] },
  { key: "foodWelfare", label: "Food & welfare", groups: ["FOOD_WELFARE"] },
  { key: "equipment", label: "Equipment", groups: ["EQUIPMENT"] },
  { key: "other", label: "Rent, electricity & other", groups: ["OTHER", "RENT", "ELECTRICITY"] },
];

export default function ProjectMoneyPage(props: PageProps<"/projects/[id]/money">) {
  return (
    <Suspense fallback={<TableSkeleton rows={10} />}>
      <ProjectMoney params={props.params} />
    </Suspense>
  );
}

async function ProjectMoney({ params }: { params: PageProps<"/projects/[id]/money">["params"] }) {
  const { id } = await params;
  const user = await requireUser();
  if (!can(user, "projects.viewMoney")) return <NoAccess message="Ask the owner for permission to see project money." />;
  const project = await getProject(user, id);
  if (!project) return null;
  const [moneyMap, budgets, variations, bills, payments, expenses, payDialog, expDialog] = await Promise.all([
    loadProjectMoney([id]),
    getBudgets(id),
    listVariations(id),
    listInvoices(user, { projectId: id }),
    listClientPayments(user, { projectId: id }),
    listExpenses(user, { projectId: id }),
    can(user, "clientPayments.record") ? clientPaymentDialogData(user) : Promise.resolve(null),
    can(user, "expenses.record") ? expenseDialogData(user) : Promise.resolve(null),
  ]);
  const m = moneyMap.get(id)!;
  const budgetOf = (groups: CostGroup[]): Paise => sumPaise(budgets.filter((b) => groups.includes(b.group)).map((b) => b.budgetPaise));
  const totalBudget = sumPaise(budgets.map((b) => b.budgetPaise));
  const manageBilling = can(user, "quotations.manage");
  const approvedExtra = sumPaise(variations.filter((v) => v.status === "APPROVED").map((v) => v.amountPaise));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2">
        {payDialog && (
          <ClientPaymentDialog projects={payDialog.projects.filter((p) => p.value === id)} invoices={payDialog.invoices} accounts={payDialog.accounts} defaultProjectId={id} />
        )}
        {expDialog && <ExpenseDialog categories={expDialog.categories} projects={expDialog.projects} accounts={expDialog.accounts} allowOffice={false} defaultProjectId={id} />}
        {manageBilling && (
          <Button asChild variant="outline" size="lg">
            <Link href={`/clients/bills/new?project=${id}`}>
              <Plus className="size-4" /> New client bill
            </Link>
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Project value" value={<Money paise={m.money.projectValuePaise} short />} sub={approvedExtra !== 0n ? `incl. ${formatINR(approvedExtra, { paise: false })} extra work` : "Contract value"} />
        <StatTile label="Received" value={<Money paise={m.money.receivedPaise} short />} tone="good" sub={`Pending ${formatINR(m.money.pendingFromClientPaise, { paise: false })}`} />
        <StatTile label="Spent so far" value={<Money paise={m.money.spentPaise} short />} sub={totalBudget > 0n ? `of ${formatINR(totalBudget, { paise: false })} budget` : "No budget set"} tone={totalBudget > 0n && m.money.spentPaise > totalBudget ? "bad" : "default"} />
        <StatTile label="Expected profit" value={<Money paise={m.money.estimatedProfitPaise} short />} tone={m.money.estimatedProfitPaise < 0n ? "bad" : "good"} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section
          title="Budget vs spent"
          description="Spent includes unpaid bills and wages earned."
          actions={
            can(user, "projects.edit") && (
              <BudgetDialog
                projectId={id}
                groups={HEADS.map((h) => ({ group: h.groups[0], label: h.label, value: (() => { const b = budgetOf([h.groups[0]]); return b > 0n ? paiseToInput(b) : ""; })() }))}
              />
            )
          }
        >
          <ul className="flex flex-col gap-3">
            {HEADS.map((h) => {
              const spent = m.costs[h.key];
              const budget = budgetOf(h.groups);
              const pct = budget > 0n ? Number((spent * 100n) / budget) : null;
              if (spent === 0n && budget === 0n) return null;
              return (
                <li key={h.key} className="flex flex-col gap-1 text-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">{h.label}</span>
                    <span className="tabular text-muted-foreground">
                      <Money paise={spent} wholeRupees className="text-foreground" />
                      {budget > 0n && <> / {formatINR(budget, { paise: false })}</>}
                    </span>
                  </div>
                  {pct !== null && (
                    <div className="h-2 overflow-hidden rounded-full bg-stone-100" role="img" aria-label={`${pct}% of budget used`}>
                      <div className={cn("h-full rounded-full", pct > 100 ? "bg-red-600" : pct > 85 ? "bg-amber-500" : "bg-emerald-600")} style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                  )}
                  {pct !== null && pct > 100 && <span className="text-xs text-red-700">Over budget by {formatINR(spent - budget, { paise: false })}</span>}
                </li>
              );
            })}
          </ul>
        </Section>

        <Section title="Extra work (variations)" description="Approved extra work is added to the project value." actions={manageBilling && <VariationDialog projectId={id} />}>
          {variations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No extra work recorded.</p>
          ) : (
            <ul className="flex flex-col divide-y text-sm">
              {variations.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <div className="font-medium">
                      #{v.number} {v.title}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Asked {formatDate(v.requestedOn)}
                      {v.decidedOn && ` · decided ${formatDate(v.decidedOn)}`}
                      {v.description && ` · ${v.description}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Money paise={v.amountPaise} wholeRupees colorNegative />
                    <ToneBadge tone={VARIATION_STATUS[v.status].tone}>{VARIATION_STATUS[v.status].label}</ToneBadge>
                    {manageBilling && v.status === "PROPOSED" && (
                      <>
                        <ConfirmAction
                          trigger={
                            <Button size="icon" variant="ghost" aria-label="Client approved">
                              <Check className="size-4 text-emerald-700" />
                            </Button>
                          }
                          title="Client approved this extra work?"
                          description={`${formatINR(v.amountPaise)} is added to the project value.`}
                          confirmLabel="Approved"
                          reason={{ label: "Note (optional)", placeholder: "e.g. Approved on phone, confirmation by WhatsApp" }}
                          action={decideVariationAction.bind(null, v.id, "APPROVED")}
                        />
                        <ConfirmAction
                          trigger={
                            <Button size="icon" variant="ghost" aria-label="Client rejected">
                              <X className="size-4" />
                            </Button>
                          }
                          title="Client rejected this extra work?"
                          description="It stays on record and does not change the project value."
                          confirmLabel="Rejected"
                          reason={{ label: "Note (optional)" }}
                          action={decideVariationAction.bind(null, v.id, "REJECTED")}
                        />
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Section
        title="Client bills"
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href={`/clients/bills?project=${id}`}>All bills</Link>
          </Button>
        }
      >
        {bills.length === 0 ? (
          <p className="text-sm text-muted-foreground">No bills raised for this project yet.</p>
        ) : (
          <SimpleTable
            rows={bills.slice(0, 8)}
            rowKey={(b) => b.id}
            rowClassName={(b) => (b.overdue ? "bg-red-50/60" : b.status === "CANCELLED" ? "text-muted-foreground" : undefined)}
            columns={[
              { header: "Bill", cell: (b) => <Cell2 main={<Link href={`/clients/bills/${b.id}`} className="hover:underline">{b.number}{b.raNumber ? ` · RA-${b.raNumber}` : ""}</Link>} sub={`${INVOICE_KIND[b.kind]} · ${formatDate(b.date)}`} /> },
              { header: "Stage", hide: "md", cell: (b) => b.milestone ?? "—" },
              { header: "Amount", align: "right", cell: (b) => <Money paise={b.totalPaise} wholeRupees /> },
              { header: "Due", align: "right", cell: (b) => (b.status === "ISSUED" ? <Money paise={b.outstandingPaise} wholeRupees className={b.overdue ? "font-semibold text-red-700" : undefined} /> : b.status === "DRAFT" ? "Draft" : "Cancelled") },
            ]}
          />
        )}
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section
          title="Payments received"
          actions={
            <Button asChild variant="ghost" size="sm">
              <Link href={`/clients/payments?project=${id}&period=all`}>All</Link>
            </Button>
          }
        >
          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing received yet.</p>
          ) : (
            <SimpleTable
              rows={payments.slice(0, 8)}
              rowKey={(p) => p.id}
              columns={[
                { header: "Date", cell: (p) => <Cell2 main={formatDate(p.date)} sub={p.receiptNumber} /> },
                { header: "For", hide: "sm", cell: (p) => p.milestone ?? p.invoice?.number ?? "—" },
                { header: "Amount", align: "right", cell: (p) => <Money paise={p.amountPaise} colorNegative /> },
              ]}
            />
          )}
        </Section>
        <Section
          title="Recent expenses"
          actions={
            <Button asChild variant="ghost" size="sm">
              <Link href={`/accounts/expenses?project=${id}&period=all`}>All</Link>
            </Button>
          }
        >
          {expenses.length === 0 ? (
            <p className="text-sm text-muted-foreground">No expenses recorded.</p>
          ) : (
            <SimpleTable
              rows={expenses.slice(0, 8)}
              rowKey={(e) => e.id}
              columns={[
                { header: "Date", cell: (e) => formatDate(e.date) },
                { header: "What", cell: (e) => <Cell2 main={e.description} sub={e.category.name} /> },
                { header: "Amount", align: "right", cell: (e) => <Money paise={e.amountPaise} colorNegative /> },
              ]}
            />
          )}
        </Section>
      </div>
    </div>
  );
}
