import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { HardHat } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { FilterBar, param } from "@/components/app/filter-bar";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { Cell2, SimpleTable } from "@/components/app/simple-table";
import { PageSkeleton } from "@/components/app/skeletons";
import { AddContractorDialog } from "@/features/labour/contractor-dialogs";
import { LabourTabs } from "@/features/labour/nav";
import { formatPhone } from "@/lib/contact";
import { LABOUR_CATEGORY } from "@/lib/labels";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";
import { listContractors } from "@/server/services/contractors";

export const metadata: Metadata = { title: "Labour contractors" };

export default function ContractorsPage(props: PageProps<"/labour/contractors">) {
  return (
    <Suspense fallback={<PageSkeleton tiles={0} />}>
      <Contractors searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Contractors({ searchParams }: { searchParams: PageProps<"/labour/contractors">["searchParams"] }) {
  const user = await requireUser();
  const sp = await searchParams;
  const rows = await listContractors({ q: param(sp, "q"), showInactive: param(sp, "all") === "1" });
  const showMoney = can(user, "wages.view") || can(user, "payments.record");
  return (
    <div className="page-enter">
      <PageHeader
        title="Labour contractors"
        description="Mestris and gang leaders — work orders, bills (with retention and TDS) and payments."
        actions={can(user, "labour.manage") && <AddContractorDialog />}
      />
      <LabourTabs />
      <FilterBar action="/labour/contractors" values={sp} fields={[{ type: "search", placeholder: "Name or phone…" }, { type: "checkbox", name: "all", label: "Include inactive" }]} />
      {rows.length === 0 ? (
        <EmptyState icon={HardHat} title="No labour contractors yet" description="Add the mestris who bring their own gang and bill you for the work." />
      ) : (
        <SimpleTable
          rows={rows}
          rowKey={(r) => r.id}
          columns={[
            { header: "Contractor", cell: (r) => <Cell2 main={<Link href={`/labour/contractors/${r.id}`} className="hover:underline">{r.name}</Link>} sub={[r.code, r.trade ? LABOUR_CATEGORY[r.trade] : null].filter(Boolean).join(" · ")} /> },
            { header: "Phone", hide: "sm", cell: (r) => formatPhone(r.phone) },
            { header: "Workers", align: "right", hide: "md", cell: (r) => r._count.workers },
            { header: "Open work orders", align: "right", hide: "md", cell: (r) => r._count.workOrders },
            ...(showMoney
              ? [
                  { header: "Billed (net)", align: "right" as const, hide: "lg" as const, cell: (r: (typeof rows)[number]) => <Money paise={r.balance.billedPaise} short /> },
                  {
                    header: "We owe",
                    align: "right" as const,
                    cell: (r: (typeof rows)[number]) =>
                      r.balance.owedPaise > 0n ? <Money paise={r.balance.owedPaise} wholeRupees className="font-semibold text-amber-800" /> : <span className="text-muted-foreground">Nothing</span>,
                  },
                ]
              : []),
          ]}
        />
      )}
    </div>
  );
}
