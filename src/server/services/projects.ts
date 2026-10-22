import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { ProjectStatus } from "@/generated/prisma/enums";
import type { ProjectFormInput } from "@/features/projects/schemas";
import { fromDbDateOrNull, todayIST, toDbDate, type ISODate } from "@/lib/dates";
import { PROJECT_STATUS, PROJECT_TYPE } from "@/lib/labels";
import { formatINR } from "@/lib/money";
import { can } from "@/lib/permissions";
import type { CurrentUser } from "@/server/auth/current-user";
import { audit, describeChanges } from "@/server/audit";
import { db } from "@/server/db";
import { AppError, ForbiddenError, NotFoundError } from "@/server/errors";
import { projectWhere } from "@/server/scope";
import { loadProjectMoney, loadWorkStats } from "@/server/services/project-money";
import { nextCode } from "@/server/services/sequence";

export type ProjectTab = "all" | "active" | "pending" | "completed" | "archived";

const TAB_FILTER: Record<ProjectTab, Prisma.ProjectWhereInput> = {
  all: { archivedAt: null },
  active: { archivedAt: null, status: { in: ["ACTIVE", "DELAYED"] } },
  // "Pending" = not started yet or paused.
  pending: { archivedAt: null, status: { in: ["PLANNING", "ON_HOLD"] } },
  completed: { archivedAt: null, status: "COMPLETED" },
  archived: { archivedAt: { not: null } },
};

export type ProjectListRow = Awaited<ReturnType<typeof listProjects>>[number];

export async function listProjects(user: CurrentUser, options: { tab?: ProjectTab; q?: string } = {}) {
  const tab = options.tab ?? "all";
  const q = options.q?.trim();
  const projects = await db.project.findMany({
    where: {
      AND: [
        projectWhere(user),
        TAB_FILTER[tab],
        q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { code: { contains: q, mode: "insensitive" } },
                { city: { contains: q, mode: "insensitive" } },
                { client: { name: { contains: q, mode: "insensitive" } } },
              ],
            }
          : {},
      ],
    },
    orderBy: [{ archivedAt: "asc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
      type: true,
      city: true,
      startDate: true,
      expectedEndDate: true,
      archivedAt: true,
      client: { select: { id: true, name: true } },
    },
  });
  const ids = projects.map((p) => p.id);
  const showMoney = can(user, "projects.viewMoney");
  const [money, work] = await Promise.all([
    showMoney ? loadProjectMoney(ids) : Promise.resolve(null),
    loadWorkStats(ids),
  ]);
  return projects.map((p) => {
    const m = money?.get(p.id)?.money;
    const w = work.get(p.id);
    return {
      ...p,
      startDate: fromDbDateOrNull(p.startDate),
      expectedEndDate: fromDbDateOrNull(p.expectedEndDate),
      progress: w?.progress ?? 0,
      overdueItems: w?.overdueItems ?? 0,
      health: w?.health.state ?? "unknown",
      valuePaise: m?.projectValuePaise ?? null,
      receivedPaise: m?.receivedPaise ?? null,
      pendingPaise: m?.pendingFromClientPaise ?? null,
    };
  });
}

export async function projectTabCounts(user: CurrentUser): Promise<Record<ProjectTab, number>> {
  const base = projectWhere(user);
  const entries = await Promise.all(
    (Object.keys(TAB_FILTER) as ProjectTab[]).map(
      async (tab) => [tab, await db.project.count({ where: { AND: [base, TAB_FILTER[tab]] } })] as const,
    ),
  );
  return Object.fromEntries(entries) as Record<ProjectTab, number>;
}

/** Full project record for the detail page, or null if not visible to the user. */
export async function getProject(user: CurrentUser, id: string) {
  const project = await db.project.findFirst({
    where: { id, ...projectWhere(user) },
    include: {
      client: { select: { id: true, name: true, phone: true, email: true } },
      sites: { where: { archivedAt: null }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] },
      assignments: { include: { user: { select: { id: true, name: true } } } },
      engineerProjects: { include: { engineer: { select: { id: true, name: true, role: true, phone: true } } } },
    },
  });
  if (!project) return null;
  return {
    ...project,
    startDate: fromDbDateOrNull(project.startDate),
    expectedEndDate: fromDbDateOrNull(project.expectedEndDate),
    actualEndDate: fromDbDateOrNull(project.actualEndDate),
  };
}

