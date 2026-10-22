import { cn } from "@/lib/utils";

type ProgressBarProps = {
  value: number;
  /** Where the work should be by now (shown as a thin marker). */
  planned?: number | null;
  tone?: "default" | "good" | "warn" | "bad";
  size?: "sm" | "md";
  showLabel?: boolean;
  className?: string;
};

const TONE = {
  default: "bg-stone-700",
  good: "bg-emerald-600",
  warn: "bg-amber-500",
  bad: "bg-red-600",
} as const;

export function ProgressBar({ value, planned, tone = "default", size = "sm", showLabel = true, className }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${pct}% complete`}
        className={cn("relative w-full overflow-hidden rounded-full bg-stone-200/80", size === "sm" ? "h-1.5" : "h-2.5")}
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-500 ease-out", TONE[tone])}
          style={{ width: `${pct}%` }}
        />
        {planned !== undefined && planned !== null && (
          <div
            title={`Planned by today: ${planned}%`}
            className="absolute inset-y-0 w-0.5 bg-stone-900/60"
            style={{ left: `calc(${Math.max(0, Math.min(100, planned))}% - 1px)` }}
          />
        )}
      </div>
      {showLabel && <span className="tabular w-9 shrink-0 text-right text-xs font-medium text-muted-foreground">{pct}%</span>}
    </div>
  );
}

export function healthTone(state: string): ProgressBarProps["tone"] {
  if (state === "behind") return "bad";
  if (state === "slightly_behind") return "warn";
  if (state === "ahead" || state === "on_track") return "good";
  return "default";
}
