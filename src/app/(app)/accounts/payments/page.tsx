import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Banknote, Undo2 } from "lucide-react";
import { ToneBadge } from "@/components/app/badges";
import { ConfirmAction } from "@/components/app/confirm-action";
import { EmptyState } from "@/components/app/empty-state";
import { FilterBar, param } from "@/components/app/filter-bar";
import { Money } from "@/components/app/money";
import { NoAccess } from "@/components/app/no-access";
import { PageHeader } from "@/components/app/page-header";
import { Cell2, SimpleTable } from "@/components/app/simple-table";
import { PageSkeleton } from "@/components/app/skeletons";
import { StatTile } from "@/components/app/stat-tile";
import { Button } from "@/components/ui/button";
import { reversePaymentAction } from "@/features/money/actions";
import { paymentDialogData } from "@/features/money/dialog-data";
import { RecordPaymentDialog } from "@/features/money/money-dialogs";
import { AccountsTabs } from "@/features/money/nav";
import type { PayeeType, PaymentPurpose } from "@/generated/prisma/enums";
import { formatDate } from "@/lib/dates";
import { PAYEE_TYPE, PAYMENT_METHOD, PAYMENT_PURPOSE } from "@/lib/labels";
import { formatINR, sumPaise } from "@/lib/money";
import { resolvePeriod } from "@/lib/period";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";
import { listPaymentsMade } from "@/server/services/money-lists";
import { projectOptions } from "@/server/services/projects";

export const metadata: Metadata = { title: "Payments made" };

export default function PaymentsMadePage(props: PageProps<"/accounts/payments">) {
  return (
    <Suspense fallback={<PageSkeleton tiles={4} rows={10} />}>
      <PaymentsMade searchParams={props.searchParams} />
    </Suspense>
  );
}

async function PaymentsMade({ searchParams }: { searchParams: PageProps<"/accounts/payments">["searchParams"] }) {
  const user = await requireUser();
  if (!can(user, "payments.record") && !can(user, "bank.viewBalances")) return <NoAccess />;
  const sp = await searchParams;
  const period = resolvePeriod(sp, "this-month");
  const payee = param(sp, "payee") as PayeeType | undefined;
  const purpose = param(sp, "purpose") as PaymentPurpose | undefined;
  const [rows, projects, dialog] = await Promise.all([
    listPaymentsMade(user, {
      from: period.from,
      to: period.to,
      projectId: param(sp, "project"),
      payeeType: payee && payee in PAYEE_TYPE ? payee : undefined,
      purpose: purpose && purpose in PAYMENT_PURPOSE ? purpose : undefined,
    }),
    projectOptions(user, { includeClosed: true }),
    can(user, "payments.record") ? paymentDialogData(user) : Promise.resolve(null),
  ]);
  const by = (t: PayeeType) => sumPaise(rows.filter((r) => r.payeeType === t).map((r) => r.amountPaise));

  return (
    <div className="page-enter flex flex-col gap-5">
      <PageHeader
        title="Payments made"
        description={`Money paid to suppliers, workers, engineers and contractors · ${period.label}`}
        className="mb-0"
        actions={dialog && <RecordPaymentDialog accounts={dialog.accounts} projects={dialog.projects} people={dialog.people} />}
      />
      <AccountsTabs showBanks={can(user, "bank.viewBalances")} />
      <FilterBar
        action="/accounts/payments"
        values={sp}
        fields={[
          { type: "period", fallback: "this-month" },
          { type: "select", name: "payee", label: "Paid to", options: Object.entries(PAYEE_TYPE).map(([value, label]) => ({ value, label })) },
          { type: "select", name: "purpose", label: "For", options: Object.entries(PAYMENT_PURPOSE).map(([value, label]) => ({ value, label })) },
          { type: "select", name: "project", label: "Project", options: projects.map((p) => ({ value: p.id, label: p.name })) },
        ]}
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Suppliers" value={<Money paise={by("SUPPLIER")} short />} href="/accounts/payments?payee=SUPPLIER" />
        <StatTile label="Workers" value={<Money paise={by("LABOUR")} short />} sub="Wages and advances" href="/accounts/payments?payee=LABOUR" />
        <StatTile label="Contractors" value={<Money paise={by("CONTRACTOR")} short />} href="/accounts/payments?payee=CONTRACTOR" />
        <StatTile label="Engineers & others" value={<Money paise={by("ENGINEER") + by("OTHER")} short />} />
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={Banknote} title="No payments in this period" description="Payments are also recorded from a supplier bill, a worker's page, the wage sheet or a contractor bill." />
      ) : (
        <SimpleTable
          rows={rows}
          rowKey={(r) => r.id}
          rowClassName={(r) => (r.reversalOfId || r.reversedBy ? "text-muted-foreground" : undefined)}
          columns={[
            { header: "No.", cell: (r) => <Cell2 main={r.number} sub={formatDate(r.date)} /> },
            {
              header: "Paid to",
              cell: (r) => (
                <Cell2
                  main={r.payeeHref ? <Link href={r.payeeHref} className="hover:underline">{r.payee}</Link> : r.payee}
                  sub={`${PAYEE_TYPE[r.payeeType]} · ${PAYMENT_PURPOSE[r.purpose]}${r.project ? ` · ${r.project.name}` : ""}`}
                />
              ),
            },
            { header: "How", hide: "md", cell: (r) => <Cell2 main={PAYMENT_METHOD[r.method]} sub={[r.account.name, r.reference].filter(Boolean).join(" · ")} /> },
            {
              header: "Amount",
              align: "right",
              cell: (r) => (
                <div className="flex flex-col items-end gap-0.5">
                  <Money paise={r.amountPaise} colorNegative />
                  {r.reversalOfId && <ToneBadge tone="grey">Reversal</ToneBadge>}
                  {r.reversedBy && <ToneBadge tone="grey">Reversed</ToneBadge>}
                </div>
              ),
            },
            {
              header: <span className="sr-only">Actions</span>,
              align: "right",
              cell: (r) =>
                can(user, "finance.reverse") && !r.reversalOfId && !r.reversedBy ? (
                  <ConfirmAction
                    trigger={
                      <Button variant="ghost" size="icon" aria-label={`Reverse ${r.number}`}>
                        <Undo2 className="size-4" />
                      </Button>
                    }
                    title={`Reverse payment ${r.number}?`}
                    description={`${formatINR(r.amountPaise)} to ${r.payee} is cancelled with a minus entry. The original stays on record.`}
                    confirmLabel="Reverse payment"
                    destructive
                    reason={{ label: "Reason", required: true }}
                    action={reversePaymentAction.bind(null, r.id)}
                  />
                ) : null,
            },
          ]}
          footer={["Total", null, null, <Money key="t" paise={sumPaise(rows.map((r) => r.amountPaise))} />, null]}
        />
      )}
    </div>
  );
}
