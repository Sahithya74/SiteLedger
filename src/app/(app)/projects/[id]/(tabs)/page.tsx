import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CalendarClock, CheckCircle2, ListChecks } from "lucide-react";
import { ContactLinks } from "@/components/app/contact-links";
import { Money } from "@/components/app/money";
import { Section } from "@/components/app/page-header";
import { TableSkeleton } from "@/components/app/skeletons";
import { StatTile } from "@/components/app/stat-tile";
import { CostBars } from "@/features/dashboard/cost-bars";
import { ManagersDialog } from "@/features/projects/managers-dialog";
import { describeDue, diffDays, formatDate, formatDateTime, todayIST } from "@/lib/dates";
import { PROJECT_TYPE } from "@/lib/labels";
import { formatINRShort } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";
import { projectActivity } from "@/server/services/audit-log";
import { loadProjectMoney, loadWorkStats } from "@/server/services/project-money";
import { getProject } from "@/server/services/projects";
import { managerOptions } from "@/server/services/users";

export const metadata: Metadata = { title: "Project" };

export default function ProjectOverviewPage(props: PageProps<"/projects/[id]">) {
  return (
    <Suspense fallback={<TableSkeleton rows={8} />}>
      <Overview params={props.params} />
    </Suspense>
  );
}

async function Overview({ params }: { params: PageProps<"/projects/[id]">["params"] }) {
  const { id } = await params;
  const user = await requireUser();
  const project = await getProject(user, id);
  if (!project) return null; // the layout already shows "not found"

  const showMoney = can(user, "projects.viewMoney");
  const today = todayIST();
  const [moneyMap, workMap, activity, managers] = await Promise.all([
    showMoney ? loadProjectMoney([id]) : Promise.resolve(null),
    loadWorkStats([id], today),
    projectActivity(id),
    user.role === "ADMIN" ? managerOptions() : Promise.resolve([]),
  ]);
  const money = moneyMap?.get(id);
  const work = workMap.get(id)!;
  const daysLeft = project.expectedEndDate ? diffDays(project.expectedEndDate, today) : null;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
        {money && (
          <Section title="Money" description="Calculated from payments, purchases, wages and expenses recorded for this project.">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatTile label="Project value" value={formatINRShort(money.money.projectValuePaise)} sub={money.input.approvedVariationsPaise ? "incl. extra work" : "contract amount"} />
              <StatTile label="Received" value={formatINRShort(money.money.receivedPaise)} tone="good" sub={money.money.projectValuePaise > 0n ? `${Math.round((Number(money.money.receivedPaise) / Number(money.money.projectValuePaise)) * 100)}% of value` : undefined} />
              <StatTile label="Pending" value={formatINRShort(money.money.pendingFromClientPaise)} sub="still to receive" tone={money.money.pendingFromClientPaise > 0n ? "warn" : "good"} />
              <StatTile label="Spent" value={formatINRShort(money.money.spentPaise)} sub={money.money.budgetUsed !== null ? `${Math.round(money.money.budgetUsed * 100)}% of estimated cost` : "no estimate yet"} tone={money.money.budgetUsed !== null && money.money.budgetUsed > 1 ? "bad" : "default"} />
            </div>
            <dl className="mt-4 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
              <Row label="Quoted amount" value={<Money paise={money.input.quotedPaise} wholeRupees />} />
              <Row label="Contract amount" value={<Money paise={money.input.contractPaise} wholeRupees />} />
              <Row label="Billed to client" value={<Money paise={money.input.billedPaise} wholeRupees />} />
              <Row label="Billed, not yet received" value={<Money paise={money.money.billedNotReceivedPaise} wholeRupees />} />
              <Row
                label="Estimated profit"
                hint="Project value minus estimated total cost (or actual cost if higher)."
                value={<Money paise={money.money.estimatedProfitPaise} wholeRupees colorNegative className="font-semibold" />}
              />
              <Row
                label="Cash position"
                hint="Received minus spent. Negative means you have paid more than the client has paid you so far."
                value={<Money paise={money.money.cashPositionPaise} wholeRupees colorNegative />}
              />
            </dl>
            <div className="mt-5 border-t pt-4">
              <h3 className="mb-3 text-sm font-medium">Costs so far</h3>
              <CostBars
                items={[
                  { label: "Materials", paise: money.costs.materials },
                  { label: "Labour wages", paise: money.costs.labour },
                  { label: "Labour contractors", paise: money.costs.contractors },
                  { label: "Engineers", paise: money.costs.engineers },
                  { label: "Transport", paise: money.costs.transport },
                  { label: "Food & welfare", paise: money.costs.foodWelfare },
                  { label: "Equipment", paise: money.costs.equipment },
                  { label: "Other", paise: money.costs.other },
                ]}
              />
            </div>
          </Section>
        )}

        <Section
          title="Schedule"
          actions={
            <Link href={`/projects/${id}/work`} className="text-sm font-medium text-brand hover:underline">
              Open work list →
            </Link>
          }
        >
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile label="Work done" icon={CheckCircle2} value={`${work.progress}%`} sub={work.health.planned !== null ? `planned ${work.health.planned}% by today` : "no planned dates yet"} tone={work.health.state === "behind" ? "bad" : work.health.state === "slightly_behind" ? "warn" : "default"} />
            <StatTile label="Items finished" icon={ListChecks} value={`${work.completedItems}/${work.totalItems}`} />
            <StatTile label="Overdue items" icon={AlertTriangle} value={work.overdueItems} tone={work.overdueItems ? "bad" : "good"} href={`/projects/${id}/work`} />
            <StatTile
              label="Completion"
              icon={CalendarClock}
              value={project.status === "COMPLETED" ? "Done" : daysLeft === null ? "—" : daysLeft >= 0 ? `${daysLeft} days` : `${-daysLeft} late`}
              sub={project.status === "COMPLETED" ? formatDate(project.actualEndDate) : project.expectedEndDate ? describeDue(project.expectedEndDate, today) : "set an expected date"}
              tone={daysLeft !== null && daysLeft < 0 && project.status !== "COMPLETED" ? "bad" : "default"}
            />
          </div>
        </Section>

        <Section title="Recent activity" description="Latest changes made by you and your team.">
          {activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {activity.map((a) => (
                <li key={a.id} className="flex gap-3 text-sm">
                  <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-stone-300" />
                  <div className="min-w-0">
                    <p>
                      <span className="font-medium">{a.userName}</span> {a.summary}
                    </p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(a.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Section>
      </div>

      <div className="flex min-w-0 flex-col gap-6">
        <Section title="Client">
          <dl className="flex flex-col gap-2 text-sm">
            <Row label="Name" value={<Link href={`/clients/${project.client.id}`} className="font-medium hover:underline">{project.client.name}</Link>} />
            <Row label="Phone" value={<ContactLinks phone={project.client.phone} />} />
            {project.client.email && <Row label="Email" value={<a href={`mailto:${project.client.email}`} className="hover:underline">{project.client.email}</a>} />}
          </dl>
        </Section>

        <Section title="Details">
          <dl className="flex flex-col gap-2 text-sm">
            <Row label="Type" value={PROJECT_TYPE[project.type]} />
            <Row label="Start" value={formatDate(project.startDate)} />
            <Row label="Expected completion" value={formatDate(project.expectedEndDate)} />
            {project.actualEndDate && <Row label="Completed on" value={formatDate(project.actualEndDate)} />}
            <Row label="Address" value={project.address ? <span className="text-right whitespace-pre-line">{project.address}</span> : "—"} />
            {project.pincode && <Row label="PIN code" value={project.pincode} />}
          </dl>
          {project.description && <p className="mt-3 border-t pt-3 text-sm whitespace-pre-line text-muted-foreground">{project.description}</p>}
        </Section>

        <Section title="Engineers on this project">
          {project.engineerProjects.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No engineers assigned. Assign them from the <Link href="/engineers" className="underline">Engineers</Link> page.
            </p>
          ) : (
            <ul className="flex flex-col gap-3 text-sm">
              {project.engineerProjects.map(({ engineer }) => (
                <li key={engineer.id} className="flex flex-col">
                  <Link href={`/engineers/${engineer.id}`} className="font-medium hover:underline">
                    {engineer.name}
                  </Link>
                  <span className="text-xs text-muted-foreground">{engineer.role ?? "Engineer"}</span>
                  <ContactLinks phone={engineer.phone} />
                </li>
              ))}
            </ul>
          )}
        </Section>

        {user.role === "ADMIN" && (
          <Section
            title="Managers"
            actions={
              <ManagersDialog
                projectId={id}
                managers={managers}
                assignedIds={project.assignments.map((a) => a.user.id)}
              />
            }
          >
            {project.assignments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No manager assigned. Only you can see this project.</p>
            ) : (
              <ul className="text-sm">
                {project.assignments.map((a) => (
                  <li key={a.user.id}>{a.user.name}</li>
                ))}
              </ul>
            )}
          </Section>
        )}

        {project.sites.length > 1 && (
          <Section title="Sites">
            <ul className="flex flex-col gap-1 text-sm">
              {project.sites.map((s) => (
                <li key={s.id}>
                  {s.name}
                  {s.isDefault && <span className="text-muted-foreground"> (main)</span>}
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-start justify-between gap-4" title={hint}>
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right">{value}</dd>
    </div>
  );
}
