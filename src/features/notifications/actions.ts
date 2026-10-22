"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { DeliveryChannel, Severity } from "@/generated/prisma/enums";
import { zEnum, zId, zOptionalDate, zOptionalId, zOptionalText, zText } from "@/lib/validation";
import { formToObject, runAction, type ActionResult } from "@/server/action";
import { requireActionUser } from "@/server/auth/current-user";
import { createReminder, markAllRead, recordDelivery, resolveNotification, sendTaskReminder } from "@/server/services/notifications";

type Result = ActionResult<unknown>;

const reminderSchema = z.object({
  engineerId: zOptionalId(),
  projectId: zOptionalId(),
  title: zText("Reminder", 150),
  message: zText("Message", 1000),
  dueDate: zOptionalDate("Due date"),
  severity: zEnum(Severity, "Importance"),
});

export async function createReminderAction(_prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("engineers.manage");
    await createReminder(user, reminderSchema.parse(formToObject(formData)));
    refresh();
    return { ok: true, message: "Reminder saved." };
  });
}

const deliverySchema = z.object({
  id: zId("Reminder"),
  channel: zEnum(DeliveryChannel, "How"),
  note: zOptionalText(300),
  resolve: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
});

export async function recordDeliveryAction(_prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser();
    const input = deliverySchema.parse(formToObject(formData));
    await recordDelivery(user, input.id, input);
    refresh();
    return { ok: true, message: "Marked as sent." };
  });
}

export async function sendTaskReminderAction(taskId: string, channel: string): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser();
    await sendTaskReminder(user, taskId, z.enum(DeliveryChannel).parse(channel));
    refresh();
    return { ok: true, message: "Reminder recorded." };
  });
}

export async function resolveNotificationAction(id: string, resolved: boolean): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser();
    await resolveNotification(user, id, resolved === true);
    refresh();
    return { ok: true, message: resolved ? "Marked done." : "Re-opened." };
  });
}

export async function markAllReadAction(): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser();
    await markAllRead(user);
    refresh();
    return { ok: true, message: "All marked as read." };
  });
}
