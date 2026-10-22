"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { EngineerTaskKind, WorkStatus } from "@/generated/prisma/enums";
import { zId, zOptionalDate, zOptionalId, zOptionalText, zText } from "@/lib/validation";
import { engineerFormSchema } from "@/features/engineers/schemas";
import { formToObject, runAction, type ActionResult } from "@/server/action";
import { requireActionUser } from "@/server/auth/current-user";
import { createEngineer, createEngineerTask, setEngineerActive, updateEngineer, updateEngineerTask } from "@/server/services/engineers";

type Result = ActionResult<unknown>;

export async function createEngineerAction(_prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("engineers.manage");
    const input = engineerFormSchema.parse(formToObject(formData));
    const { id } = await createEngineer(user, input);
    redirect(`/engineers/${id}`);
  });
}

export async function updateEngineerAction(engineerId: string, _prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("engineers.manage");
    const input = engineerFormSchema.parse(formToObject(formData));
    await updateEngineer(user, engineerId, input);
    redirect(`/engineers/${engineerId}`);
  });
}

export async function setEngineerActiveAction(engineerId: string, active: boolean): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("engineers.manage");
    await setEngineerActive(user, engineerId, active === true);
    refresh();
    return { ok: true, message: active ? "Engineer re-activated." : "Engineer marked as no longer working." };
  });
}

const taskSchema = z.object({
  engineerId: zId("Engineer"),
  projectId: zId("Project"),
  workItemId: zOptionalId(),
  kind: z.enum(EngineerTaskKind),
  title: zText("Task", 200),
  description: zOptionalText(1000),
  dueDate: zOptionalDate("Due date"),
});

export async function createEngineerTaskAction(_prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("engineers.manage");
    await createEngineerTask(user, taskSchema.parse(formToObject(formData)));
    refresh();
    return { ok: true, message: "Task given." };
  });
}

export async function updateEngineerTaskAction(id: string, status: string, notes: string): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("engineers.manage");
    await updateEngineerTask(user, id, { status: z.enum(WorkStatus).parse(status), notes: notes?.trim() || null });
    refresh();
    return { ok: true, message: "Task updated." };
  });
}
