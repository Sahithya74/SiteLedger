import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertOctagon,
  Building2,
  CalendarClock,
  HardHat,
  IndianRupee,
  Package,
  Plus,
  Receipt,
  Users,
  Wallet,
} from "lucide-react";
import { ProjectStatusBadge, ToneBadge } from "@/components/app/badges";
import { EmptyState } from "@/components/app/empty-state";
import { Money } from "@/components/app/money";
import { PageHeader, Section } from "@/components/app/page-header";
import { healthTone, ProgressBar } from "@/components/app/progress-bar";
import { PageSkeleton } from "@/components/app/skeletons";
import { StatTile } from "@/components/app/stat-tile";
import { Button } from "@/components/ui/button";
import { AttentionList } from "@/features/dashboard/attention-list";
import { CashflowChart } from "@/features/dashboard/cashflow-chart";
import { CostBars } from "@/features/dashboard/cost-bars";
import type { ProjectStatus } from "@/generated/prisma/enums";
import { formatDateLong } from "@/lib/dates";
import { PROJECT_STATUS, TONE_CLASSES } from "@/lib/labels";
import { formatINRShort } from "@/lib/money";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/auth/current-user";
import { getDashboard } from "@/server/services/dashboard";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <Suspense fallback={<PageSkeleton tiles={7} rows={8} />}>
      <Dashboard />
    </Suspense>
  );
}

function greeting(): string {
  const hour = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date()));
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

const STATUS_LINK: Record<ProjectStatus, string> = {
  ACTIVE: "/projects?tab=active",
  DELAYED: "/projects?tab=active",
  PLANNING: "/projects?tab=pending",
  ON_HOLD: "/projects?tab=pending",
  COMPLETED: "/projects?tab=completed",
  CANCELLED: "/projects",
};

