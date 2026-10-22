"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function ProjectTabs({ projectId, tabs }: { projectId: string; tabs: { segment: string; label: string; count?: number }[] }) {
  const pathname = usePathname();
  const base = `/projects/${projectId}`;
  return (
    <nav aria-label="Project sections" className="-mb-px flex gap-1 overflow-x-auto border-b">
      {tabs.map((t) => {
        const href = t.segment ? `${base}/${t.segment}` : base;
        const active = t.segment ? pathname.startsWith(href) : pathname === base;
        return (
          <Link
            key={t.segment}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors",
              active ? "border-brand text-foreground" : "border-transparent text-muted-foreground hover:border-stone-300 hover:text-foreground",
            )}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className="tabular rounded-full bg-red-100 px-1.5 text-[11px] font-semibold text-red-700">{t.count}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
