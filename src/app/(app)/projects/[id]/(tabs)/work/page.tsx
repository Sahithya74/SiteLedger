import { Suspense } from "react";
import type { Metadata } from "next";
import { Link2, ListChecks, Pencil, Plus, User } from "lucide-react";
import { PriorityBadge, WorkStatusBadge } from "@/components/app/badges";
import { EmptyState } from "@/components/app/empty-state";
import { Money } from "@/components/app/money";
import { ProgressBar } from "@/components/app/progress-bar";
import { TableSkeleton } from "@/components/app/skeletons";
import { Button } from "@/components/ui/button";
import { AddPhaseDialog } from "@/features/work/phase-dialog";
import { QuickProgress } from "@/features/work/quick-progress";
import { DeleteWorkItemButton, StandardStagesButton } from "@/features/work/work-buttons";
import { EMPTY_WORK_ITEM, type WorkItemValues, type WorkOptions } from "@/features/work/form-values";
import { WorkItemSheet } from "@/features/work/work-item-sheet";
import { describeDue, formatDate, todayIST } from "@/lib/dates";
import { paiseToInput } from "@/lib/money";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/auth/current-user";
import { engineerOptions } from "@/server/services/engineers";
import { projectSites } from "@/server/services/projects";
import { getWorkBreakdown, type WorkItemRow } from "@/server/services/work";

export const metadata: Metadata = { title: "Project work" };

export default function ProjectWorkPage(props: PageProps<"/projects/[id]/work">) {
  return (
    <Suspense fallback={<TableSkeleton rows={10} />}>
      <Work params={props.params} />
    </Suspense>
  );
}

function toValues(item: WorkItemRow): WorkItemValues {
  return {
    name: item.name,
    description: item.description ?? "",
    parentId: item.parentId ?? "",
    siteId: item.siteId ?? "",
    status: item.status,
    priority: item.priority,
    percentComplete: String(item.percentComplete),
    engineerId: item.engineer?.id ?? "",
    team: item.team ?? "",
    startDate: item.startDate ?? "",
    expectedEndDate: item.expectedEndDate ?? "",
    actualEndDate: item.actualEndDate ?? "",
    estimatedCost: item.estimatedCostPaise ? paiseToInput(item.estimatedCostPaise) : "",
    actualCost: item.actualCostPaise ? paiseToInput(item.actualCostPaise) : "",
    pendingReason: item.pendingReason ?? "",
    notes: item.notes ?? "",
    dependsOnIds: item.dependsOn.map((d) => d.id),
  };
}

