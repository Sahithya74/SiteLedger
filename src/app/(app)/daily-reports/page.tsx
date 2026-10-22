import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, Plus } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { FilterBar, param } from "@/components/app/filter-bar";
import { PageHeader } from "@/components/app/page-header";
import { Cell2, SimpleTable } from "@/components/app/simple-table";
import { PageSkeleton } from "@/components/app/skeletons";
import { Button } from "@/components/ui/button";
import { formatDate, todayIST } from "@/lib/dates";
import { WEATHER } from "@/lib/labels";
import { resolvePeriod } from "@/lib/period";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";
import { listDailyReports, missingReports } from "@/server/services/daily-reports";
import { projectOptions } from "@/server/services/projects";

export const metadata: Metadata = { title: "Daily reports" };

export default function DailyReportsPage(props: PageProps<"/daily-reports">) {
  return (
    <Suspense fallback={<PageSkeleton tiles={0} rows={10} />}>
      <DailyReports searchParams={props.searchParams} />
    </Suspense>
  );
}

async function DailyReports({ searchParams }: { searchParams: PageProps<"/daily-reports">["searchParams"] }) {
  const user = await requireUser();
  const sp = await searchParams;
  const period = resolvePeriod(sp, "this-month");
  const today = todayIST();
  const [rows, projects, missing] = await Promise.all([
    listDailyReports(user, { projectId: param(sp, "project"), from: period.from, to: period.to }),
    projectOptions(user, { includeClosed: true }),
    missingReports(user, today),
  ]);
  const canWrite = can(user, "dailyReports.manage");

  return (
    <div className="page-enter">
      <PageHeader
        title="Daily reports"
        description={`What happened at each site, day by day · ${period.label}`}
        actions={
          canWrite && (
            <Button asChild size="lg">
              <Link href="/daily-reports/new">
                <Plus className="size-4" /> Today’s report
              </Link>
            </Button>
          )
        }
      />
      {canWrite && missing.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span className="font-medium">No report yet today for:</span>
          {missing.map((p) => (
            <Link key={p.id} href={`/daily-reports/new?project=${p.id}`} className="rounded-md bg-white px-2 py-0.5 underline-offset-2 hover:underline">
              {p.name}
            </Link>
          ))}
        </div>
      )}
      <FilterBar
        action="/daily-reports"
        values={sp}
        fields={[{ type: "period", fallback: "this-month" }, { type: "select", name: "project", label: "Project", options: projects.map((p) => ({ value: p.id, label: p.name })) }]}
      />
      {rows.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No reports in this period" description="A daily report takes a minute: attendance, deliveries and material used are filled in for you." />
      ) : (
        <SimpleTable
          rows={rows}
          rowKey={(r) => r.id}
          columns={[
            { header: "Date", cell: (r) => <Link href={`/daily-reports/${r.id}`} className="font-medium hover:underline">{formatDate(r.date)}</Link> },
            { header: "Project", cell: (r) => <Cell2 main={r.project.name} sub={r.site.name !== r.project.name ? r.site.name : undefined} /> },
            { header: "Work done", hide: "md", cell: (r) => <span className="line-clamp-2 text-sm">{r.workCompleted}</span> },
            { header: "Workers", align: "right", cell: (r) => r.labourPresent },
            { header: "Weather", hide: "sm", cell: (r) => WEATHER[r.weather] },
            { header: "By", hide: "lg", cell: (r) => r.submittedBy.name },
          ]}
        />
      )}
    </div>
  );
}
