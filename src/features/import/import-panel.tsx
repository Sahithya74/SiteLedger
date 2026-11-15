"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Download, FileUp, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { NativeSelect } from "@/components/app/form";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { previewImportAction, runImportAction } from "./actions";

type RowCheck = { line: number; label: string; errors: string[] };

/** Choose a type, upload a CSV, see every problem, then import all rows at once. */
export function ImportPanel({ types }: { types: { type: string; title: string }[] }) {
  const [type, setType] = useState(types[0]?.type ?? "");
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [check, setCheck] = useState<{ total: number; problems: RowCheck[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function reset() {
    setFile(null);
    setCheck(null);
    setError(null);
  }

  async function choose(f: File | undefined) {
    reset();
    if (!f) return;
    if (!/\.csv$/i.test(f.name)) {
      setError("Please choose a .csv file. In Excel use File → Save As → “CSV UTF-8 (Comma delimited)”.");
      return;
    }
    const text = await f.text();
    setFile({ name: f.name, text });
    start(async () => {
      const r = await previewImportAction(type, text);
      if (r.ok && r.data) setCheck(r.data);
      else if (!r.ok) setError(r.error);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="import-type">What are you adding?</Label>
          <NativeSelect
            id="import-type"
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              reset();
            }}
            className="w-48"
          >
            {types.map((t) => (
              <option key={t.type} value={t.type}>
                {t.title}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button asChild variant="outline">
          <a href={`/api/import-template?type=${type}`}>
            <Download className="size-4" /> Download empty sheet
          </a>
        </Button>
      </div>
      <ol className="list-decimal pl-5 text-sm text-muted-foreground">
        <li>Download the empty sheet and open it in Excel. Keep the heading row; columns marked * must be filled.</li>
        <li>Fill one row per {types.find((t) => t.type === type)?.title.toLowerCase().replace(/s$/, "") ?? "item"}. Dates as DD-MM-YYYY, amounts in rupees.</li>
        <li>Save as “CSV UTF-8” and upload it below. Nothing is saved until every row is correct.</li>
      </ol>
      <label className="flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-dashed px-4 py-3 text-sm font-medium hover:bg-muted/50">
        <FileUp className="size-4" />
        {file ? `Chosen: ${file.name} — choose another` : "Choose the CSV file"}
        <input key={type} type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => choose(e.target.files?.[0])} />
      </label>
      {pending && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Checking…
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      {check && !pending && (
        <div className="flex flex-col gap-3">
          {check.problems.length === 0 ? (
            <p className="flex items-center gap-2 text-sm font-medium text-emerald-700">
              <CheckCircle2 className="size-4" /> All {check.total} rows are correct.
            </p>
          ) : (
            <div className="rounded-lg border border-red-200">
              <p className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
                <XCircle className="size-4" /> {check.problems.length} of {check.total} rows need fixing. Correct them in Excel and upload again.
              </p>
              <ul className="max-h-80 divide-y overflow-y-auto text-sm">
                {check.problems.map((p) => (
                  <li key={p.line} className="px-3 py-2">
                    <span className="font-medium">
                      Row {p.line} · {p.label}
                    </span>
                    <ul className="list-disc pl-5 text-red-800">
                      {p.errors.map((e) => (
                        <li key={e}>{e}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {check.problems.length === 0 && check.total > 0 && file && (
            <Button
              className="w-fit"
              size="lg"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await runImportAction(type, file.text);
                  if (r.ok) {
                    toast.success(r.message ?? "Imported.");
                    reset();
                  } else setError(r.error);
                })
              }
            >
              Import {check.total} {types.find((t) => t.type === type)?.title.toLowerCase()}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
