import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { HandCoins, Printer, Undo2 } from "lucide-react";
import { ToneBadge } from "@/components/app/badges";
import { ConfirmAction } from "@/components/app/confirm-action";
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
import { reverseClientPaymentAction } from "@/features/money/actions";
import { clientPaymentDialogData } from "@/features/money/dialog-data";
import { ClientPaymentDialog } from "@/features/money/money-dialogs";
import { formatDate } from "@/lib/dates";
import { PAYMENT_METHOD } from "@/lib/labels";
import { formatINR, sumPaise } from "@/lib/money";
import { resolvePeriod } from "@/lib/period";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";
import { listClientPayments } from "@/server/services/money-lists";
import { projectOptions } from "@/server/services/projects";

export const metadata: Metadata = { title: "Payments received" };

export default function ClientPaymentsPage(props: PageProps<"/clients/payments">) {
  return (
    <Suspense fallback={<PageSkeleton tiles={3} rows={10} />}>
      <ClientPayments searchParams={props.searchParams} />
    </Suspense>
  );
}

async function ClientPayments({ searchParams }: { searchParams: PageProps<"/clients/payments">["searchParams"] }) {
  const user = await requireUser();
  if (!can(user, "projects.viewMoney") && !can(user, "clientPayments.record")) return <NoAccess />;
  const sp = await searchParams;
  const period = resolvePeriod(sp, "this-fy");
  const [rows, projects, dialog] = await Promise.all([
    listClientPayments(user, { from: period.from, to: period.to, projectId: param(sp, "project") }),
    projectOptions(user, { includeClosed: true }),
    can(user, "clientPayments.record") ? clientPaymentDialogData(user) : Promise.resolve(null),
  ]);
  const tds = sumPaise(rows.map((r) => r.tdsDeductedPaise));

  return (
    <div className="page-enter">
      <PageHeader
        title="Payments received"
        description={`Money received from clients · ${period.label}`}
        actions={dialog && <ClientPaymentDialog projects={dialog.projects} invoices={dialog.invoices} accounts={dialog.accounts} defaultProjectId={param(sp, "project")} />}
      />
      <ClientsTabs />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatTile label="Received" value={<Money paise={sumPaise(rows.map((r) => r.amountPaise))} short />} sub={`${rows.filter((r) => !r.reversalOfId).length} payments`} tone="good" />
        <StatTile label="TDS deducted by clients" value={<Money paise={tds} short />} sub="Claim it in your income tax return" />
        <StatTile label="Still to receive" value="See pending" href="/clients/pending" />
      </div>
      <FilterBar
        action="/clients/payments"
        values={sp}
        fields={[{ type: "period" }, { type: "select", name: "project", label: "Project", options: projects.map((p) => ({ value: p.id, label: p.name })) }]}
      />
      {rows.length === 0 ? (
        <EmptyState icon={HandCoins} title="No payments in this period" description="When a client pays, add it here. It goes into the bank or cash account and a receipt number is given." />
      ) : (
        <SimpleTable
          rows={rows}
          rowKey={(r) => r.id}
          rowClassName={(r) => (r.reversalOfId || r.reversedBy ? "text-muted-foreground" : undefined)}
          columns={[
            { header: "Receipt", cell: (r) => <Cell2 main={r.receiptNumber} sub={formatDate(r.date)} /> },
            {
              header: "From",
              cell: (r) => (
                <Cell2
                  main={
                    <Link href={`/projects/${r.project.id}`} className="hover:underline">
                      {r.project.name}
                    </Link>
                  }
                  sub={[r.client.name, r.milestone, r.invoice && `against ${r.invoice.number}`].filter(Boolean).join(" · ")}
                />
              ),
            },
            { header: "How", hide: "md", cell: (r) => <Cell2 main={PAYMENT_METHOD[r.method]} sub={[r.account.name, r.reference].filter(Boolean).join(" · ")} /> },
            {
              header: "Amount",
              align: "right",
              cell: (r) => (
                <div className="flex flex-col items-end">
                  <Money paise={r.amountPaise} colorNegative />
                  {r.tdsDeductedPaise !== 0n && <span className="text-xs text-muted-foreground">+ TDS {formatINR(r.tdsDeductedPaise, { paise: false })}</span>}
                  {r.reversalOfId && <ToneBadge tone="grey">Reversal</ToneBadge>}
                  {r.reversedBy && <ToneBadge tone="grey">Reversed</ToneBadge>}
                </div>
              ),
            },
            {
              header: <span className="sr-only">Actions</span>,
              align: "right",
              cell: (r) => (
                <div className="flex justify-end gap-1">
                  {!r.reversalOfId && (
                    <Button asChild variant="ghost" size="icon" aria-label={`Print receipt ${r.receiptNumber}`}>
                      <Link href={`/print/receipt/${r.id}`} target="_blank">
                        <Printer className="size-4" />
                      </Link>
                    </Button>
                  )}
                  {can(user, "finance.reverse") && !r.reversalOfId && !r.reversedBy && (
                    <ConfirmAction
                      trigger={
                        <Button variant="ghost" size="icon" aria-label={`Reverse ${r.receiptNumber}`}>
                          <Undo2 className="size-4" />
                        </Button>
                      }
                      title={`Reverse receipt ${r.receiptNumber}?`}
                      description={`Use this if the payment was entered by mistake or the cheque bounced. A minus entry of ${formatINR(r.amountPaise)} is added — the original stays on record.`}
                      confirmLabel="Reverse payment"
                      destructive
                      reason={{ label: "Reason", required: true, placeholder: "e.g. Entered twice" }}
                      action={reverseClientPaymentAction.bind(null, r.id)}
                    />
                  )}
                </div>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}
