"use client";

import { LogOut, MonitorSmartphone } from "lucide-react";
import { ConfirmAction } from "@/components/app/confirm-action";
import { ActionForm, FormGrid, TextAreaField, TextField } from "@/components/app/form";
import { Button } from "@/components/ui/button";
import { companyProfileAction, endSessionAction, signOutEverywhereAction } from "./actions";

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

/** Company details printed on quotations, bills and receipts. */
export function CompanyProfileForm({ profile }: { profile: CompanyProfileValues }) {
  return (
    <ActionForm action={companyProfileAction} submitLabel="Save company details" className="max-w-3xl">
      <FormGrid>
        <TextField label="Company name" name="name" defaultValue={profile.name} required />
        <TextField label="Phone" name="phone" defaultValue={profile.phone ?? ""} inputMode="tel" />
        <TextAreaField label="Address" name="address" rows={2} defaultValue={profile.address ?? ""} fieldClassName="sm:col-span-2" />
        <TextField label="Email" name="email" type="email" defaultValue={profile.email ?? ""} />
        <TextField label="GSTIN" name="gstin" defaultValue={profile.gstin ?? ""} className="uppercase" maxLength={15} />
        <TextField label="PAN" name="pan" defaultValue={profile.pan ?? ""} className="uppercase" maxLength={10} />
        <TextAreaField
          label="Bank details printed on bills"
          name="bankDetails"
          rows={3}
          defaultValue={profile.bankDetails ?? ""}
          placeholder={"e.g. HDFC Bank, A/c 50200012345678, IFSC HDFC0001234\nUPI: sunrise@hdfcbank"}
          hint="Shown to clients so they know where to pay. Never type passwords here."
          fieldClassName="sm:col-span-2"
        />
      </FormGrid>
    </ActionForm>
  );
}

export type CompanyProfileValues = {
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  pan: string | null;
  bankDetails: string | null;
};
