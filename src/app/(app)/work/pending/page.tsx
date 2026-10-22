import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Filter } from "lucide-react";
import { PriorityBadge, WorkStatusBadge } from "@/components/app/badges";
import { EmptyState } from "@/components/app/empty-state";
import { NativeSelect } from "@/components/app/form";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/skeletons";
import { StatTile } from "@/components/app/stat-tile";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Priority } from "@/generated/prisma/enums";
import { formatDate } from "@/lib/dates";
import { PRIORITY } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/auth/current-user";
import { projectOptions } from "@/server/services/projects";
import { listPendingWork } from "@/server/services/work";

export const metadata: Metadata = { title: "Pending work" };

export default function PendingWorkPage(props: PageProps<"/work/pending">) {
  return (
    <Suspense fallback={<PageSkeleton tiles={4} rows={10} />}>
      <PendingWork searchParams={props.searchParams} />
    </Suspense>
  );
}

function daysText(days: number | null): string {
  if (days === null) return "—";
  if (days < 0) return `${-days} day${days === -1 ? "" : "s"} late`;
  if (days === 0) return "Today";
  return `${days} day${days === 1 ? "" : "s"}`;
}

async function PendingWork({ searchParams }: { searchParams: PageProps<"/work/pending">["searchParams"] }) {
  const user = await requireUser();
  const params = await searchParams;
  const projectId = typeof params.project === "string" && params.project ? params.project : undefined;
  const priority = typeof params.priority === "string" && params.priority in PRIORITY ? (params.priority as Priority) : undefined;
  const overdueOnly = params.overdue === "1";
  const [rows, projects] = await Promise.all([
    listPendingWork(user, { projectId, priority, overdueOnly }),
    projectOptions(user),
  ]);
  const overdue = rows.filter((r) => r.overdue).length;
  const dueThisWeek = rows.filter((r) => r.daysRemaining !== null && r.daysRemaining >= 0 && r.daysRemaining <= 7).length;
  const critical = rows.filter((r) => r.priority === "CRITICAL" || r.priority === "HIGH").length;
  const showMoney = rows.some((r) => r.estimatedCostPaise !== null);
  const filtered = Boolean(projectId || priority || overdueOnly);

  return (
    <div className="page-enter">
      <PageHeader title="Pending work" description="Everything not finished yet, across all your projects. Late work is shown first." />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Open items" value={rows.length} />
        <StatTile label="Overdue" value={overdue} tone={overdue ? "bad" : "good"} href={overdue ? "/work/pending?overdue=1" : undefined} />
        <StatTile label="Due in 7 days" value={dueThisWeek} tone={dueThisWeek ? "warn" : "default"} />
        <StatTile label="High priority" value={critical} />
      </div>

      <form action="/work/pending" className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3">
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Project</span>
          <NativeSelect name="project" defaultValue={projectId ?? ""}>
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="flex w-40 flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Priority</span>
          <NativeSelect name="priority" defaultValue={priority ?? ""}>
            <option value="">Any</option>
            {Object.values(Priority).map((p) => (
              <option key={p} value={p}>
                {PRIORITY[p].label}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="flex h-10 items-center gap-2 text-sm">
          <input type="checkbox" name="overdue" value="1" defaultChecked={overdueOnly} className="size-4 accent-stone-800" />
          Only overdue
        </label>
        <Button type="submit" variant="secondary" size="lg">
          <Filter className="size-4" /> Show
        </Button>
        {filtered && (
          <Button asChild variant="ghost" size="lg">
            <Link href="/work/pending">Clear</Link>
          </Button>
        )}
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title={filtered ? "No pending work matches these filters" : "All work is finished"}
          description={filtered ? "Try clearing the filters." : "Add work to a project from its Work tab."}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="min-w-52">Work</TableHead>
                <TableHead className="hidden md:table-cell">Project</TableHead>
                <TableHead className="hidden lg:table-cell">Responsible</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="hidden sm:table-cell">Priority</TableHead>
                <TableHead className="hidden xl:table-cell">Reason pending / waiting for</TableHead>
                {showMoney && <TableHead className="hidden text-right 2xl:table-cell">Est. cost</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} className={cn(r.overdue && "bg-red-50/70 hover:bg-red-50")}>
                  <TableCell className="py-3">
                    <Link href={`/projects/${r.project.id}/work#item-${r.id}`} className="font-medium hover:underline">
                      {r.name}
                    </Link>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      {r.phase && <span>{r.phase}</span>}
                      <WorkStatusBadge status={r.status} />
                      <span>{r.percentComplete}% done</span>
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground md:hidden">{r.project.name}</div>
                  </TableCell>
                  <TableCell className="hidden text-sm md:table-cell">
                    <Link href={`/projects/${r.project.id}`} className="hover:underline">
                      {r.project.name}
                    </Link>
                    {r.site && <div className="text-xs text-muted-foreground">{r.site}</div>}
                  </TableCell>
                  <TableCell className="hidden text-sm lg:table-cell">{r.responsible ?? <span className="text-muted-foreground">Not assigned</span>}</TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    <div>{formatDate(r.dueDate)}</div>
                    <div className={cn("text-xs", r.overdue ? "font-semibold text-red-700" : "text-muted-foreground")}>{daysText(r.daysRemaining)}</div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <PriorityBadge priority={r.priority} />
                  </TableCell>
                  <TableCell className="hidden max-w-64 text-sm xl:table-cell">
                    {r.pendingReason && <div>{r.pendingReason}</div>}
                    {r.waitingFor.length > 0 && <div className="text-xs text-muted-foreground">Waiting for: {r.waitingFor.join(", ")}</div>}
                    {!r.pendingReason && r.waitingFor.length === 0 && <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  {showMoney && (
                    <TableCell className="hidden text-right 2xl:table-cell">
                      <Money paise={r.estimatedCostPaise || null} short />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
