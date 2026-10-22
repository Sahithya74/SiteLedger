"use client";

import { LogOut, MonitorSmartphone } from "lucide-react";
import { ConfirmAction } from "@/components/app/confirm-action";
import { FormError, SubmitButton, TextField, useActionForm } from "@/components/app/form";
import { Button } from "@/components/ui/button";
import { companyNameAction, endSessionAction, signOutEverywhereAction } from "./actions";

export function CompanyNameForm({ name }: { name: string }) {
  const { onSubmit, pending, fieldErrors: e, formError } = useActionForm(companyNameAction);
  return (
    <form onSubmit={onSubmit} className="flex max-w-lg flex-col gap-3 sm:flex-row sm:items-end">
      <FormError message={Object.keys(e).length ? null : formError} />
      <TextField label="Company name" name="companyName" defaultValue={name} error={e.companyName} fieldClassName="flex-1" required />
      <SubmitButton pending={pending}>Save</SubmitButton>
    </form>
  );
}

export type SessionRow = {
  id: string;
  current: boolean;
  who: string;
  device: string;
  ip: string | null;
  lastSeen: string;
  started: string;
};

export function SessionsList({ sessions, showWho }: { sessions: SessionRow[]; showWho: boolean }) {
  const others = sessions.filter((s) => !s.current).length;
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y rounded-lg border">
        {sessions.map((s) => (
          <li key={s.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
            <MonitorSmartphone className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {showWho && `${s.who} · `}
                {s.device}
                {s.current && <span className="ml-2 rounded bg-emerald-100 px-1.5 text-xs font-medium text-emerald-800">This device</span>}
              </p>
              <p className="text-xs text-muted-foreground">
                Last active {s.lastSeen} · signed in {s.started}
                {s.ip && ` · ${s.ip}`}
              </p>
            </div>
            {!s.current && (
              <ConfirmAction
                trigger={
                  <Button variant="ghost" size="sm">
                    Sign out
                  </Button>
                }
                title="Sign out this device?"
                description="Whoever is using it will have to log in again."
                confirmLabel="Sign out"
                action={() => endSessionAction(s.id)}
              />
            )}
          </li>
        ))}
      </ul>
      {others > 0 && (
        <ConfirmAction
          trigger={
            <Button variant="outline" className="w-fit">
              <LogOut className="size-4" /> Sign out my other devices
            </Button>
          }
          title="Sign out everywhere else?"
          description="Every other phone or computer logged in with your account will have to log in again. This device stays logged in."
          confirmLabel="Sign out others"
          action={() => signOutEverywhereAction()}
        />
      )}
    </div>
  );
}
