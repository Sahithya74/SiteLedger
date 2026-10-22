import { todayIST } from "@/lib/dates";
import { toCsv } from "@/lib/csv";
import { getCurrentUser } from "@/server/auth/current-user";
import { csvValue, reportParams } from "@/server/reports/format";
import { findReport, reportTotals } from "@/server/reports/registry";

/** CSV download of any report the person may open, with the same filters as the screen. */
export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return new Response("Please log in.", { status: 401 });
  const url = new URL(request.url);
  const sp = Object.fromEntries(url.searchParams.entries());
  const def = findReport(user, sp.report ?? "");
  if (!def) return new Response("Report not found.", { status: 404 });
  const { params } = reportParams(def, sp);
  const result = await def.run(user, params);
  const totals = reportTotals(result);
  const rows = result.rows.map((r) => result.columns.map((c) => csvValue(r[c.key], c.type)));
  if (Object.keys(totals).length) rows.push(result.columns.map((c, i) => (i === 0 ? "Total" : c.key in totals ? csvValue(totals[c.key], c.type) : "")));
  const csv = toCsv(
    result.columns.map((c) => (c.type === "money" ? `${c.label} (₹)` : c.label)),
    rows,
  );
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${def.key}-${todayIST()}.csv"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
