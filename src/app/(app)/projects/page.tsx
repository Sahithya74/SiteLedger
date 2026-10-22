import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Building2, MapPin, Plus, Search } from "lucide-react";
import { ProjectStatusBadge, ToneBadge } from "@/components/app/badges";
import { EmptyState } from "@/components/app/empty-state";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { healthTone, ProgressBar } from "@/components/app/progress-bar";
import { PageSkeleton } from "@/components/app/skeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/dates";
import { PROJECT_TYPE } from "@/lib/labels";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/auth/current-user";
import { listProjects, projectTabCounts, type ProjectTab } from "@/server/services/projects";

export const metadata: Metadata = { title: "Projects" };

const TABS: { key: ProjectTab; label: string; help: string }[] = [
  { key: "all", label: "All", help: "Every project except archived ones" },
  { key: "active", label: "Active", help: "Work is happening (includes delayed)" },
  { key: "pending", label: "Pending", help: "Planning stage or on hold" },
  { key: "completed", label: "Completed", help: "Finished and handed over" },
  { key: "archived", label: "Archived", help: "Hidden from day-to-day lists" },
];

export default function ProjectsPage(props: PageProps<"/projects">) {
  return (
    <Suspense fallback={<PageSkeleton tiles={0} rows={8} />}>
      <Projects searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Projects({ searchParams }: { searchParams: PageProps<"/projects">["searchParams"] }) {
  const user = await requireUser();
  const params = await searchParams;
  const tab = (TABS.some((t) => t.key === params.tab) ? params.tab : "all") as ProjectTab;
  const q = typeof params.q === "string" ? params.q : "";
  const [rows, counts] = await Promise.all([listProjects(user, { tab, q }), projectTabCounts(user)]);
  const showMoney = can(user, "projects.viewMoney");

  return (
    <div className="page-enter">
      <PageHeader
        title="Projects"
        description="Every site and job, with progress and money at a glance."
        actions={
          can(user, "projects.create") && (
            <Button asChild size="lg">
              <Link href="/projects/new">
                <Plus className="size-4" /> New project
              </Link>
            </Button>
          )
        }
      />

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <nav aria-label="Project groups" className="flex gap-1 overflow-x-auto rounded-lg border bg-card p-1">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={{ pathname: "/projects", query: { ...(t.key !== "all" && { tab: t.key }), ...(q && { q }) } }}
              title={t.help}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-colors",
                tab === t.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {t.label}
              <span className={cn("tabular text-xs", tab === t.key ? "opacity-80" : "opacity-70")}>{counts[t.key]}</span>
            </Link>
          ))}
        </nav>
        <form className="relative w-full md:w-72" action="/projects">
          {tab !== "all" && <input type="hidden" name="tab" value={tab} />}
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={q} placeholder="Search name, client, city…" className="h-10 pl-9" aria-label="Search projects" />
        </form>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={q ? `No projects match “${q}”` : tab === "all" ? "No projects yet" : "Nothing here"}
          description={
            q
              ? "Try a shorter word, or check the other tabs."
              : tab === "all"
                ? "Create your first project to start tracking work, people and money."
                : "Projects appear here when their status matches this tab."
          }
          action={
            !q && tab === "all" && can(user, "projects.create") ? (
              <Button asChild>
                <Link href="/projects/new">
                  <Plus className="size-4" /> New project
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="min-w-56">Project</TableHead>
                <TableHead className="hidden lg:table-cell">Location</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden w-44 md:table-cell">Progress</TableHead>
                {showMoney && <TableHead className="hidden text-right xl:table-cell">Value</TableHead>}
                {showMoney && <TableHead className="hidden text-right sm:table-cell">Pending</TableHead>}
                <TableHead className="hidden lg:table-cell">Due</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="py-3">
                    <Link href={`/projects/${p.id}`} className="group flex flex-col">
                      <span className="font-medium group-hover:underline">{p.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {p.code} · {p.client.name} · {PROJECT_TYPE[p.type]}
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                    {p.city ? (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="size-3.5" /> {p.city}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col items-start gap-1">
                      <ProjectStatusBadge status={p.status} />
                      {p.archivedAt && <ToneBadge tone="grey">Archived</ToneBadge>}
                      {p.overdueItems > 0 && (
                        <span className="text-xs font-medium text-red-700">{p.overdueItems} overdue</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <ProgressBar value={p.progress} tone={healthTone(p.health)} />
                  </TableCell>
                  {showMoney && (
                    <TableCell className="hidden text-right xl:table-cell">
                      <Money paise={p.valuePaise} short />
                    </TableCell>
                  )}
                  {showMoney && (
                    <TableCell className="hidden text-right sm:table-cell">
                      <Money paise={p.pendingPaise} short />
                    </TableCell>
                  )}
                  <TableCell className="hidden text-sm whitespace-nowrap text-muted-foreground lg:table-cell">
                    {formatDate(p.expectedEndDate)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
