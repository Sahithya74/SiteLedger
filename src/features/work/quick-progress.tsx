"use client";

import { useMemo, useState } from "react";
import { FormError, SelectField, SubmitButton, TextField, useActionForm } from "@/components/app/form";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { WorkStatus } from "@/generated/prisma/enums";
import { WORK_STATUS } from "@/lib/labels";
import { quickProgressAction } from "./actions";

const STEPS = [0, 10, 25, 50, 75, 90, 100];

/** One-tap progress update from the work list — designed for use on site. */
export function QuickProgress({
  itemId,
  name,
  status,
  percent,
  pendingReason,
}: {
  itemId: string;
  name: string;
  status: WorkStatus;
  percent: number;
  pendingReason: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(percent);
  const [current, setCurrent] = useState<WorkStatus>(status);
  const action = useMemo(() => quickProgressAction.bind(null, itemId), [itemId]);
  const { onSubmit, pending, fieldErrors: e, formError } = useActionForm(action, { onSuccess: () => setOpen(false) });

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setValue(percent);
          setCurrent(status);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          Update
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <p className="text-sm font-medium">{name}</p>
          <FormError message={Object.keys(e).length ? null : formError} />
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">How much is done?</span>
            <div className="grid grid-cols-7 gap-1">
              {STEPS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setValue(s);
                    if (s === 100) setCurrent("COMPLETED");
                    else if (current === "COMPLETED" || (current === "NOT_STARTED" && s > 0)) setCurrent("IN_PROGRESS");
                  }}
                  className={`rounded-md border py-1.5 text-xs font-medium transition-colors ${
                    value === s ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
                  }`}
                >
                  {s}%
                </button>
              ))}
            </div>
            <input type="hidden" name="percentComplete" value={value} />
            {e.percentComplete && <p className="text-sm text-red-700">{e.percentComplete}</p>}
          </div>
          <SelectField
            label="Status"
            name="status"
            value={current}
            onChange={(ev) => setCurrent(ev.target.value as WorkStatus)}
            options={Object.values(WorkStatus).map((s) => ({ value: s, label: WORK_STATUS[s].label }))}
          />
          {current !== "COMPLETED" && (
            <TextField label="Reason pending (optional)" name="pendingReason" defaultValue={pendingReason ?? ""} placeholder="e.g. Rain, waiting for material" />
          )}
          <SubmitButton pending={pending} size="default">
            Save
          </SubmitButton>
        </form>
      </PopoverContent>
    </Popover>
  );
}
