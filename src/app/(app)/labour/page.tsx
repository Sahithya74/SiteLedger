import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Users } from "lucide-react";
import { ToneBadge } from "@/components/app/badges";
import { EmptyState } from "@/components/app/empty-state";
import { FilterBar, param } from "@/components/app/filter-bar";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { Cell2, SimpleTable } from "@/components/app/simple-table";
import { PageSkeleton } from "@/components/app/skeletons";
import { StatTile } from "@/components/app/stat-tile";
import { Button } from "@/components/ui/button";
import { LabourTabs } from "@/features/labour/nav";
import type { LabourCategory } from "@/generated/prisma/enums";
import { formatPhone } from "@/lib/contact";
import { formatDate } from "@/lib/dates";
import { LABOUR_CATEGORY, options } from "@/lib/labels";
import { sumPaise } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";
import { contractorOptions } from "@/server/services/contractors";
import { listWorkers } from "@/server/services/labour";
import { projectOptions } from "@/server/services/projects";

export const metadata: Metadata = { title: "Labour" };

export default function LabourPage(props: PageProps<"/labour">) {
  return (
    <Suspense fallback={<PageSkeleton tiles={3} rows={10} />}>
      <Labour searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Labour({ searchParams }: { searchParams: PageProps<"/labour">["searchParams"] }) {
  const user = await requireUser();
  const sp = await searchParams;
  const category = param(sp, "category") as LabourCategory | undefined;
  const [workers, projects, contractors] = await Promise.all([
    listWorkers(user, {
      q: param(sp, "q"),
      category: category && category in LABOUR_CATEGORY ? category : undefined,
      projectId: param(sp, "project"),
      contractorId: param(sp, "contractor"),
      showInactive: param(sp, "all") === "1",
      pendingOnly: param(sp, "pending") === "1",
    }),
    projectOptions(user),
    contractorOptions(),
  ]);
  const showWages = can(user, "wages.view");
  const pending = sumPaise(workers.map((w) => w.balance?.pendingWagesPaise));
  const advances = sumPaise(workers.map((w) => w.balance?.advanceOutstandingPaise));

  return (
    <div className="page-enter">
      <PageHeader
        title="Labour"
        description="Workers, their sites and wages. Workers never log in — the site manager marks attendance for them."
        actions={
          can(user, "labour.manage") && (
            <Button asChild size="lg">
              <Link href="/labour/new">
                <Plus className="size-4" /> Add worker
              </Link>
            </Button>
          )
        }
      />
      <LabourTabs />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Workers" value={workers.length} sub={param(sp, "all") === "1" ? "including those who left" : "currently working"} />
        <StatTile label="Worked in last 45 days" value={workers.filter((w) => w.lastSite).length} />
        {showWages && <StatTile label="Wages pending" value={<Money paise={pending} short />} tone={pending > 0n ? "warn" : "good"} href="/labour/wages" />}
        {showWages && <StatTile label="Advances outstanding" value={<Money paise={advances} short />} sub="to be recovered from wages" />}
      </div>
      <FilterBar
        action="/labour"
        values={sp}
        fields={[
          { type: "search", placeholder: "Name, phone, code…" },
          { type: "select", name: "category", label: "Type of work", options: options(LABOUR_CATEGORY) },
          { type: "select", name: "project", label: "Recent site", options: projects.map((p) => ({ value: p.id, label: p.name })) },
          { type: "select", name: "contractor", label: "Contractor", options: contractors.map((c) => ({ value: c.id, label: c.name })) },
          ...(showWages ? [{ type: "checkbox" as const, name: "pending", label: "Only with wages pending" }] : []),
          { type: "checkbox", name: "all", label: "Include workers who left" },
        ]}
      />
      {workers.length === 0 ? (
        <EmptyState icon={Users} title="No workers found" description="Add the masons, helpers and other workers who come to your sites." />
      ) : (
        <SimpleTable
          rows={workers}
          rowKey={(w) => w.id}
          rowClassName={(w) => (w.isActive ? undefined : "text-muted-foreground")}
          columns={[
            {
              header: "Worker",
              cell: (w) => (
                <Cell2
                  main={
                    <span className="inline-flex items-center gap-2">
                      <Link href={`/labour/${w.id}`} className="hover:underline">{w.name}</Link>
                      {!w.isActive && <ToneBadge tone="grey">Left</ToneBadge>}
                    </span>
                  }
                  sub={`${w.code} · ${LABOUR_CATEGORY[w.category]}${w.contractor ? ` · ${w.contractor.name}` : ""}`}
                />
              ),
            },
            { header: "Phone", hide: "md", cell: (w) => formatPhone(w.phone) },
            { header: "Last site", hide: "sm", cell: (w) => (w.lastSite ? <Cell2 main={w.lastSite.name} sub={formatDate(w.lastSite.date)} /> : <span className="text-muted-foreground">—</span>) },
            ...(showWages
              ? [
                  { header: "Daily wage", align: "right" as const, hide: "lg" as const, cell: (w: (typeof workers)[number]) => <Money paise={w.dailyWagePaise} wholeRupees /> },
                  {
                    header: "To pay",
                    align: "right" as const,
                    cell: (w: (typeof workers)[number]) =>
                      w.balance && w.balance.pendingWagesPaise > 0n ? (
                        <Money paise={w.balance.pendingWagesPaise} wholeRupees className="font-semibold text-amber-800" />
                      ) : w.balance && w.balance.advanceOutstandingPaise > 0n ? (
                        <span className="text-xs text-muted-foreground">
                          Advance <Money paise={w.balance.advanceOutstandingPaise} wholeRupees />
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Settled</span>
                      ),
                  },
                ]
              : []),
          ]}
        />
      )}
    </div>
  );
}
