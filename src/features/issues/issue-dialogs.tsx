"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { DialogForm, FormGrid, SelectField, TextAreaField, TextField } from "@/components/app/form";
import { Button } from "@/components/ui/button";
import { todayIST } from "@/lib/dates";
import { PRIORITY } from "@/lib/labels";
import { createIssueAction, updateIssueAction } from "./actions";

type Opt = { value: string; label: string };

export function ReportIssueDialog({ projects, workItems, defaultProjectId }: { projects: Opt[]; workItems: (Opt & { projectId: string })[]; defaultProjectId?: string }) {
  const [projectId, setProjectId] = useState(defaultProjectId ?? projects[0]?.value ?? "");
  return (
    <DialogForm
      trigger={
        <Button size="lg">
          <AlertTriangle className="size-4" /> Report issue
        </Button>
      }
      title="Report a site issue"
      description="Anything that stops or slows work: a leak, a missing drawing, a safety problem, a dispute…"
      action={createIssueAction}
      submitLabel="Report"
      wide
    >
      <FormGrid>
        <SelectField label="Project" name="projectId" value={projectId} onChange={(e) => setProjectId(e.target.value)} options={projects} required />
        <SelectField key={projectId} label="Work item (optional)" name="workItemId" options={workItems.filter((w) => w.projectId === projectId)} placeholder="Not about one item" />
        <TextField label="What is the problem" name="title" required fieldClassName="sm:col-span-2" placeholder="e.g. Water seepage in basement wall" />
        <TextAreaField label="Details" name="description" rows={3} fieldClassName="sm:col-span-2" />
        <SelectField label="How serious" name="severity" defaultValue="MEDIUM" options={Object.entries(PRIORITY).map(([value, p]) => ({ value, label: p.label }))} />
        <TextField label="Noticed on" name="reportedOn" type="date" defaultValue={todayIST()} max={todayIST()} required />
        <TextField label="Who will handle it" name="assignedTo" placeholder="e.g. Engineer Kumar" />
      </FormGrid>
    </DialogForm>
  );
}

export function UpdateIssueDialog({ id, status, assignedTo, resolution }: { id: string; status: string; assignedTo: string | null; resolution: string | null }) {
  const [next, setNext] = useState(status === "OPEN" ? "IN_PROGRESS" : status);
  return (
    <DialogForm trigger={<Button size="sm" variant="outline">Update</Button>} title="Update issue" action={updateIssueAction} submitLabel="Save">
      <input type="hidden" name="id" value={id} />
      <SelectField
        label="Status"
        name="status"
        value={next}
        onChange={(e) => setNext(e.target.value)}
        options={[
          { value: "OPEN", label: "Open" },
          { value: "IN_PROGRESS", label: "Being fixed" },
          { value: "RESOLVED", label: "Resolved" },
        ]}
      />
      <TextField label="Who will handle it" name="assignedTo" defaultValue={assignedTo ?? ""} />
      <TextAreaField label={next === "RESOLVED" ? "How was it fixed" : "Notes"} name="resolution" rows={3} defaultValue={resolution ?? ""} required={next === "RESOLVED"} />
    </DialogForm>
  );
}
