import Link from "next/link";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/app/empty-state";

export function NoAccess({ message }: { message?: string }) {
  return (
    <EmptyState
      icon={Lock}
      title="You don't have access to this page"
      description={message ?? "Ask the owner to give you permission if you need it."}
      action={
        <Button asChild variant="outline">
          <Link href="/dashboard">Go to dashboard</Link>
        </Button>
      }
    />
  );
}

export function NotFoundPanel({ what, backHref, backLabel }: { what: string; backHref: string; backLabel: string }) {
  return (
    <EmptyState
      title={`This ${what} could not be found`}
      description="It may have been removed, or you may not have access to it."
      action={
        <Button asChild variant="outline">
          <Link href={backHref}>{backLabel}</Link>
        </Button>
      }
    />
  );
}
