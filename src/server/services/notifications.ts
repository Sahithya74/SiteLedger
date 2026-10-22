import "server-only";
import type { DeliveryChannel, Severity } from "@/generated/prisma/enums";
import { addDays, formatDate, fromDbDate, fromDbDateOrNull, todayIST, toDbDate, type ISODate } from "@/lib/dates";
import { can } from "@/lib/permissions";
import type { CurrentUser } from "@/server/auth/current-user";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { AppError, ForbiddenError, NotFoundError } from "@/server/errors";
import { accessibleProjectIds } from "@/server/scope";

type Actor = Pick<CurrentUser, "id" | "name" | "role" | "permissions">;

/** Stored notifications this person may see: their projects, plus company-wide ones (owner-only ones for the owner). */
async function visibleWhere(user: Actor & { id: string }) {
  const ids = await accessibleProjectIds(user);
  return {
    ...(user.role === "ADMIN" ? {} : { adminOnly: false }),
    ...(ids === null ? {} : { OR: [{ projectId: null }, { projectId: { in: ids } }] }),
  };
}

export async function listNotifications(user: Actor & { id: string }, filter: { open?: boolean } = {}) {
  const rows = await db.notification.findMany({
    where: { ...(await visibleWhere(user)), ...(filter.open ? { resolvedAt: null } : {}) },
    orderBy: [{ resolvedAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }],
    take: 200,
    include: {
      project: { select: { id: true, name: true } },
      engineer: { select: { id: true, name: true, phone: true } },
      reads: { where: { userId: user.id }, select: { readAt: true } },
      deliveries: { orderBy: { sentAt: "desc" }, include: { sentBy: { select: { name: true } } } },
    },
  });
  return rows.map((n) => ({ ...n, dueDate: fromDbDateOrNull(n.dueDate), read: n.reads.length > 0 }));
}

export type NotificationRow = Awaited<ReturnType<typeof listNotifications>>[number];

export async function unreadCount(user: Actor & { id: string }): Promise<number> {
  return db.notification.count({ where: { ...(await visibleWhere(user)), resolvedAt: null, reads: { none: { userId: user.id } } } });
}

export async function markAllRead(user: Actor & { id: string }): Promise<void> {
  const unread = await db.notification.findMany({
    where: { ...(await visibleWhere(user)), reads: { none: { userId: user.id } } },
    select: { id: true },
  });
  if (unread.length) await db.notificationRead.createMany({ data: unread.map((n) => ({ notificationId: n.id, userId: user.id })), skipDuplicates: true });
}

/** A reminder written by the owner or manager — usually for an engineer. */
export async function createReminder(
  actor: Actor & { id: string },
  input: { engineerId: string | null; projectId: string | null; title: string; message: string; dueDate: ISODate | null; severity: Severity },
): Promise<{ id: string }> {
  if (!can(actor, "engineers.manage")) throw new ForbiddenError();
  if (input.projectId) {
    const ids = await accessibleProjectIds(actor);
    if (ids !== null && !ids.includes(input.projectId)) throw new NotFoundError("project");
  }
  return db.$transaction(async (tx) => {
    const n = await tx.notification.create({
      data: {
        kind: input.engineerId ? "ENGINEER_REMINDER" : "REMINDER",
        severity: input.severity,
        title: input.title,
        message: input.message,
        engineerId: input.engineerId,
        projectId: input.projectId,
        dueDate: input.dueDate ? toDbDate(input.dueDate) : null,
        link: input.engineerId ? `/engineers/${input.engineerId}` : input.projectId ? `/projects/${input.projectId}` : null,
      },
    });
    await tx.notificationRead.create({ data: { notificationId: n.id, userId: actor.id } });
    await audit(tx, { actor, action: "CREATE", entityType: "Notification", entityId: n.id, projectId: input.projectId, summary: `created reminder "${input.title}"` });
    return { id: n.id };
  });
}

