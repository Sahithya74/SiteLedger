"use client";

import { useMemo, useState } from "react";
import {
  FormError,
  FormGrid,
  MoneyField,
  SelectField,
  SubmitButton,
  TextAreaField,
  TextField,
  useActionForm,
} from "@/components/app/form";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Priority, WorkStatus } from "@/generated/prisma/enums";
import { PRIORITY, WORK_STATUS } from "@/lib/labels";
import { createWorkItemAction, updateWorkItemAction } from "./actions";
import type { WorkItemValues, WorkOptions } from "./form-values";

/** Side panel with the full work-item form (create or edit). */
export function WorkItemSheet({
  trigger,
  projectId,
  itemId,
  values,
  options,
  isPhase,
}: {
  trigger: React.ReactNode;
  projectId: string;
  itemId?: string;
  values: WorkItemValues;
  options: WorkOptions;
  /** Editing a stage that contains items: hide the "Stage" picker. */
  isPhase?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const action = useMemo(
    () => (itemId ? updateWorkItemAction.bind(null, itemId) : createWorkItemAction.bind(null, projectId)),
    [itemId, projectId],
  );
  const { onSubmit, pending, fieldErrors: e, formError } = useActionForm(action, { onSuccess: () => setOpen(false) });
  const [deps, setDeps] = useState<string[]>(values.dependsOnIds);
  const [status, setStatus] = useState<WorkStatus>(values.status);
  const candidates = options.items.filter((i) => i.id !== itemId);

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setDeps(values.dependsOnIds);
          setStatus(values.status);
        }
      }}
    >
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="w-full gap-0 sm:max-w-xl">
        <SheetHeader className="border-b">
          <SheetTitle>{itemId ? `Edit “${values.name}”` : "Add work item"}</SheetTitle>
          <SheetDescription>Who is doing it, when it should finish and how far it has got.</SheetDescription>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1">
          <form id={`work-form-${itemId ?? "new"}`} onSubmit={onSubmit} className="flex flex-col gap-4 p-4">
            <FormError message={Object.keys(e).length ? "Please check the fields marked in red." : formError} />
            <TextField label="Work name" name="name" defaultValue={values.name} required error={e.name} placeholder="e.g. Ground floor slab" autoFocus={!itemId} />
            <FormGrid>
              {!isPhase && (
                <SelectField
                  label="Stage"
                  name="parentId"
                  defaultValue={values.parentId}
                  error={e.parentId}
                  placeholder="— Not inside a stage —"
                  options={options.phases.filter((p) => p.id !== itemId).map((p) => ({ value: p.id, label: p.name }))}
                />
              )}
              {options.sites.length > 1 && (
                <SelectField label="Site" name="siteId" defaultValue={values.siteId} error={e.siteId} placeholder="Main site" options={options.sites.map((s) => ({ value: s.id, label: s.name }))} />
              )}
              <SelectField
                label="Status"
                name="status"
                value={status}
                onChange={(ev) => setStatus(ev.target.value as WorkStatus)}
                error={e.status}
                options={Object.values(WorkStatus).map((s) => ({ value: s, label: WORK_STATUS[s].label }))}
              />
              <SelectField
                label="Priority"
                name="priority"
                defaultValue={values.priority}
                error={e.priority}
                options={Object.values(Priority).map((p) => ({ value: p, label: PRIORITY[p].label }))}
              />
              <TextField
                label="% completed"
                name="percentComplete"
                type="number"
                min={0}
                max={100}
                step={5}
                defaultValue={values.percentComplete}
                error={e.percentComplete}
                hint="100% marks it completed."
              />
              <SelectField
                label="Engineer in charge"
                name="engineerId"
                defaultValue={values.engineerId}
                error={e.engineerId}
                placeholder="— None —"
                options={options.engineers.map((en) => ({
                  value: en.id,
                  label: `${en.name}${en.role ? ` (${en.role})` : ""}${en.onProject ? "" : " – not on this project"}`,
                }))}
              />
              <TextField label="Team / gang" name="team" defaultValue={values.team} error={e.team} placeholder="e.g. Murugan's mason gang (6)" fieldClassName="sm:col-span-2" />
              <TextField label="Start date" name="startDate" type="date" defaultValue={values.startDate} error={e.startDate} />
              <TextField label="Expected completion" name="expectedEndDate" type="date" defaultValue={values.expectedEndDate} error={e.expectedEndDate} />
              {status === "COMPLETED" && (
                <TextField label="Completed on" name="actualEndDate" type="date" defaultValue={values.actualEndDate} error={e.actualEndDate} hint="Leave empty for today." />
              )}
              {options.showMoney ? (
                <>
                  <MoneyField label="Estimated cost" name="estimatedCostPaise" defaultValue={values.estimatedCost} error={e.estimatedCostPaise} help="Used to weigh this item in the overall progress." />
                  <MoneyField label="Actual cost so far" name="actualCostPaise" defaultValue={values.actualCost} error={e.actualCostPaise} />
                </>
              ) : (
                <>
                  <input type="hidden" name="estimatedCostPaise" value="" />
                  <input type="hidden" name="actualCostPaise" value="" />
                </>
              )}
            </FormGrid>
            {status !== "COMPLETED" && (
              <TextField
                label="Why is it pending / delayed?"
                name="pendingReason"
                defaultValue={values.pendingReason}
                error={e.pendingReason}
                placeholder="e.g. Waiting for steel delivery"
              />
            )}
            <TextAreaField label="Description" name="description" defaultValue={values.description} error={e.description} rows={2} />

            {candidates.length > 0 && (
              <div className="flex flex-col gap-2">
                <Label>Must finish first</Label>
                <p className="text-xs text-muted-foreground">Tick the work that has to be done before this can start.</p>
                <div className="max-h-48 overflow-y-auto rounded-lg border p-2">
                  {candidates.map((c) => (
                    <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted">
                      <Checkbox
                        checked={deps.includes(c.id)}
                        onCheckedChange={(checked) => setDeps((d) => (checked ? [...d, c.id] : d.filter((x) => x !== c.id)))}
                      />
                      <span>
                        {c.name}
                        {c.phase && <span className="text-muted-foreground"> · {c.phase}</span>}
                      </span>
                    </label>
                  ))}
                </div>
                {e.dependsOnIds && <p className="text-sm text-red-700">{e.dependsOnIds}</p>}
                {deps.map((d) => (
                  <input key={d} type="hidden" name="dependsOnIds" value={d} />
                ))}
              </div>
            )}

            <TextAreaField label="Notes" name="notes" defaultValue={values.notes} error={e.notes} rows={2} />
          </form>
        </ScrollArea>
        <div className="border-t p-4">
          <SubmitButton form={`work-form-${itemId ?? "new"}`} pending={pending} className="w-full">
            {itemId ? "Save changes" : "Add work item"}
          </SubmitButton>
        </div>
      </SheetContent>
    </Sheet>
  );
}
