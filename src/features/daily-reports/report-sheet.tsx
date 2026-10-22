import { formatDateLong, formatDateTime } from "@/lib/dates";
import { WEATHER } from "@/lib/labels";
import type { DailyReportDetail } from "@/server/services/daily-reports";

/** The daily report as one readable sheet (screen and print). */
export function ReportSheet({ report, company }: { report: DailyReportDetail; company: string }) {
  const blocks: { title: string; body: string | null }[] = [
    { title: "Work done", body: report.workCompleted },
    { title: "Material received", body: report.materialsReceived },
    { title: "Material used", body: report.materialsUsed },
    { title: "Equipment used", body: report.equipmentUsed },
    { title: "Problems / delays", body: report.issues },
    { title: "Safety", body: report.safetyObservations },
    { title: "Notes", body: report.notes },
  ];
  return (
    <article className="mx-auto w-full max-w-[210mm] rounded-xl border bg-white p-5 text-[14px] leading-relaxed text-stone-900 shadow-xs sm:p-8 print:rounded-none print:border-0 print:p-0 print:shadow-none">
      <header className="flex flex-col gap-2 border-b-2 border-stone-800 pb-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs font-semibold tracking-wide text-stone-500 uppercase">{company} · Daily site report</div>
          <div className="text-xl font-bold">{report.project.name}</div>
          <div className="text-stone-600">
            {report.site.name !== report.project.name && `${report.site.name} · `}
            {[report.project.address, report.project.city].filter(Boolean).join(", ")}
          </div>
        </div>
        <div className="sm:text-right">
          <div className="font-semibold">{formatDateLong(report.date)}</div>
          <div className="text-stone-600">
            {WEATHER[report.weather]}
            {report.weatherNote && ` — ${report.weatherNote}`}
          </div>
        </div>
      </header>
      <dl className="grid grid-cols-2 gap-3 py-4 sm:grid-cols-3">
        <div>
          <dt className="text-xs text-stone-500 uppercase">Workers present</dt>
          <dd className="tabular text-2xl font-semibold">{report.labourPresent}</dd>
        </div>
        <div>
          <dt className="text-xs text-stone-500 uppercase">Engineers present</dt>
          <dd className="tabular text-2xl font-semibold">{report.engineersPresent}</dd>
        </div>
        <div>
          <dt className="text-xs text-stone-500 uppercase">Client</dt>
          <dd className="font-medium">{report.project.client.name}</dd>
        </div>
      </dl>
      {blocks
        .filter((b) => b.body && b.body.trim())
        .map((b) => (
          <section key={b.title} className="border-t py-3">
            <h3 className="text-xs font-semibold tracking-wide text-stone-500 uppercase">{b.title}</h3>
            <p className="whitespace-pre-line">{b.body}</p>
          </section>
        ))}
      <footer className="mt-4 border-t pt-2 text-xs text-stone-500">
        Submitted by {report.submittedBy.name} · last saved {formatDateTime(report.updatedAt)}
      </footer>
    </article>
  );
}

/** Plain-text version for sharing on WhatsApp. */
export function reportText(report: DailyReportDetail, company: string): string {
  const lines = [
    `*${company} — Daily report*`,
    `${report.project.name}${report.site.name !== report.project.name ? ` (${report.site.name})` : ""} · ${formatDateLong(report.date)}`,
    `Weather: ${WEATHER[report.weather]}${report.weatherNote ? ` — ${report.weatherNote}` : ""}`,
    `Workers: ${report.labourPresent} · Engineers: ${report.engineersPresent}`,
    "",
    `*Work done*\n${report.workCompleted}`,
  ];
  if (report.materialsReceived) lines.push("", `*Material received*\n${report.materialsReceived}`);
  if (report.materialsUsed) lines.push("", `*Material used*\n${report.materialsUsed}`);
  if (report.issues) lines.push("", `*Problems*\n${report.issues}`);
  return lines.join("\n");
}
