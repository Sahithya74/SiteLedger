import { Suspense } from "react";
import type { Metadata } from "next";
import { NotFoundPanel } from "@/components/app/no-access";
import { PrintToolbar } from "@/components/print/print-toolbar";
import { ReportTable } from "@/features/reports/report-table";
import { formatDateTime } from "@/lib/dates";
import { requireUser } from "@/server/auth/current-user";
import { reportParams } from "@/server/reports/format";
import { findReport } from "@/server/reports/registry";
import { db } from "@/server/db";
import { companyName } from "@/server/services/users";

export const metadata: Metadata = { title: "Print report" };

export default function PrintReportPage(props: PageProps<"/print/report/[key]">) {
  return (
    <Suspense>
      <PrintReport params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

async function PrintReport({ params, searchParams }: { params: PageProps<"/print/report/[key]">["params"]; searchParams: PageProps<"/print/report/[key]">["searchParams"] }) {
  const user = await requireUser();
  const [{ key }, sp] = await Promise.all([params, searchParams]);
  const def = findReport(user, key);
  if (!def) return <NotFoundPanel what="report" backHref="/reports" backLabel="All reports" />;
  const { params: p, period } = reportParams(def, sp);
  const [result, company, project] = await Promise.all([
    def.run(user, p),
    companyName(),
    p.projectId ? db.project.findUnique({ where: { id: p.projectId }, select: { name: true } }) : Promise.resolve(null),
  ]);
  return (
    <>
      <PrintToolbar title={def.title} />
      <main className="print-sheet mx-auto max-w-[297mm] p-4 sm:p-8">
        <div className="rounded-xl border bg-white p-5 print:rounded-none print:border-0 print:p-0">
          <header className="mb-4 border-b-2 border-stone-800 pb-2">
            <div className="text-xs font-semibold tracking-wide text-stone-500 uppercase">{company}</div>
            <h1 className="text-xl font-bold">{def.title}</h1>
            <p className="text-sm text-stone-600">
              {[period?.label, project?.name, `printed ${formatDateTime(new Date())}`].filter(Boolean).join(" · ")}
            </p>
          </header>
          <ReportTable result={result} linkRows={false} />
          {result.note && <p className="mt-3 text-xs text-stone-600">{result.note}</p>}
        </div>
      </main>
    </>
  );
}
