import "server-only";
import type { Priority, WorkStatus } from "@/generated/prisma/enums";
import type { WorkItemFormInput } from "@/features/work/schemas";
import { diffDays, fromDbDateOrNull, todayIST, toDbDate, type ISODate } from "@/lib/dates";
import { PRIORITY, WORK_STATUS } from "@/lib/labels";
import { formatINR } from "@/lib/money";
import { can } from "@/lib/permissions";
import {
  createsDependencyCycle,
  isOverdue,
  normalizeWorkUpdate,
  phaseProgress,
  type ProgressItem,
} from "@/lib/progress";
import { STANDARD_STAGES } from "@/lib/work-templates";
import type { CurrentUser } from "@/server/auth/current-user";
import { audit, describeChanges } from "@/server/audit";
import { db } from "@/server/db";
import { AppError, ForbiddenError, NotFoundError } from "@/server/errors";
import { projectWhere } from "@/server/scope";

const WORK_SELECT = {
  id: true,
  projectId: true,
  parentId: true,
  siteId: true,
  name: true,
  description: true,
  sortOrder: true,
  status: true,
  priority: true,
  percentComplete: true,
  team: true,
  startDate: true,
  expectedEndDate: true,
  actualEndDate: true,
  estimatedCostPaise: true,
  actualCostPaise: true,
  pendingReason: true,
  notes: true,
  updatedAt: true,
  engineer: { select: { id: true, name: true, phone: true } },
  site: { select: { id: true, name: true } },
  dependsOn: { select: { dependsOn: { select: { id: true, name: true, status: true } } } },
} as const;

