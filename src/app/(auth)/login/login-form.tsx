"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { FormError, SubmitButton, TextField, useActionForm } from "@/components/app/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loginAction } from "../actions";

export function LoginForm({ next, passwordReset }: { next?: string; passwordReset?: boolean }) {
  const { onSubmit, pending, formError, fieldErrors } = useActionForm(loginAction);
  // Shown once the password is right and the account has 2-step login turned on.
  const askCode = fieldErrors.code === "needs-code";
  const [show, setShow] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Log in</CardTitle>
        <CardDescription>Use the login name and password given to you by the owner.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {next && <input type="hidden" name="next" value={next} />}
          {passwordReset && !formError && (
            <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">Password changed. Log in with your new password.</p>
          )}
          <FormError message={formError} />
          <TextField
            label="Login name"
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            required
          />
          <div className="relative">
            <TextField
              label="Password"
              name="password"
              type={show ? "text" : "password"}
              autoComplete="current-password"
              required
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute right-2 bottom-2 rounded p-1 text-muted-foreground hover:text-foreground"
              aria-label={show ? "Hide password" : "Show password"}
            >
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {askCode && (
            <TextField
              label="6-digit code from your authenticator app"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]{6,7}"
              maxLength={7}
              autoFocus
              required
              className="tabular text-lg tracking-[0.3em]"
            />
          )}
          <SubmitButton pending={pending} pendingText="Checking…" className="mt-2 w-full">
            <LogIn className="size-4" />
            Log in
          </SubmitButton>
          <p className="text-center text-sm text-muted-foreground">
            <Link href="/forgot-password" className="font-medium text-foreground underline-offset-2 hover:underline">
              Forgot your password?
            </Link>
          </p>
          <p className="text-center text-xs text-muted-foreground">3 wrong tries lock the login for 15 minutes.</p>
        </form>
      </CardContent>
    </Card>
  );
}
