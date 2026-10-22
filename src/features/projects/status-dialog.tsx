"use client";

import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { FormError, SelectField, SubmitButton, TextField, useActionForm } from "@/components/app/form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ProjectStatus } from "@/generated/prisma/enums";
import { todayIST } from "@/lib/dates";
import { PROJECT_STATUS } from "@/lib/labels";
import { changeProjectStatusAction } from "./actions";

export function ProjectStatusDialog({
  projectId,
  status,
  statusNote,
}: {
  projectId: string;
  status: ProjectStatus;
  statusNote: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<ProjectStatus>(status);
  const action = useMemo(() => changeProjectStatusAction.bind(null, projectId), [projectId]);
  const { onSubmit, pending, fieldErrors: e, formError } = useActionForm(action, { onSuccess: () => setOpen(false) });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="lg">
          <RefreshCw className="size-4" /> Change status
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change project status</DialogTitle>
          <DialogDescription>{PROJECT_STATUS[selected].help}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <FormError message={Object.keys(e).length ? null : formError} />
          <SelectField
            label="Status"
            name="status"
            value={selected}
            onChange={(ev) => setSelected(ev.target.value as ProjectStatus)}
            error={e.status}
            options={Object.values(ProjectStatus).map((s) => ({ value: s, label: PROJECT_STATUS[s].label }))}
          />
          {selected === "COMPLETED" && (
            <TextField label="Completion date" name="actualEndDate" type="date" defaultValue={todayIST()} error={e.actualEndDate} />
          )}
          <TextField
            label={selected === "ON_HOLD" || selected === "DELAYED" ? "Reason" : "Note (optional)"}
            name="statusNote"
            defaultValue={statusNote ?? ""}
            error={e.statusNote}
            placeholder={selected === "ON_HOLD" ? "e.g. Waiting for client's payment" : selected === "DELAYED" ? "e.g. Rain stopped concreting for a week" : ""}
          />
          <SubmitButton pending={pending}>Save status</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
