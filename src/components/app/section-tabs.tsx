"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type SectionTab = { href: string; label: string; count?: number; exact?: boolean };

/** Underlined tabs for the pages of one module (Materials, Labour, Accounts…). */
export function SectionTabs({ tabs, className }: { tabs: SectionTab[]; className?: string }) {
  const pathname = usePathname();
  const active =
    tabs
      .filter((t) => (t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(`${t.href}/`)))
      .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;
  return (
    <nav aria-label="Section" className={cn("-mt-2 mb-5 flex gap-1 overflow-x-auto border-b", className)}>
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={active === t.href ? "page" : undefined}
          className={cn(
            "inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
            active === t.href ? "border-brand text-foreground" : "border-transparent text-muted-foreground hover:border-stone-300 hover:text-foreground",
          )}
        >
          {t.label}
          {t.count !== undefined && t.count > 0 && (
            <span className="tabular rounded-full bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-800">{t.count}</span>
          )}
        </Link>
      ))}
    </nav>
  );
}
