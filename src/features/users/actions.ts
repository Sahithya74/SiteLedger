"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createManagerSchema, emailSchema, resetPasswordSchema, updateUserSchema } from "@/features/users/schemas";
import { zOptionalText, zText } from "@/lib/validation";
import { formToObject, runAction, type ActionResult } from "@/server/action";
import { requestMeta, requireActionUser } from "@/server/auth/current-user";
import {
  createManager,
  endSession,
  resetUserPassword,
  setCompanyProfile,
  enableTotp,
  setOwnEmail,
  confirmOwnEmail,
  disableTotp,
  setManagerPermissions,
  setManagerProjects,
  setUserActive,
  signOutEverywhere,
  updateUserProfile,
} from "@/server/services/users";

type Result = ActionResult<unknown>;

export async function createManagerAction(_prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("users.manage");
    const input = createManagerSchema.parse(formToObject(formData));
    const { id } = await createManager(user, input);
    redirect(`/settings/users/${id}`);
  });
}

export async function updateUserAction(userId: string, _prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("users.manage");
    const input = updateUserSchema.parse(formToObject(formData));
    await updateUserProfile(user, userId, input);
    refresh();
    return { ok: true, message: "Details saved." };
  });
}

export async function resetPasswordAction(userId: string, _prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("users.manage");
    const input = resetPasswordSchema.parse(formToObject(formData));
    await resetUserPassword(user, userId, input.newPassword);
    refresh();
    return { ok: true, message: "Password reset. Give the new password to the person; they will choose their own when they log in." };
  });
}

export async function setUserActiveAction(userId: string, active: boolean): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("users.manage");
    await setUserActive(user, userId, active === true);
    refresh();
    return { ok: true, message: active ? "Account re-activated." : "Account deactivated and signed out." };
  });
}

export async function savePermissionsAction(userId: string, permissions: string[]): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("users.manage");
    const keys = z.array(z.string().max(60)).max(100).parse(permissions);
    await setManagerPermissions(user, userId, keys);
    refresh();
    return { ok: true, message: "Permissions saved." };
  });
}

export async function saveManagerProjectsAction(userId: string, projectIds: string[]): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("users.manage");
    const ids = z.array(z.string().max(50)).max(500).parse(projectIds);
    await setManagerProjects(user, userId, ids);
    refresh();
    return { ok: true, message: "Projects saved." };
  });
}

export async function endSessionAction(sessionId: string): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser();
    await endSession(user, z.string().max(100).parse(sessionId));
    refresh();
    return { ok: true, message: "Signed out that device." };
  });
}

export async function signOutEverywhereAction(): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser();
    const count = await signOutEverywhere(user);
    refresh();
    return { ok: true, message: count ? `Signed out ${count} other device${count === 1 ? "" : "s"}.` : "No other devices were signed in." };
  });
}

const companySchema = z.object({
  name: zText("Company name", 150),
  address: zOptionalText(500),
  phone: zOptionalText(30),
  email: zOptionalText(150),
  gstin: z.preprocess(
    (v) => (typeof v === "string" && v.trim() ? v.trim().toUpperCase() : null),
    z.string().regex(/^[0-9]{2}[A-Z0-9]{13}$/, "GSTIN has 15 characters, e.g. 33ABCDE1234F1Z5").nullable(),
  ),
  pan: z.preprocess(
    (v) => (typeof v === "string" && v.trim() ? v.trim().toUpperCase() : null),
    z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, "PAN looks like ABCDE1234F").nullable(),
  ),
  bankDetails: zOptionalText(500),
});

export async function companyProfileAction(_prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("settings.manage");
    await setCompanyProfile(user, companySchema.parse(formToObject(formData)));
    refresh();
    return { ok: true, message: "Company details saved." };
  });
}

export async function enableTotpAction(_prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser();
    const { code } = z.object({ code: zText("Code", 10) }).parse(formToObject(formData));
    await enableTotp(user, code);
    redirect("/settings?twostep=on");
  });
}

export async function disableTotpAction(_prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser();
    const { password, code } = z.object({ password: zText("Password", 200), code: zText("Code", 10) }).parse(formToObject(formData));
    await disableTotp(user, password, code);
    refresh();
    return { ok: true, message: "2-step login turned off." };
  });
}

export async function setEmailAction(_prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser();
    const { email } = emailSchema.parse(formToObject(formData));
    await setOwnEmail(user, email, (await requestMeta()).ipAddress);
    refresh();
    return { ok: true, message: `A 6-digit code was sent to ${email}.` };
  });
}

export async function confirmEmailAction(_prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser();
    const { code } = z.object({ code: z.string().trim().regex(/^\d{6}$/, "The code has 6 digits.") }).parse(formToObject(formData));
    await confirmOwnEmail(user, code);
    refresh();
    return { ok: true, message: "Email confirmed. You can now use “Forgot password” if you ever need it." };
  });
}