export type ProjectDetail = NonNullable<Awaited<ReturnType<typeof getProject>>>;

function toProjectData(input: ProjectFormInput) {
  return {
    name: input.name,
    clientId: input.clientId,
    type: input.type,
    status: input.status,
    description: input.description,
    address: input.address,
    city: input.city,
    state: input.state,
    pincode: input.pincode,
    latitude: input.latitude,
    longitude: input.longitude,
    mapUrl: input.mapUrl,
    startDate: input.startDate ? toDbDate(input.startDate) : null,
    expectedEndDate: input.expectedEndDate ? toDbDate(input.expectedEndDate) : null,
    actualEndDate: input.actualEndDate ? toDbDate(input.actualEndDate) : null,
    quotedPaise: input.quotedPaise,
    contractPaise: input.contractPaise,
    statusNote: input.statusNote,
  };
}

async function assertClientUsable(clientId: string) {
  const client = await db.client.findFirst({ where: { id: clientId, deletedAt: null }, select: { id: true } });
  if (!client) throw new AppError("Choose a client from the list.", { clientId: "Choose a client from the list." });
}

export async function createProject(actor: CurrentUser, input: ProjectFormInput): Promise<{ id: string }> {
  if (!can(actor, "projects.create")) throw new ForbiddenError();
  await assertClientUsable(input.clientId);
  return db.$transaction(async (tx) => {
    const code = await nextCode(tx, "project");
    const project = await tx.project.create({
      data: {
        ...toProjectData(input),
        code,
        sites: { create: { name: "Main site", address: input.address, latitude: input.latitude, longitude: input.longitude, isDefault: true } },
        // A manager who creates a project should be able to see it.
        ...(actor.role === "MANAGER" ? { assignments: { create: { userId: actor.id } } } : {}),
      },
    });
    await audit(tx, {
      actor,
      action: "CREATE",
      entityType: "Project",
      entityId: project.id,
      projectId: project.id,
      summary: `created project ${project.code} "${project.name}"${
        can(actor, "projects.viewMoney") && input.contractPaise > 0n ? ` with contract value ${formatINR(input.contractPaise)}` : ""
      }`,
      after: project,
    });
    return { id: project.id };
  });
}

const money = (v: unknown) => formatINR(typeof v === "bigint" ? v : 0n);
const dateText = (v: unknown) => (v instanceof Date ? fromDbDateOrNull(v)! : v ? String(v) : "blank");

const PROJECT_FIELDS = [
  { key: "name", label: "Name" },
  { key: "clientId", label: "Client" },
  { key: "type", label: "Type", format: (v: unknown) => PROJECT_TYPE[v as keyof typeof PROJECT_TYPE] ?? String(v) },
  { key: "status", label: "Status", format: (v: unknown) => PROJECT_STATUS[v as ProjectStatus]?.label ?? String(v) },
  { key: "address", label: "Address" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "pincode", label: "PIN code" },
  { key: "latitude", label: "Latitude" },
  { key: "longitude", label: "Longitude" },
  { key: "mapUrl", label: "Map link" },
  { key: "description", label: "Description" },
  { key: "startDate", label: "Start date", format: dateText },
  { key: "expectedEndDate", label: "Expected completion", format: dateText },
  { key: "actualEndDate", label: "Actual completion", format: dateText },
  { key: "quotedPaise", label: "Quoted amount", format: money },
  { key: "contractPaise", label: "Contract amount", format: money },
  { key: "statusNote", label: "Status note" },
] as const;

