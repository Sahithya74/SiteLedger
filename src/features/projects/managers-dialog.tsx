"use client";

import { useState, useTransition } from "react";
import { Loader2, UserCog } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { setProjectManagersAction } from "./actions";

/** Owner chooses which managers can see and work on this project. */
export function ManagersDialog({
  projectId,
  managers,
  assignedIds,
}: {
  projectId: string;
  managers: { id: string; name: string; isActive: boolean }[];
  assignedIds: string[];
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(assignedIds);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await setProjectManagersAction(projectId, selected);
      if (result.ok) {
        toast.success(result.message ?? "Saved.");
        setOpen(false);
      } else toast.error(result.error);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setSelected(assignedIds);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <UserCog className="size-4" /> Change
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Who manages this project?</DialogTitle>
          <DialogDescription>Selected managers can see this project and work on it, within their permissions.</DialogDescription>
        </DialogHeader>
        {managers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No manager accounts yet. Add one in Settings → Users & permissions.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {managers.map((m) => (
              <li key={m.id} className="flex items-center gap-3">
                <Checkbox
                  id={`mgr-${m.id}`}
                  checked={selected.includes(m.id)}
                  onCheckedChange={(checked) =>
                    setSelected((s) => (checked ? [...s, m.id] : s.filter((x) => x !== m.id)))
                  }
                />
                <Label htmlFor={`mgr-${m.id}`} className="font-normal">
                  {m.name}
                  {!m.isActive && <span className="text-muted-foreground"> (deactivated)</span>}
                </Label>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button onClick={save} disabled={pending || managers.length === 0}>
            {pending && <Loader2 className="size-4 animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
