"use client";

import { useState } from "react";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { FormError, SubmitButton, TextField, useActionForm } from "@/components/app/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loginAction } from "../actions";

export function LoginForm({ next }: { next?: string }) {
  const { onSubmit, pending, formError } = useActionForm(loginAction);
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
          <SubmitButton pending={pending} pendingText="Checking…" className="mt-2 w-full">
            <LogIn className="size-4" />
            Log in
          </SubmitButton>
          <p className="text-center text-xs text-muted-foreground">Forgot your password? Ask the owner to reset it.</p>
        </form>
      </CardContent>
    </Card>
  );
}
