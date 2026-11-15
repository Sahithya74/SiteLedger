"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { runAction, type ActionResult } from "@/server/action";
import { requireActionUser } from "@/server/auth/current-user";
import { previewImport, runImport, type RowCheck } from "@/server/services/csv-import";

const input = z.object({
  type: z.enum(["workers", "materials", "suppliers"]),
  // About 2 MB of text is far more than 1,000 rows need.
  text: z.string().max(2_000_000, "The file is too big."),
});

export async function previewImportAction(type: string, text: string): Promise<ActionResult<{ total: number; problems: RowCheck[] }>> {
  return runAction(async () => {
    const user = await requireActionUser();
    const p = input.parse({ type, text });
    return { ok: true, data: await previewImport(user, p.type, p.text) };
  });
}

export async function runImportAction(type: string, text: string): Promise<ActionResult<{ count: number }>> {
  return runAction(async () => {
    const user = await requireActionUser();
    const p = input.parse({ type, text });
    const count = await runImport(user, p.type, p.text);
    refresh();
    return { ok: true, message: `${count} imported.`, data: { count } };
  });
}
