import Link from "next/link";
import { Filter, Search } from "lucide-react";
import { NativeSelect } from "@/components/app/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PERIOD_OPTIONS } from "@/lib/period";

export type FilterField =
  | { type: "search"; name?: string; placeholder?: string }
  | { type: "select"; name: string; label: string; options: { value: string; label: string }[]; allLabel?: string }
  | { type: "period"; fallback?: string }
  | { type: "checkbox"; name: string; label: string };

type Values = Record<string, string | string[] | undefined>;

const val = (values: Values, key: string) => {
  const v = values[key];
  return Array.isArray(v) ? v[0] : (v ?? "");
};

/**
 * Filters as a plain GET form, so every filtered view has a shareable URL
 * and works without JavaScript.
 */
export function FilterBar({ action, values, fields }: { action: string; values: Values; fields: FilterField[] }) {
  const active = fields.some((f) => {
    if (f.type === "period") return Boolean(val(values, "period") || val(values, "from") || val(values, "to"));
    return Boolean(val(values, f.type === "search" ? (f.name ?? "q") : f.name));
  });
  return (
    <form action={action} className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3">
      {fields.map((f, i) => {
        if (f.type === "search") {
          const name = f.name ?? "q";
          return (
            <label key={i} className="relative flex min-w-52 flex-1 flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Search</span>
              <Search className="pointer-events-none absolute bottom-3 left-3 size-4 text-muted-foreground" />
              <Input name={name} defaultValue={val(values, name)} placeholder={f.placeholder ?? "Type to search…"} className="h-10 pl-9" />
            </label>
          );
        }
        if (f.type === "select") {
          return (
            <label key={i} className="flex min-w-40 flex-col gap-1 text-sm">
              <span className="text-muted-foreground">{f.label}</span>
              <NativeSelect name={f.name} defaultValue={val(values, f.name)}>
                <option value="">{f.allLabel ?? "All"}</option>
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </NativeSelect>
            </label>
          );
        }
        if (f.type === "checkbox") {
          return (
            <label key={i} className="flex h-10 items-center gap-2 text-sm">
              <input type="checkbox" name={f.name} value="1" defaultChecked={val(values, f.name) === "1"} className="size-4 accent-stone-800" />
              {f.label}
            </label>
          );
        }
        return (
          <div key={i} className="flex flex-wrap items-end gap-2">
            <label className="flex w-44 flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Period</span>
              <NativeSelect name="period" defaultValue={val(values, "period") || f.fallback || "this-fy"}>
                {PERIOD_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <label className="flex w-36 flex-col gap-1 text-sm">
              <span className="text-muted-foreground">or from</span>
              <Input type="date" name="from" defaultValue={val(values, "from")} className="h-10" />
            </label>
            <label className="flex w-36 flex-col gap-1 text-sm">
              <span className="text-muted-foreground">to</span>
              <Input type="date" name="to" defaultValue={val(values, "to")} className="h-10" />
            </label>
          </div>
        );
      })}
      <Button type="submit" variant="secondary" size="lg">
        <Filter className="size-4" /> Show
      </Button>
      {active && (
        <Button asChild variant="ghost" size="lg">
          <Link href={action}>Clear</Link>
        </Button>
      )}
    </form>
  );
}

/** Reads one string search param. */
export function param(values: Values, key: string): string | undefined {
  const v = val(values, key);
  return v || undefined;
}
