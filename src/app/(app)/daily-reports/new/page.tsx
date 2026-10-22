import { Suspense } from "react";
import type { Metadata } from "next";
import { NoAccess } from "@/components/app/no-access";
import { PageHeader } from "@/components/app/page-header";
import { FormSkeleton } from "@/components/app/skeletons";
import { DailyReportForm } from "@/features/daily-reports/report-form";
import { isISODate, todayIST, toDbDate } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";
import { db } from "@/server/db";
import { prefillDailyReport } from "@/server/services/daily-reports";
import { projectOptions, projectSites } from "@/server/services/projects";

export const metadata: Metadata = { title: "Daily report" };

export default function NewDailyReportPage(props: PageProps<"/daily-reports/new">) {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <NewDailyReport searchParams={props.searchParams} />
    </Suspense>
  );
}

async function NewDailyReport({ searchParams }: { searchParams: PageProps<"/daily-reports/new">["searchParams"] }) {
  const user = await requireUser();
  if (!can(user, "dailyReports.manage")) return <NoAccess />;
  const sp = await searchParams;
  const today = todayIST();
  const projects = await projectOptions(user);
  const projectId = typeof sp.project === "string" && projects.some((p) => p.id === sp.project) ? sp.project : (projects[0]?.id ?? "");
  const date = typeof sp.date === "string" && isISODate(sp.date) && sp.date <= today ? sp.date : today;
  if (!projectId) return <NoAccess message="You have no projects to report on." />;

  const sites = await projectSites(projectId);
  const siteId = sites[0]?.id ?? "";
  const [existing, prefill] = await Promise.all([
    db.dailyReport.findFirst({ where: { projectId, date: toDbDate(date) }, orderBy: { createdAt: "asc" } }),
    prefillDailyReport(user, projectId, date),
  ]);

  const values = existing
    ? {
        projectId,
        siteId: existing.siteId,
        date,
        weather: existing.weather,
        weatherNote: existing.weatherNote ?? "",
        labourPresent: String(existing.labourPresent),
        engineersPresent: String(existing.engineersPresent),
        workCompleted: existing.workCompleted,
        materialsReceived: existing.materialsReceived ?? "",
        materialsUsed: existing.materialsUsed ?? "",
        equipmentUsed: existing.equipmentUsed ?? "",
        issues: existing.issues ?? "",
        safetyObservations: existing.safetyObservations ?? "",
        notes: existing.notes ?? "",
      }
    : {
        projectId,
        siteId,
        date,
        weather: "SUNNY",
        weatherNote: "",
        labourPresent: String(prefill.labourPresent),
        engineersPresent: String(prefill.engineersPresent),
        workCompleted: prefill.workCompleted,
        materialsReceived: prefill.materialsReceived,
        materialsUsed: prefill.materialsUsed,
        equipmentUsed: prefill.equipmentUsed,
        issues: "",
        safetyObservations: "",
        notes: "",
      };

  return (
    <div className="page-enter">
      <PageHeader title="Daily site report" description="One report per site per day. Most of it is filled from what was already recorded." back={{ href: "/daily-reports", label: "Daily reports" }} />
      <DailyReportForm
        key={`${projectId}-${date}`}
        projects={projects.map((p) => ({ value: p.id, label: p.name }))}
        sites={sites.map((s) => ({ value: s.id, label: s.name }))}
        values={values}
        existing={Boolean(existing)}
        maxDate={today}
      />
    </div>
  );
}
