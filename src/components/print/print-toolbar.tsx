"use client";

import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Shown on screen only: print (or "Save as PDF" in the print dialog) and go back. */
export function PrintToolbar({ title }: { title: string }) {
  return (
    <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-2 border-b bg-background/95 px-4 py-2 backdrop-blur">
      <Button variant="ghost" onClick={() => (window.history.length > 1 ? window.history.back() : window.close())}>
        <ArrowLeft className="size-4" /> Back
      </Button>
      <span className="truncate text-sm text-muted-foreground">{title}</span>
      <Button onClick={() => window.print()}>
        <Printer className="size-4" /> Print / Save as PDF
      </Button>
    </div>
  );
}
