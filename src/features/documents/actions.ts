"use server";

import { refresh } from "next/cache";
import { runAction, type ActionResult } from "@/server/action";
import { requireActionUser } from "@/server/auth/current-user";
import { deleteDocument } from "@/server/services/documents";

export async function deleteDocumentAction(id: string): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    const user = await requireActionUser();
    await deleteDocument(user, id);
    refresh();
    return { ok: true, message: "Attachment removed." };
  });
}
