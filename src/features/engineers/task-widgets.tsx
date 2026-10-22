"use client";

import { ClipboardPlus } from "lucide-react";
import { DialogForm, FormGrid, SelectField, TextAreaField, TextField } from "@/components/app/form";
import { Button } from "@/components/ui/button";
import { addDays, todayIST } from "@/lib/dates";
import { createEngineerTaskAction } from "./actions";

type Opt = { value: string; label: string };

const KINDS = [
  { value: "TASK", label: "Task" },
  { value: "INSPECTION", label: "Inspection" },
  { value: "SITE_VISIT", label: "Site visit" },
  { value: "REPORT", label: "Report / document" },
];

export function AddTaskDialog({
  engineers,
  projects,
  defaultEngineerId,
  defaultProjectId,
  label = "Give a task",
}: {
  engineers: Opt[];
  projects: Opt[];
  defaultEngineerId?: string;
  defaultProjectId?: string;
  label?: string;
}) {
  return (
    <DialogForm
      trigger={
        <Button variant="outline" size="lg">
          <ClipboardPlus className="size-4" /> {label}
        </Button>
      }
      title="Give an engineer a task"
      description="Inspections, site visits, reports — anything with a deadline. You'll see reminders when it is due."
      action={createEngineerTaskAction}
      submitLabel="Save task"
      wide
    >
      <FormGrid>
        <SelectField label="Engineer" name="engineerId" options={engineers} defaultValue={defaultEngineerId} placeholder="Choose…" required />
        <SelectField label="Project" name="projectId" options={projects} defaultValue={defaultProjectId} placeholder="Choose…" required />
        <SelectField label="Type" name="kind" defaultValue="TASK" options={KINDS} />
        <TextField label="Due by" name="dueDate" type="date" defaultValue={addDays(todayIST(), 2)} />
        <TextField label="What needs to be done" name="title" required placeholder="e.g. Concrete cube test inspection" fieldClassName="sm:col-span-2" />
        <TextAreaField label="Details" name="description" rows={2} fieldClassName="sm:col-span-2" />
      </FormGrid>
    </DialogForm>
  );
}
