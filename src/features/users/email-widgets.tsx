"use client";

import { useState } from "react";
import { MailCheck } from "lucide-react";
import { FormError, SubmitButton, TextField, useActionForm } from "@/components/app/form";
import { confirmEmailAction, setEmailAction } from "./actions";

/** Add or change the email used for "forgot password", then confirm it with the emailed code. */
export function EmailSettings({ email, verified }: { email: string | null; verified: boolean }) {
  const [waiting, setWaiting] = useState(Boolean(email && !verified));
  const [editing, setEditing] = useState(!email);
  const send = useActionForm(setEmailAction, { onSuccess: () => { setWaiting(true); setEditing(false); } });
  const confirm = useActionForm(confirmEmailAction, { onSuccess: () => setWaiting(false) });

  return (
    <div className="flex max-w-lg flex-col gap-4">
      {email && verified && !editing && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
            <MailCheck className="size-4" /> {email} — confirmed
          </span>
          <button type="button" className="text-muted-foreground underline-offset-2 hover:underline" onClick={() => setEditing(true)}>
            Change
          </button>
        </div>
      )}
      {(editing || (!verified && !waiting)) && (
        <form onSubmit={send.onSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <TextField label="Your email" name="email" type="email" defaultValue={email ?? ""} autoComplete="email" required fieldClassName="flex-1" error={send.fieldErrors.email} />
          <SubmitButton pending={send.pending} pendingText="Sending…">
            Send code
          </SubmitButton>
        </form>
      )}
      {waiting && !editing && (
        <form onSubmit={confirm.onSubmit} className="flex flex-col gap-3">
          <p className="text-sm">
            A code was sent to <strong>{email}</strong>. Type it here to confirm the address.
          </p>
          <FormError message={Object.keys(confirm.fieldErrors).length ? null : confirm.formError} />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <TextField label="6-digit code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required className="tabular tracking-[0.3em]" error={confirm.fieldErrors.code} />
            <SubmitButton pending={confirm.pending}>Confirm</SubmitButton>
          </div>
          <button type="button" className="w-fit text-sm text-muted-foreground underline-offset-2 hover:underline" onClick={() => setEditing(true)}>
            Send a new code or use a different email
          </button>
        </form>
      )}
      <FormError message={Object.keys(send.fieldErrors).length ? null : send.formError} />
    </div>
  );
}
