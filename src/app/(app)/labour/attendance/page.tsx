import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { param } from "@/components/app/filter-bar";
import { NativeSelect } from "@/components/app/form";
import { Money } from "@/components/app/money";
import { NoAccess } from "@/components/app/no-access";
import { PageHeader, Section } from "@/components/app/page-header";
import { SimpleTable } from "@/components/app/simple-table";
import { PageSkeleton } from "@/components/app/skeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AttendanceSheet } from "@/features/labour/attendance-sheet";
import { LabourTabs } from "@/features/labour/nav";
import { addDays, formatDateLong, isISODate, todayIST, wageWeek } from "@/lib/dates";
import { LABOUR_CATEGORY } from "@/lib/labels";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/auth/current-user";
import { attendanceSheet, attendanceSummary } from "@/server/services/labour";
import { projectOptions } from "@/server/services/projects";

export const metadata: Metadata = { title: "Attendance" };

export default function AttendancePage(props: PageProps<"/labour/attendance">) {
  return (
    <Suspense fallback={<PageSkeleton tiles={0} rows={12} />}>
      <Attendance searchParams={props.searchParams} />
    </Suspense>
  );
}

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MARK: Record<string, { text: string; className: string }> = {
  PRESENT: { text: "P", className: "bg-emerald-100 text-emerald-800" },
  HALF_DAY: { text: "½", className: "bg-amber-100 text-amber-800" },
  ABSENT: { text: "A", className: "bg-stone-100 text-stone-500" },
};

async function Attendance({ searchParams }: { searchParams: PageProps<"/labour/attendance">["searchParams"] }) {
  const user = await requireUser();
  const sp = await searchParams;
  const projects = await projectOptions(user);
  const today = todayIST();
  const date = param(sp, "date") && isISODate(param(sp, "date")) ? param(sp, "date")! : today;
  const projectId = param(sp, "project") && projects.some((p) => p.id === param(sp, "project")) ? param(sp, "project")! : projects[0]?.id;
  const canMark = can(user, "attendance.record");
  const showWages = can(user, "wages.view");

  if (!projectId) {
    return (
      <div className="page-enter">
        <PageHeader title="Attendance" />
        <LabourTabs />
        <EmptyState icon={CalendarDays} title="No projects to mark attendance for" description="Create a project first, or ask the owner to assign you one." />
      </div>
    );
  }
  const week = wageWeek(date);
  const [people, summary] = await Promise.all([attendanceSheet(user, projectId, date), attendanceSummary(user, { from: week.start, to: week.end, projectId })]);
  const days = Array.from({ length: 7 }, (_, i) => addDays(week.start, i));
  const link = (d: string) => `/labour/attendance?project=${projectId}&date=${d}`;

  return (
    <div className="page-enter">
      <PageHeader title="Attendance" description="Mark who came to site. Wages are worked out automatically from each person's daily rate." />
      <LabourTabs />

      <form action="/labour/attendance" className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3">
        <label className="flex min-w-56 flex-1 flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Site</span>
          <NativeSelect name="project" defaultValue={projectId}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="flex w-44 flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Date</span>
          <Input type="date" name="date" defaultValue={date} max={today} className="h-10" />
        </label>
        <Button type="submit" variant="secondary" size="lg">Open</Button>
        <div className="ml-auto flex items-center gap-1">
          <Button asChild variant="ghost" size="icon-lg" aria-label="Previous day">
            <Link href={link(addDays(date, -1))}><ChevronLeft className="size-4" /></Link>
          </Button>
          <span className="text-sm font-medium">{formatDateLong(date)}{date === today && " (today)"}</span>
          {date < today && (
            <Button asChild variant="ghost" size="icon-lg" aria-label="Next day">
              <Link href={link(addDays(date, 1))}><ChevronRight className="size-4" /></Link>
            </Button>
          )}
        </div>
      </form>

      {canMark ? (
        <AttendanceSheet
          key={`${projectId}-${date}`}
          projectId={projectId}
          date={date}
          showWages={showWages}
          people={people.map((p) => ({ ...p, dailyWage: p.dailyWagePaise.toString(), status: p.status ?? "" }))}
        />
      ) : (
        <NoAccess message="You can see attendance, but marking it needs the 'Mark attendance' permission." />
      )}

      <Section title="This week at this site" description={`${formatDateLong(week.start)} – ${formatDateLong(week.end)} (wage week ends Saturday)`} className="mt-6">
        {summary.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody marked this week yet.</p>
        ) : (
          <SimpleTable
            rows={summary}
            rowKey={(r) => r.id}
            columns={[
              { header: "Worker", cell: (r) => <div><Link href={`/labour/${r.id}`} className="font-medium hover:underline">{r.name}</Link><div className="text-xs text-muted-foreground">{LABOUR_CATEGORY[r.category]}</div></div> },
              ...days.map((d) => ({
                header: (
                  <Link href={link(d)} className={cn("block text-center", d === date && "text-brand")}>
                    {DAY[new Date(`${d}T00:00:00Z`).getUTCDay()]}
                    <br />
                    <span className="text-[10px]">{d.slice(8)}</span>
                  </Link>
                ),
                hide: "md" as const,
                cell: (r: (typeof summary)[number]) => {
                  const m = r.dates[d];
                  return m ? <span className={cn("mx-auto flex size-6 items-center justify-center rounded text-xs font-semibold", MARK[m].className)}>{MARK[m].text}</span> : <span className="block text-center text-muted-foreground">·</span>;
                },
              })),
              { header: "Days", align: "right", cell: (r) => r.days },
              { header: "OT", align: "right", hide: "sm", cell: (r) => (Number(r.overtime) ? `${r.overtime} h` : "—") },
              ...(showWages ? [{ header: "Wages", align: "right" as const, cell: (r: (typeof summary)[number]) => <Money paise={r.wagesPaise} wholeRupees /> }] : []),
            ]}
          />
        )}
      </Section>
    </div>
  );
}
