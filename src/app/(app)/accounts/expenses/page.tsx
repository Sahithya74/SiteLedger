import { Suspense } from "react";
import type { Metadata } from "next";
import { Eye, EyeOff, Receipt, Undo2 } from "lucide-react";
import { ToneBadge } from "@/components/app/badges";
import { ConfirmAction } from "@/components/app/confirm-action";
import { EmptyState } from "@/components/app/empty-state";
import { FilterBar, param } from "@/components/app/filter-bar";
import { Money } from "@/components/app/money";
import { PageHeader, Section } from "@/components/app/page-header";
import { Cell2, SimpleTable } from "@/components/app/simple-table";
import { PageSkeleton } from "@/components/app/skeletons";
import { StatTile } from "@/components/app/stat-tile";
import { Button } from "@/components/ui/button";
import { reverseExpenseAction, toggleExpenseCategoryAction } from "@/features/money/actions";
import { expenseDialogData } from "@/features/money/dialog-data";
import { AddExpenseCategoryDialog, ExpenseDialog } from "@/features/money/money-dialogs";
import { AccountsTabs } from "@/features/money/nav";
import type { CostGroup } from "@/generated/prisma/enums";
import { formatDate } from "@/lib/dates";
import { formatQuantity } from "@/lib/format";
import { COST_GROUP, PAYMENT_METHOD } from "@/lib/labels";
import { formatINR, sumPaise } from "@/lib/money";
import { resolvePeriod } from "@/lib/period";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";
import { expenseCategories, listExpenses } from "@/server/services/money-lists";
import { projectOptions } from "@/server/services/projects";

export const metadata: Metadata = { title: "Expenses" };

