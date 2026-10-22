import { Suspense } from "react";
import type { Metadata } from "next";
import { Ban, Ticket } from "lucide-react";
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
import { ClientsTabs } from "@/features/billing/nav";
import { bounceChequeAction } from "@/features/money/actions";
import { ClearChequeDialog, DepositChequeDialog, RecordChequeDialog } from "@/features/money/money-dialogs";
import type { ChequeStatus } from "@/generated/prisma/enums";
import { describeDue, formatDate } from "@/lib/dates";
import { CHEQUE_STATUS } from "@/lib/labels";
import { sumPaise } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";
import { listCheques } from "@/server/services/cheques";
import { accountOptions } from "@/server/services/ledger";
import { projectOptions } from "@/server/services/projects";

export const metadata: Metadata = { title: "Cheques" };

export default function ChequesPage(props: PageProps<"/clients/cheques">) {
  return (
    <Suspense fallback={<PageSkeleton tiles={3} rows={8} />}>
      <Cheques searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Cheques({ searchParams }: { searchParams: PageProps<"/clients/cheques">["searchParams"] }) {
  const user = await requireUser();
  if (!can(user, "clientPayments.record") && !can(user, "payments.record") && !can(user, "projects.viewMoney")) return <NoAccess />;
  const sp = await searchParams;
  const status = param(sp, "status") as ChequeStatus | undefined;
  const direction = param(sp, "direction") as "RECEIVED" | "ISSUED" | undefined;
  const [rows, all, projects, accounts] = await Promise.all([
    listCheques(user, { status: status && status in CHEQUE_STATUS ? status : undefined, direction: direction === "RECEIVED" || direction === "ISSUED" ? direction : undefined }),
    listCheques(user),
    projectOptions(user),
    accountOptions(user),
  ]);
  const inHand = all.filter((c) => c.direction === "RECEIVED" && (c.status === "RECEIVED" || c.status === "DEPOSITED"));
  const issuedOpen = all.filter((c) => c.direction === "ISSUED" && (c.status === "RECEIVED" || c.status === "DEPOSITED"));
  const canAct = (c: (typeof rows)[number]) => (c.direction === "RECEIVED" ? can(user, "clientPayments.record") : can(user, "payments.record"));

  return (
    <div className="page-enter">
      <PageHeader
        title="Cheques"
        description="Cheques received and given. A cheque becomes a payment only when the bank clears it."
        actions={<RecordChequeDialog projects={projects.map((p) => ({ value: p.id, label: p.name, client: p.client.name }))} />}
      />
      <ClientsTabs cheques={inHand.filter((c) => c.canDeposit && c.status === "RECEIVED").length} />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatTile label="Received, not cleared" value={<Money paise={sumPaise(inHand.map((c) => c.amountPaise))} short />} sub={`${inHand.length} cheques`} />
        <StatTile label="Post-dated in hand" value={inHand.filter((c) => c.postDated).length} sub="Deposit on the cheque date" />
        <StatTile label="Given, not cleared" value={<Money paise={sumPaise(issuedOpen.map((c) => c.amountPaise))} short />} sub="Keep this much in the bank" tone={issuedOpen.length ? "warn" : "default"} />
      </div>
      <FilterBar
        action="/clients/cheques"
        values={sp}
        fields={[
          { type: "select", name: "direction", label: "Cheque", options: [{ value: "RECEIVED", label: "Received" }, { value: "ISSUED", label: "Given by us" }] },
          { type: "select", name: "status", label: "Status", options: Object.entries(CHEQUE_STATUS).map(([value, s]) => ({ value, label: s.label })) },
        ]}
      />
      {rows.length === 0 ? (
        <EmptyState icon={Ticket} title="No cheques" description="Record a cheque when you receive or give one. You'll be reminded on the cheque date." />
      ) : (
        <SimpleTable
          rows={rows}
          rowKey={(c) => c.id}
          rowClassName={(c) => (c.status === "BOUNCED" ? "bg-red-50/60" : undefined)}
          columns={[
            { header: "Cheque", cell: (c) => <Cell2 main={`#${c.chequeNumber}`} sub={c.bankName ?? undefined} /> },
            { header: "Party", cell: (c) => <Cell2 main={c.partyName} sub={[c.direction === "RECEIVED" ? "Received" : "Given", c.project?.name].filter(Boolean).join(" · ")} /> },
            {
              header: "Cheque date",
              cell: (c) => (
                <Cell2 main={formatDate(c.chequeDate)} sub={c.status === "RECEIVED" && c.postDated ? `Post-dated · ${describeDue(c.chequeDate)}` : c.clearedOn ? `Cleared ${formatDate(c.clearedOn)}` : c.depositedOn ? `Deposited ${formatDate(c.depositedOn)}` : undefined} />
              ),
            },
            {
              header: "Status",
              cell: (c) => (
                <div className="flex flex-col items-start gap-0.5">
                  <ToneBadge tone={CHEQUE_STATUS[c.status].tone}>{c.direction === "ISSUED" && c.status === "RECEIVED" ? "Given" : CHEQUE_STATUS[c.status].label}</ToneBadge>
                  {c.bounceReason && <span className="text-xs text-red-700">{c.bounceReason}</span>}
                </div>
              ),
            },
            { header: "Amount", align: "right", cell: (c) => <Money paise={c.amountPaise} wholeRupees /> },
            {
              header: <span className="sr-only">Actions</span>,
              align: "right",
              cell: (c) =>
                canAct(c) && (c.status === "RECEIVED" || c.status === "DEPOSITED") ? (
                  <div className="flex flex-wrap justify-end gap-1">
                    {c.direction === "RECEIVED" && c.status === "RECEIVED" && c.canDeposit && <DepositChequeDialog id={c.id} accounts={accounts} />}
                    {!c.postDated && <ClearChequeDialog id={c.id} accounts={accounts} defaultAccountId={c.accountId} />}
                    <ConfirmAction
                      trigger={
                        <Button size="sm" variant="ghost" aria-label="Bounced">
                          <Ban className="size-4" /> Bounced
                        </Button>
                      }
                      title={`Cheque #${c.chequeNumber} bounced?`}
                      description="No payment is recorded. Contact the party for a fresh payment."
                      confirmLabel="Mark bounced"
                      destructive
                      reason={{ label: "Reason given by the bank", required: true, placeholder: "e.g. Insufficient funds" }}
                      action={bounceChequeAction.bind(null, c.id)}
                    />
                  </div>
                ) : null,
            },
          ]}
        />
      )}
    </div>
  );
}
