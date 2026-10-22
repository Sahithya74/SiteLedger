"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import { formatMonth } from "@/lib/dates";
import { formatINR, formatINRShort } from "@/lib/money";

/**
 * Money in vs money out per month. Two series → legend + tooltip; colours
 * are slots 1–2 of the validated categorical palette (checked with the
 * dataviz validator against the white card surface).
 */
const SERIES = [
  { key: "in", label: "Money in", color: "#2a78d6" },
  { key: "out", label: "Money out", color: "#eb6834" },
] as const;

type Row = { month: string; in: number; out: number; inPaise: string; outPaise: string };

export function CashflowChart({ data, caption = "Last 6 months" }: { data: { month: string; inPaise: string; outPaise: string }[]; caption?: string }) {
  // Values arrive as paise strings (bigint can't go into a chart); rupees as numbers are fine for drawing.
  const rows: Row[] = data.map((d) => ({
    ...d,
    in: Number(BigInt(d.inPaise) / 100n),
    out: Number(BigInt(d.outPaise) / 100n),
  }));
  const empty = rows.every((r) => r.in === 0 && r.out === 0);

  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        {SERIES.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-sm" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
        <span>{caption} · transfers between own accounts excluded</span>
      </figcaption>
      {empty ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No money has moved in this period yet.</p>
      ) : (
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} barGap={2} barCategoryGap="28%" margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
              <CartesianGrid vertical={false} stroke="#e7e5e4" />
              <XAxis
                dataKey="month"
                tickFormatter={(m: string) => formatMonth(m).slice(0, 3)}
                tickLine={false}
                axisLine={{ stroke: "#d6d3d1" }}
                tick={{ fill: "#78716c", fontSize: 12 }}
              />
              <YAxis
                width={64}
                tickFormatter={(v: number) => formatINRShort(BigInt(Math.round(v)) * 100n)}
                tickLine={false}
                axisLine={false}
                tick={{ fill: "#78716c", fontSize: 12 }}
              />
              <Tooltip cursor={{ fill: "rgba(120,113,108,0.08)" }} content={<CashflowTooltip />} />
              {SERIES.map((s) => (
                <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {/* Table view for screen readers and anyone who prefers numbers. */}
      <table className="sr-only">
        <caption>Money in and out by month</caption>
        <thead>
          <tr>
            <th>Month</th>
            <th>Money in</th>
            <th>Money out</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.month}>
              <td>{formatMonth(r.month)}</td>
              <td>{formatINR(BigInt(r.inPaise))}</td>
              <td>{formatINR(BigInt(r.outPaise))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function CashflowTooltip({ active, payload, label }: Partial<TooltipContentProps<number, string>>) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as Row;
  const net = BigInt(row.inPaise) - BigInt(row.outPaise);
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="mb-1 font-medium">{formatMonth(String(label))}</div>
      {SERIES.map((s) => (
        <div key={s.key} className="flex items-center justify-between gap-6">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <span aria-hidden className="size-2 rounded-sm" style={{ background: s.color }} />
            {s.label}
          </span>
          <span className="tabular font-medium">{formatINR(BigInt(s.key === "in" ? row.inPaise : row.outPaise), { paise: false })}</span>
        </div>
      ))}
      <div className="mt-1 flex justify-between gap-6 border-t pt-1">
        <span className="text-muted-foreground">Net</span>
        <span className="tabular font-medium">{formatINR(net, { paise: false })}</span>
      </div>
    </div>
  );
}
