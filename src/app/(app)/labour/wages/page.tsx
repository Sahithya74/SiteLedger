import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Wallet } from "lucide-react";
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
import { LabourTabs } from "@/features/labour/nav";
import { WagePayForm } from "@/features/labour/wage-pay-form";
import { addDays, endOfMonth, formatDate, formatDateLong, fromDbDate, isISODate, startOfMonth, todayIST, wageWeek } from "@/lib/dates";
import { LABOUR_CATEGORY } from "@/lib/labels";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/auth/current-user";
import { recentSettlements, wageSheet } from "@/server/services/labour";
import { accountOptions } from "@/server/services/ledger";
import { projectOptions } from "@/server/services/projects";

export const metadata: Metadata = { title: "Wages" };

export default function WagesPage(props: PageProps<"/labour/wages">) {
  return (
    <Suspense fallback={<PageSkeleton tiles={0} rows={10} />}>
      <Wages searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Wages({ searchParams }: { searchParams: PageProps<"/labour/wages">["searchParams"] }) {
  const user = await requireUser();
  if (!can(user, "wages.view")) return <NoAccess message="Wages are visible only with the 'See wages' permission." />;
  const sp = await searchParams;
  const today = todayIST();
  const thisWeek = wageWeek(today);
  const lastWeek = wageWeek(addDays(thisWeek.start, -1));
  const from = param(sp, "from") && isISODate(param(sp, "from")) ? param(sp, "from")! : thisWeek.start;
  const to = param(sp, "to") && isISODate(param(sp, "to")) ? param(sp, "to")! : thisWeek.end;
  const projectId = param(sp, "project");
  const [lines, accounts, projects, settlements] = await Promise.all([
    wageSheet(user, { from, to, projectId }),
    can(user, "payments.record") ? accountOptions(user) : Promise.resolve([]),
    projectOptions(user),
    recentSettlements(user),
  ]);
  const presets = [
    { label: "This week", from: thisWeek.start, to: thisWeek.end },
    { label: "Last week", from: lastWeek.start, to: lastWeek.end },
    { label: "This month", from: startOfMonth(today), to: endOfMonth(today) },
  ];
  const qs = (f: string, t: string) => `/labour/wages?from=${f}&to=${t}${projectId ? `&project=${projectId}` : ""}`;

  return (
    <div className="page-enter">
      <PageHeader title="Wages" description="Weekly wage sheet — what each worker earned, what is still pending, and paying everyone in one go." />
      <LabourTabs />

      <form action="/labour/wages" className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3">
        <div className="flex flex-wrap gap-1">
          {presets.map((p) => (
            <Button key={p.label} asChild variant={p.from === from && p.to === to ? "default" : "outline"} size="sm">
              <Link href={qs(p.from, p.to)}>{p.label}</Link>
            </Button>
          ))}
        </div>
        <label className="flex w-36 flex-col gap-1 text-sm">
          <span className="text-muted-foreground">From</span>
          <Input type="date" name="from" defaultValue={from} className="h-10" />
        </label>
        <label className="flex w-36 flex-col gap-1 text-sm">
          <span className="text-muted-foreground">To</span>
          <Input type="date" name="to" defaultValue={to} className="h-10" />
        </label>
        <label className="flex min-w-48 flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Site</span>
          <NativeSelect name="project" defaultValue={projectId ?? ""}>
            <option value="">All sites</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
        </label>
        <Button type="submit" variant="secondary" size="lg">Show</Button>
      </form>

      <Section title={`Wage sheet · ${formatDateLong(from)} – ${formatDateLong(to)}`}>
        {lines.length === 0 ? (
          <EmptyState icon={Wallet} title="Nobody worked in this period" description="Wages appear here once attendance is marked." className="py-8" />
        ) : can(user, "payments.record") ? (
          <WagePayForm
            key={`${from}-${to}-${projectId ?? ""}`}
            from={from}
            to={to}
            projectId={projectId}
            accounts={accounts}
            lines={lines.map((l) => ({
              id: l.id,
              name: l.name,
              category: LABOUR_CATEGORY[l.category],
              days: l.days,
              overtime: l.overtime,
              gross: l.grossPaise.toString(),
              pending: l.pendingWagesPaise.toString(),
              advance: l.advanceOutstandingPaise.toString(),
            }))}
          />
        ) : (
          <SimpleTable
            rows={lines}
            rowKey={(l) => l.id}
            columns={[
              { header: "Worker", cell: (l) => l.name },
              { header: "Days", align: "right", cell: (l) => l.days },
              { header: "Earned", align: "right", cell: (l) => <Money paise={l.grossPaise} wholeRupees /> },
              { header: "Pending", align: "right", cell: (l) => <Money paise={l.pendingWagesPaise} wholeRupees /> },
            ]}
          />
        )}
      </Section>

      <Section title="Recent wage settlements" className="mt-6">
        {settlements.length === 0 ? (
          <p className="text-sm text-muted-foreground">No wages settled yet.</p>
        ) : (
          <SimpleTable
            rows={settlements}
            rowKey={(s) => s.id}
            columns={[
              { header: "Settlement", cell: (s) => <span className="font-medium">{s.number}</span> },
              { header: "Period", cell: (s) => `${formatDate(fromDbDate(s.periodFrom))} – ${formatDate(fromDbDate(s.periodTo))}` },
              { header: "Site", hide: "md", cell: (s) => s.project?.name ?? "All sites" },
              { header: "Workers", align: "right", hide: "sm", cell: (s) => s._count.lines },
              { header: "Paid", align: "right", cell: (s) => <Money paise={s.totalNetPaise} wholeRupees /> },
              { header: "By", hide: "lg", cell: (s) => <span className={cn("text-muted-foreground")}>{s.createdBy.name}</span> },
            ]}
          />
        )}
      </Section>
    </div>
  );
}
