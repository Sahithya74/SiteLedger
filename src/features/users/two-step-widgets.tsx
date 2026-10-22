"use client";

import { ShieldOff } from "lucide-react";
import { ActionForm, DialogForm, TextField } from "@/components/app/form";
import { Button } from "@/components/ui/button";
import { disableTotpAction, enableTotpAction } from "./actions";

const codeProps = { inputMode: "numeric" as const, autoComplete: "one-time-code", maxLength: 7, className: "tabular text-lg tracking-[0.3em]" };

export function EnableTwoStepForm() {
  return (
    <ActionForm action={enableTotpAction} submitLabel="Turn on 2-step login" cancelHref="/settings" className="max-w-sm">
      <TextField label="Code now showing in the app" name="code" required {...codeProps} />
    </ActionForm>
  );
}

export function DisableTwoStepDialog() {
  return (
    <DialogForm
      trigger={
        <Button variant="outline">
          <ShieldOff className="size-4" /> Turn off
        </Button>
      }
      title="Turn off 2-step login?"
      description="Your account will be protected by the password only."
      action={disableTotpAction}
      submitLabel="Turn off"
    >
      <TextField label="Your password" name="password" type="password" autoComplete="current-password" required />
      <TextField label="Code from the app" name="code" required {...codeProps} />
    </DialogForm>
  );
}
