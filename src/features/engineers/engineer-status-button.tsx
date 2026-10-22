"use client";

import { UserCheck, UserX } from "lucide-react";
import { ConfirmAction } from "@/components/app/confirm-action";
import { Button } from "@/components/ui/button";
import { setEngineerActiveAction } from "./actions";

export function EngineerStatusButton({ engineerId, name, active }: { engineerId: string; name: string; active: boolean }) {
  return active ? (
    <ConfirmAction
      trigger={
        <Button variant="ghost" size="lg">
          <UserX className="size-4" /> No longer working
        </Button>
      }
      title={`Mark ${name} as no longer working?`}
      description="They will be hidden from lists and from the engineer picker. Their history and past work stay as they are."
      confirmLabel="Confirm"
      action={() => setEngineerActiveAction(engineerId, false)}
    />
  ) : (
    <ConfirmAction
      trigger={
        <Button variant="ghost" size="lg">
          <UserCheck className="size-4" /> Re-activate
        </Button>
      }
      title={`Re-activate ${name}?`}
      description="They will appear in lists and can be assigned work again."
      confirmLabel="Re-activate"
      action={() => setEngineerActiveAction(engineerId, true)}
    />
  );
}
