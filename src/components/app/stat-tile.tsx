import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type StatTileProps = {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon?: LucideIcon;
  /** Colours the value when it needs attention. */
  tone?: "default" | "good" | "warn" | "bad";
  href?: string;
  title?: string;
  className?: string;
};

const TONE = {
  default: "text-foreground",
  good: "text-emerald-700",
  warn: "text-amber-700",
  bad: "text-red-700",
} as const;

/** A headline number: label, big value, one line of context. */
export function StatTile({ label, value, sub, icon: Icon, tone = "default", href, title, className }: StatTileProps) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</span>
        {Icon && <Icon className="size-4 text-muted-foreground/70" aria-hidden />}
      </div>
      <div className={cn("mt-2 text-2xl leading-none font-semibold tracking-tight sm:text-[1.7rem]", TONE[tone])}>{value}</div>
      {sub && <div className="mt-1.5 truncate text-xs text-muted-foreground">{sub}</div>}
    </>
  );
  const classes = cn(
    "flex min-w-0 flex-col rounded-xl border bg-card p-4 shadow-xs",
    href && "transition-colors hover:border-stone-300 hover:bg-stone-50/60",
    className,
  );
  return href ? (
    <Link href={href} className={classes} title={title}>
      {body}
    </Link>
  ) : (
    <div className={classes} title={title}>
      {body}
    </div>
  );
}
