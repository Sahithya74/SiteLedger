"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, HardHat, ListChecks, Loader2, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { searchAction } from "@/app/(app)/actions";
import type { SearchResult } from "@/server/services/search";

const GROUPS: { type: SearchResult["type"]; label: string; icon: typeof Building2 }[] = [
  { type: "project", label: "Projects", icon: Building2 },
  { type: "client", label: "Clients", icon: Users },
  { type: "engineer", label: "Engineers", icon: HardHat },
  { type: "work", label: "Work items", icon: ListChecks },
];

/** Search box in the header. Opens with Ctrl+K (or ⌘K, or "/"). */
export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [pending, startTransition] = useTransition();
  const latest = useRef("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const typing = e.target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName);
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const q = query.trim();
    latest.current = q;
    if (q.length < 2) return;
    const timer = setTimeout(() => {
      startTransition(async () => {
        const found = await searchAction(q);
        if (latest.current === q) setResults(found);
      });
    }, 220);
    return () => clearTimeout(timer);
  }, [query]);

  function go(href: string) {
    setOpen(false);
    setQuery("");
    setResults([]);
    router.push(href);
  }

  const showResults = query.trim().length >= 2;

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="h-9 w-full max-w-sm justify-start gap-2 bg-card px-3 text-muted-foreground sm:w-72"
      >
        <Search className="size-4" />
        <span className="truncate">Search projects, clients…</span>
        <kbd className="ml-auto hidden rounded border bg-muted px-1.5 text-[10px] font-medium sm:inline">Ctrl K</kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen} title="Search" description="Search projects, clients, engineers and work">
        <Command shouldFilter={false}>
          <CommandInput value={query} onValueChange={setQuery} placeholder="Type a name, phone number or project code…" />
          <CommandList>
            {!showResults && (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                Type at least 2 letters. Small spelling mistakes are fine.
              </p>
            )}
            {showResults && pending && results.length === 0 && (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Searching…
              </div>
            )}
            {showResults && !pending && <CommandEmpty>Nothing found for “{query.trim()}”.</CommandEmpty>}
            {showResults &&
              GROUPS.map((group) => {
                const items = results.filter((r) => r.type === group.type);
                if (items.length === 0) return null;
                const Icon = group.icon;
                return (
                  <CommandGroup key={group.type} heading={group.label}>
                    {items.map((r) => (
                      <CommandItem key={`${r.type}-${r.id}`} value={`${r.type}-${r.id}`} onSelect={() => go(r.href)} className="gap-3 py-2">
                        <Icon className="size-4 text-muted-foreground" />
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate font-medium">{r.title}</span>
                          {r.subtitle && <span className="truncate text-xs text-muted-foreground">{r.subtitle}</span>}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                );
              })}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
