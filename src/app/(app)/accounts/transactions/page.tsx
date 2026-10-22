import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { FilterBar, param } from "@/components/app/filter-bar";
import { Money } from "@/components/app/money";
import { NoAccess } from "@/components/app/no-access";
import { PageHeader } from "@/components/app/page-header";
import { Cell2, SimpleTable } from "@/components/app/simple-table";
import { PageSkeleton } from "@/components/app/skeletons";
import { StatTile } from "@/components/app/stat-tile";
import { Button } from "@/components/ui/button";
import { AccountsTabs } from "@/features/money/nav";
import type { LedgerSource } from "@/generated/prisma/enums";
import { formatDate } from "@/lib/dates";
import { sumPaise } from "@/lib/money";
import { resolvePeriod } from "@/lib/period";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";
import { listAccounts } from "@/server/services/banks";
import { ledgerEntries } from "@/server/services/money-lists";

export const metadata: Metadata = { title: "All transactions" };

const SOURCE: Record<LedgerSource, string> = {
  CLIENT_PAYMENT: "Client payments",
  PAYMENT: "Payments made",
  EXPENSE: "Expenses",
  OTHER_INCOME: "Other income",
  TRANSFER: "Transfers",
};

export default function TransactionsPage(props: PageProps<"/accounts/transactions">) {
  return (
    <Suspense fallback={<PageSkeleton tiles={3} rows={14} />}>
      <Transactions searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Transactions({ searchParams }: { searchParams: PageProps<"/accounts/transactions">["searchParams"] }) {
  const user = await requireUser();
  if (!can(user, "bank.viewBalances")) return <NoAccess />;
  const sp = await searchParams;
  const period = resolvePeriod(sp, "this-month");
  const source = param(sp, "source") as LedgerSource | undefined;
  const [rows, accounts] = await Promise.all([
    ledgerEntries(user, { from: period.from, to: period.to, accountId: param(sp, "account"), source: source && source in SOURCE ? source : undefined }),
    listAccounts(user),
  ]);
  const inPaise = sumPaise(rows.filter((r) => r.amountPaise > 0n).map((r) => r.amountPaise));
  const outPaise = -sumPaise(rows.filter((r) => r.amountPaise < 0n).map((r) => r.amountPaise));
  const csv = new URLSearchParams({ report: "ledger", ...(Object.fromEntries(Object.entries(sp).filter(([, v]) => typeof v === "string")) as Record<string, string>) });

  return (
    <div className="page-enter flex flex-col gap-5">
      <PageHeader
        title="All transactions"
        description={`Every entry in every bank and cash account · ${period.label}`}
        className="mb-0"
        actions={
          can(user, "reports.view") && (
            <Button asChild variant="outline" size="lg">
              <a href={`/api/export?${csv.toString()}`}>
                <Download className="size-4" /> Download CSV
              </a>
            </Button>
          )
        }
      />
      <AccountsTabs />
      <FilterBar
        action="/accounts/transactions"
        values={sp}
        fields={[
          { type: "period", fallback: "this-month" },
          { type: "select", name: "account", label: "Account", options: accounts.map((a) => ({ value: a.id, label: a.name })) },
          { type: "select", name: "source", label: "Type", options: Object.entries(SOURCE).map(([value, label]) => ({ value, label })) },
        ]}
      />
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="In" value={<Money paise={inPaise} short />} tone="good" />
        <StatTile label="Out" value={<Money paise={outPaise} short />} />
        <StatTile label="Entries" value={rows.length} sub={rows.length >= 1000 ? "Showing the latest 1,000" : undefined} />
      </div>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">No entries in this period.</p>
      ) : (
        <SimpleTable
          rows={rows}
          rowKey={(r) => r.id}
          columns={[
            { header: "Date", cell: (r) => formatDate(r.date) },
            { header: "Details", cell: (r) => <Cell2 main={r.description} sub={[SOURCE[r.source], r.reference].filter(Boolean).join(" · ")} /> },
            { header: "Account", hide: "md", cell: (r) => <Link href={`/accounts/banks/${r.account.id}`} className="hover:underline">{r.account.name}</Link> },
            { header: "In", align: "right", cell: (r) => (r.amountPaise > 0n ? <Money paise={r.amountPaise} className="text-emerald-700" /> : null) },
            { header: "Out", align: "right", cell: (r) => (r.amountPaise < 0n ? <Money paise={-r.amountPaise} /> : null) },
          ]}
        />
      )}
    </div>
  );
}
