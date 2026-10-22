"use server";

import { redirect } from "next/navigation";
import { clientFormSchema } from "@/features/clients/schemas";
import { formToObject, runAction, type ActionResult } from "@/server/action";
import { requireActionUser } from "@/server/auth/current-user";
import { createClient, deleteClient, updateClient } from "@/server/services/clients";

type Result = ActionResult<unknown>;

/** After creating, return to where the person came from (e.g. the new-project form). */
function safeReturn(value: FormDataEntryValue | null, clientId: string): string {
  if (value === "/projects/new") return `/projects/new?clientId=${clientId}`;
  return `/clients/${clientId}`;
}

export async function createClientAction(_prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("clients.manage");
    const input = clientFormSchema.parse(formToObject(formData));
    const { id } = await createClient(user, input);
    redirect(safeReturn(formData.get("returnTo"), id));
  });
}

export async function updateClientAction(clientId: string, _prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("clients.manage");
    const input = clientFormSchema.parse(formToObject(formData));
    await updateClient(user, clientId, input);
    redirect(`/clients/${clientId}`);
  });
}

export async function deleteClientAction(clientId: string): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser();
    await deleteClient(user, clientId);
    redirect("/clients");
  });
}
