import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Plus, ReceiptText } from "lucide-react";
import { ToneBadge } from "@/components/app/badges";
import { EmptyState } from "@/components/app/empty-state";
import { FilterBar, param } from "@/components/app/filter-bar";
import { Money } from "@/components/app/money";
import { NoAccess } from "@/components/app/no-access";
import { PageHeader } from "@/components/app/page-header";
import { Cell2, SimpleTable } from "@/components/app/simple-table";
import { PageSkeleton } from "@/components/app/skeletons";
import { StatTile } from "@/components/app/stat-tile";
import { Button } from "@/components/ui/button";
import { ClientsTabs } from "@/features/billing/nav";
import { describeDue, formatDate } from "@/lib/dates";
import { INVOICE_KIND, INVOICE_STATUS } from "@/lib/labels";
import { sumPaise } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";
import { listInvoices } from "@/server/services/billing";
import { projectOptions } from "@/server/services/projects";

export const metadata: Metadata = { title: "Client bills" };

export default function BillsPage(props: PageProps<"/clients/bills">) {
  return (
    <Suspense fallback={<PageSkeleton tiles={4} rows={8} />}>
      <Bills searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Bills({ searchParams }: { searchParams: PageProps<"/clients/bills">["searchParams"] }) {
  const user = await requireUser();
  if (!can(user, "quotations.manage") && !can(user, "projects.viewMoney")) return <NoAccess />;
  const sp = await searchParams;
  const status = param(sp, "status") as "DRAFT" | "ISSUED" | "CANCELLED" | undefined;
  const [rows, projects] = await Promise.all([
    listInvoices(user, { projectId: param(sp, "project"), status: status && status in INVOICE_STATUS ? status : undefined, outstandingOnly: param(sp, "due") === "1" }),
    projectOptions(user, { includeClosed: true }),
  ]);
  const issued = rows.filter((r) => r.status === "ISSUED");
  const overdue = issued.filter((r) => r.overdue);

  return (
    <div className="page-enter">
      <PageHeader
        title="Client bills"
        description="Running (RA) bills, advance requests and final bills sent to clients."
        actions={
          can(user, "quotations.manage") && (
            <Button asChild size="lg">
              <Link href="/clients/bills/new">
                <Plus className="size-4" /> New bill
              </Link>
            </Button>
          )
        }
      />
      <ClientsTabs overdue={overdue.length} />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Billed" value={<Money paise={sumPaise(issued.map((r) => r.totalPaise))} short />} sub={`${issued.length} bills issued`} />
        <StatTile label="Still due" value={<Money paise={sumPaise(issued.map((r) => r.outstandingPaise))} short />} tone="warn" href="/clients/bills?due=1" />
        <StatTile label="Overdue" value={<Money paise={sumPaise(overdue.map((r) => r.outstandingPaise))} short />} sub={`${overdue.length} bills`} tone={overdue.length ? "bad" : "default"} href="/clients/pending" />
        <StatTile label="Retention held" value={<Money paise={sumPaise(issued.map((r) => r.retentionPaise))} short />} sub="Released at handover" />
      </div>
      <FilterBar
        action="/clients/bills"
        values={sp}
        fields={[
          { type: "select", name: "project", label: "Project", options: projects.map((p) => ({ value: p.id, label: p.name })) },
          { type: "select", name: "status", label: "Status", options: Object.entries(INVOICE_STATUS).map(([value, s]) => ({ value, label: s.label })) },
          { type: "checkbox", name: "due", label: "Only bills with money due" },
        ]}
      />
      {rows.length === 0 ? (
        <EmptyState icon={ReceiptText} title="No bills here" description="Raise a running bill when a stage is complete. Client payments are applied to the oldest bill first." />
      ) : (
        <SimpleTable
          rows={rows}
          rowKey={(r) => r.id}
          rowClassName={(r) => (r.status === "CANCELLED" ? "text-muted-foreground line-through decoration-stone-300" : r.overdue ? "bg-red-50/60" : undefined)}
          columns={[
            {
              header: "Bill",
              cell: (r) => (
                <Cell2
                  main={
                    <Link href={`/clients/bills/${r.id}`} className="hover:underline">
                      {r.number}
                      {r.raNumber ? ` · RA-${r.raNumber}` : ""}
                    </Link>
                  }
                  sub={`${INVOICE_KIND[r.kind]} · ${formatDate(r.date)}`}
                />
              ),
            },
            { header: "Project", cell: (r) => <Cell2 main={r.project.name} sub={r.client.name} /> },
            { header: "Stage", hide: "lg", cell: (r) => r.milestone ?? "—" },
            {
              header: "Status",
              cell: (r) => (
                <div className="flex flex-col items-start gap-0.5">
                  <ToneBadge tone={r.overdue ? "red" : r.status === "ISSUED" && r.outstandingPaise === 0n ? "green" : INVOICE_STATUS[r.status].tone}>
                    {r.overdue ? "Overdue" : r.status === "ISSUED" && r.outstandingPaise === 0n ? "Paid" : INVOICE_STATUS[r.status].label}
                  </ToneBadge>
                  {r.status === "ISSUED" && r.outstandingPaise > 0n && r.dueDate && <span className="text-xs text-muted-foreground">{describeDue(r.dueDate)}</span>}
                </div>
              ),
            },
            { header: "Amount", align: "right", cell: (r) => <Money paise={r.totalPaise} wholeRupees /> },
            { header: "Due", align: "right", cell: (r) => (r.status === "ISSUED" ? <Money paise={r.outstandingPaise} wholeRupees /> : "—") },
          ]}
        />
      )}
    </div>
  );
}
