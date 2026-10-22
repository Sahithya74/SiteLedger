import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { FileText, Plus } from "lucide-react";
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
import type { QuotationStatus } from "@/generated/prisma/enums";
import { describeDue, formatDate } from "@/lib/dates";
import { QUOTATION_STATUS } from "@/lib/labels";
import { sumPaise } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";
import { listQuotations } from "@/server/services/billing";
import { clientOptions } from "@/server/services/clients";

export const metadata: Metadata = { title: "Quotations" };

export default function QuotationsPage(props: PageProps<"/clients/quotations">) {
  return (
    <Suspense fallback={<PageSkeleton tiles={4} rows={8} />}>
      <Quotations searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Quotations({ searchParams }: { searchParams: PageProps<"/clients/quotations">["searchParams"] }) {
  const user = await requireUser();
  if (!can(user, "quotations.manage") && !can(user, "projects.viewMoney")) return <NoAccess />;
  const sp = await searchParams;
  const status = param(sp, "status") as QuotationStatus | undefined;
  const [rows, all, clients] = await Promise.all([
    listQuotations(user, { status: status && status in QUOTATION_STATUS ? status : undefined, clientId: param(sp, "client"), q: param(sp, "q") }),
    listQuotations(user),
    clientOptions(user),
  ]);
  const open = all.filter((q) => q.status === "SENT");
  const accepted = all.filter((q) => q.status === "ACCEPTED");
  const decided = all.filter((q) => q.status === "ACCEPTED" || q.status === "REJECTED");

  return (
    <div className="page-enter">
      <PageHeader
        title="Quotations"
        description="Estimates you send to clients. Accepted quotations can be turned into a project."
        actions={
          can(user, "quotations.manage") && (
            <Button asChild size="lg">
              <Link href="/clients/quotations/new">
                <Plus className="size-4" /> New quotation
              </Link>
            </Button>
          )
        }
      />
      <ClientsTabs />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Waiting for reply" value={open.length} sub={<Money paise={sumPaise(open.map((q) => q.totalPaise))} short />} href="/clients/quotations?status=SENT" />
        <StatTile label="Accepted" value={accepted.length} sub={<Money paise={sumPaise(accepted.map((q) => q.totalPaise))} short />} tone="good" href="/clients/quotations?status=ACCEPTED" />
        <StatTile label="Drafts" value={all.filter((q) => q.status === "DRAFT").length} href="/clients/quotations?status=DRAFT" />
        <StatTile
          label="Win rate"
          value={decided.length ? `${Math.round((accepted.length / decided.length) * 100)}%` : "—"}
          sub={decided.length ? `${accepted.length} of ${decided.length} decided` : "No decisions yet"}
        />
      </div>
      <FilterBar
        action="/clients/quotations"
        values={sp}
        fields={[
          { type: "search", placeholder: "Number or title…" },
          { type: "select", name: "client", label: "Client", options: clients.map((c) => ({ value: c.id, label: c.name })) },
          { type: "select", name: "status", label: "Status", options: Object.entries(QUOTATION_STATUS).map(([value, s]) => ({ value, label: s.label })) },
        ]}
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No quotations here"
          description="Prepare a quotation with items, GST and terms. It prints neatly and can be sent to the client."
          action={
            can(user, "quotations.manage") && (
              <Button asChild>
                <Link href="/clients/quotations/new">New quotation</Link>
              </Button>
            )
          }
        />
      ) : (
        <SimpleTable
          rows={rows}
          rowKey={(r) => r.id}
          columns={[
            { header: "Quotation", cell: (r) => <Cell2 main={<Link href={`/clients/quotations/${r.id}`} className="hover:underline">{r.number}</Link>} sub={formatDate(r.date)} /> },
            { header: "For", cell: (r) => <Cell2 main={r.title} sub={`${r.client.name}${r.project ? ` · ${r.project.name}` : ""}`} /> },
            {
              header: "Status",
              cell: (r) => (
                <div className="flex flex-col items-start gap-0.5">
                  <ToneBadge tone={QUOTATION_STATUS[r.status].tone}>{QUOTATION_STATUS[r.status].label}</ToneBadge>
                  {r.status === "SENT" && r.validUntil && <span className="text-xs text-muted-foreground">valid {describeDue(r.validUntil)}</span>}
                </div>
              ),
            },
            { header: "Amount", align: "right", cell: (r) => <Money paise={r.totalPaise} wholeRupees /> },
          ]}
        />
      )}
    </div>
  );
}
