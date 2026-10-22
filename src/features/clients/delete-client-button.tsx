"use client";

import { Trash2 } from "lucide-react";
import { ConfirmAction } from "@/components/app/confirm-action";
import { Button } from "@/components/ui/button";
import { deleteClientAction } from "./actions";

export function DeleteClientButton({ clientId, name }: { clientId: string; name: string }) {
  return (
    <ConfirmAction
      trigger={
        <Button variant="ghost" size="lg" className="text-red-700 hover:text-red-800">
          <Trash2 className="size-4" /> Remove
        </Button>
      }
      title={`Remove ${name}?`}
      description="Only clients without projects, quotations or payments can be removed."
      confirmLabel="Remove client"
      destructive
      action={() => deleteClientAction(clientId)}
    />
  );
}
