import { cn } from "@/lib/utils";

/** SITECORE mark: stacked floor slabs on an amber tile. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand text-brand-foreground shadow-sm", className)}
    >
      <svg viewBox="0 0 24 24" className="size-[62%]" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
        <path d="M5 19h14" />
        <path d="M7 14.5h10" />
        <path d="M9 10h6" />
        <path d="M11 5.5h2" />
      </svg>
    </span>
  );
}

export function BrandName({ className, subtitle }: { className?: string; subtitle?: string }) {
  return (
    <span className={cn("flex min-w-0 flex-col leading-tight", className)}>
      <span className="text-[15px] font-semibold tracking-[0.12em]">SITECORE</span>
      {subtitle && <span className="truncate text-xs text-muted-foreground">{subtitle}</span>}
    </span>
  );
}
