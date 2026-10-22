import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Pencil, UserCheck, UserX } from "lucide-react";
import { ToneBadge } from "@/components/app/badges";
import { ConfirmAction } from "@/components/app/confirm-action";
import { ContactLinks } from "@/components/app/contact-links";
import { Money } from "@/components/app/money";
import { NotFoundPanel } from "@/components/app/no-access";
import { PageHeader, Section } from "@/components/app/page-header";
import { Cell2, SimpleTable } from "@/components/app/simple-table";
import { PageSkeleton } from "@/components/app/skeletons";
import { StatTile } from "@/components/app/stat-tile";
import { Button } from "@/components/ui/button";
import { setWorkerActiveAction } from "@/features/labour/actions";
import { PayPersonDialog } from "@/features/money/pay-person-dialog";
import { formatDate } from "@/lib/dates";
import { ATTENDANCE, LABOUR_CATEGORY, PAYMENT_METHOD, PAYMENT_PURPOSE } from "@/lib/labels";
import { paiseToInput } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";
import { getWorker } from "@/server/services/labour";
import { accountOptions } from "@/server/services/ledger";
import { projectOptions } from "@/server/services/projects";

export const metadata: Metadata = { title: "Worker" };

export default function WorkerPage(props: PageProps<"/labour/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton tiles={4} />}>
      <WorkerDetail params={props.params} />
    </Suspense>
  );
}

