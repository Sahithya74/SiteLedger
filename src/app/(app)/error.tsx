"use client";

import { useEffect } from "react";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-16 text-center">
      <TriangleAlert className="size-10 text-amber-600" />
      <h2 className="text-lg font-semibold">Something went wrong on this page</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        Nothing was lost. Please try again. If it keeps happening, note the time and tell the person who looks after SITECORE.
        {error.digest && <span className="mt-1 block text-xs">Reference: {error.digest}</span>}
      </p>
      <Button onClick={reset} variant="outline">
        <RotateCcw className="size-4" /> Try again
      </Button>
    </div>
  );
}
