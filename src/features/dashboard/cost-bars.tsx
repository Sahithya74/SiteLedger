import { formatINR, formatINRShort, ratio, type Paise } from "@/lib/money";

/**
 * Costs by type as simple horizontal bars (magnitude → one hue). Every bar
 * carries its value at the tip, so no axis or legend is needed.
 */
export function CostBars({ items }: { items: { label: string; paise: Paise }[] }) {
  const rows = items.filter((i) => i.paise !== 0n);
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No costs recorded yet.</p>;
  }
  const max = rows.reduce((m, r) => (r.paise > m ? r.paise : m), 0n);
  const total = rows.reduce((s, r) => s + r.paise, 0n);
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2.5">
        {rows
          .sort((a, b) => (b.paise > a.paise ? 1 : b.paise < a.paise ? -1 : 0))
          .map((row) => {
            const share = Math.round(ratio(row.paise, total) * 100);
            return (
              <li key={row.label} className="grid grid-cols-[minmax(0,10rem)_1fr] items-center gap-3 text-sm sm:grid-cols-[13rem_1fr]">
                <span className="truncate text-muted-foreground" title={row.label}>
                  {row.label}
                </span>
                <span className="flex items-center gap-2" title={`${row.label}: ${formatINR(row.paise)} (${share}% of costs)`}>
                  <span className="h-3 rounded-r-[4px] bg-stone-600" style={{ width: `${Math.max(2, ratio(row.paise, max) * 100) * 0.75}%` }} />
                  <span className="tabular shrink-0 text-xs font-medium">
                    {formatINRShort(row.paise)} <span className="text-muted-foreground">· {share}%</span>
                  </span>
                </span>
              </li>
            );
          })}
      </ul>
      <p className="border-t pt-2 text-right text-sm">
        Total <span className="font-semibold">{formatINR(total, { paise: false })}</span>
      </p>
    </div>
  );
}