async function WorkerDetail({ params }: { params: PageProps<"/labour/[id]">["params"] }) {
  const { id } = await params;
  const user = await requireUser();
  const w = await getWorker(user, id);
  if (!w) return <NotFoundPanel what="worker" backHref="/labour" backLabel="Back to labour" />;
  const canPay = can(user, "payments.record") && can(user, "wages.view");
  const [accounts, projects] = canPay ? await Promise.all([accountOptions(user), projectOptions(user)]) : [[], []];
  const lastProject = w.attendance[0]?.project.id;
  const projectOpts = projects.map((p) => ({ value: p.id, label: p.name }));

  return (
    <div className="page-enter flex flex-col gap-6">
      <PageHeader
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            {w.name}
            {!w.isActive && <ToneBadge tone="grey">Left</ToneBadge>}
          </span>
        }
        description={`${w.code} · ${LABOUR_CATEGORY[w.category]}${w.contractor ? ` · with ${w.contractor.name}` : ""}`}
        back={{ href: "/labour", label: "Labour" }}
        className="mb-0"
        actions={
          <>
            {canPay && w.balance && (
              <>
                <PayPersonDialog
                  payeeType="LABOUR"
                  personId={id}
                  personName={w.name}
                  purposes={["WAGES"]}
                  accounts={accounts}
                  projects={projectOpts}
                  defaultProjectId={lastProject}
                  defaultAmount={w.balance.pendingWagesPaise > 0n ? paiseToInput(w.balance.pendingWagesPaise) : undefined}
                  label="Pay wages"
                />
                <PayPersonDialog payeeType="LABOUR" personId={id} personName={w.name} purposes={["ADVANCE"]} accounts={accounts} projects={projectOpts} defaultProjectId={lastProject} label="Give advance" variant="outline" />
              </>
            )}
            {can(user, "labour.manage") && (
              <>
                <Button asChild variant="outline" size="lg">
                  <Link href={`/labour/${id}/edit`}>
                    <Pencil className="size-4" /> Edit
                  </Link>
                </Button>
                <ConfirmAction
                  trigger={
                    <Button variant="ghost" size="lg">
                      {w.isActive ? <UserX className="size-4" /> : <UserCheck className="size-4" />} {w.isActive ? "Mark as left" : "Re-activate"}
                    </Button>
                  }
                  title={w.isActive ? `Mark ${w.name} as left?` : `Re-activate ${w.name}?`}
                  description={w.isActive ? "They no longer appear on the attendance sheet. Their history and balance stay." : "They appear on attendance sheets again."}
                  confirmLabel="Confirm"
                  action={setWorkerActiveAction.bind(null, id, !w.isActive)}
                />
              </>
            )}
          </>
        }
      />

      {w.balance && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile label="Total earned" value={<Money paise={w.balance.earnedPaise} wholeRupees />} sub={`${w.balance.daysWorked} days worked`} />
          <StatTile label="Wages paid" value={<Money paise={w.balance.wagesPaidPaise} wholeRupees />} />
          <StatTile label="Advances given" value={<Money paise={w.balance.advancesPaise} wholeRupees />} />
          {w.balance.advanceOutstandingPaise > 0n ? (
            <StatTile label="Advance to recover" value={<Money paise={w.balance.advanceOutstandingPaise} wholeRupees />} tone="warn" sub="more than wages earned" />
          ) : (
            <StatTile label="Wages to pay" value={<Money paise={w.balance.pendingWagesPaise} wholeRupees />} tone={w.balance.pendingWagesPaise > 0n ? "warn" : "good"} />
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          <Section title="Attendance" description="Latest 90 days at the sites you can see.">
            {w.attendance.length === 0 ? (
              <p className="text-sm text-muted-foreground">No attendance yet.</p>
            ) : (
              <SimpleTable
                rows={w.attendance}
                rowKey={(a) => a.id}
                columns={[
                  { header: "Date", cell: (a) => formatDate(a.date) },
                  { header: "Site", hide: "sm", cell: (a) => <Link href={`/projects/${a.project.id}`} className="hover:underline">{a.project.name}</Link> },
                  { header: "Status", cell: (a) => <ToneBadge tone={ATTENDANCE[a.status].tone}>{ATTENDANCE[a.status].label}</ToneBadge> },
                  { header: "Overtime", align: "right", hide: "md", cell: (a) => (Number(a.overtimeHours) > 0 ? `${a.overtimeHours} h` : "—") },
                  ...(w.balance ? [{ header: "Wage", align: "right" as const, cell: (a: (typeof w.attendance)[number]) => <Money paise={a.wagePaise + a.adjustmentPaise} wholeRupees /> }] : []),
                ]}
              />
            )}
          </Section>
          {w.balance && (
            <Section title="Payments">
              {w.payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No payments yet.</p>
              ) : (
                <SimpleTable
                  rows={w.payments}
                  rowKey={(p) => p.id}
                  columns={[
                    { header: "Date", cell: (p) => <Cell2 main={formatDate(p.date)} sub={p.number} /> },
                    { header: "For", cell: (p) => <Cell2 main={PAYMENT_PURPOSE[p.purpose]} sub={p.notes ?? undefined} /> },
                    { header: "How", hide: "md", cell: (p) => <Cell2 main={PAYMENT_METHOD[p.method]} sub={p.account.name} /> },
                    { header: "Amount", align: "right", cell: (p) => <Money paise={p.amountPaise} colorNegative /> },
                  ]}
                />
              )}
            </Section>
          )}
        </div>
        <Section title="Details">
          <dl className="flex flex-col gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Phone</dt>
              <dd><ContactLinks phone={w.phone} /></dd>
            </div>
            {w.balance && (
              <div>
                <dt className="text-muted-foreground">Wage</dt>
                <dd>
                  <Money paise={w.dailyWagePaise} wholeRupees /> per day · <Money paise={w.overtimeRatePaise} wholeRupees /> per overtime hour
                </dd>
              </div>
            )}
            {w.upiId && (
              <div>
                <dt className="text-muted-foreground">UPI ID</dt>
                <dd className="font-mono text-xs">{w.upiId}</dd>
              </div>
            )}
            <div>
              <dt className="text-muted-foreground">Joined</dt>
              <dd>{formatDate(w.joinedOn)}</dd>
            </div>
            {w.emergencyContact && (
              <div>
                <dt className="text-muted-foreground">Emergency contact</dt>
                <dd>{w.emergencyContact}</dd>
              </div>
            )}
            {w.address && (
              <div>
                <dt className="text-muted-foreground">Address</dt>
                <dd className="whitespace-pre-line">{w.address}</dd>
              </div>
            )}
            {w.notes && <p className="border-t pt-3 whitespace-pre-line text-muted-foreground">{w.notes}</p>}
          </dl>
        </Section>
      </div>
    </div>
  );
}
