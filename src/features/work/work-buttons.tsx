"use client";

import { Layers, Trash2 } from "lucide-react";
import { ConfirmAction } from "@/components/app/confirm-action";
import { Button } from "@/components/ui/button";
import { addStandardStagesAction, deleteWorkItemAction } from "./actions";

export function StandardStagesButton({ projectId, prominent }: { projectId: string; prominent?: boolean }) {
  return (
    <ConfirmAction
      trigger={
        <Button variant={prominent ? "default" : "outline"} size="lg">
          <Layers className="size-4" /> Add standard stages
        </Button>
      }
      title="Add the standard stages?"
      description={
        <div className="flex flex-col gap-2">
          <p>This adds the usual building work, which you can rename or remove afterwards:</p>
          <ul className="list-disc pl-5">
            <li>Foundation — excavation, PCC, footing, reinforcement, concrete</li>
            <li>Structure — columns, beams, slab</li>
            <li>Masonry — brickwork, blockwork</li>
            <li>Finishing — plastering, electrical, plumbing, flooring, granite, doors, windows, painting</li>
          </ul>
          <p>Stages that already exist are skipped.</p>
        </div>
      }
      confirmLabel="Add stages"
      action={() => addStandardStagesAction(projectId)}
    />
  );
}

export function DeleteWorkItemButton({ itemId, name, isPhase }: { itemId: string; name: string; isPhase: boolean }) {
  return (
    <ConfirmAction
      trigger={
        <Button variant="ghost" size="icon-sm" aria-label={`Remove ${name}`} className="text-muted-foreground hover:text-red-700">
          <Trash2 className="size-4" />
        </Button>
      }
      title={`Remove “${name}”?`}
      description={
        isPhase
          ? "The stage can only be removed when it has no work items inside it."
          : "The work item is removed from the list. Its history stays in the audit log."
      }
      confirmLabel="Remove"
      destructive
      action={() => deleteWorkItemAction(itemId)}
    />
  );
}
