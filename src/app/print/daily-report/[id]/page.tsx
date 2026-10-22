import { Suspense } from "react";
import type { Metadata } from "next";
import { NotFoundPanel } from "@/components/app/no-access";
import { PrintToolbar } from "@/components/print/print-toolbar";
import { ReportSheet } from "@/features/daily-reports/report-sheet";
import { formatDate } from "@/lib/dates";
import { requireUser } from "@/server/auth/current-user";
import { getDailyReport } from "@/server/services/daily-reports";
import { companyName } from "@/server/services/users";

export const metadata: Metadata = { title: "Print daily report" };

export default function PrintDailyReportPage(props: PageProps<"/print/daily-report/[id]">) {
  return (
    <Suspense>
      <PrintDailyReport params={props.params} />
    </Suspense>
  );
}

async function PrintDailyReport({ params }: { params: PageProps<"/print/daily-report/[id]">["params"] }) {
  const user = await requireUser();
  const { id } = await params;
  const [report, company] = await Promise.all([getDailyReport(user, id), companyName()]);
  if (!report) return <NotFoundPanel what="report" backHref="/daily-reports" backLabel="Back to daily reports" />;
  return (
    <>
      <PrintToolbar title={`Daily report ${formatDate(report.date)} — ${report.project.name}`} />
      <main className="print-sheet mx-auto max-w-[220mm] p-4 sm:p-8">
        <ReportSheet report={report} company={company} />
      </main>
    </>
  );
}
