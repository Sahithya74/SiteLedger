"use client";

import { FormError, SubmitButton, TextField, useActionForm } from "@/components/app/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { setupAction } from "../actions";

export function SetupForm({ needsCode }: { needsCode: boolean }) {
  const { onSubmit, pending, fieldErrors, formError } = useActionForm(setupAction);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Welcome — let&apos;s set up SITECORE</CardTitle>
        <CardDescription>
          Create the owner account. The owner can see everything and can add a manager later.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <FormError message={fieldErrors && Object.keys(fieldErrors).length ? null : formError} />
          {needsCode && (
            <TextField label="Setup code" name="setupCode" type="password" required error={fieldErrors.setupCode} hint="The SETUP_CODE set on the server. It stops strangers creating the owner account." autoFocus />
          )}
          <TextField label="Company name" name="companyName" required error={fieldErrors.companyName} autoFocus={!needsCode} />
          <TextField label="Your name" name="name" required error={fieldErrors.name} autoComplete="name" />
          <TextField
            label="Login name"
            name="username"
            required
            error={fieldErrors.username}
            hint="Short and simple, e.g. ramesh. No spaces."
            autoCapitalize="none"
            autoComplete="username"
          />
          <TextField
            label="Password"
            name="password"
            type="password"
            required
            error={fieldErrors.password}
            hint="At least 8 characters."
            autoComplete="new-password"
          />
          <TextField
            label="Type the password again"
            name="confirmPassword"
            type="password"
            required
            error={fieldErrors.confirmPassword}
            autoComplete="new-password"
          />
          <SubmitButton pending={pending} className="mt-2 w-full">
            Create owner account
          </SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
