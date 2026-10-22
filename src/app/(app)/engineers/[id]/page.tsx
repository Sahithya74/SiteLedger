import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ListChecks, Pencil } from "lucide-react";
import { PriorityBadge, ProjectStatusBadge, ToneBadge, WorkStatusBadge } from "@/components/app/badges";
import { ContactLinks } from "@/components/app/contact-links";
import { EmptyState } from "@/components/app/empty-state";
import { Money } from "@/components/app/money";
import { NotFoundPanel } from "@/components/app/no-access";
import { PageHeader, Section } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/skeletons";
import { Button } from "@/components/ui/button";
import { EngineerStatusButton } from "@/features/engineers/engineer-status-button";
import { AddTaskDialog } from "@/features/engineers/task-widgets";
import { EngineerTasksList } from "@/features/engineers/tasks-list";
import { PayPersonDialog } from "@/features/money/pay-person-dialog";
import { Cell2, SimpleTable } from "@/components/app/simple-table";
import { StatTile } from "@/components/app/stat-tile";
import { PAYMENT_METHOD, PAYMENT_PURPOSE } from "@/lib/labels";
import { paiseToInput } from "@/lib/money";
import { accountOptions } from "@/server/services/ledger";
import { projectOptions } from "@/server/services/projects";
import { describeDue, formatDate, todayIST } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/auth/current-user";
import { engineerPay, getEngineer, listEngineerTasks } from "@/server/services/engineers";

export const metadata: Metadata = { title: "Engineer" };

export default function EngineerPage(props: PageProps<"/engineers/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton tiles={0} />}>
      <EngineerDetail params={props.params} />
    </Suspense>
  );
}

