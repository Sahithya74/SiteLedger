"use client";

import { useMemo, useState } from "react";
import { CheckCheck, Loader2, RotateCcw, Save } from "lucide-react";
import { FormError, useActionForm } from "@/components/app/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatINR, multiplyQtyRate } from "@/lib/money";
import { cn } from "@/lib/utils";
import { saveAttendanceAction } from "./actions";

type Status = "PRESENT" | "HALF_DAY" | "ABSENT" | "";

type Person = {
  type: "LABOUR" | "ENGINEER";
  id: string;
  name: string;
  detail: string;
  dailyWage: string; // paise
  status: Status;
  overtimeHours: string;
  elsewhere: string | null;
  regular: boolean;
};

const BUTTONS: { value: Exclude<Status, "">; label: string; className: string }[] = [
  { value: "PRESENT", label: "P", className: "data-[on=true]:bg-emerald-600 data-[on=true]:text-white" },
  { value: "HALF_DAY", label: "½", className: "data-[on=true]:bg-amber-500 data-[on=true]:text-white" },
  { value: "ABSENT", label: "A", className: "data-[on=true]:bg-stone-500 data-[on=true]:text-white" },
];

/**
 * Fast attendance for a whole crew: tap P / ½ / A per person, or mark
 * everyone present at once. People already marked at another site that day
 * are shown but locked.
 */
export function AttendanceSheet({ projectId, date, people, showWages }: { projectId: string; date: string; people: Person[]; showWages: boolean }) {
  const [rows, setRows] = useState(people);
  const [showAll, setShowAll] = useState(people.every((p) => !p.regular) || people.some((p) => p.status && !p.regular));
  const { onSubmit, pending, formError, fieldErrors } = useActionForm(saveAttendanceAction);

  const visible = rows.filter((r) => showAll || r.regular || r.status);
  const counts = useMemo(() => {
    const present = rows.filter((r) => r.status === "PRESENT").length;
    const half = rows.filter((r) => r.status === "HALF_DAY").length;
    const absent = rows.filter((r) => r.status === "ABSENT").length;
    const wages = rows.reduce((sum, r) => {
      if (!r.status || r.status === "ABSENT") return sum;
      const base = multiplyQtyRate(r.status === "HALF_DAY" ? "0.5" : "1", BigInt(r.dailyWage));
      return sum + base;
    }, 0n);
    return { present, half, absent, wages };
  }, [rows]);

  function set(id: string, patch: Partial<Person>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="date" value={date} />
      <FormError message={Object.keys(fieldErrors).length ? "Please check the overtime hours." : formError} />

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={() => setRows((rs) => rs.map((r) => (r.elsewhere || !(showAll || r.regular || r.status) ? r : { ...r, status: "PRESENT" })))}>
          <CheckCheck className="size-4" /> Mark everyone shown as present
        </Button>
        <Button type="button" variant="ghost" onClick={() => setRows(people)}>
          <RotateCcw className="size-4" /> Undo changes
        </Button>
        <label className="ml-auto flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="size-4 accent-stone-800" />
          Show all workers (not only this site&apos;s regulars)
        </label>
      </div>

      <ul className="divide-y rounded-xl border bg-card">
        {visible.map((r) => {
          const index = rows.indexOf(r);
          return (
            <li key={`${r.type}-${r.id}`} className={cn("flex flex-wrap items-center gap-3 px-3 py-2.5", r.elsewhere && "opacity-60")}>
              <input type="hidden" name={`people.${index}.personType`} value={r.type} />
              <input type="hidden" name={`people.${index}.personId`} value={r.id} />
              <input type="hidden" name={`people.${index}.status`} value={r.elsewhere ? "" : r.status} />
              <div className="min-w-40 flex-1">
                <p className="font-medium">
                  {r.name}
                  {r.type === "ENGINEER" && <span className="ml-2 rounded bg-sky-100 px-1.5 text-[11px] font-medium text-sky-800">Engineer</span>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {r.elsewhere ? `Already marked at ${r.elsewhere} today` : r.detail}
                  {showWages && BigInt(r.dailyWage) > 0n && !r.elsewhere && ` · ${formatINR(BigInt(r.dailyWage), { paise: false })}/day`}
                </p>
              </div>
              <div className="flex gap-1" role="radiogroup" aria-label={`Attendance for ${r.name}`}>
                {BUTTONS.map((b) => (
                  <button
                    key={b.value}
                    type="button"
                    role="radio"
                    aria-checked={r.status === b.value}
                    aria-label={`${r.name}: ${b.value === "PRESENT" ? "present" : b.value === "HALF_DAY" ? "half day" : "absent"}`}
                    disabled={Boolean(r.elsewhere)}
                    data-on={r.status === b.value}
                    onClick={() => set(r.id, { status: r.status === b.value ? "" : b.value })}
                    className={cn("size-10 rounded-lg border text-sm font-semibold transition-colors hover:bg-muted disabled:cursor-not-allowed", b.className)}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                OT
                <Input
                  name={`people.${index}.overtimeHours`}
                  value={r.overtimeHours === "0" ? "" : r.overtimeHours}
                  onChange={(e) => set(r.id, { overtimeHours: e.target.value })}
                  inputMode="decimal"
                  placeholder="0"
                  disabled={!r.status || r.status === "ABSENT" || Boolean(r.elsewhere)}
                  className="h-10 w-16 text-center"
                  aria-label={`Overtime hours for ${r.name}`}
                />
                h
              </label>
            </li>
          );
        })}
        {visible.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">No workers yet. Tick “Show all workers” or add workers in Labour.</li>}
      </ul>

      <div className="sticky bottom-0 z-10 -mx-3 flex flex-wrap items-center gap-3 border-t bg-background/95 px-3 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
        <span className="text-sm">
          <strong>{counts.present}</strong> present · <strong>{counts.half}</strong> half day · <strong>{counts.absent}</strong> absent
          {showWages && counts.wages > 0n && <span className="text-muted-foreground"> · day&apos;s wages about {formatINR(counts.wages, { paise: false })}</span>}
        </span>
        <Button type="submit" size="lg" className="ml-auto" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save attendance
        </Button>
      </div>
    </form>
  );
}
