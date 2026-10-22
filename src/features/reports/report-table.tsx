import Link from "next/link";
import { cn } from "@/lib/utils";
import { displayValue } from "@/server/reports/format";
import { reportTotals, type ReportResult } from "@/server/reports/registry";

const HIDE = { sm: "hidden sm:table-cell", md: "hidden md:table-cell", lg: "hidden lg:table-cell" } as const;

/** A report as a table (screen and print). In print every column is shown. */
export function ReportTable({ result, linkRows = true }: { result: ReportResult; linkRows?: boolean }) {
  const totals = reportTotals(result);
  const hasTotals = Object.keys(totals).length > 0;
  const cls = (c: ReportResult["columns"][number]) => cn(c.hide && HIDE[c.hide], c.hide && "print:table-cell", (c.type === "money" || c.type === "number") && "text-right tabular");
  if (result.rows.length === 0) {
    return <p className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">Nothing to show for these filters.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border bg-card print:overflow-visible print:rounded-none print:border-0">
      <table className="w-full border-collapse text-sm print:text-[11px]">
        <thead>
          <tr className="border-b bg-muted/40 text-left">
            {result.columns.map((c) => (
              <th key={c.key} className={cn("px-3 py-2 font-medium whitespace-nowrap", cls(c))}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((r, i) => (
            <tr key={i} className="border-b last:border-0 hover:bg-muted/30 print:break-inside-avoid">
              {result.columns.map((c, j) => {
                const text = displayValue(r[c.key], c.type);
                return (
                  <td key={c.key} className={cn("px-3 py-2 align-top", cls(c), c.type === "money" && typeof r[c.key] === "bigint" && (r[c.key] as bigint) < 0n && "text-red-700")}>
                    {j === 0 && linkRows && r._href ? (
                      <Link href={r._href} className="font-medium hover:underline print:no-underline">
                        {text}
                      </Link>
                    ) : (
                      text
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        {hasTotals && (
          <tfoot>
            <tr className="border-t-2 bg-muted/40 font-semibold">
              {result.columns.map((c, j) => (
                <td key={c.key} className={cn("px-3 py-2", cls(c))}>
                  {j === 0 ? `Total (${result.rows.length})` : c.key in totals ? displayValue(totals[c.key], c.type) : ""}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
