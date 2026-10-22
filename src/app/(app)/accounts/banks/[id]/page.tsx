import { Suspense } from "react";
import type { Metadata } from "next";
import { CheckCircle2, Circle } from "lucide-react";
import { ConfirmAction } from "@/components/app/confirm-action";
import { FilterBar, param } from "@/components/app/filter-bar";
import { Money } from "@/components/app/money";
import { NotFoundPanel } from "@/components/app/no-access";
import { PageHeader } from "@/components/app/page-header";
import { Cell2, SimpleTable } from "@/components/app/simple-table";
import { PageSkeleton } from "@/components/app/skeletons";
import { StatTile } from "@/components/app/stat-tile";
import { Button } from "@/components/ui/button";
import { closeAccountAction, setReconciledAction } from "@/features/money/actions";
import { TransferDialog } from "@/features/money/money-dialogs";
import { formatDate, formatDateTime } from "@/lib/dates";
import { ACCOUNT_KIND } from "@/lib/labels";
import { formatINR } from "@/lib/money";
import { resolvePeriod } from "@/lib/period";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";
import { getAccountLedger } from "@/server/services/banks";
import { accountOptions } from "@/server/services/ledger";

export const metadata: Metadata = { title: "Account" };

const SOURCE: Record<string, string> = {
  CLIENT_PAYMENT: "Client payment",
  PAYMENT: "Payment",
  EXPENSE: "Expense",
  OTHER_INCOME: "Other income",
  TRANSFER: "Transfer",
};

export default function AccountPage(props: PageProps<"/accounts/banks/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton tiles={4} rows={12} />}>
      <Account params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Account({ params, searchParams }: { params: PageProps<"/accounts/banks/[id]">["params"]; searchParams: PageProps<"/accounts/banks/[id]">["searchParams"] }) {
  const user = await requireUser();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const period = resolvePeriod(sp, "this-month");
  const ledger = await getAccountLedger(user, id, period);
  if (!ledger) return <NotFoundPanel what="account" backHref="/accounts/banks" backLabel="Back to accounts" />;
  const { account } = ledger;
  const manage = can(user, "bank.manage");
  const onlyOpen = param(sp, "open") === "1";
  const entries = onlyOpen ? ledger.entries.filter((e) => !e.reconciledAt) : ledger.entries;
  const accounts = manage ? await accountOptions(user) : [];

  return (
    <div className="page-enter flex flex-col gap-5">
      <PageHeader
        title={account.name}
        description={[
          ACCOUNT_KIND[account.kind],
          account.bankName,
          account.accountNumberLast4 && `•••• ${account.accountNumberLast4}`,
          account.ifsc,
          `opening ${formatINR(account.openingBalancePaise)} on ${formatDate(account.openingDate)}`,
        ]
          .filter(Boolean)
          .join(" · ")}
        back={{ href: "/accounts/banks", label: "Bank & cash" }}
        className="mb-0"
        actions={
          manage && (
            <>
              {account.isActive && <TransferDialog accounts={accounts} label={account.kind === "SITE_CASH" ? "Top up site cash" : "Move money"} defaultTo={account.kind === "SITE_CASH" ? account.id : undefined} />}
              <ConfirmAction
                trigger={<Button variant="ghost" size="lg">{account.isActive ? "Close account" : "Re-open"}</Button>}
                title={account.isActive ? `Close “${account.name}”?` : `Re-open “${account.name}”?`}
                description={account.isActive ? "It will no longer be offered in payment forms. Its history stays." : "It will be offered in payment forms again."}
                confirmLabel={account.isActive ? "Close" : "Re-open"}
                action={closeAccountAction.bind(null, account.id, !account.isActive)}
              />
            </>
          )
        }
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Balance now" value={<Money paise={ledger.closingPaise} />} tone={ledger.closingPaise < 0n ? "bad" : "good"} />
        <StatTile label={`At start of period`} value={<Money paise={ledger.openingForWindowPaise} />} sub={period.label} />
        <StatTile label="In" value={<Money paise={ledger.inPaise} />} tone="good" />
        <StatTile label="Out" value={<Money paise={ledger.outPaise} />} />
      </div>
      <FilterBar
        action={`/accounts/banks/${account.id}`}
        values={sp}
        fields={[{ type: "period", fallback: "this-month" }, ...(manage && account.kind === "BANK" ? [{ type: "checkbox" as const, name: "open", label: "Only entries not matched with the statement" }] : [])]}
      />
      {entries.length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">No entries in this period.</p>
      ) : (
        <SimpleTable
          rows={entries}
          rowKey={(e) => e.id}
          columns={[
            { header: "Date", cell: (e) => formatDate(e.date) },
            { header: "Details", cell: (e) => <Cell2 main={e.description} sub={[SOURCE[e.source], e.reference, `by ${e.createdBy.name}`].filter(Boolean).join(" · ")} /> },
            { header: "In", align: "right", cell: (e) => (e.amountPaise > 0n ? <Money paise={e.amountPaise} className="text-emerald-700" /> : null) },
            { header: "Out", align: "right", cell: (e) => (e.amountPaise < 0n ? <Money paise={-e.amountPaise} /> : null) },
            { header: "Balance", align: "right", hide: "sm", cell: (e) => <Money paise={e.balancePaise} colorNegative className="text-muted-foreground" /> },
            ...(account.kind === "BANK"
              ? [
                  {
                    header: "Matched",
                    align: "right" as const,
                    cell: (e: (typeof entries)[number]) =>
                      manage ? (
                        <ConfirmAction
                          trigger={
                            <Button variant="ghost" size="icon" aria-label={e.reconciledAt ? "Matched — click to undo" : "Mark as matched with the statement"}>
                              {e.reconciledAt ? <CheckCircle2 className="size-5 text-emerald-600" /> : <Circle className="size-5 text-stone-300" />}
                            </Button>
                          }
                          title={e.reconciledAt ? "Un-match this entry?" : "Matched with the bank statement?"}
                          description={
                            e.reconciledAt
                              ? `Matched on ${formatDateTime(e.reconciledAt)}${e.reconciledBy ? ` by ${e.reconciledBy.name}` : ""}${e.statementRef ? ` (${e.statementRef})` : ""}.`
                              : `${formatDate(e.date)} · ${formatINR(e.amountPaise)} · ${e.description}`
                          }
                          confirmLabel={e.reconciledAt ? "Un-match" : "Yes, matched"}
                          reason={e.reconciledAt ? undefined : { label: "Statement reference (optional)", placeholder: "e.g. Sep statement, page 2" }}
                          action={setReconciledAction.bind(null, e.id, !e.reconciledAt)}
                        />
                      ) : e.reconciledAt ? (
                        <CheckCircle2 className="ml-auto size-5 text-emerald-600" aria-label="Matched" />
                      ) : null,
                  },
                ]
              : []),
          ]}
        />
      )}
    </div>
  );
}