async function Work({ params }: { params: PageProps<"/projects/[id]/work">["params"] }) {
  const { id } = await params;
  const user = await requireUser();
  const breakdown = await getWorkBreakdown(user, id);
  if (!breakdown) return null;
  const canManage = can(user, "work.manage");
  const today = todayIST();

  const [engineers, sites] = await Promise.all([engineerOptions(id), projectSites(id)]);
  const phaseName = new Map(breakdown.phases.map((p) => [p.id, p.name]));
  const options: WorkOptions = {
    phases: breakdown.phases.map((p) => ({ id: p.id, name: p.name })),
    sites,
    engineers,
    items: breakdown.items.map((i) => ({ id: i.id, name: i.name, phase: i.parentId ? (phaseName.get(i.parentId) ?? null) : null })),
    showMoney: breakdown.showMoney,
  };

  if (breakdown.phases.length === 0) {
    return (
      <EmptyState
        icon={ListChecks}
        title="No work planned yet"
        description="Start with the standard building stages (foundation, structure, masonry, finishing) or add your own."
        action={
          canManage ? (
            <div className="flex flex-wrap justify-center gap-2">
              <StandardStagesButton projectId={id} prominent />
              <AddPhaseDialog projectId={id} />
            </div>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {canManage && (
        <div className="flex flex-wrap gap-2">
          <WorkItemSheet
            trigger={
              <Button size="lg">
                <Plus className="size-4" /> Add work item
              </Button>
            }
            projectId={id}
            values={{ ...EMPTY_WORK_ITEM, parentId: breakdown.phases[0]?.id ?? "" }}
            options={options}
          />
          <AddPhaseDialog projectId={id} />
          <StandardStagesButton projectId={id} />
        </div>
      )}

      {breakdown.phases.map((phase) => {
        const rows = phase.children.length ? phase.children : [phase];
        return (
          <section key={phase.id} id={`item-${phase.id}`} className="overflow-hidden rounded-xl border bg-card">
            <header className="flex flex-col gap-2 border-b bg-muted/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold">{phase.name}</h2>
                <span className="text-xs text-muted-foreground">
                  {phase.children.length ? `${phase.children.filter((c) => c.status === "COMPLETED").length}/${phase.children.length} done` : "single item"}
                </span>
                {phase.overdueCount > 0 && (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">{phase.overdueCount} overdue</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <ProgressBar value={phase.progress} className="w-40" />
                {canManage && phase.children.length > 0 && (
                  <>
                    <WorkItemSheet
                      trigger={
                        <Button variant="ghost" size="icon-sm" aria-label={`Rename ${phase.name}`}>
                          <Pencil className="size-4" />
                        </Button>
                      }
                      projectId={id}
                      itemId={phase.id}
                      values={toValues(phase)}
                      options={options}
                      isPhase
                    />
                    <DeleteWorkItemButton itemId={phase.id} name={phase.name} isPhase />
                  </>
                )}
              </div>
            </header>
            <ul className="divide-y">
              {rows.map((item) => {
                const due = item.expectedEndDate && item.status !== "COMPLETED" ? describeDue(item.expectedEndDate, today) : null;
                return (
                  <li
                    key={item.id}
                    id={`item-${item.id}`}
                    className={cn("grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto] md:items-center", item.overdue && "bg-red-50/60")}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{item.name}</span>
                        <WorkStatusBadge status={item.status} />
                        {(item.priority === "HIGH" || item.priority === "CRITICAL") && <PriorityBadge priority={item.priority} />}
                      </div>
                      {item.pendingReason && item.status !== "COMPLETED" && (
                        <p className="mt-0.5 text-xs text-amber-800">Pending: {item.pendingReason}</p>
                      )}
                      {item.blockedBy.length > 0 && item.status !== "COMPLETED" && (
                        <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Link2 className="size-3" /> Waiting for {item.blockedBy.map((b) => b.name).join(", ")}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col gap-0.5 text-sm">
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <User className="size-3.5" />
                        {item.engineer?.name ?? item.team ?? "No one assigned"}
                      </span>
                      <span className={cn("text-xs", item.overdue ? "font-semibold text-red-700" : "text-muted-foreground")}>
                        {item.status === "COMPLETED"
                          ? `Finished ${formatDate(item.actualEndDate)}`
                          : item.expectedEndDate
                            ? `Due ${formatDate(item.expectedEndDate)} · ${due}`
                            : "No due date"}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <ProgressBar value={item.percentComplete} tone={item.status === "COMPLETED" ? "good" : item.overdue ? "bad" : "default"} />
                      {breakdown.showMoney && item.estimatedCostPaise ? (
                        <span className="text-xs text-muted-foreground">
                          Est. <Money paise={item.estimatedCostPaise} short />
                          {item.actualCostPaise ? (
                            <>
                              {" "}· Actual <Money paise={item.actualCostPaise} short />
                            </>
                          ) : null}
                        </span>
                      ) : null}
                    </div>
                    {canManage && (
                      <div className="flex items-center gap-1 md:justify-end">
                        <QuickProgress itemId={item.id} name={item.name} status={item.status} percent={item.percentComplete} pendingReason={item.pendingReason} />
                        <WorkItemSheet
                          trigger={
                            <Button variant="ghost" size="icon-sm" aria-label={`Edit ${item.name}`}>
                              <Pencil className="size-4" />
                            </Button>
                          }
                          projectId={id}
                          itemId={item.id}
                          values={toValues(item)}
                          options={options}
                          isPhase={item.parentId === null && phase.children.length > 0}
                        />
                        <DeleteWorkItemButton itemId={item.id} name={item.name} isPhase={item.parentId === null && phase.children.length > 0} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            {canManage && phase.children.length > 0 && (
              <div className="border-t px-4 py-2">
                <WorkItemSheet
                  trigger={
                    <Button variant="ghost" size="sm">
                      <Plus className="size-4" /> Add to {phase.name}
                    </Button>
                  }
                  projectId={id}
                  values={{ ...EMPTY_WORK_ITEM, parentId: phase.id }}
                  options={options}
                />
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
