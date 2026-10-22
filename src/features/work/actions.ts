"use server";

import { refresh } from "next/cache";
import { phaseFormSchema, quickProgressSchema, workItemFormSchema } from "@/features/work/schemas";
import { formToObject, runAction, type ActionResult } from "@/server/action";
import { requireActionUser } from "@/server/auth/current-user";
import {
  addStandardStages,
  createPhase,
  createWorkItem,
  deleteWorkItem,
  updateWorkItem,
  updateWorkProgress,
} from "@/server/services/work";

type Result = ActionResult<unknown>;

export async function createWorkItemAction(projectId: string, _prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("work.manage");
    const input = workItemFormSchema.parse(formToObject(formData));
    const { warning } = await createWorkItem(user, projectId, input);
    refresh();
    return { ok: true, message: warning ?? "Work item added." };
  });
}

export async function updateWorkItemAction(itemId: string, _prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("work.manage");
    const input = workItemFormSchema.parse(formToObject(formData));
    const { warning } = await updateWorkItem(user, itemId, input);
    refresh();
    return { ok: true, message: warning ?? "Saved." };
  });
}

export async function quickProgressAction(itemId: string, _prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("work.manage");
    const input = quickProgressSchema.parse(formToObject(formData));
    const { warning } = await updateWorkProgress(user, itemId, input);
    refresh();
    return { ok: true, message: warning ?? "Progress updated." };
  });
}

export async function createPhaseAction(projectId: string, _prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("work.manage");
    const input = phaseFormSchema.parse(formToObject(formData));
    await createPhase(user, projectId, input);
    refresh();
    return { ok: true, message: `Stage "${input.name}" added.` };
  });
}

export async function deleteWorkItemAction(itemId: string): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("work.manage");
    await deleteWorkItem(user, itemId);
    refresh();
    return { ok: true, message: "Removed." };
  });
}

export async function addStandardStagesAction(projectId: string): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("work.manage");
    const { added } = await addStandardStages(user, projectId);
    refresh();
    return {
      ok: true,
      message: added ? `Added ${added} stages and work items. Set dates and engineers next.` : "The standard stages are already in this project.",
    };
  });
}
