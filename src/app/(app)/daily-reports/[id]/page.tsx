import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { MessageCircle, Pencil, Printer } from "lucide-react";
import { NotFoundPanel } from "@/components/app/no-access";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/skeletons";
import { Button } from "@/components/ui/button";
import { Attachments } from "@/features/documents/attachments";
import { ReportSheet, reportText } from "@/features/daily-reports/report-sheet";
import { formatDate } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";
import { getDailyReport } from "@/server/services/daily-reports";
import { companyName } from "@/server/services/users";

export const metadata: Metadata = { title: "Daily report" };

export default function DailyReportPage(props: PageProps<"/daily-reports/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton tiles={0} />}>
      <DailyReport params={props.params} />
    </Suspense>
  );
}

async function DailyReport({ params }: { params: PageProps<"/daily-reports/[id]">["params"] }) {
  const user = await requireUser();
  const { id } = await params;
  const [report, company] = await Promise.all([getDailyReport(user, id), companyName()]);
  if (!report) return <NotFoundPanel what="report" backHref="/daily-reports" backLabel="Back to daily reports" />;
  // No phone number: WhatsApp opens and lets the person pick a chat or group.
  const share = `https://wa.me/?text=${encodeURIComponent(reportText(report, company))}`;

  return (
    <div className="page-enter flex flex-col gap-5">
      <PageHeader
        title={`Daily report — ${formatDate(report.date)}`}
        description={report.project.name}
        back={{ href: "/daily-reports", label: "Daily reports" }}
        className="mb-0"
        actions={
          <>
            <Button asChild size="lg">
              <a href={share} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="size-4" /> Share on WhatsApp
              </a>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href={`/print/daily-report/${report.id}`} target="_blank">
                <Printer className="size-4" /> Print / PDF
              </Link>
            </Button>
            {can(user, "dailyReports.manage") && (
              <Button asChild variant="ghost" size="lg">
                <Link href={`/daily-reports/new?project=${report.projectId}&date=${report.date}`}>
                  <Pencil className="size-4" /> Edit
                </Link>
              </Button>
            )}
          </>
        }
      />
      <ReportSheet report={report} company={company} />
      <Attachments entityType="DAILY_REPORT" entityId={report.id} projectId={report.projectId} title="Site photos" />
    </div>
  );
}
