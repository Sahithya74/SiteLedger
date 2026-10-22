import Link from "next/link";
import { AlertOctagon, AlertTriangle, CheckCircle2, ChevronRight, Info, PartyPopper } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AlertSeverity, AttentionItem } from "@/server/services/alerts";

const STYLE: Record<AlertSeverity, { icon: typeof Info; iconClass: string; label: string; bar: string }> = {
  CRITICAL: { icon: AlertOctagon, iconClass: "text-red-600", label: "Urgent", bar: "bg-red-500" },
  WARNING: { icon: AlertTriangle, iconClass: "text-amber-600", label: "Needs attention", bar: "bg-amber-500" },
  INFO: { icon: Info, iconClass: "text-sky-600", label: "Coming up", bar: "bg-sky-500" },
  SUCCESS: { icon: CheckCircle2, iconClass: "text-emerald-600", label: "Good news", bar: "bg-emerald-500" },
};

/** "Things that need your attention" — the heart of the dashboard (spec §42). */
export function AttentionList({ items, limit = 10 }: { items: AttentionItem[]; limit?: number }) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <PartyPopper className="size-8 text-emerald-600" />
        <p className="font-medium">Nothing needs your attention right now</p>
        <p className="text-sm text-muted-foreground">Payments, stock, wages and work are all on track.</p>
      </div>
    );
  }
  const shown = items.slice(0, limit);
  const counts = {
    CRITICAL: items.filter((i) => i.severity === "CRITICAL").length,
    WARNING: items.filter((i) => i.severity === "WARNING").length,
  };
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {counts.CRITICAL > 0 && <span className="font-medium text-red-700">{counts.CRITICAL} urgent</span>}
        {counts.CRITICAL > 0 && counts.WARNING > 0 && " · "}
        {counts.WARNING > 0 && <span className="font-medium text-amber-700">{counts.WARNING} need attention</span>}
        {counts.CRITICAL + counts.WARNING === 0 && "Only updates and reminders today."}
      </p>
      <ol className="flex flex-col divide-y rounded-lg border">
        {shown.map((item, index) => {
          const s = STYLE[item.severity];
          const Icon = s.icon;
          const content = (
            <>
              <span aria-hidden className={cn("absolute inset-y-2 left-0 w-1 rounded-r", s.bar)} />
              <span className="tabular mt-0.5 w-5 shrink-0 text-right text-xs text-muted-foreground">{index + 1}.</span>
              <Icon className={cn("mt-0.5 size-4 shrink-0", s.iconClass)} aria-label={s.label} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-medium">{item.title}</span>
                <span className="truncate text-xs text-muted-foreground">{item.detail}</span>
              </span>
              {item.href && <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />}
            </>
          );
          return (
            <li key={item.key} className="page-enter relative">
              {item.href ? (
                <Link href={item.href} className="flex items-start gap-2.5 px-3 py-2.5 pl-4 transition-colors hover:bg-muted/60">
                  {content}
                </Link>
              ) : (
                <div className="flex items-start gap-2.5 px-3 py-2.5 pl-4">{content}</div>
              )}
            </li>
          );
        })}
      </ol>
      {items.length > limit && (
        <p className="text-xs text-muted-foreground">
          + {items.length - limit} more lower-priority item{items.length - limit === 1 ? "" : "s"}
        </p>
      )}
    </div>
  );
}
