import { Suspense } from "react";
import Link from "next/link";
import { CalendarDays, MapPin, Pencil, User } from "lucide-react";
import { ProjectStatusBadge, ToneBadge } from "@/components/app/badges";
import { NotFoundPanel } from "@/components/app/no-access";
import { healthTone, ProgressBar } from "@/components/app/progress-bar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ProjectMenu } from "@/features/projects/project-menu";
import { ProjectStatusDialog } from "@/features/projects/status-dialog";
import { ProjectTabs } from "@/features/projects/project-tabs";
import { describeDue, formatDate } from "@/lib/dates";
import { PROJECT_TYPE } from "@/lib/labels";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";
import { getProject } from "@/server/services/projects";
import { loadWorkStats } from "@/server/services/project-money";

/**
 * Project header (name, client, location, status, progress) and tabs.
 * The Admin can understand a project from here without opening many screens.
 */
export default function ProjectLayout({ children, params }: LayoutProps<"/projects/[id]">) {
  return (
    <div className="page-enter flex flex-col gap-5">
      <Suspense fallback={<HeaderSkeleton />}>
        <ProjectHeader params={params} />
      </Suspense>
      {children}
    </div>
  );
}

async function ProjectHeader({ params }: { params: LayoutProps<"/projects/[id]">["params"] }) {
  const { id } = await params;
  const user = await requireUser();
  const project = await getProject(user, id);
  if (!project) return <NotFoundPanel what="project" backHref="/projects" backLabel="Back to projects" />;
  const stats = (await loadWorkStats([id])).get(id)!;
  const location = [project.city, project.state].filter(Boolean).join(", ");
  const due = project.expectedEndDate && project.status !== "COMPLETED" ? describeDue(project.expectedEndDate) : null;

  return (
    <div className="flex flex-col gap-4">
      <Link href="/projects" className="w-fit text-sm text-muted-foreground hover:text-foreground">
        ← Projects
      </Link>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
            <ProjectStatusBadge status={project.status} />
            {project.archivedAt && <ToneBadge tone="grey">Archived</ToneBadge>}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>
              {project.code} · {PROJECT_TYPE[project.type]}
            </span>
            <Link href={`/clients/${project.client.id}`} className="inline-flex items-center gap-1 hover:text-foreground hover:underline">
              <User className="size-3.5" /> {project.client.name}
            </Link>
            {location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" /> {location}
              </span>
            )}
            {project.expectedEndDate && (
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="size-3.5" /> Due {formatDate(project.expectedEndDate)}
                {due && <span className={due.includes("late") ? "font-medium text-red-700" : ""}>({due.toLowerCase()})</span>}
              </span>
            )}
          </div>
          {project.statusNote && <p className="mt-2 text-sm">Note: {project.statusNote}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {can(user, "projects.updateStatus") && !project.archivedAt && (
            <ProjectStatusDialog projectId={id} status={project.status} statusNote={project.statusNote} />
          )}
          {can(user, "projects.edit") && (
            <Button asChild variant="outline" size="lg">
              <Link href={`/projects/${id}/edit`}>
                <Pencil className="size-4" /> Edit
              </Link>
            </Button>
          )}
          {user.role === "ADMIN" && <ProjectMenu projectId={id} name={project.name} archived={Boolean(project.archivedAt)} />}
        </div>
      </div>
      <div className="max-w-xl">
        <div className="mb-1 flex justify-between text-xs text-muted-foreground">
          <span>
            Work progress · {stats.completedItems} of {stats.totalItems} items done
          </span>
          {stats.health.planned !== null && <span>Planned by today: {stats.health.planned}%</span>}
        </div>
        <ProgressBar value={stats.progress} planned={stats.health.planned} tone={healthTone(stats.health.state)} size="md" />
      </div>
      <ProjectTabs
        projectId={id}
        tabs={[
          { segment: "", label: "Overview" },
          { segment: "work", label: "Work", count: stats.overdueItems },
          ...(can(user, "projects.viewMoney") ? [{ segment: "money", label: "Money" }] : []),
          { segment: "map", label: "Map" },
        ]}
      />
    </div>
  );
}

function HeaderSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-8 w-72" />
      <Skeleton className="h-4 w-96" />
      <Skeleton className="h-2.5 w-full max-w-xl" />
      <Skeleton className="h-10 w-64" />
    </div>
  );
}