async function Dashboard() {
  const user = await requireUser();
  const data = await getDashboard(user);
  const { finance, site, counts } = data;
  const firstName = user.name.split(" ")[0];

  return (
    <div className="page-enter flex flex-col gap-6">
      <PageHeader
        title={`${greeting()}, ${firstName}`}
        description={`Here is your business today — ${formatDateLong(data.today)}`}
        actions={
          can(user, "projects.create") ? (
            <Button asChild size="lg">
              <Link href="/projects/new">
                <Plus className="size-4" /> New project
              </Link>
            </Button>
          ) : undefined
        }
        className="mb-0"
      />

      {/* ── Headline numbers (spec §42) ───────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        <StatTile
          label="Active projects"
          icon={Building2}
          value={finance ? formatINRShort(finance.activeValuePaise) : counts.active}
          sub={finance ? `${counts.active} running · ${counts.delayed} delayed` : `${counts.delayed} delayed`}
          tone={counts.delayed > 0 ? "warn" : "default"}
          href="/projects?tab=active"
          title={finance ? "Total value of projects currently running" : undefined}
        />
        {finance && (
          <>
            <StatTile label="Received" icon={IndianRupee} value={formatINRShort(finance.receivedPaise)} sub="from clients so far" tone="good" />
            <StatTile label="Pending" icon={Wallet} value={formatINRShort(finance.pendingPaise)} sub="still to come from clients" />
            <StatTile label="Expenses" icon={Receipt} value={formatINRShort(finance.spentPaise)} sub="all costs so far" />
          </>
        )}
        <StatTile label="Labour present" icon={Users} value={site.labourPresent} sub={`${site.engineersPresent} engineer${site.engineersPresent === 1 ? "" : "s"} on site`} />
        <StatTile
          label="Open issues"
          icon={AlertOctagon}
          value={site.openIssues}
          sub={site.issuesToday ? `${site.issuesToday} reported today` : "reported on site"}
          tone={site.openIssues > 0 ? "warn" : "default"}
        />
        <StatTile
          label="Overdue work"
          icon={CalendarClock}
          value={site.overdueWork}
          sub="past the planned date"
          tone={site.overdueWork > 0 ? "bad" : "good"}
          href="/work/pending"
        />
      </div>

      {/* ── Attention + status ────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Section
          title="Things that need your attention"
          description="Most urgent first. Click an item to open it."
          className="lg:col-span-2"
        >
          <AttentionList items={data.attention} />
        </Section>

        <div className="flex min-w-0 flex-col gap-6">
          <Section title="Projects by status">
            <ul className="flex flex-col gap-1">
              {(Object.keys(PROJECT_STATUS) as ProjectStatus[]).map((status) => (
                <li key={status}>
                  <Link
                    href={STATUS_LINK[status]}
                    className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted"
                  >
                    <span className="inline-flex items-center gap-2">
                      <span className={cn("size-2 rounded-full", TONE_CLASSES[PROJECT_STATUS[status].tone].dot)} />
                      {PROJECT_STATUS[status].label}
                    </span>
                    <span className="tabular font-semibold">{data.statusCounts[status]}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
              {counts.completed} completed · {counts.pending} pending (planning or on hold)
            </p>
          </Section>

          <Section title="Today on site">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Sites with people</dt>
                <dd className="text-lg font-semibold">{site.activeSitesWithPeople}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Labour present</dt>
                <dd className="text-lg font-semibold">{site.labourPresent}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Material deliveries</dt>
                <dd className="text-lg font-semibold">{site.materialsReceived.length}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Issues reported</dt>
                <dd className="text-lg font-semibold">{site.issuesToday}</dd>
              </div>
            </dl>
            {site.materialsReceived.length > 0 && (
              <ul className="mt-3 flex flex-col gap-1 border-t pt-3 text-sm">
                {site.materialsReceived.slice(0, 4).map((m) => (
                  <li key={m.id} className="flex items-center gap-2">
                    <Package className="size-3.5 text-muted-foreground" />
                    <span className="truncate">
                      {m.quantity} {m.material} <span className="text-muted-foreground">· {m.project}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>

      {/* ── Active sites ──────────────────────────────────────────── */}
      <Section title="Work happening now" description="Active projects, today's people on site and the work in progress.">
        {site.activeSites.length === 0 ? (
          <EmptyState
            icon={HardHat}
            title="No active projects"
            description="When a project's status is set to Active it appears here with today's progress."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {site.activeSites.map((p) => (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="flex flex-col gap-3 rounded-lg border p-4 transition-colors hover:border-stone-300 hover:bg-stone-50/60"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{p.name}</p>
                    {p.city && <p className="text-xs text-muted-foreground">{p.city}</p>}
                  </div>
                  <ProjectStatusBadge status={p.status} />
                </div>
                <ProgressBar value={p.progress} tone={healthTone(p.health)} size="md" />
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Users className="size-3.5" /> {p.labourPresent} labour today
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <HardHat className="size-3.5" /> {p.engineersPresent} engineer{p.engineersPresent === 1 ? "" : "s"}
                  </span>
                </div>
                {p.workToday.length > 0 ? (
                  <ul className="flex flex-col gap-1 border-t pt-2 text-sm">
                    {p.workToday.map((w) => (
                      <li key={w.id} className="flex items-center justify-between gap-2">
                        <span className="truncate">{w.name}</span>
                        <span className="tabular shrink-0 text-xs text-muted-foreground">{w.percent}%</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="border-t pt-2 text-xs text-muted-foreground">No work marked “in progress”.</p>
                )}
              </Link>
            ))}
          </div>
        )}
      </Section>

      {/* ── Money ─────────────────────────────────────────────────── */}
      {finance && (
        <div className="grid gap-6 lg:grid-cols-5">
          <Section title="Financial summary" description="Across all projects you can see." className="lg:col-span-2">
            <dl className="flex flex-col divide-y text-sm">
              {[
                { label: "Total quoted", value: finance.totalQuotedPaise },
                { label: "Total project value", value: finance.totalValuePaise, hint: "Contract amounts plus approved extra work" },
                { label: "Received from clients", value: finance.receivedPaise },
                { label: "Pending from clients", value: finance.pendingPaise },
                { label: "Spent so far", value: finance.spentPaise },
                { label: "We owe (suppliers, contractors, wages)", value: finance.payablesPaise },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-4 py-2" title={row.hint}>
                  <dt className="text-muted-foreground">{row.label}</dt>
                  <dd className="font-medium">
                    <Money paise={row.value} wholeRupees />
                  </dd>
                </div>
              ))}
              <div className="flex items-center justify-between gap-4 py-2.5">
                <dt className="font-medium">Net position</dt>
                <dd className="flex items-center gap-2">
                  <ToneBadge tone={finance.netPositionPaise >= 0n ? "green" : "red"} dot={false}>
                    {finance.netPositionPaise >= 0n ? "Received more than spent" : "Spent more than received"}
                  </ToneBadge>
                  <Money paise={finance.netPositionPaise} wholeRupees colorNegative className="font-semibold" />
                </dd>
              </div>
            </dl>
          </Section>

          <Section title="Where the money went" description="Costs so far, by type." className="lg:col-span-3">
            <CostBars
              items={[
                { label: "Materials", paise: finance.materialsPaise },
                { label: "Labour wages", paise: finance.labourPaise },
                { label: "Labour contractors", paise: finance.contractorsPaise },
                { label: "Engineers", paise: finance.engineersPaise },
                { label: "Transport, food, equipment & other", paise: finance.otherPaise },
                { label: "Office & company (not project)", paise: finance.officeExpensesPaise },
              ]}
            />
          </Section>

          {data.cashflow && (
            <Section title="Money in and out" className="lg:col-span-5">
              <CashflowChart
                data={data.cashflow.map((m) => ({ month: m.month, inPaise: m.inPaise.toString(), outPaise: m.outPaise.toString() }))}
              />
            </Section>
          )}
        </div>
      )}
    </div>
  );
}
