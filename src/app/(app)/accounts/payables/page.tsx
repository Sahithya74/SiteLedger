import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Money } from "@/components/app/money";
import { NoAccess } from "@/components/app/no-access";
import { PageHeader, Section } from "@/components/app/page-header";
import { Cell2, SimpleTable } from "@/components/app/simple-table";
import { PageSkeleton } from "@/components/app/skeletons";
import { StatTile } from "@/components/app/stat-tile";
import { Button } from "@/components/ui/button";
import { AccountsTabs } from "@/features/money/nav";
import { describeDue, formatDate, todayIST } from "@/lib/dates";
import { sumPaise } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";
import { payablesDetail } from "@/server/services/accounts";

export const metadata: Metadata = { title: "We owe" };

export default function PayablesPage() {
  return (
    <Suspense fallback={<PageSkeleton tiles={4} rows={8} />}>
      <Payables />
    </Suspense>
  );
}

async function Payables() {
  const user = await requireUser();
  if (!can(user, "payments.record") && !can(user, "bank.viewBalances")) return <NoAccess />;
  const p = await payablesDetail(user);
  const today = todayIST();
  const suppliers = sumPaise(p.suppliers.map((s) => s.owedPaise));
  const contractors = sumPaise(p.contractors.map((c) => c.owedPaise));
  const overdueBills = p.billsDue.filter((b) => b.dueDate < today);

  return (
    <div className="page-enter flex flex-col gap-5">
      <PageHeader title="We owe" description="Everything the business still has to pay." className="mb-0" />
      <AccountsTabs showBanks={can(user, "bank.viewBalances")} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Suppliers" value={<Money paise={suppliers} short />} sub={`${p.suppliers.length} suppliers`} tone={suppliers > 0n ? "warn" : "good"} />
        <StatTile label="Overdue supplier bills" value={overdueBills.length} sub={<Money paise={sumPaise(overdueBills.map((b) => b.balancePaise))} short />} tone={overdueBills.length ? "bad" : "good"} />
        <StatTile label="Contractors" value={<Money paise={contractors} short />} sub="Approved bills not paid" href="/labour/contractors" />
        <StatTile label="Wages pending" value={<Money paise={p.wages.totalPaise} short />} sub={`${p.wages.workers} workers`} href="/labour/wages" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Supplier bills by due date">
          {p.billsDue.length === 0 ? (
            <p className="text-sm text-muted-foreground">No unpaid supplier bills with a due date.</p>
          ) : (
            <SimpleTable
              rows={p.billsDue}
              rowKey={(b) => b.id}
              rowClassName={(b) => (b.dueDate < today ? "bg-red-50/60" : undefined)}
              columns={[
                { header: "Bill", cell: (b) => <Cell2 main={<Link href={`/materials/purchases/${b.id}`} className="hover:underline">{b.number}</Link>} sub={b.supplier.name} /> },
                { header: "Due", cell: (b) => <Cell2 main={formatDate(b.dueDate)} sub={describeDue(b.dueDate)} /> },
                { header: "Balance", align: "right", cell: (b) => <Money paise={b.balancePaise} wholeRupees /> },
              ]}
            />
          )}
        </Section>
        <div className="flex flex-col gap-5">
          <Section title="Suppliers">
            {p.suppliers.length === 0 ? (
              <p className="text-sm text-muted-foreground">All suppliers are paid.</p>
            ) : (
              <SimpleTable
                rows={p.suppliers}
                rowKey={(s) => s.id}
                columns={[
                  { header: "Supplier", cell: (s) => <Link href={`/materials/suppliers/${s.id}`} className="font-medium hover:underline">{s.name}</Link> },
                  { header: "We owe", align: "right", cell: (s) => <Money paise={s.owedPaise} wholeRupees /> },
                ]}
                footer={["Total", <Money key="t" paise={suppliers} wholeRupees />]}
              />
            )}
          </Section>
          <Section
            title="Labour contractors"
            actions={
              <Button asChild variant="outline" size="sm">
                <Link href="/labour/contractors">Contractors</Link>
              </Button>
            }
          >
            {p.contractors.length === 0 ? (
              <p className="text-sm text-muted-foreground">No approved contractor bills are waiting.</p>
            ) : (
              <SimpleTable
                rows={p.contractors}
                rowKey={(c) => c.id}
                columns={[
                  { header: "Contractor", cell: (c) => <Link href={`/labour/contractors/${c.id}`} className="font-medium hover:underline">{c.name}</Link> },
                  { header: "We owe", align: "right", cell: (c) => <Money paise={c.owedPaise} wholeRupees /> },
                ]}
              />
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
