import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { CircleCheck } from "lucide-react";
import { ContactLinks } from "@/components/app/contact-links";
import { EmptyState } from "@/components/app/empty-state";
import { Money } from "@/components/app/money";
import { NoAccess } from "@/components/app/no-access";
import { PageHeader } from "@/components/app/page-header";
import { Cell2, SimpleTable } from "@/components/app/simple-table";
import { PageSkeleton } from "@/components/app/skeletons";
import { StatTile } from "@/components/app/stat-tile";
import { ClientsTabs } from "@/features/billing/nav";
import { clientPaymentDialogData } from "@/features/money/dialog-data";
import { ClientPaymentDialog } from "@/features/money/money-dialogs";
import { describeDue } from "@/lib/dates";
import { formatINR, sumPaise } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";
import { receivables } from "@/server/services/billing";
import { companyName } from "@/server/services/users";

export const metadata: Metadata = { title: "Pending from clients" };

export default function PendingPage() {
  return (
    <Suspense fallback={<PageSkeleton tiles={3} rows={8} />}>
      <Pending />
    </Suspense>
  );
}

async function Pending() {
  const user = await requireUser();
  if (!can(user, "projects.viewMoney")) return <NoAccess />;
  const [rows, company, dialog] = await Promise.all([
    receivables(user),
    companyName(),
    can(user, "clientPayments.record") ? clientPaymentDialogData(user) : Promise.resolve(null),
  ]);
  const sorted = [...rows].sort((a, b) => (b.overduePaise !== a.overduePaise ? (b.overduePaise > a.overduePaise ? 1 : -1) : b.pendingPaise > a.pendingPaise ? 1 : -1));
  const overdueCount = rows.filter((r) => r.overduePaise > 0n).length;

  return (
    <div className="page-enter">
      <PageHeader
        title="Pending from clients"
        description="What each client still has to pay — against the contract value, and against bills already sent."
        actions={dialog && <ClientPaymentDialog projects={dialog.projects} invoices={dialog.invoices} accounts={dialog.accounts} />}
      />
      <ClientsTabs overdue={overdueCount} />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Still to receive" value={<Money paise={sumPaise(rows.map((r) => r.pendingPaise))} short />} sub="Contract value − received" tone="warn" />
        <StatTile label="Billed, not paid" value={<Money paise={sumPaise(rows.map((r) => r.billedNotReceivedPaise))} short />} sub="Bills sent and waiting" />
        <StatTile label="Overdue" value={<Money paise={sumPaise(rows.map((r) => r.overduePaise))} short />} sub={`${overdueCount} projects`} tone={overdueCount ? "bad" : "good"} />
        <StatTile label="Retention with clients" value={<Money paise={sumPaise(rows.map((r) => r.retentionPaise))} short />} sub="Ask for it at handover" />
      </div>
      {sorted.length === 0 ? (
        <EmptyState icon={CircleCheck} title="Nothing pending" description="Every client is fully paid up." />
      ) : (
        <SimpleTable
          rows={sorted}
          rowKey={(r) => r.id}
          rowClassName={(r) => (r.overduePaise > 0n ? "bg-red-50/60" : undefined)}
          columns={[
            {
              header: "Project",
              cell: (r) => (
                <Cell2
                  main={
                    <Link href={`/projects/${r.id}`} className="hover:underline">
                      {r.name}
                    </Link>
                  }
                  sub={r.client.name}
                />
              ),
            },
            { header: "Value", align: "right", hide: "lg", cell: (r) => <Money paise={r.valuePaise} short /> },
            { header: "Received", align: "right", hide: "md", cell: (r) => <Money paise={r.receivedPaise} short /> },
            { header: "Billed, not paid", align: "right", hide: "sm", cell: (r) => <Money paise={r.billedNotReceivedPaise} short /> },
            {
              header: "Overdue",
              align: "right",
              cell: (r) =>
                r.overduePaise > 0n ? (
                  <div className="flex flex-col items-end">
                    <Money paise={r.overduePaise} short className="font-semibold text-red-700" />
                    <span className="text-xs text-red-700">{describeDue(r.overdueBills.map((b) => b.dueDate!).sort()[0])}</span>
                  </div>
                ) : (
                  "—"
                ),
            },
            { header: "Total pending", align: "right", cell: (r) => <Money paise={r.pendingPaise} short className="font-semibold" /> },
            {
              header: <span className="sr-only">Remind</span>,
              cell: (r) =>
                r.client.phone ? (
                  <ContactLinks
                    phone={r.client.phone}
                    message={`Dear ${r.client.name}, this is a gentle reminder from ${company} about the payment for ${r.name}. ${r.overduePaise > 0n ? `${formatINR(r.overduePaise)} is overdue` : `${formatINR(r.billedNotReceivedPaise > 0n ? r.billedNotReceivedPaise : r.pendingPaise)} is pending`}. Thank you.`}
                  />
                ) : null,
            },
          ]}
        />
      )}
    </div>
  );
}