export async function updateProject(actor: CurrentUser, id: string, input: ProjectFormInput): Promise<void> {
  if (!can(actor, "projects.edit")) throw new ForbiddenError();
  const existing = await db.project.findFirst({ where: { id, ...projectWhere(actor) } });
  if (!existing) throw new NotFoundError("project");
  await assertClientUsable(input.clientId);

  const data = toProjectData(input);
  // Managers without money access cannot see — so must not change — amounts.
  if (!can(actor, "projects.viewMoney")) {
    data.quotedPaise = existing.quotedPaise;
    data.contractPaise = existing.contractPaise;
  }
  if (data.status !== existing.status && !can(actor, "projects.updateStatus")) data.status = existing.status;

  const changes = describeChanges(existing, data, [...PROJECT_FIELDS]);
  if (!changes.changed) return;

  await db.$transaction(async (tx) => {
    await tx.project.update({ where: { id }, data });
    await audit(tx, {
      actor,
      action: "UPDATE",
      entityType: "Project",
      entityId: id,
      projectId: id,
      summary: `changed ${existing.name}: ${changes.text}`,
      before: changes.before,
      after: changes.after,
    });
  });
}

export async function changeProjectStatus(
  actor: CurrentUser,
  id: string,
  input: { status: ProjectStatus; statusNote: string | null; actualEndDate: ISODate | null },
): Promise<void> {
  if (!can(actor, "projects.updateStatus")) throw new ForbiddenError();
  const existing = await db.project.findFirst({ where: { id, ...projectWhere(actor) } });
  if (!existing) throw new NotFoundError("project");
  if (existing.archivedAt) throw new AppError("Restore this project before changing its status.");

  const actualEndDate =
    input.status === "COMPLETED"
      ? toDbDate(input.actualEndDate ?? fromDbDateOrNull(existing.actualEndDate) ?? todayIST())
      : existing.actualEndDate;

  await db.$transaction(async (tx) => {
    await tx.project.update({
      where: { id },
      data: { status: input.status, statusNote: input.statusNote, actualEndDate },
    });
    await audit(tx, {
      actor,
      action: "STATUS_CHANGE",
      entityType: "Project",
      entityId: id,
      projectId: id,
      summary: `changed status of ${existing.name} from ${PROJECT_STATUS[existing.status].label} to ${
        PROJECT_STATUS[input.status].label
      }${input.statusNote ? ` — "${input.statusNote}"` : ""}`,
      before: { status: existing.status, statusNote: existing.statusNote },
      after: { status: input.status, statusNote: input.statusNote },
    });
  });
}

/** Counts records that make a project part of the financial history. */
export async function financialRecordCount(projectId: string): Promise<number> {
  const where = { projectId };
  const counts = await Promise.all([
    db.clientPayment.count({ where }),
    db.payment.count({ where }),
    db.expense.count({ where }),
    db.otherIncome.count({ where }),
    db.purchase.count({ where }),
    db.invoice.count({ where }),
    db.contractorBill.count({ where }),
    db.attendance.count({ where }),
  ]);
  return counts.reduce((a, b) => a + b, 0);
}

export const FINANCIAL_DELETE_MESSAGE =
  "This project contains financial records and cannot be permanently deleted. You can archive it instead.";

export async function archiveProject(actor: CurrentUser, id: string, reason: string | null): Promise<void> {
  if (!can(actor, "projects.archive")) throw new ForbiddenError();
  const existing = await db.project.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new NotFoundError("project");
  if (existing.archivedAt) return;
  await db.$transaction(async (tx) => {
    await tx.project.update({ where: { id }, data: { archivedAt: new Date() } });
    await audit(tx, {
      actor,
      action: "ARCHIVE",
      entityType: "Project",
      entityId: id,
      projectId: id,
      summary: `archived project ${existing.name}${reason ? ` — "${reason}"` : ""}`,
    });
  });
}

export async function restoreProject(actor: CurrentUser, id: string): Promise<void> {
  if (!can(actor, "projects.archive")) throw new ForbiddenError();
  const existing = await db.project.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new NotFoundError("project");
  if (!existing.archivedAt) return;
  await db.$transaction(async (tx) => {
    await tx.project.update({ where: { id }, data: { archivedAt: null } });
    await audit(tx, {
      actor,
      action: "RESTORE",
      entityType: "Project",
      entityId: id,
      projectId: id,
      summary: `restored archived project ${existing.name}`,
    });
  });
}

/**
 * Permanently deletes a project. Only allowed for projects with no financial
 * records and no work history — everything else must be archived instead.
 */
