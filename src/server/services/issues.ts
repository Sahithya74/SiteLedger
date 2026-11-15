import "server-only";
import type { IssueStatus, Priority } from "@/generated/prisma/enums";
import { formatDate, fromDbDate, fromDbDateOrNull, todayIST, toDbDate, type ISODate } from "@/lib/dates";
import { can } from "@/lib/permissions";
import type { CurrentUser } from "@/server/auth/current-user";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { AppError, ForbiddenError, NotFoundError } from "@/server/errors";
import { accessibleProjectIds, assertProjectAccess } from "@/server/scope";

type Actor = Pick<CurrentUser, "id" | "name" | "role" | "permissions">;

const PRIORITY_ORDER: Record<Priority, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

/** Site problems: open first, most serious first. */
export async function listIssues(user: Actor & { id: string }, filter: { projectId?: string; status?: IssueStatus | "OPEN_ANY" } = {}) {
  const ids = await accessibleProjectIds(user);
  const rows = await db.issue.findMany({
    where: {
      ...(ids === null ? {} : { projectId: { in: ids } }),
      ...(filter.projectId ? { projectId: filter.projectId } : {}),
      ...(filter.status === "OPEN_ANY" ? { status: { not: "RESOLVED" } } : filter.status ? { status: filter.status } : {}),
    },
    orderBy: [{ reportedOn: "desc" }, { createdAt: "desc" }],
    take: 300,
    include: { project: { select: { id: true, name: true } }, workItem: { select: { name: true } }, reportedBy: { select: { name: true } } },
  });
  const today = todayIST();
  return rows
    .map((i) => {
      const reportedOn = fromDbDate(i.reportedOn);
      return { ...i, reportedOn, resolvedOn: fromDbDateOrNull(i.resolvedOn), daysOpen: i.status === "RESOLVED" ? null : Math.max(0, Math.round((Date.parse(today) - Date.parse(reportedOn)) / 86_400_000)) };
    })
    .sort((a, b) => Number(a.status === "RESOLVED") - Number(b.status === "RESOLVED") || PRIORITY_ORDER[a.severity] - PRIORITY_ORDER[b.severity]);
}

export type IssueRow = Awaited<ReturnType<typeof listIssues>>[number];

export async function createIssue(
  actor: Actor & { id: string },
  input: { projectId: string; workItemId: string | null; title: string; description: string | null; severity: Priority; reportedOn: ISODate; assignedTo: string | null },
): Promise<void> {
  if (!can(actor, "issues.manage")) throw new ForbiddenError();
  await assertProjectAccess(actor, input.projectId);
  if (input.reportedOn > todayIST()) throw new AppError("The date cannot be in the future.", { reportedOn: "Choose today or earlier." });
  if (input.workItemId) {
    const w = await db.workItem.findFirst({ where: { id: input.workItemId, projectId: input.projectId } });
    if (!w) throw new AppError("Choose a work item of this project.", { workItemId: "Not in this project." });
  }
  await db.$transaction(async (tx) => {
    const issue = await tx.issue.create({ data: { ...input, reportedOn: toDbDate(input.reportedOn), reportedById: actor.id } });
    await audit(tx, {
      actor,
      action: "CREATE",
      entityType: "Issue",
      entityId: issue.id,
      projectId: input.projectId,
      summary: `reported a ${input.severity.toLowerCase()} site issue: "${input.title}"`,
    });
  });
}

export async function updateIssue(actor: Actor & { id: string }, id: string, input: { status: IssueStatus; assignedTo: string | null; resolution: string | null }): Promise<void> {
  if (!can(actor, "issues.manage")) throw new ForbiddenError();
  const issue = await db.issue.findUnique({ where: { id } });
  if (!issue) throw new NotFoundError("issue");
  await assertProjectAccess(actor, issue.projectId);
  if (input.status === "RESOLVED" && !input.resolution) throw new AppError("Write how it was fixed.", { resolution: "Required when resolved." });
  const today = todayIST();
  await db.$transaction(async (tx) => {
    await tx.issue.update({
      where: { id },
      data: { status: input.status, assignedTo: input.assignedTo, resolution: input.resolution, resolvedOn: input.status === "RESOLVED" ? (issue.resolvedOn ?? toDbDate(today)) : null },
    });
    await audit(tx, {
      actor,
      action: input.status !== issue.status ? "STATUS_CHANGE" : "UPDATE",
      entityType: "Issue",
      entityId: id,
      projectId: issue.projectId,
      summary:
        input.status === "RESOLVED" && issue.status !== "RESOLVED"
          ? `resolved site issue "${issue.title}" (reported ${formatDate(issue.reportedOn)}): ${input.resolution}`
          : `updated site issue "${issue.title}"${input.status !== issue.status ? ` to ${input.status.toLowerCase().replace("_", " ")}` : ""}`,
    });
  });
}

/** Work items for the "report issue" form, limited to the person's projects. */
export async function issueWorkItemOptions(user: Actor & { id: string }) {
  const ids = await accessibleProjectIds(user);
  const rows = await db.workItem.findMany({
    where: { deletedAt: null, project: { deletedAt: null, archivedAt: null }, ...(ids === null ? {} : { projectId: { in: ids } }) },
    orderBy: [{ projectId: "asc" }, { sortOrder: "asc" }],
    select: { id: true, name: true, projectId: true },
    take: 2000,
  });
  return rows.map((w) => ({ value: w.id, label: w.name, projectId: w.projectId }));
}
