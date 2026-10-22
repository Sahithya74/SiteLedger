import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { CircleDollarSign } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { FilterBar } from "@/components/app/filter-bar";
import { Money } from "@/components/app/money";
import { NoAccess } from "@/components/app/no-access";
import { PageHeader, Section } from "@/components/app/page-header";
import { Cell2, SimpleTable } from "@/components/app/simple-table";
import { PageSkeleton } from "@/components/app/skeletons";
import { StatTile } from "@/components/app/stat-tile";
import { Button } from "@/components/ui/button";
import { clientPaymentDialogData } from "@/features/money/dialog-data";
import { ClientPaymentDialog, OtherIncomeDialog } from "@/features/money/money-dialogs";
import { AccountsTabs } from "@/features/money/nav";
import { formatDate } from "@/lib/dates";
import { PAYMENT_METHOD } from "@/lib/labels";
import { sumPaise } from "@/lib/money";
import { resolvePeriod } from "@/lib/period";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";
import { listClientPayments, listOtherIncome } from "@/server/services/money-lists";

export const metadata: Metadata = { title: "Money in" };

export default function IncomePage(props: PageProps<"/accounts/income">) {
  return (
    <Suspense fallback={<PageSkeleton tiles={3} rows={8} />}>
      <Income searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Income({ searchParams }: { searchParams: PageProps<"/accounts/income">["searchParams"] }) {
  const user = await requireUser();
  if (!can(user, "projects.viewMoney") && !can(user, "clientPayments.record")) return <NoAccess />;
  const sp = await searchParams;
  const period = resolvePeriod(sp, "this-fy");
  const canRecord = can(user, "clientPayments.record");
  const [clientPayments, other, dialog] = await Promise.all([
    listClientPayments(user, { from: period.from, to: period.to }),
    listOtherIncome(user, { from: period.from, to: period.to }),
    canRecord ? clientPaymentDialogData(user) : Promise.resolve(null),
  ]);
  const fromClients = sumPaise(clientPayments.map((p) => p.amountPaise));
  const otherTotal = sumPaise(other.map((p) => p.amountPaise));
  const byProject = new Map<string, { id: string; name: string; total: bigint; count: number }>();
  for (const p of clientPayments) {
    const row = byProject.get(p.project.id) ?? { id: p.project.id, name: p.project.name, total: 0n, count: 0 };
    row.total += p.amountPaise;
    row.count += p.reversalOfId ? 0 : 1;
    byProject.set(p.project.id, row);
  }

  return (
    <div className="page-enter flex flex-col gap-5">
      <PageHeader
        title="Money in"
        description={`Client payments and other income · ${period.label}`}
        className="mb-0"
        actions={
          dialog && (
            <>
              <ClientPaymentDialog projects={dialog.projects} invoices={dialog.invoices} accounts={dialog.accounts} />
              <OtherIncomeDialog accounts={dialog.accounts} projects={dialog.projects.map((p) => ({ value: p.value, label: p.label }))} />
            </>
          )
        }
      />
      <AccountsTabs showBanks={can(user, "bank.viewBalances")} />
      <FilterBar action="/accounts/income" values={sp} fields={[{ type: "period" }]} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatTile label="From clients" value={<Money paise={fromClients} short />} tone="good" href="/clients/payments" />
        <StatTile label="Other income" value={<Money paise={otherTotal} short />} sub="Scrap sales, hire, refunds…" />
        <StatTile label="Total in" value={<Money paise={fromClients + otherTotal} short />} />
      </div>

      <Section
        title="From clients, by project"
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/clients/payments">All client payments</Link>
          </Button>
        }
      >
        {byProject.size === 0 ? (
          <p className="text-sm text-muted-foreground">No client payments in this period.</p>
        ) : (
          <SimpleTable
            rows={[...byProject.values()].sort((a, b) => (b.total > a.total ? 1 : -1))}
            rowKey={(r) => r.id}
            columns={[
              { header: "Project", cell: (r) => <Link href={`/clients/payments?project=${r.id}`} className="font-medium hover:underline">{r.name}</Link> },
              { header: "Payments", align: "right", cell: (r) => r.count },
              { header: "Received", align: "right", cell: (r) => <Money paise={r.total} wholeRupees /> },
            ]}
            footer={["Total", null, <Money key="t" paise={fromClients} wholeRupees />]}
          />
        )}
      </Section>

      <Section title="Other income">
        {other.length === 0 ? (
          <EmptyState icon={CircleDollarSign} title="No other income" description="Record money that is not from a client: selling scrap, hiring out equipment, deposits returned." className="py-8" />
        ) : (
          <SimpleTable
            rows={other}
            rowKey={(r) => r.id}
            rowClassName={(r) => (r.reversalOfId || r.reversedBy ? "text-muted-foreground" : undefined)}
            columns={[
              { header: "No.", cell: (r) => <Cell2 main={r.number} sub={formatDate(r.date)} /> },
              { header: "From / for", cell: (r) => <Cell2 main={r.source} sub={r.project?.name} /> },
              { header: "How", hide: "md", cell: (r) => <Cell2 main={PAYMENT_METHOD[r.method]} sub={[r.account.name, r.reference].filter(Boolean).join(" · ")} /> },
              { header: "Amount", align: "right", cell: (r) => <Money paise={r.amountPaise} colorNegative /> },
            ]}
          />
        )}
      </Section>
    </div>
  );
}
