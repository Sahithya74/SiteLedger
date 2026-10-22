"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { projectFormSchema, projectLocationSchema, projectStatusSchema } from "@/features/projects/schemas";
import { formToObject, runAction, type ActionResult } from "@/server/action";
import { requireActionUser } from "@/server/auth/current-user";
import {
  archiveProject,
  changeProjectStatus,
  createProject,
  deleteProject,
  restoreProject,
  setProjectManagers,
  updateProject,
  updateProjectLocation,
} from "@/server/services/projects";

type Result = ActionResult<unknown>;

export async function createProjectAction(_prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("projects.create");
    const input = projectFormSchema.parse(formToObject(formData));
    const { id } = await createProject(user, input);
    redirect(`/projects/${id}`);
  });
}

export async function updateProjectAction(projectId: string, _prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("projects.edit");
    const input = projectFormSchema.parse(formToObject(formData));
    await updateProject(user, projectId, input);
    redirect(`/projects/${projectId}`);
  });
}

export async function changeProjectStatusAction(projectId: string, _prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("projects.updateStatus");
    const input = projectStatusSchema.parse(formToObject(formData));
    await changeProjectStatus(user, projectId, input);
    refresh();
    return { ok: true, message: "Project status updated." };
  });
}

export async function updateProjectLocationAction(projectId: string, _prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("projects.edit");
    const input = projectLocationSchema.parse(formToObject(formData));
    await updateProjectLocation(user, projectId, input);
    refresh();
    return { ok: true, message: "Location saved." };
  });
}

export async function archiveProjectAction(projectId: string, reason: string): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("projects.archive");
    await archiveProject(user, projectId, reason || null);
    refresh();
    return { ok: true, message: "Project archived. You can restore it from the Archived tab." };
  });
}

export async function restoreProjectAction(projectId: string): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("projects.archive");
    await restoreProject(user, projectId);
    refresh();
    return { ok: true, message: "Project restored." };
  });
}

export async function deleteProjectAction(projectId: string): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("projects.delete");
    await deleteProject(user, projectId);
    redirect("/projects");
  });
}

export async function setProjectManagersAction(projectId: string, managerIds: string[]): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("users.manage");
    if (!Array.isArray(managerIds) || managerIds.some((id) => typeof id !== "string")) {
      return { ok: false, error: "Invalid selection." };
    }
    await setProjectManagers(user, projectId, managerIds);
    refresh();
    return { ok: true, message: "Managers updated." };
  });
}
