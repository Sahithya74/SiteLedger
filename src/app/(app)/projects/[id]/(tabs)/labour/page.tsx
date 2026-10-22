import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck } from "lucide-react";
import { Money } from "@/components/app/money";
import { Section } from "@/components/app/page-header";
import { Cell2, SimpleTable } from "@/components/app/simple-table";
import { TableSkeleton } from "@/components/app/skeletons";
import { StatTile } from "@/components/app/stat-tile";
import { Button } from "@/components/ui/button";
import { addDays, formatDate, todayIST, toDbDate } from "@/lib/dates";
import { LABOUR_CATEGORY } from "@/lib/labels";
import { sumPaise } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";
import { db } from "@/server/db";
import { attendanceSummary } from "@/server/services/labour";
import { getProject } from "@/server/services/projects";

export const metadata: Metadata = { title: "Project labour" };

export default function ProjectLabourPage(props: PageProps<"/projects/[id]/labour">) {
  return (
    <Suspense fallback={<TableSkeleton rows={10} />}>
      <ProjectLabour params={props.params} />
    </Suspense>
  );
}

async function ProjectLabour({ params }: { params: PageProps<"/projects/[id]/labour">["params"] }) {
  const { id } = await params;
  const user = await requireUser();
  const project = await getProject(user, id);
  if (!project) return null;
  const today = todayIST();
  const from = addDays(today, -6);
  const showWages = can(user, "wages.view");
  const [week, todayRows, orders] = await Promise.all([
    attendanceSummary(user, { from, to: today, projectId: id }),
    db.attendance.count({ where: { projectId: id, date: toDbDate(today), labourId: { not: null }, status: { not: "ABSENT" } } }),
    db.workOrder.findMany({
      where: { projectId: id, status: { not: "CANCELLED" } },
      include: { contractor: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const days: string[] = [];
  for (let d = from; d <= today; d = addDays(d, 1)) days.push(d);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2">
        {can(user, "attendance.record") && (
          <Button asChild size="lg">
            <Link href={`/labour/attendance?project=${id}`}>
              <CalendarCheck className="size-4" /> Mark today’s attendance
            </Link>
          </Button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Present today" value={todayRows} tone={todayRows ? "good" : "warn"} />
        <StatTile label="Workers this week" value={week.length} />
        <StatTile label="Man-days this week" value={week.reduce((s, w) => s + Number(w.days), 0).toLocaleString("en-IN")} />
        {showWages && <StatTile label="Wages this week" value={<Money paise={sumPaise(week.map((w) => w.wagesPaise))} short />} href={`/labour/wages?project=${id}`} />}
      </div>
      <Section title="Last 7 days" description="P = present, ½ = half day, A = absent.">
        {week.length === 0 ? (
          <p className="text-sm text-muted-foreground">No attendance marked here this week.</p>
        ) : (
          <SimpleTable
            rows={week}
            rowKey={(w) => w.id}
            columns={[
              { header: "Worker", cell: (w) => <Cell2 main={<Link href={`/labour/${w.id}`} className="hover:underline">{w.name}</Link>} sub={LABOUR_CATEGORY[w.category]} /> },
              ...days.map((d) => ({
                header: <span title={formatDate(d)}>{new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short" }).slice(0, 2)}</span>,
                hide: d < addDays(today, -2) ? ("md" as const) : undefined,
                cell: (w: (typeof week)[number]) => {
                  const s = w.dates[d];
                  return s === "PRESENT" ? <span className="text-emerald-700">P</span> : s === "HALF_DAY" ? <span className="text-amber-700">½</span> : s === "ABSENT" ? <span className="text-red-700">A</span> : <span className="text-stone-300">·</span>;
                },
              })),
              { header: "Days", align: "right" as const, cell: (w) => w.days },
              ...(showWages ? [{ header: "Earned", align: "right" as const, cell: (w: (typeof week)[number]) => <Money paise={w.wagesPaise} wholeRupees /> }] : []),
            ]}
          />
        )}
      </Section>
      <Section title="Contractor work orders">
        {orders.length === 0 ? (
          <p className="text-sm text-muted-foreground">No labour contractor works on this project.</p>
        ) : (
          <ul className="flex flex-col divide-y text-sm">
            {orders.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Cell2 main={o.title} sub={o.number} />
                <Link href={`/labour/contractors/${o.contractor.id}`} className="hover:underline">
                  {o.contractor.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
