import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Printer, Send, XCircle } from "lucide-react";
import { ToneBadge } from "@/components/app/badges";
import { ConfirmAction } from "@/components/app/confirm-action";
import { ContactLinks } from "@/components/app/contact-links";
import { Money } from "@/components/app/money";
import { NoAccess, NotFoundPanel } from "@/components/app/no-access";
import { PageHeader, Section } from "@/components/app/page-header";
import { SimpleTable } from "@/components/app/simple-table";
import { PageSkeleton } from "@/components/app/skeletons";
import { StatTile } from "@/components/app/stat-tile";
import { Button } from "@/components/ui/button";
import { cancelInvoiceAction, issueInvoiceAction } from "@/features/billing/actions";
import { BillDocument } from "@/features/billing/bill-document";
import { clientPaymentDialogData } from "@/features/money/dialog-data";
import { ClientPaymentDialog } from "@/features/money/money-dialogs";
import { describeDue, formatDate } from "@/lib/dates";
import { INVOICE_KIND, INVOICE_STATUS, PAYMENT_METHOD } from "@/lib/labels";
import { formatINR } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";
import { getInvoice } from "@/server/services/billing";
import { companyProfile } from "@/server/services/users";

export const metadata: Metadata = { title: "Client bill" };

export default function BillPage(props: PageProps<"/clients/bills/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton tiles={3} />}>
      <Bill params={props.params} />
    </Suspense>
  );
}

