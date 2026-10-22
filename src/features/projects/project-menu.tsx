"use client";

import { Archive, ArchiveRestore, MoreHorizontal, Trash2 } from "lucide-react";
import { ConfirmAction } from "@/components/app/confirm-action";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { archiveProjectAction, deleteProjectAction, restoreProjectAction } from "./actions";

/** Owner-only actions: archive / restore / delete (with the §44 safeguards). */
export function ProjectMenu({ projectId, name, archived }: { projectId: string; name: string; archived: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon-lg" aria-label="More actions">
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {archived ? (
          <ConfirmAction
            trigger={
              <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                <ArchiveRestore /> Restore project
              </DropdownMenuItem>
            }
            title={`Restore ${name}?`}
            description="The project will appear in the normal project lists again."
            confirmLabel="Restore"
            action={() => restoreProjectAction(projectId)}
          />
        ) : (
          <ConfirmAction
            trigger={
              <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                <Archive /> Archive project
              </DropdownMenuItem>
            }
            title={`Archive ${name}?`}
            description="Archived projects are hidden from day-to-day lists but all their records are kept. You can restore it any time."
            confirmLabel="Archive"
            reason={{ label: "Reason (optional)", placeholder: "e.g. Project finished and all payments settled" }}
            action={(reason) => archiveProjectAction(projectId, reason)}
          />
        )}
        <ConfirmAction
          trigger={
            <DropdownMenuItem variant="destructive" onSelect={(e) => e.preventDefault()}>
              <Trash2 /> Delete permanently
            </DropdownMenuItem>
          }
          title={`Delete ${name} permanently?`}
          description={
            <>
              Only a project with <strong>no</strong> payments, expenses, attendance, work or documents can be deleted. If it
              has any records you will be asked to archive it instead.
            </>
          }
          confirmLabel="Delete"
          destructive
          action={() => deleteProjectAction(projectId)}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
