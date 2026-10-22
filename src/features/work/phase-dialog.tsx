"use client";

import { useMemo, useState } from "react";
import { FolderPlus } from "lucide-react";
import { FormError, SubmitButton, TextField, useActionForm } from "@/components/app/form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { createPhaseAction } from "./actions";

export function AddPhaseDialog({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const action = useMemo(() => createPhaseAction.bind(null, projectId), [projectId]);
  const { onSubmit, pending, fieldErrors: e, formError } = useActionForm(action, { onSuccess: () => setOpen(false) });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="lg">
          <FolderPlus className="size-4" /> Add stage
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a stage</DialogTitle>
          <DialogDescription>A stage groups related work, e.g. “Foundation” or “Second floor”.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <FormError message={Object.keys(e).length ? null : formError} />
          <TextField label="Stage name" name="name" required error={e.name} autoFocus placeholder="e.g. Compound wall" />
          <TextField label="Description (optional)" name="description" error={e.description} />
          <SubmitButton pending={pending}>Add stage</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