async function Bill({ params }: { params: PageProps<"/clients/bills/[id]">["params"] }) {
  const user = await requireUser();
  if (!can(user, "quotations.manage") && !can(user, "projects.viewMoney")) return <NoAccess />;
  const { id } = await params;
  const [inv, company] = await Promise.all([getInvoice(user, id), companyProfile()]);
  if (!inv) return <NotFoundPanel what="bill" backHref="/clients/bills" backLabel="Back to bills" />;
  const manage = can(user, "quotations.manage");
  const canReceive = can(user, "clientPayments.record") && inv.status === "ISSUED" && inv.outstandingPaise > 0n;
  const dialog = canReceive ? await clientPaymentDialogData(user) : null;
  const statusLabel = inv.overdue ? "Overdue" : inv.status === "ISSUED" && inv.outstandingPaise === 0n ? "Paid" : INVOICE_STATUS[inv.status].label;
  const statusTone = inv.overdue ? "red" : inv.status === "ISSUED" && inv.outstandingPaise === 0n ? "green" : INVOICE_STATUS[inv.status].tone;

  return (
    <div className="page-enter flex flex-col gap-5">
      <PageHeader
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            {INVOICE_KIND[inv.kind]} {inv.number}
            {inv.raNumber ? ` (RA-${inv.raNumber})` : ""}
            <ToneBadge tone={statusTone}>{statusLabel}</ToneBadge>
          </span>
        }
        description={
          <>
            <Link href={`/projects/${inv.projectId}`} className="underline-offset-2 hover:underline">
              {inv.project.name}
            </Link>{" "}
            · {inv.client.name} · {formatDate(inv.date)}
            {inv.milestone && <> · {inv.milestone}</>}
          </>
        }
        back={{ href: "/clients/bills", label: "Client bills" }}
        className="mb-0"
        actions={
          <>
            <Button asChild variant="outline" size="lg">
              <Link href={`/print/bill/${inv.id}`} target="_blank">
                <Printer className="size-4" /> Print / PDF
              </Link>
            </Button>
            {manage && inv.status === "DRAFT" && (
              <ConfirmAction
                trigger={
                  <Button size="lg">
                    <Send className="size-4" /> Issue bill
                  </Button>
                }
                title="Issue this bill to the client?"
                description={`${formatINR(inv.totalPaise)} is added to what ${inv.client.name} owes.`}
                confirmLabel="Issue"
                action={issueInvoiceAction.bind(null, inv.id)}
              />
            )}
            {dialog && (
              <ClientPaymentDialog
                projects={dialog.projects.filter((p) => p.value === inv.projectId)}
                invoices={dialog.invoices}
                accounts={dialog.accounts}
                defaultProjectId={inv.projectId}
                label="Payment received"
              />
            )}
            {manage && inv.status !== "CANCELLED" && (
              <ConfirmAction
                trigger={
                  <Button variant="ghost" size="lg">
                    <XCircle className="size-4" /> Cancel bill
                  </Button>
                }
                title="Cancel this bill?"
                description="The bill stays on record marked as cancelled and no longer counts as billed. Bills with payments linked cannot be cancelled."
                confirmLabel="Cancel bill"
                destructive
                reason={{ label: "Why is it cancelled?", required: true }}
                action={cancelInvoiceAction.bind(null, inv.id)}
              />
            )}
          </>
        }
      />
      {inv.status === "CANCELLED" && (
        <p className="rounded-lg border border-stone-300 bg-stone-50 px-3 py-2 text-sm">
          Cancelled{inv.cancelReason ? ` — “${inv.cancelReason}”` : ""}.
        </p>
      )}
      {inv.status === "ISSUED" && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile label="Bill amount" value={<Money paise={inv.totalPaise} wholeRupees />} />
          <StatTile label="Settled" value={<Money paise={inv.settledPaise} wholeRupees />} tone="good" sub="Oldest bill is settled first" />
          <StatTile label="Still due" value={<Money paise={inv.outstandingPaise} wholeRupees />} tone={inv.overdue ? "bad" : inv.outstandingPaise > 0n ? "warn" : "good"} sub={inv.dueDate && inv.outstandingPaise > 0n ? describeDue(inv.dueDate) : undefined} />
          <StatTile label="Retention held" value={<Money paise={inv.retentionPaise} wholeRupees />} />
        </div>
      )}
      {inv.status === "ISSUED" && inv.outstandingPaise > 0n && inv.client.phone && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          Remind {inv.client.name}:
          <ContactLinks
            phone={inv.client.phone}
            message={`Dear ${inv.client.name}, a gentle reminder that ${formatINR(inv.outstandingPaise)} is due against bill ${inv.number}${inv.raNumber ? ` (RA-${inv.raNumber})` : ""} for ${inv.project.name}${inv.dueDate ? `, due on ${formatDate(inv.dueDate)}` : ""}. Thank you. — ${company.name}`}
          />
        </div>
      )}
      <BillDocument
        company={company}
        heading={inv.kind === "RUNNING" ? `Running Bill RA-${inv.raNumber}` : INVOICE_KIND[inv.kind]}
        number={inv.number}
        date={inv.date}
        extraMeta={[...(inv.dueDate ? [{ label: "Due by", value: formatDate(inv.dueDate) }] : []), ...(inv.milestone ? [{ label: "Stage", value: inv.milestone }] : [])]}
        to={{
          name: inv.client.name,
          address: [inv.client.address, inv.client.city].filter(Boolean).join(", ") || null,
          phone: inv.client.phone,
          gstin: inv.client.gstin,
          site: [inv.project.name, inv.project.address, inv.project.city].filter(Boolean).join("\n"),
        }}
        lines={inv.items}
        totals={{ ...inv.totals, retentionPaise: inv.retentionPaise }}
        taxMode={inv.taxMode}
        taxPercent={inv.taxPercent.toString()}
        footerNote={inv.notes}
      />
      {inv.clientPayments.length > 0 && (
        <Section title="Payments linked to this bill" description="Payments not linked to a bill are still applied to the oldest bills first.">
          <SimpleTable
            rows={inv.clientPayments}
            rowKey={(p) => p.id}
            columns={[
              { header: "Receipt", cell: (p) => p.receiptNumber },
              { header: "Date", cell: (p) => formatDate(p.date) },
              { header: "How", hide: "sm", cell: (p) => `${PAYMENT_METHOD[p.method]} · ${p.account.name}` },
              { header: "Amount", align: "right", cell: (p) => <Money paise={p.amountPaise} colorNegative /> },
            ]}
          />
        </Section>
      )}
    </div>
  );
}