async function EngineerDetail({ params }: { params: PageProps<"/engineers/[id]">["params"] }) {
  const { id } = await params;
  const user = await requireUser();
  const engineer = await getEngineer(user, id);
  if (!engineer) return <NotFoundPanel what="engineer" backHref="/engineers" backLabel="Back to engineers" />;
  const today = todayIST();
  const open = engineer.workItems.filter((w) => w.status !== "COMPLETED");
  const done = engineer.workItems.filter((w) => w.status === "COMPLETED");
  const canManage = can(user, "engineers.manage");
  const showPay = can(user, "wages.view");
  const canPay = showPay && can(user, "payments.record");
  const [tasks, projects, pay, accounts] = await Promise.all([
    listEngineerTasks(user, { engineerId: id }),
    projectOptions(user),
    showPay ? engineerPay(id) : Promise.resolve(null),
    canPay ? accountOptions(user) : Promise.resolve([]),
  ]);
  const projectOpts = projects.map((p) => ({ value: p.id, label: p.name }));

  return (
    <div className="page-enter flex flex-col gap-6">
      <PageHeader
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            {engineer.name}
            {!engineer.isActive && <ToneBadge tone="grey">Former engineer</ToneBadge>}
          </span>
        }
        description={[engineer.code, engineer.role, engineer.qualification].filter(Boolean).join(" · ")}
        back={{ href: "/engineers", label: "Engineers" }}
        className="mb-0"
        actions={
          <>
            {canPay && pay && (
              <PayPersonDialog
                payeeType="ENGINEER"
                personId={id}
                personName={engineer.name}
                purposes={pay.payFrequency === "DAILY" ? ["WAGES", "ADVANCE"] : ["SALARY", "ADVANCE", "OTHER"]}
                accounts={accounts}
                projects={projectOpts}
                defaultProjectId={engineer.projects[0]?.project.id}
                defaultAmount={pay.payFrequency === "DAILY" ? (pay.wagesDuePaise > 0n ? paiseToInput(pay.wagesDuePaise) : undefined) : engineer.salaryPaise ? paiseToInput(engineer.salaryPaise) : undefined}
                label={pay.payFrequency === "DAILY" ? "Pay wages" : "Pay salary"}
              />
            )}
            {canManage && <AddTaskDialog engineers={[{ value: id, label: engineer.name }]} projects={projectOpts} defaultEngineerId={id} defaultProjectId={engineer.projects[0]?.project.id} />}
          {canManage && (
            <>
              <Button asChild variant="outline" size="lg">
                <Link href={`/engineers/${id}/edit`}>
                  <Pencil className="size-4" /> Edit
                </Link>
              </Button>
              <EngineerStatusButton engineerId={id} name={engineer.name} active={engineer.isActive} />
            </>
          )}
          </>
        }
      />

      {pay && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {pay.payFrequency === "DAILY" ? (
            <>
              <StatTile label="Earned (attendance)" value={<Money paise={pay.earnedPaise} wholeRupees />} />
              <StatTile label="Paid" value={<Money paise={pay.wagesPaidPaise} wholeRupees />} tone="good" />
              <StatTile label="Wages due" value={<Money paise={pay.wagesDuePaise} wholeRupees />} tone={pay.wagesDuePaise > 0n ? "warn" : "good"} />
            </>
          ) : (
            <>
              <StatTile label={`Salary FY ${pay.fyLabel}`} value={<Money paise={pay.expectedSalaryPaise} wholeRupees />} sub={`${pay.months} completed month${pay.months === 1 ? "" : "s"}`} />
              <StatTile label="Salary paid" value={<Money paise={pay.salaryPaidPaise} wholeRupees />} tone="good" />
              <StatTile label="Salary due (estimate)" value={<Money paise={pay.salaryDuePaise} wholeRupees />} tone={pay.salaryDuePaise > 0n ? "warn" : "good"} />
            </>
          )}
          <StatTile label="Open tasks" value={tasks.filter((t) => t.status !== "COMPLETED").length} sub={`${tasks.filter((t) => t.overdue).length} overdue`} tone={tasks.some((t) => t.overdue) ? "bad" : "default"} />
        </div>
      )}

      <Section title="Tasks, inspections & site visits">
        <EngineerTasksList tasks={tasks} canManage={canManage} show="project" />
      </Section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Section title="Assigned work" description="Work items this engineer is in charge of." className="lg:col-span-2">
          {open.length === 0 ? (
            <EmptyState icon={ListChecks} title="No open work" description="Assign work from a project's Work tab." className="py-6" />
          ) : (
            <ul className="flex flex-col divide-y">
              {open.map((w) => {
                const late = w.expectedEndDate !== null && w.expectedEndDate < today;
                return (
                  <li key={w.id} className={cn("flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between", late && "rounded-md bg-red-50/70 px-2")}>
                    <div className="min-w-0">
                      <Link href={`/projects/${w.project.id}/work#item-${w.id}`} className="font-medium hover:underline">
                        {w.name}
                      </Link>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>
                          {w.project.name}
                          {w.parent && ` · ${w.parent.name}`}
                        </span>
                        <WorkStatusBadge status={w.status} />
                        {(w.priority === "HIGH" || w.priority === "CRITICAL") && <PriorityBadge priority={w.priority} />}
                      </div>
                    </div>
                    <div className={cn("text-sm sm:text-right", late ? "font-semibold text-red-700" : "text-muted-foreground")}>
                      {w.expectedEndDate ? (
                        <>
                          {formatDate(w.expectedEndDate)}
                          <div className="text-xs">{describeDue(w.expectedEndDate, today)}</div>
                        </>
                      ) : (
                        "No due date"
                      )}
                      <div className="text-xs font-normal text-muted-foreground">{w.percentComplete}% done</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {done.length > 0 && <p className="mt-3 border-t pt-3 text-sm text-muted-foreground">{done.length} work item{done.length === 1 ? "" : "s"} completed.</p>}
        </Section>

        <div className="flex min-w-0 flex-col gap-6">
          <Section title="Contact">
            <dl className="flex flex-col gap-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Phone</dt>
                <dd><ContactLinks phone={engineer.phone} /></dd>
              </div>
              {engineer.altPhone && (
                <div>
                  <dt className="text-muted-foreground">Other phone</dt>
                  <dd><ContactLinks phone={engineer.altPhone} /></dd>
                </div>
              )}
              {engineer.email && (
                <div>
                  <dt className="text-muted-foreground">Email</dt>
                  <dd>{engineer.email}</dd>
                </div>
              )}
              <div>
                <dt className="text-muted-foreground">Joined</dt>
                <dd>{formatDate(engineer.joiningDate)}</dd>
              </div>
              {engineer.salaryPaise !== null && (
                <div>
                  <dt className="text-muted-foreground">Pay</dt>
                  <dd>
                    {engineer.payFrequency === "DAILY" ? (
                      <>
                        <Money paise={engineer.dailyWagePaise} wholeRupees /> per day
                      </>
                    ) : (
                      <>
                        <Money paise={engineer.salaryPaise} wholeRupees /> per {engineer.payFrequency === "WEEKLY" ? "week" : "month"}
                      </>
                    )}
                  </dd>
                </div>
              )}
            </dl>
          </Section>
          <Section title="Projects">
            {engineer.projects.length === 0 ? (
              <p className="text-sm text-muted-foreground">Not assigned to any project.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {engineer.projects.map(({ project }) => (
                  <li key={project.id} className="flex items-center justify-between gap-2">
                    <Link href={`/projects/${project.id}`} className="hover:underline">
                      {project.name}
                    </Link>
                    <ProjectStatusBadge status={project.status} />
                  </li>
                ))}
              </ul>
            )}
          </Section>
          {(engineer.responsibilities || engineer.notes) && (
            <Section title="Responsibilities & notes">
              {engineer.responsibilities && <p className="text-sm whitespace-pre-line">{engineer.responsibilities}</p>}
              {engineer.notes && <p className="mt-2 text-sm whitespace-pre-line text-muted-foreground">{engineer.notes}</p>}
            </Section>
          )}
        </div>
      </div>
      {pay && pay.payments.length > 0 && (
        <Section title="Payments">
          <SimpleTable
            rows={pay.payments}
            rowKey={(p) => p.id}
            columns={[
              { header: "Date", cell: (p) => <Cell2 main={formatDate(p.date)} sub={p.number} /> },
              { header: "For", cell: (p) => <Cell2 main={PAYMENT_PURPOSE[p.purpose]} sub={p.project?.name ?? p.notes ?? undefined} /> },
              { header: "How", hide: "md", cell: (p) => <Cell2 main={PAYMENT_METHOD[p.method]} sub={p.account.name} /> },
              { header: "Amount", align: "right", cell: (p) => <Money paise={p.amountPaise} colorNegative /> },
            ]}
          />
        </Section>
      )}
    </div>
  );
}