/** Records that a reminder was passed on (call, WhatsApp, in person…). Nothing is sent automatically. */
export async function recordDelivery(
  actor: Actor & { id: string },
  notificationId: string,
  input: { channel: DeliveryChannel; note: string | null; resolve: boolean },
): Promise<void> {
  const n = await db.notification.findUnique({ where: { id: notificationId }, include: { engineer: { select: { name: true, phone: true } } } });
  if (!n) throw new NotFoundError("reminder");
  const ids = await accessibleProjectIds(actor);
  if (n.projectId && ids !== null && !ids.includes(n.projectId)) throw new NotFoundError("reminder");
  await db.$transaction(async (tx) => {
    await tx.notificationDelivery.create({
      data: {
        notificationId,
        channel: input.channel,
        recipientName: n.engineer?.name ?? "—",
        recipientPhone: n.engineer?.phone ?? null,
        note: input.note,
        sentById: actor.id,
      },
    });
    if (input.resolve) await tx.notification.update({ where: { id: notificationId }, data: { resolvedAt: new Date() } });
    await audit(tx, {
      actor,
      action: "UPDATE",
      entityType: "Notification",
      entityId: notificationId,
      projectId: n.projectId,
      summary: `passed on reminder "${n.title}"${n.engineer ? ` to ${n.engineer.name}` : ""} by ${input.channel.toLowerCase().replace("_", " ")}`,
    });
  });
}

export async function resolveNotification(actor: Actor & { id: string }, id: string, resolved: boolean): Promise<void> {
  const n = await db.notification.findUnique({ where: { id } });
  if (!n) throw new NotFoundError("reminder");
  if (n.adminOnly && actor.role !== "ADMIN") throw new ForbiddenError();
  await db.notification.update({ where: { id }, data: { resolvedAt: resolved ? new Date() : null } });
  await db.notificationRead.upsert({ where: { notificationId_userId: { notificationId: id, userId: actor.id } }, create: { notificationId: id, userId: actor.id }, update: {} });
}

/**
 * Engineer tasks that are due by tomorrow or late, and whether they were
 * already reminded today. Shown on the notifications page so nothing slips.
 */
export async function taskReminderSuggestions(user: CurrentUser, today: ISODate = todayIST()) {
  const ids = await accessibleProjectIds(user);
  const tasks = await db.engineerTask.findMany({
    where: {
      status: { not: "COMPLETED" },
      dueDate: { lte: toDbDate(addDays(today, 1)) },
      engineer: { deletedAt: null, isActive: true },
      ...(ids === null ? {} : { projectId: { in: ids } }),
    },
    orderBy: { dueDate: "asc" },
    include: { engineer: { select: { id: true, name: true, phone: true } }, project: { select: { id: true, name: true } } },
    take: 50,
  });
  const keys = tasks.map((t) => `task:${t.id}:${today}`);
  const sent = await db.notification.findMany({ where: { dedupeKey: { in: keys } }, select: { dedupeKey: true, deliveries: { select: { channel: true, sentAt: true } } } });
  return tasks.map((t) => {
    const due = fromDbDate(t.dueDate!);
    const already = sent.find((s) => s.dedupeKey === `task:${t.id}:${today}`);
    return {
      id: t.id,
      title: t.title,
      engineer: t.engineer,
      project: t.project,
      dueDate: due,
      late: due < today,
      sentToday: Boolean(already?.deliveries.length),
      message: `Reminder: ${t.title} at ${t.project.name} — ${due < today ? `was due ${formatDate(due)}` : due === today ? "due today" : "due tomorrow"}. Please update once done.`,
    };
  });
}

/** One reminder per task per day, so the history shows who was reminded and how. */
export async function sendTaskReminder(actor: CurrentUser, taskId: string, channel: DeliveryChannel, today: ISODate = todayIST()): Promise<void> {
  const [suggestion] = (await taskReminderSuggestions(actor, today)).filter((s) => s.id === taskId);
  if (!suggestion) throw new AppError("This task is not due for a reminder.");
  const n = await db.notification.upsert({
    where: { dedupeKey: `task:${taskId}:${today}` },
    create: {
      dedupeKey: `task:${taskId}:${today}`,
      kind: "ENGINEER_REMINDER",
      severity: suggestion.late ? "CRITICAL" : "WARNING",
      title: `${suggestion.engineer.name}: ${suggestion.title}`,
      message: suggestion.message,
      engineerId: suggestion.engineer.id,
      projectId: suggestion.project.id,
      entityType: "EngineerTask",
      entityId: taskId,
      dueDate: toDbDate(suggestion.dueDate),
      link: `/engineers/${suggestion.engineer.id}`,
    },
    update: {},
  });
  await recordDelivery(actor, n.id, { channel, note: null, resolve: true });
}