export default function ExpensesPage(props: PageProps<"/accounts/expenses">) {
  return (
    <Suspense fallback={<PageSkeleton tiles={4} rows={10} />}>
      <Expenses searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Expenses({ searchParams }: { searchParams: PageProps<"/accounts/expenses">["searchParams"] }) {
  const user = await requireUser();
  const sp = await searchParams;
  const period = resolvePeriod(sp, "this-month");
  const projectParam = param(sp, "project");
  const group = param(sp, "group") as CostGroup | undefined;
  const [rows, categories, allCategories, projects, dialog] = await Promise.all([
    listExpenses(user, { from: period.from, to: period.to, office: projectParam === "office", projectId: projectParam === "office" ? undefined : projectParam, categoryId: param(sp, "category") }),
    expenseCategories(),
    user.role === "ADMIN" ? expenseCategories(true) : Promise.resolve([]),
    projectOptions(user, { includeClosed: true }),
    can(user, "expenses.record") ? expenseDialogData(user) : Promise.resolve(null),
  ]);
  const shown = group ? rows.filter((r) => r.category.group === group) : rows;
  const live = shown.filter((r) => !r.reversalOfId && !r.reversedBy);
  const total = sumPaise(shown.map((r) => r.amountPaise));
  const welfare = sumPaise(shown.filter((r) => r.category.isWelfare).map((r) => r.amountPaise));
  const office = sumPaise(shown.filter((r) => !r.project).map((r) => r.amountPaise));
  const byGroup = new Map<string, bigint>();
  for (const r of shown) byGroup.set(r.category.group, (byGroup.get(r.category.group) ?? 0n) + r.amountPaise);
  const topGroup = [...byGroup.entries()].sort((a, b) => (b[1] > a[1] ? 1 : -1))[0];

  return (
    <div className="page-enter flex flex-col gap-5">
      <PageHeader
        title="Expenses"
        description={`Transport, food, water, rent, fuel and other spending · ${period.label}`}
        className="mb-0"
        actions={dialog && <ExpenseDialog categories={dialog.categories} projects={dialog.projects} accounts={dialog.accounts} allowOffice={dialog.allowOffice} defaultProjectId={projectParam && projectParam !== "office" ? projectParam : undefined} />}
      />
      <AccountsTabs showBanks={can(user, "bank.viewBalances")} />
      <FilterBar
        action="/accounts/expenses"
        values={sp}
        fields={[
          { type: "period", fallback: "this-month" },
          { type: "select", name: "project", label: "For", options: [{ value: "office", label: "Office / company" }, ...projects.map((p) => ({ value: p.id, label: p.name }))] },
          { type: "select", name: "group", label: "Head", options: Object.entries(COST_GROUP).map(([value, label]) => ({ value, label })) },
          { type: "select", name: "category", label: "Category", options: categories.map((c) => ({ value: c.id, label: c.name })) },
        ]}
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Spent" value={<Money paise={total} short />} sub={`${live.length} entries`} />
        <StatTile label="Biggest head" value={topGroup ? COST_GROUP[topGroup[0] as CostGroup] : "—"} sub={topGroup ? formatINR(topGroup[1], { paise: false }) : undefined} />
        <StatTile label="Labour welfare" value={<Money paise={welfare} short />} sub="Food, water, stay" />
        <StatTile label="Office / company" value={<Money paise={office} short />} sub="Not charged to a project" />
      </div>
      {shown.length === 0 ? (
        <EmptyState icon={Receipt} title="No expenses in this period" description="Record expenses as they happen — from the office or from site cash. Each one reduces the chosen account." />
      ) : (
        <SimpleTable
          rows={shown}
          rowKey={(r) => r.id}
          rowClassName={(r) => (r.reversalOfId || r.reversedBy ? "text-muted-foreground" : undefined)}
          columns={[
            { header: "No.", cell: (r) => <Cell2 main={r.number} sub={formatDate(r.date)} /> },
            {
              header: "What",
              cell: (r) => (
                <Cell2
                  main={r.description}
                  sub={[r.category.name, r.quantity && r.unit ? formatQuantity(r.quantity.toString(), r.unit) : null, r.paidTo && `to ${r.paidTo}`].filter(Boolean).join(" · ")}
                />
              ),
            },
            { header: "For", hide: "md", cell: (r) => r.project?.name ?? <span className="text-muted-foreground">Office</span> },
            { header: "Paid", hide: "lg", cell: (r) => <Cell2 main={PAYMENT_METHOD[r.method]} sub={`${r.account.name} · by ${r.createdBy.name}`} /> },
            {
              header: "Amount",
              align: "right",
              cell: (r) => (
                <div className="flex flex-col items-end gap-0.5">
                  <Money paise={r.amountPaise} colorNegative />
                  {r.reversalOfId && <ToneBadge tone="grey">Reversal</ToneBadge>}
                  {r.reversedBy && <ToneBadge tone="grey">Reversed</ToneBadge>}
                </div>
              ),
            },
            {
              header: <span className="sr-only">Actions</span>,
              align: "right",
              cell: (r) =>
                can(user, "finance.reverse") && !r.reversalOfId && !r.reversedBy ? (
                  <ConfirmAction
                    trigger={
                      <Button variant="ghost" size="icon" aria-label={`Reverse ${r.number}`}>
                        <Undo2 className="size-4" />
                      </Button>
                    }
                    title={`Reverse expense ${r.number}?`}
                    description={`${formatINR(r.amountPaise)} goes back into ${r.account.name}. The original entry stays on record.`}
                    confirmLabel="Reverse expense"
                    destructive
                    reason={{ label: "Reason", required: true, placeholder: "e.g. Wrong amount — re-entered" }}
                    action={reverseExpenseAction.bind(null, r.id)}
                  />
                ) : null,
            },
          ]}
          footer={["Total", null, null, null, <Money key="t" paise={total} />, null]}
        />
      )}

      {user.role === "ADMIN" && (
        <Section
          title="Expense categories"
          description="Each category counts under a cost head in project profit and reports. Hidden categories stay on old entries."
          actions={<AddExpenseCategoryDialog groups={Object.entries(COST_GROUP).map(([value, label]) => ({ value, label }))} />}
        >
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {allCategories.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                <div className={c.isActive ? "" : "text-muted-foreground line-through"}>
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {COST_GROUP[c.group]}
                    {c.isWelfare && " · welfare"}
                  </div>
                </div>
                <ConfirmAction
                  trigger={
                    <Button variant="ghost" size="icon" aria-label={c.isActive ? `Hide ${c.name}` : `Show ${c.name}`}>
                      {c.isActive ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </Button>
                  }
                  title={c.isActive ? `Hide “${c.name}”?` : `Show “${c.name}” again?`}
                  description={c.isActive ? "It will no longer be offered when recording expenses." : "It will be offered again when recording expenses."}
                  confirmLabel={c.isActive ? "Hide" : "Show"}
                  action={toggleExpenseCategoryAction.bind(null, c.id, !c.isActive)}
                />
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
