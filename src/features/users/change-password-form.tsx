"use client";

import { FormError, SubmitButton, TextField, useActionForm } from "@/components/app/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { changePasswordAction } from "@/app/(auth)/actions";

export function ChangePasswordForm({ firstLogin, name }: { firstLogin: boolean; name: string }) {
  const { onSubmit, pending, fieldErrors, formError, state } = useActionForm(changePasswordAction);
  const hasFieldErrors = Object.keys(fieldErrors).length > 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{firstLogin ? `Welcome, ${name}` : "Change your password"}</CardTitle>
        <CardDescription>
          {firstLogin
            ? "Please choose your own password before you start. Only you will know it."
            : "Choose a new password. You will stay logged in here; other devices will be signed out."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form key={state.ok && state.message ? "done" : "form"} onSubmit={onSubmit} className="flex flex-col gap-4">
          <FormError message={hasFieldErrors ? null : formError} />
          <TextField
            label={firstLogin ? "Password given to you" : "Current password"}
            name="currentPassword"
            type="password"
            required
            error={fieldErrors.currentPassword}
            autoComplete="current-password"
          />
          <TextField
            label="New password"
            name="newPassword"
            type="password"
            required
            error={fieldErrors.newPassword}
            hint="At least 8 characters. Avoid your name or phone number."
            autoComplete="new-password"
          />
          <TextField
            label="Type the new password again"
            name="confirmPassword"
            type="password"
            required
            error={fieldErrors.confirmPassword}
            autoComplete="new-password"
          />
          <SubmitButton pending={pending} className="mt-2 w-full">
            Save new password
          </SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
