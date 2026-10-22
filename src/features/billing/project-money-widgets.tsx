"use client";

import { Plus, Target } from "lucide-react";
import { DialogForm, FormGrid, MoneyField, TextAreaField, TextField } from "@/components/app/form";
import { Button } from "@/components/ui/button";
import { todayIST } from "@/lib/dates";
import { createVariationAction, setBudgetsAction } from "./actions";

export function VariationDialog({ projectId }: { projectId: string }) {
  return (
    <DialogForm
      trigger={
        <Button variant="outline" size="sm">
          <Plus className="size-4" /> Extra work
        </Button>
      }
      title="Record extra work (variation)"
      description="Work the client asked for beyond the contract, or a reduction. Once the client approves it, the project value changes."
      action={createVariationAction}
      submitLabel="Save"
    >
      <input type="hidden" name="projectId" value={projectId} />
      <TextField label="What" name="title" required placeholder="e.g. Extra room on terrace" />
      <TextAreaField label="Details" name="description" rows={2} />
      <FormGrid>
        <MoneyField label="Amount" name="amountPaise" required hint="Use a minus sign for a reduction, e.g. -50000" />
        <TextField label="Asked on" name="requestedOn" type="date" defaultValue={todayIST()} required />
      </FormGrid>
    </DialogForm>
  );
}

export function BudgetDialog({ projectId, groups }: { projectId: string; groups: { group: string; label: string; value: string }[] }) {
  return (
    <DialogForm
      trigger={
        <Button variant="outline" size="sm">
          <Target className="size-4" /> Set budget
        </Button>
      }
      title="Project budget"
      description="How much you plan to spend under each head. Leave blank for heads you don't track."
      action={setBudgetsAction.bind(null, projectId)}
      submitLabel="Save budget"
      wide
    >
      <FormGrid>
        {groups.map((g) => (
          <MoneyField key={g.group} label={g.label} name={`budget.${g.group}`} defaultValue={g.value} />
        ))}
      </FormGrid>
    </DialogForm>
  );
}
