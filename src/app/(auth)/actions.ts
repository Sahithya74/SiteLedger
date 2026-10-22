"use server";

import { redirect } from "next/navigation";
import { changePasswordSchema, resetWithCodeSchema, setupOwnerSchema } from "@/features/users/schemas";
import { runAction, formToObject, type ActionResult } from "@/server/action";
import { getCurrentUser, requestMeta } from "@/server/auth/current-user";
import { attemptLogin } from "@/server/auth/login";
import { requestPasswordReset, resetPasswordWithCode } from "@/server/auth/password-reset";
import {
  createSession,
  deleteSessionCookie,
  invalidateSession,
  setSessionCookie,
} from "@/server/auth/session";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { UnauthenticatedError } from "@/server/errors";
import { changeOwnPassword, createFirstOwner } from "@/server/services/users";

/** Only allow redirects to paths inside this app. */
function safeNext(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  if (value.startsWith("/login") || value.startsWith("/setup")) return null;
  return value;
}

export async function loginAction(_prev: ActionResult<unknown>, formData: FormData): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    const meta = await requestMeta();
    const code = formData.get("code");
    const result = await attemptLogin(String(formData.get("username") ?? ""), String(formData.get("password") ?? ""), meta, typeof code === "string" ? code : undefined);
    if (!result.ok) return { ok: false, error: result.error, fieldErrors: result.needsCode ? { code: "needs-code" } : undefined };
    await setSessionCookie(result.token, result.expiresAt);
    redirect(result.mustChangePassword ? "/change-password" : (safeNext(formData.get("next")) ?? "/dashboard"));
  });
}

export async function logoutAction(): Promise<void> {
  const user = await getCurrentUser();
  if (user) {
    await invalidateSession(user.sessionId);
    await audit(db, { actor: user, action: "LOGOUT", entityType: "User", entityId: user.id, summary: "logged out" });
  }
  await deleteSessionCookie();
  redirect("/login");
}

export async function setupAction(_prev: ActionResult<unknown>, formData: FormData): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    const input = setupOwnerSchema.parse(formToObject(formData));
    const owner = await createFirstOwner(input);
    const { token, absoluteExpiresAt } = await createSession(owner.id, await requestMeta());
    await setSessionCookie(token, absoluteExpiresAt);
    redirect("/dashboard");
  });
}

export async function changePasswordAction(_prev: ActionResult<unknown>, formData: FormData): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    const user = await getCurrentUser();
    if (!user) throw new UnauthenticatedError();
    const input = changePasswordSchema.parse(formToObject(formData));
    await changeOwnPassword(user, input);
    if (user.mustChangePassword) redirect("/dashboard");
    return { ok: true, message: "Your password has been changed. Other devices have been signed out." };
  });
}

/** "Forgot password", step 1: email a code. Same reply whether or not the account exists. */
export async function forgotPasswordAction(_prev: ActionResult<unknown>, formData: FormData): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    const identifier = String(formData.get("identifier") ?? "").trim();
    if (!identifier) return { ok: false, error: "Enter your login name or email.", fieldErrors: { identifier: "Required." } };
    await requestPasswordReset(identifier, await requestMeta());
    return { ok: true, message: "If this login has a confirmed email, a code has been sent to it." };
  });
}

/** Step 2: code from the email + new password. */
export async function resetWithCodeAction(_prev: ActionResult<unknown>, formData: FormData): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    const input = resetWithCodeSchema.parse(formToObject(formData));
    await resetPasswordWithCode(input.identifier, input.code, input.newPassword, await requestMeta());
    redirect("/login?reset=1");
  });
}