export async function deleteProject(actor: CurrentUser, id: string): Promise<void> {
  if (!can(actor, "projects.delete")) throw new ForbiddenError();
  const existing = await db.project.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new NotFoundError("project");
  if ((await financialRecordCount(id)) > 0) throw new AppError(FINANCIAL_DELETE_MESSAGE);

  const other = await Promise.all([
    db.workItem.count({ where: { projectId: id, deletedAt: null } }),
    db.inventoryTransaction.count({ where: { projectId: id } }),
    db.dailyReport.count({ where: { projectId: id } }),
    db.quotation.count({ where: { projectId: id, deletedAt: null } }),
    db.document.count({ where: { projectId: id, deletedAt: null } }),
    db.issue.count({ where: { projectId: id } }),
    db.engineerTask.count({ where: { projectId: id } }),
  ]);
  if (other.some((n) => n > 0)) {
    throw new AppError(
      "This project already has work, stock, reports or documents recorded, so it cannot be permanently deleted. You can archive it instead.",
    );
  }

  await db.$transaction(async (tx) => {
    // Soft delete keeps the code reserved and the audit trail meaningful.
    await tx.project.update({ where: { id }, data: { deletedAt: new Date(), archivedAt: existing.archivedAt ?? new Date() } });
    await tx.projectAssignment.deleteMany({ where: { projectId: id } });
    await audit(tx, {
      actor,
      action: "DELETE",
      entityType: "Project",
      entityId: id,
      projectId: id,
      summary: `deleted empty project ${existing.code} "${existing.name}"`,
      before: existing,
    });
  });
}

export async function updateProjectLocation(
  actor: CurrentUser,
  id: string,
  input: { latitude: number | null; longitude: number | null; address: string | null },
): Promise<void> {
  if (!can(actor, "projects.edit")) throw new ForbiddenError();
  const existing = await db.project.findFirst({ where: { id, ...projectWhere(actor) } });
  if (!existing) throw new NotFoundError("project");
  const changes = describeChanges(existing, input, [
    { key: "latitude", label: "Latitude" },
    { key: "longitude", label: "Longitude" },
    { key: "address", label: "Address" },
  ]);
  if (!changes.changed) return;
  await db.$transaction(async (tx) => {
    await tx.project.update({ where: { id }, data: input });
    // Keep the default site's pin in step with the project's pin.
    await tx.site.updateMany({
      where: { projectId: id, isDefault: true },
      data: { latitude: input.latitude, longitude: input.longitude, ...(input.address ? { address: input.address } : {}) },
    });
    await audit(tx, {
      actor,
      action: "UPDATE",
      entityType: "Project",
      entityId: id,
      projectId: id,
      summary: `updated the location of ${existing.name}: ${changes.text}`,
      before: changes.before,
      after: changes.after,
    });
  });
}

export async function projectSites(projectId: string) {
  return db.site.findMany({
    where: { projectId, archivedAt: null },
    select: { id: true, name: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
}

/** Simple id/name list for dropdowns, limited to what the user can see. */
export async function projectOptions(user: CurrentUser, options: { includeClosed?: boolean } = {}) {
  return db.project.findMany({
    where: {
      ...projectWhere(user),
      archivedAt: null,
      ...(options.includeClosed ? {} : { status: { notIn: ["CANCELLED"] } }),
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, code: true, clientId: true, client: { select: { name: true } } },
  });
}

export async function setProjectManagers(actor: CurrentUser, projectId: string, managerIds: string[]): Promise<void> {
  if (actor.role !== "ADMIN") throw new ForbiddenError();
  const project = await db.project.findFirst({ where: { id: projectId, deletedAt: null }, select: { id: true, name: true } });
  if (!project) throw new NotFoundError("project");
  const managers = await db.user.findMany({ where: { id: { in: managerIds }, role: "MANAGER" }, select: { id: true, name: true } });
  await db.$transaction(async (tx) => {
    await tx.projectAssignment.deleteMany({ where: { projectId } });
    if (managers.length) {
      await tx.projectAssignment.createMany({ data: managers.map((m) => ({ projectId, userId: m.id })) });
    }
    await audit(tx, {
      actor,
      action: "PERMISSION_CHANGE",
      entityType: "Project",
      entityId: projectId,
      projectId,
      summary: `set managers for ${project.name}: ${managers.map((m) => m.name).join(", ") || "none"}`,
    });
  });
}
