"use client";

import { useMemo, useState, useTransition } from "react";
import { Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/app/confirm-action";
import { FormError, FormGrid, SelectField, SubmitButton, TextField, useActionForm } from "@/components/app/form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  ADMIN_ONLY_PERMISSIONS,
  GRANTABLE_PERMISSIONS,
  PERMISSION_PRESETS,
  PERMISSIONS,
  type Permission,
  type PermissionGroup,
} from "@/lib/permissions";
import {
  createManagerAction,
  resetPasswordAction,
  saveManagerProjectsAction,
  savePermissionsAction,
  setUserActiveAction,
  updateUserAction,
} from "./actions";

export function AddManagerDialog() {
  const [open, setOpen] = useState(false);
  const { onSubmit, pending, fieldErrors: e, formError } = useActionForm(createManagerAction);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg">
          <UserPlus className="size-4" /> Add manager
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a manager</DialogTitle>
          <DialogDescription>
            Give them the login name and this first password. They will be asked to choose their own password when they first log in.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <FormError message={Object.keys(e).length ? null : formError} />
          <FormGrid>
            <TextField label="Full name" name="name" required error={e.name} autoFocus />
            <TextField label="Phone" name="phone" type="tel" error={e.phone} />
            <TextField label="Login name" name="username" required error={e.username} autoCapitalize="none" hint="e.g. suresh — no spaces" />
            <SelectField
              label="Start with"
              name="preset"
              defaultValue="SITE_MANAGER"
              options={[
                { value: "SITE_MANAGER", label: PERMISSION_PRESETS.SITE_MANAGER.label },
                { value: "OFFICE_MANAGER", label: PERMISSION_PRESETS.OFFICE_MANAGER.label },
                { value: "NONE", label: "View only (no permissions)" },
              ]}
              help="You can tick or untick individual permissions afterwards."
            />
            <TextField label="First password" name="password" type="text" required error={e.password} autoComplete="off" hint="At least 8 characters." />
            <TextField label="Type it again" name="confirmPassword" type="text" required error={e.confirmPassword} autoComplete="off" />
          </FormGrid>
          <SubmitButton pending={pending}>Create manager</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const GROUP_ORDER: PermissionGroup[] = ["Projects", "Clients", "People", "Materials", "Money", "Site", "System"];

/** Checklist of what a manager may do, with one-click presets. */
export function PermissionsEditor({ userId, current }: { userId: string; current: string[] }) {
  const [selected, setSelected] = useState<string[]>(current);
  const [pending, startTransition] = useTransition();
  const dirty = useMemo(() => [...selected].sort().join() !== [...current].sort().join(), [selected, current]);

  function save() {
    startTransition(async () => {
      const result = await savePermissionsAction(userId, selected);
      if (result.ok) toast.success(result.message ?? "Saved.");
      else toast.error(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Quick set:</span>
        {(Object.keys(PERMISSION_PRESETS) as (keyof typeof PERMISSION_PRESETS)[]).map((k) => (
          <Button key={k} variant="outline" size="sm" type="button" onClick={() => setSelected([...PERMISSION_PRESETS[k].permissions])} title={PERMISSION_PRESETS[k].description}>
            {PERMISSION_PRESETS[k].label}
          </Button>
        ))}
        <Button variant="ghost" size="sm" type="button" onClick={() => setSelected([])}>
          Clear all
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {GROUP_ORDER.map((group) => {
          const keys = (Object.keys(PERMISSIONS) as Permission[]).filter((k) => PERMISSIONS[k].group === group);
          return (
            <fieldset key={group} className="rounded-lg border p-3">
              <legend className="px-1 text-sm font-semibold">{group}</legend>
              <ul className="flex flex-col gap-1.5">
                {keys.map((k) => {
                  const ownerOnly = ADMIN_ONLY_PERMISSIONS.includes(k);
                  return (
                    <li key={k}>
                      <label className={`flex items-start gap-2 text-sm ${ownerOnly ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
                        <Checkbox
                          className="mt-0.5"
                          disabled={ownerOnly}
                          checked={!ownerOnly && selected.includes(k)}
                          onCheckedChange={(checked) => setSelected((s) => (checked ? [...s, k] : s.filter((x) => x !== k)))}
                        />
                        <span>
                          {PERMISSIONS[k].label}
                          {ownerOnly && <span className="block text-xs text-muted-foreground">Owner only</span>}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          );
        })}
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={pending || !dirty} size="lg">
          {pending && <Loader2 className="size-4 animate-spin" />} Save permissions
        </Button>
        {dirty && <span className="text-sm text-amber-700">You have unsaved changes.</span>}
        <span className="text-xs text-muted-foreground">
          {selected.filter((s) => GRANTABLE_PERMISSIONS.includes(s as Permission)).length} of {GRANTABLE_PERMISSIONS.length} allowed
        </span>
      </div>
    </div>
  );
}

export function ManagerProjectsEditor({
  userId,
  projects,
  current,
}: {
  userId: string;
  projects: { id: string; name: string; code: string }[];
  current: string[];
}) {
  const [selected, setSelected] = useState<string[]>(current);
  const [pending, startTransition] = useTransition();
  function save() {
    startTransition(async () => {
      const result = await saveManagerProjectsAction(userId, selected);
      if (result.ok) toast.success(result.message ?? "Saved.");
      else toast.error(result.error);
    });
  }
  return (
    <div className="flex flex-col gap-3">
      {projects.length === 0 ? (
        <p className="text-sm text-muted-foreground">No projects yet.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {projects.map((p) => (
            <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted">
              <Checkbox checked={selected.includes(p.id)} onCheckedChange={(c) => setSelected((s) => (c ? [...s, p.id] : s.filter((x) => x !== p.id)))} />
              <span>
                {p.name} <span className="text-xs text-muted-foreground">{p.code}</span>
              </span>
            </label>
          ))}
        </div>
      )}
      <Button onClick={save} disabled={pending} className="w-fit" variant="outline">
        {pending && <Loader2 className="size-4 animate-spin" />} Save projects
      </Button>
    </div>
  );
}

export function UserDetailsForm({ userId, name, phone }: { userId: string; name: string; phone: string }) {
  const action = useMemo(() => updateUserAction.bind(null, userId), [userId]);
  const { onSubmit, pending, fieldErrors: e, formError } = useActionForm(action);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <FormError message={Object.keys(e).length ? null : formError} />
      <FormGrid>
        <TextField label="Full name" name="name" defaultValue={name} required error={e.name} />
        <TextField label="Phone" name="phone" type="tel" defaultValue={phone} error={e.phone} />
      </FormGrid>
      <SubmitButton pending={pending} variant="outline" className="w-fit">
        Save details
      </SubmitButton>
    </form>
  );
}

export function ResetPasswordForm({ userId, isSelf }: { userId: string; isSelf: boolean }) {
  const action = useMemo(() => resetPasswordAction.bind(null, userId), [userId]);
  const [key, setKey] = useState(0);
  const { onSubmit, pending, fieldErrors: e, formError } = useActionForm(action, { onSuccess: () => setKey((k) => k + 1) });
  return (
    <form key={key} onSubmit={onSubmit} className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {isSelf
          ? "Set a new password for your own account. Your other devices will be signed out."
          : "Use this if they forgot their password. They will be signed out everywhere and must choose a new password when they log in."}
      </p>
      <FormError message={Object.keys(e).length ? null : formError} />
      <FormGrid>
        <TextField label="New password" name="newPassword" type="text" required error={e.newPassword} autoComplete="off" />
        <TextField label="Type it again" name="confirmPassword" type="text" required error={e.confirmPassword} autoComplete="off" />
      </FormGrid>
      <SubmitButton pending={pending} variant="outline" className="w-fit">
        Reset password
      </SubmitButton>
    </form>
  );
}

export function ActiveToggle({ userId, name, active }: { userId: string; name: string; active: boolean }) {
  return active ? (
    <ConfirmAction
      trigger={<Button variant="destructive">Deactivate account</Button>}
      title={`Deactivate ${name}?`}
      description="They will be signed out immediately and cannot log in. Everything they recorded stays. You can re-activate the account later."
      confirmLabel="Deactivate"
      destructive
      action={() => setUserActiveAction(userId, false)}
    />
  ) : (
    <ConfirmAction
      trigger={<Button variant="outline">Re-activate account</Button>}
      title={`Re-activate ${name}?`}
      description="They will be able to log in again with their existing password."
      confirmLabel="Re-activate"
      action={() => setUserActiveAction(userId, true)}
    />
  );
}