/** The project's work breakdown as phases with their items, plus roll-ups. */
export async function getWorkBreakdown(user: CurrentUser, projectId: string) {
  const project = await db.project.findFirst({ where: { id: projectId, ...projectWhere(user) }, select: { id: true } });
  if (!project) return null;
  const rows = await db.workItem.findMany({
    where: { projectId, deletedAt: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: WORK_SELECT,
  });
  const showMoney = can(user, "projects.viewMoney");
  const today = todayIST();
  const items = rows.map((r) => ({
    ...r,
    startDate: fromDbDateOrNull(r.startDate),
    expectedEndDate: fromDbDateOrNull(r.expectedEndDate),
    actualEndDate: fromDbDateOrNull(r.actualEndDate),
    estimatedCostPaise: showMoney ? r.estimatedCostPaise : null,
    actualCostPaise: showMoney ? r.actualCostPaise : null,
    dependsOn: r.dependsOn.map((d) => d.dependsOn),
    blockedBy: r.dependsOn.map((d) => d.dependsOn).filter((d) => d.status !== "COMPLETED"),
    overdue: isOverdue({ status: r.status, expectedEndDate: fromDbDateOrNull(r.expectedEndDate) }, today),
  }));
  const progressInput: ProgressItem[] = rows.map((r) => ({
    id: r.id,
    parentId: r.parentId,
    status: r.status,
    percentComplete: r.percentComplete,
    estimatedCostPaise: r.estimatedCostPaise,
  }));
  const phaseProgressMap = phaseProgress(progressInput);
  const phases = items
    .filter((i) => !i.parentId)
    .map((phase) => {
      const children = items.filter((i) => i.parentId === phase.id);
      return {
        ...phase,
        progress: phaseProgressMap.get(phase.id) ?? 0,
        children,
        overdueCount: children.filter((c) => c.overdue).length + (children.length === 0 && phase.overdue ? 1 : 0),
      };
    });
  return { phases, items, showMoney };
}

export type WorkBreakdown = NonNullable<Awaited<ReturnType<typeof getWorkBreakdown>>>;
export type WorkItemRow = WorkBreakdown["items"][number];

async function loadProjectForWork(user: CurrentUser, projectId: string) {
  if (!can(user, "work.manage")) throw new ForbiddenError();
  const project = await db.project.findFirst({
    where: { id: projectId, ...projectWhere(user) },
    select: { id: true, name: true, archivedAt: true },
  });
  if (!project) throw new NotFoundError("project");
  if (project.archivedAt) throw new AppError("This project is archived. Restore it before changing its work.");
  return project;
}

async function validateRelations(projectId: string, input: Pick<WorkItemFormInput, "parentId" | "siteId" | "engineerId">, itemId?: string) {
  if (input.parentId) {
    if (input.parentId === itemId) throw new AppError("A work item cannot be inside itself.");
    const parent = await db.workItem.findFirst({
      where: { id: input.parentId, projectId, deletedAt: null, parentId: null },
      select: { id: true },
    });
    if (!parent) throw new AppError("Choose a stage from this project.", { parentId: "Choose a stage from this project." });
    if (itemId) {
      const hasChildren = await db.workItem.count({ where: { parentId: itemId, deletedAt: null } });
      if (hasChildren) throw new AppError("This is a stage with work items inside it, so it cannot be moved under another stage.");
    }
  }
  if (input.siteId) {
    const site = await db.site.findFirst({ where: { id: input.siteId, projectId }, select: { id: true } });
    if (!site) throw new AppError("Choose a site from this project.", { siteId: "Choose a site from this project." });
  }
  if (input.engineerId) {
    const engineer = await db.engineer.findFirst({ where: { id: input.engineerId, deletedAt: null }, select: { id: true } });
    if (!engineer) throw new AppError("Choose an engineer from the list.", { engineerId: "Choose an engineer from the list." });
  }
}

async function validateDependencies(projectId: string, itemId: string | null, dependsOnIds: string[]): Promise<string[]> {
  const unique = [...new Set(dependsOnIds)].filter((id) => id !== itemId);
  if (unique.length === 0) return [];
  const valid = await db.workItem.findMany({
    where: { id: { in: unique }, projectId, deletedAt: null },
    select: { id: true },
  });
  if (valid.length !== unique.length) throw new AppError("Some of the selected 'must finish first' items are not in this project.");
  if (itemId) {
    const edges = await db.workItemDependency.findMany({
      where: { workItem: { projectId } },
      select: { workItemId: true, dependsOnId: true },
    });
    const map = new Map<string, string[]>();
    for (const e of edges) {
      if (e.workItemId === itemId) continue;
      map.set(e.workItemId, [...(map.get(e.workItemId) ?? []), e.dependsOnId]);
    }
    if (createsDependencyCycle(map, itemId, unique)) {
      throw new AppError("These items would wait for each other in a loop. Remove one of the 'must finish first' links.", {
        dependsOnIds: "This would create a loop.",
      });
    }
  }
  return unique;
}

/** A gentle warning when work starts before the work it depends on is finished. */
async function dependencyWarning(itemId: string, status: WorkStatus): Promise<string | undefined> {
  if (status !== "IN_PROGRESS" && status !== "COMPLETED") return undefined;
  const open = await db.workItemDependency.findMany({
    where: { workItemId: itemId, dependsOn: { status: { not: "COMPLETED" }, deletedAt: null } },
    select: { dependsOn: { select: { name: true } } },
  });
  if (open.length === 0) return undefined;
  const names = open.map((o) => o.dependsOn.name).join(", ");
  return `Saved. Note: ${names} ${open.length === 1 ? "is" : "are"} not finished yet.`;
}

function itemData(input: WorkItemFormInput, today: ISODate) {
  const normalized = normalizeWorkUpdate(
    { status: input.status, percentComplete: input.percentComplete, actualEndDate: input.actualEndDate },
    today,
  );
  return {
    name: input.name,
    description: input.description,
    parentId: input.parentId,
    siteId: input.siteId,
    status: normalized.status as WorkStatus,
    priority: input.priority,
    percentComplete: normalized.percentComplete,
    engineerId: input.engineerId,
    team: input.team,
    startDate: input.startDate ? toDbDate(input.startDate) : null,
    expectedEndDate: input.expectedEndDate ? toDbDate(input.expectedEndDate) : null,
    actualEndDate: normalized.actualEndDate ? toDbDate(normalized.actualEndDate) : null,
    estimatedCostPaise: input.estimatedCostPaise,
    actualCostPaise: input.actualCostPaise,
    pendingReason: normalized.status === "COMPLETED" ? null : input.pendingReason,
    notes: input.notes,
  };
}

export async function createWorkItem(
  actor: CurrentUser,
  projectId: string,
  input: WorkItemFormInput,
): Promise<{ id: string; warning?: string }> {
  const project = await loadProjectForWork(actor, projectId);
  await validateRelations(projectId, input);
  const dependsOn = await validateDependencies(projectId, null, input.dependsOnIds);
  const data = itemData(input, todayIST());
  if (!can(actor, "projects.viewMoney")) {
    data.estimatedCostPaise = 0n;
    data.actualCostPaise = 0n;
  }
  const last = await db.workItem.aggregate({
    where: { projectId, parentId: input.parentId, deletedAt: null },
    _max: { sortOrder: true },
  });
  const item = await db.$transaction(async (tx) => {
    const created = await tx.workItem.create({
      data: {
        ...data,
        projectId,
        sortOrder: (last._max.sortOrder ?? 0) + 10,
        dependsOn: { create: dependsOn.map((dependsOnId) => ({ dependsOnId })) },
      },
    });
    await audit(tx, {
      actor,
      action: "CREATE",
      entityType: "WorkItem",
      entityId: created.id,
      projectId,
      summary: `added ${input.parentId ? "work" : "stage"} "${created.name}" to ${project.name}`,
      after: created,
    });
    return created;
  });
  return { id: item.id, warning: await dependencyWarning(item.id, item.status) };
}

export async function createPhase(
  actor: CurrentUser,
  projectId: string,
  input: { name: string; description: string | null },
): Promise<{ id: string }> {
  const project = await loadProjectForWork(actor, projectId);
  const last = await db.workItem.aggregate({ where: { projectId, parentId: null, deletedAt: null }, _max: { sortOrder: true } });
  return db.$transaction(async (tx) => {
    const created = await tx.workItem.create({
      data: { projectId, name: input.name, description: input.description, sortOrder: (last._max.sortOrder ?? 0) + 10 },
    });
    await audit(tx, {
      actor,
      action: "CREATE",
      entityType: "WorkItem",
      entityId: created.id,
      projectId,
      summary: `added stage "${created.name}" to ${project.name}`,
    });
    return { id: created.id };
  });
}

const fmtDate = (v: unknown) => (v instanceof Date ? fromDbDateOrNull(v)! : "blank");
const WORK_FIELDS = [
  { key: "name", label: "Name" },
  { key: "description", label: "Description" },
  { key: "parentId", label: "Stage" },
  { key: "siteId", label: "Site" },
  { key: "status", label: "Status", format: (v: unknown) => WORK_STATUS[v as WorkStatus]?.label ?? String(v) },
  { key: "priority", label: "Priority", format: (v: unknown) => PRIORITY[v as Priority]?.label ?? String(v) },
  { key: "percentComplete", label: "Progress", format: (v: unknown) => `${v}%` },
  { key: "engineerId", label: "Engineer" },
  { key: "team", label: "Team" },
  { key: "startDate", label: "Start date", format: fmtDate },
  { key: "expectedEndDate", label: "Expected completion", format: fmtDate },
  { key: "actualEndDate", label: "Actual completion", format: fmtDate },
  { key: "estimatedCostPaise", label: "Estimated cost", format: (v: unknown) => formatINR(v as bigint) },
  { key: "actualCostPaise", label: "Actual cost", format: (v: unknown) => formatINR(v as bigint) },
  { key: "pendingReason", label: "Reason pending" },
  { key: "notes", label: "Notes" },
] as const;

export async function updateWorkItem(
  actor: CurrentUser,
  itemId: string,
  input: WorkItemFormInput,
): Promise<{ warning?: string }> {
  const existing = await db.workItem.findFirst({
    where: { id: itemId, deletedAt: null },
    include: { dependsOn: { select: { dependsOnId: true } } },
  });
  if (!existing) throw new NotFoundError("work item");
  const project = await loadProjectForWork(actor, existing.projectId);
  await validateRelations(existing.projectId, input, itemId);
  const dependsOn = await validateDependencies(existing.projectId, itemId, input.dependsOnIds);

  const data = itemData(input, todayIST());
  if (!can(actor, "projects.viewMoney")) {
    data.estimatedCostPaise = existing.estimatedCostPaise;
    data.actualCostPaise = existing.actualCostPaise;
  }
  const currentDeps = existing.dependsOn.map((d) => d.dependsOnId).sort();
  const depsChanged = currentDeps.join() !== [...dependsOn].sort().join();
  const changes = describeChanges(existing, data, [...WORK_FIELDS]);
  if (!changes.changed && !depsChanged) return {};

  await db.$transaction(async (tx) => {
    await tx.workItem.update({ where: { id: itemId }, data });
    if (depsChanged) {
      await tx.workItemDependency.deleteMany({ where: { workItemId: itemId } });
      if (dependsOn.length) {
        await tx.workItemDependency.createMany({ data: dependsOn.map((dependsOnId) => ({ workItemId: itemId, dependsOnId })) });
      }
    }
    await audit(tx, {
      actor,
      action: changes.before.status !== undefined ? "STATUS_CHANGE" : "UPDATE",
      entityType: "WorkItem",
      entityId: itemId,
      projectId: existing.projectId,
      summary: `updated "${existing.name}" on ${project.name}: ${[changes.text, depsChanged ? "changed 'must finish first' items" : ""]
        .filter(Boolean)
        .join("; ")}`,
      before: { ...changes.before, ...(depsChanged ? { dependsOn: currentDeps } : {}) },
      after: { ...changes.after, ...(depsChanged ? { dependsOn } : {}) },
    });
  });
  return { warning: await dependencyWarning(itemId, data.status) };
}

/** Fast update from the work list: status, % and reason only. */
export async function updateWorkProgress(
  actor: CurrentUser,
  itemId: string,
  input: { status: WorkStatus; percentComplete: number; pendingReason: string | null },
): Promise<{ warning?: string }> {
  const existing = await db.workItem.findFirst({ where: { id: itemId, deletedAt: null } });
  if (!existing) throw new NotFoundError("work item");
  const project = await loadProjectForWork(actor, existing.projectId);
  const normalized = normalizeWorkUpdate(
    { status: input.status, percentComplete: input.percentComplete, actualEndDate: fromDbDateOrNull(existing.actualEndDate) },
    todayIST(),
  );
  const data = {
    status: normalized.status as WorkStatus,
    percentComplete: normalized.percentComplete,
    actualEndDate: normalized.actualEndDate ? toDbDate(normalized.actualEndDate) : null,
    pendingReason: normalized.status === "COMPLETED" ? null : input.pendingReason,
  };
  const changes = describeChanges(existing, data, [...WORK_FIELDS]);
  if (!changes.changed) return {};
  await db.$transaction(async (tx) => {
    await tx.workItem.update({ where: { id: itemId }, data });
    await audit(tx, {
      actor,
      action: "STATUS_CHANGE",
      entityType: "WorkItem",
      entityId: itemId,
      projectId: existing.projectId,
      summary: `updated "${existing.name}" on ${project.name}: ${changes.text}`,
      before: changes.before,
      after: changes.after,
    });
  });
  return { warning: await dependencyWarning(itemId, data.status) };
}

export async function deleteWorkItem(actor: CurrentUser, itemId: string): Promise<void> {
  const existing = await db.workItem.findFirst({ where: { id: itemId, deletedAt: null } });
  if (!existing) throw new NotFoundError("work item");
  const project = await loadProjectForWork(actor, existing.projectId);
  const children = await db.workItem.count({ where: { parentId: itemId, deletedAt: null } });
  if (children > 0) throw new AppError("Remove or move the work items inside this stage first.");
  await db.$transaction(async (tx) => {
    await tx.workItem.update({ where: { id: itemId }, data: { deletedAt: new Date() } });
    await tx.workItemDependency.deleteMany({ where: { OR: [{ workItemId: itemId }, { dependsOnId: itemId }] } });
    await audit(tx, {
      actor,
      action: "DELETE",
      entityType: "WorkItem",
      entityId: itemId,
      projectId: existing.projectId,
      summary: `removed "${existing.name}" from ${project.name}`,
      before: existing,
    });
  });
}

/**
 * Loads the standard Foundation / Structure / Masonry / Finishing breakdown.
 * Stages that already exist (same name) are skipped.
 */
export async function addStandardStages(actor: CurrentUser, projectId: string): Promise<{ added: number }> {
  const project = await loadProjectForWork(actor, projectId);
  const existingPhases = await db.workItem.findMany({
    where: { projectId, parentId: null, deletedAt: null },
    select: { name: true, sortOrder: true },
  });
  const existingNames = new Set(existingPhases.map((p) => p.name.trim().toLowerCase()));
  const toAdd = STANDARD_STAGES.filter((p) => !existingNames.has(p.name.toLowerCase()));
  if (toAdd.length === 0) return { added: 0 };
  let sortOrder = Math.max(0, ...existingPhases.map((p) => p.sortOrder));

  return db.$transaction(async (tx) => {
    const idByName = new Map<string, string>();
    let added = 0;
    for (const phase of toAdd) {
      sortOrder += 10;
      const created = await tx.workItem.create({ data: { projectId, name: phase.name, sortOrder } });
      added++;
      let childOrder = 0;
      for (const item of phase.items) {
        childOrder += 10;
        const child = await tx.workItem.create({
          data: { projectId, parentId: created.id, name: item.name, sortOrder: childOrder },
        });
        idByName.set(item.name, child.id);
        added++;
      }
    }
    const links = toAdd.flatMap((phase) =>
      phase.items.flatMap((item) =>
        (item.after ?? [])
          .map((dep) => ({ workItemId: idByName.get(item.name)!, dependsOnId: idByName.get(dep) }))
          .filter((l): l is { workItemId: string; dependsOnId: string } => Boolean(l.dependsOnId)),
      ),
    );
    if (links.length) await tx.workItemDependency.createMany({ data: links });
    await audit(tx, {
      actor,
      action: "CREATE",
      entityType: "WorkItem",
      projectId,
      summary: `added the standard stages (${toAdd.map((p) => p.name).join(", ")}) to ${project.name}`,
    });
    return { added };
  });
}

export type PendingWorkFilter = { projectId?: string; priority?: Priority; overdueOnly?: boolean };

/** Every unfinished work item across the projects the user can see (spec §8). */
export async function listPendingWork(user: CurrentUser, filter: PendingWorkFilter = {}) {
  const today = todayIST();
  const rows = await db.workItem.findMany({
    where: {
      deletedAt: null,
      status: { not: "COMPLETED" },
      // only real work, not stage headings that contain items
      children: { none: { deletedAt: null } },
      project: { ...projectWhere(user), archivedAt: null, status: { notIn: ["CANCELLED", "COMPLETED"] } },
      ...(filter.projectId ? { projectId: filter.projectId } : {}),
      ...(filter.priority ? { priority: filter.priority } : {}),
      ...(filter.overdueOnly ? { expectedEndDate: { lt: toDbDate(today) } } : {}),
    },
    select: {
      id: true,
      name: true,
      status: true,
      priority: true,
      percentComplete: true,
      team: true,
      expectedEndDate: true,
      pendingReason: true,
      estimatedCostPaise: true,
      project: { select: { id: true, name: true } },
      site: { select: { name: true } },
      parent: { select: { name: true } },
      engineer: { select: { id: true, name: true, phone: true } },
      dependsOn: { where: { dependsOn: { status: { not: "COMPLETED" }, deletedAt: null } }, select: { dependsOn: { select: { name: true } } } },
    },
  });
  const showMoney = can(user, "projects.viewMoney");
  const priorityRank: Record<Priority, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  return rows
    .map((r) => {
      const due = fromDbDateOrNull(r.expectedEndDate);
      const daysRemaining = due ? diffDays(due, today) : null;
      return {
        id: r.id,
        name: r.name,
        phase: r.parent?.name ?? null,
        status: r.status,
        priority: r.priority,
        percentComplete: r.percentComplete,
        project: r.project,
        site: r.site?.name ?? null,
        responsible: r.engineer?.name ?? r.team ?? null,
        engineer: r.engineer,
        dueDate: due,
        daysRemaining,
        overdue: daysRemaining !== null && daysRemaining < 0,
        pendingReason: r.pendingReason,
        estimatedCostPaise: showMoney ? r.estimatedCostPaise : null,
        waitingFor: r.dependsOn.map((d) => d.dependsOn.name),
      };
    })
    .sort(
      (a, b) =>
        Number(b.overdue) - Number(a.overdue) ||
        (a.daysRemaining ?? 9999) - (b.daysRemaining ?? 9999) ||
        priorityRank[a.priority] - priorityRank[b.priority],
    );
}

export type PendingWorkRow = Awaited<ReturnType<typeof listPendingWork>>[number];
