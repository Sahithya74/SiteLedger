import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { FilterBar } from "@/components/app/filter-bar";
import { Money } from "@/components/app/money";
import { NoAccess } from "@/components/app/no-access";
import { PageHeader, Section } from "@/components/app/page-header";
import { Cell2, SimpleTable } from "@/components/app/simple-table";
import { PageSkeleton } from "@/components/app/skeletons";
import { StatTile } from "@/components/app/stat-tile";
import { CashflowChart } from "@/features/dashboard/cashflow-chart";
import { AccountsTabs } from "@/features/money/nav";
import type { CostGroup } from "@/generated/prisma/enums";
import { COST_GROUP, PROJECT_STATUS } from "@/lib/labels";
import { resolvePeriod } from "@/lib/period";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";
import { accountsOverview } from "@/server/services/accounts";

export const metadata: Metadata = { title: "Accounts" };

export default function AccountsPage(props: PageProps<"/accounts">) {
  return (
    <Suspense fallback={<PageSkeleton tiles={4} rows={8} />}>
      <Accounts searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Accounts({ searchParams }: { searchParams: PageProps<"/accounts">["searchParams"] }) {
  const user = await requireUser();
  if (!can(user, "bank.viewBalances") && !can(user, "reports.view")) return <NoAccess />;
  const sp = await searchParams;
  const period = resolvePeriod(sp, "this-fy");
  const o = await accountsOverview(user, period);
  const showBanks = can(user, "bank.viewBalances");
  const net = o.flows.inPaise - o.flows.outPaise;

  return (
    <div className="page-enter flex flex-col gap-5">
      <PageHeader title="Accounts" description={`Where the money is, what came in and went out · ${period.label}`} className="mb-0" />
      <AccountsTabs showBanks={showBanks} />
      <FilterBar action="/accounts" values={sp} fields={[{ type: "period" }]} />

      {showBanks && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile label="In bank" value={<Money paise={o.cash.bankPaise} short />} href="/accounts/banks" />
          <StatTile label="Cash in office" value={<Money paise={o.cash.cashPaise} short />} href="/accounts/banks" />
          <StatTile label="Site cash" value={<Money paise={o.cash.siteCashPaise} short />} sub="With managers" href="/accounts/banks" />
          <StatTile label="Total available" value={<Money paise={o.cash.bankPaise + o.cash.cashPaise + o.cash.siteCashPaise} short />} tone="good" />
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Money in" value={<Money paise={o.flows.inPaise} short />} sub="Client payments + other income" tone="good" href="/accounts/income" />
        <StatTile label="Money out" value={<Money paise={o.flows.outPaise} short />} sub="Payments + expenses" href="/accounts/payments" />
        <StatTile label="Net cash flow" value={<Money paise={net} short />} tone={net < 0n ? "bad" : "good"} />
        <StatTile label="Materials bought" value={<Money paise={o.purchasesPaise} short />} sub="Bills, paid or not" href="/materials/purchases" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Clients owe us" value={<Money paise={o.receivablePaise} short />} sub="Contract value − received" tone="warn" href="/clients/pending" />
        <StatTile label="Overdue from clients" value={<Money paise={o.overdueReceivablePaise} short />} tone={o.overdueReceivablePaise > 0n ? "bad" : "good"} href="/clients/pending" />
        <StatTile label="We owe" value={<Money paise={o.payables.totalPaise} short />} sub="Suppliers, contractors, wages" tone="warn" href="/accounts/payables" />
        <StatTile label="Pending wages" value={<Money paise={o.payables.wagesPaise} short />} href="/labour/wages" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        <Section title="Money in and out" description="Last 12 months">
          <CashflowChart data={o.trend} caption="Last 12 months" />
        </Section>
        <Section title="Expenses by head" description={period.label}>
          {o.expenseGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">No expenses in this period.</p>
          ) : (
            <ul className="flex flex-col divide-y text-sm">
              {o.expenseGroups.map((g) => (
                <li key={g.group} className="flex items-center justify-between gap-3 py-2">
                  <Link href={`/accounts/expenses?group=${g.group}`} className="hover:underline">
                    {COST_GROUP[g.group as CostGroup] ?? g.group}
                  </Link>
                  <Money paise={g.totalPaise} wholeRupees />
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Section title="Profit by project" description="Received and spent so far, and the expected profit at the end (contract value − estimated total cost).">
        <SimpleTable
          rows={o.profitability}
          rowKey={(p) => p.id}
          columns={[
            { header: "Project", cell: (p) => <Cell2 main={<Link href={`/projects/${p.id}`} className="hover:underline">{p.name}</Link>} sub={PROJECT_STATUS[p.status].label} /> },
            { header: "Value", align: "right", hide: "md", cell: (p) => <Money paise={p.valuePaise} short /> },
            { header: "Received", align: "right", cell: (p) => <Money paise={p.receivedPaise} short /> },
            { header: "Spent", align: "right", cell: (p) => <Money paise={p.spentPaise} short /> },
            { header: "Cash position", align: "right", hide: "sm", cell: (p) => <Money paise={p.profitSoFarPaise} short colorNegative /> },
            {
              header: "Expected profit",
              align: "right",
              cell: (p) => (
                <div className="flex flex-col items-end">
                  <Money paise={p.estimatedProfitPaise} short colorNegative />
                  {p.margin !== null && <span className="text-xs text-muted-foreground">{p.margin}%</span>}
                </div>
              ),
            },
          ]}
        />
      </Section>
    </div>
  );
}
