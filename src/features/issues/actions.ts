"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { IssueStatus, Priority } from "@/generated/prisma/enums";
import { zDate, zEnum, zId, zOptionalId, zOptionalText, zText } from "@/lib/validation";
import { formToObject, runAction, type ActionResult } from "@/server/action";
import { requireActionUser } from "@/server/auth/current-user";
import { createIssue, updateIssue } from "@/server/services/issues";

type Result = ActionResult<unknown>;

const issueSchema = z.object({
  projectId: zId("Project"),
  workItemId: zOptionalId(),
  title: zText("What is the problem", 200),
  description: zOptionalText(2000),
  severity: zEnum(Priority, "How serious"),
  reportedOn: zDate("Date"),
  assignedTo: zOptionalText(100),
});

export async function createIssueAction(_prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("issues.manage");
    await createIssue(user, issueSchema.parse(formToObject(formData)));
    refresh();
    return { ok: true, message: "Issue reported." };
  });
}

export async function updateIssueAction(_prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("issues.manage");
    const input = z
      .object({ id: zId("Issue"), status: zEnum(IssueStatus, "Status"), assignedTo: zOptionalText(100), resolution: zOptionalText(2000) })
      .parse(formToObject(formData));
    await updateIssue(user, input.id, input);
    refresh();
    return { ok: true, message: "Issue updated." };
  });
}
