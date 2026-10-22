"use client";

import { useState } from "react";
import Link from "next/link";
import { KeyRound, Mail } from "lucide-react";
import { FormError, SubmitButton, TextField, useActionForm } from "@/components/app/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { forgotPasswordAction, resetWithCodeAction } from "../actions";

/** Two steps on one screen: ask for a code, then enter it with a new password. */
export function ForgotPasswordForm() {
  const [identifier, setIdentifier] = useState("");
  const [sent, setSent] = useState(false);
  const ask = useActionForm(forgotPasswordAction, { onSuccess: () => setSent(true) });
  const reset = useActionForm(resetWithCodeAction);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Forgot password</CardTitle>
        <CardDescription>
          {sent
            ? "Check your email for a 6-digit code. It expires in 10 minutes."
            : "We'll email a code to the address confirmed on your account. No email added yet? Ask the owner to reset your password."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!sent ? (
          <form onSubmit={ask.onSubmit} className="flex flex-col gap-4">
            <FormError message={ask.formError} />
            <TextField
              label="Login name or email"
              name="identifier"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
              required
              error={ask.fieldErrors.identifier}
            />
            <SubmitButton pending={ask.pending} pendingText="Sending…" className="w-full">
              <Mail className="size-4" /> Email me a code
            </SubmitButton>
          </form>
        ) : (
          <form onSubmit={reset.onSubmit} className="flex flex-col gap-4">
            <input type="hidden" name="identifier" value={identifier} />
            <p role="status" className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
              If “{identifier}” has a confirmed email, a code has been sent to it.
            </p>
            <FormError message={Object.keys(reset.fieldErrors).length ? null : reset.formError} />
            <TextField
              label="6-digit code from the email"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              autoFocus
              required
              className="tabular text-lg tracking-[0.3em]"
              error={reset.fieldErrors.code}
            />
            <TextField label="New password" name="newPassword" type="password" autoComplete="new-password" required error={reset.fieldErrors.newPassword} hint="At least 8 characters." />
            <TextField label="New password again" name="confirmPassword" type="password" autoComplete="new-password" required error={reset.fieldErrors.confirmPassword} />
            <SubmitButton pending={reset.pending} pendingText="Saving…" className="w-full">
              <KeyRound className="size-4" /> Set new password
            </SubmitButton>
            <button type="button" onClick={() => setSent(false)} className="text-sm text-muted-foreground underline-offset-2 hover:underline">
              Didn&apos;t get it? Send another code
            </button>
          </form>
        )}
        <p className="mt-4 text-center text-sm">
          <Link href="/login" className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
            Back to log in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
