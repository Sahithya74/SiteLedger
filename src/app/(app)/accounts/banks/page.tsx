import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Landmark, Lock, Unlock, Wallet } from "lucide-react";
import { ToneBadge } from "@/components/app/badges";
import { ConfirmAction } from "@/components/app/confirm-action";
import { EmptyState } from "@/components/app/empty-state";
import { Money } from "@/components/app/money";
import { PageHeader, Section } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/skeletons";
import { StatTile } from "@/components/app/stat-tile";
import { Button } from "@/components/ui/button";
import { unlockPeriodAction } from "@/features/money/actions";
import { AddAccountDialog, LockPeriodDialog, TransferDialog } from "@/features/money/money-dialogs";
import { AccountsTabs } from "@/features/money/nav";
import { formatDate } from "@/lib/dates";
import { ACCOUNT_KIND } from "@/lib/labels";
import { formatINR, sumPaise } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";
import { currentLock, listAccounts } from "@/server/services/banks";
import { projectOptions } from "@/server/services/projects";
import { managerOptions } from "@/server/services/users";

export const metadata: Metadata = { title: "Bank & cash" };

export default function BanksPage() {
  return (
    <Suspense fallback={<PageSkeleton tiles={3} rows={6} />}>
      <Banks />
    </Suspense>
  );
}

async function Banks() {
  const user = await requireUser();
  const all = can(user, "bank.viewBalances");
  const manage = can(user, "bank.manage");
  const [accounts, lock, managers, projects] = await Promise.all([
    listAccounts(user),
    currentLock(),
    manage ? managerOptions() : Promise.resolve([]),
    manage ? projectOptions(user) : Promise.resolve([]),
  ]);
  const options = accounts.filter((a) => a.isActive).map((a) => ({ id: a.id, name: a.name, kind: a.kind, balance: formatINR(a.balancePaise, { paise: false }) }));
  const lockActive = lock && lock.lockedUpTo > "2000-01-01" ? lock : null;
  const groups = (["BANK", "CASH", "SITE_CASH"] as const).map((kind) => ({ kind, rows: accounts.filter((a) => a.kind === kind) }));

  return (
    <div className="page-enter flex flex-col gap-5">
      <PageHeader
        title={all ? "Bank & cash" : "My site cash"}
        description={all ? "Balances are worked out from every entry — they cannot be typed in." : "Cash given to you for site expenses. Record expenses from it in Expenses."}
        className="mb-0"
        actions={
          manage && (
            <>
              <AddAccountDialog managers={managers.filter((m) => m.isActive).map((m) => ({ value: m.id, label: m.name }))} projects={projects.map((p) => ({ value: p.id, label: p.name }))} />
              {options.length >= 2 && <TransferDialog accounts={options} />}
            </>
          )
        }
      />
      {all && <AccountsTabs />}
      {all && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {groups.map((g) => (
            <StatTile key={g.kind} label={ACCOUNT_KIND[g.kind]} value={<Money paise={sumPaise(g.rows.map((a) => a.balancePaise))} short />} sub={`${g.rows.length} accounts`} />
          ))}
          <StatTile label="Total" value={<Money paise={sumPaise(accounts.map((a) => a.balancePaise))} short />} tone="good" />
        </div>
      )}

      {accounts.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title={all ? "No accounts yet" : "No site cash is assigned to you"}
          description={all ? "Add your bank accounts and office cash with today's balance. Every payment then goes in or out of one of them." : "Ask the owner to give you site cash for expenses."}
        />
      ) : (
        groups
          .filter((g) => g.rows.length > 0)
          .map((g) => (
            <Section key={g.kind} title={ACCOUNT_KIND[g.kind]}>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {g.rows.map((a) => (
                  <li key={a.id}>
                    <Link href={`/accounts/banks/${a.id}`} className="flex h-full flex-col gap-2 rounded-xl border p-4 transition-colors hover:border-stone-300 hover:bg-stone-50/60">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 font-semibold">
                            {a.kind === "BANK" ? <Landmark className="size-4 text-muted-foreground" /> : <Wallet className="size-4 text-muted-foreground" />}
                            <span className="truncate">{a.name}</span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {a.kind === "BANK"
                              ? [a.bankName, a.accountNumberLast4 && `•••• ${a.accountNumberLast4}`].filter(Boolean).join(" · ")
                              : a.kind === "SITE_CASH"
                                ? [a.holder && `With ${a.holder}`, a.project].filter(Boolean).join(" · ")
                                : "Office cash"}
                          </div>
                        </div>
                        {!a.isActive && <ToneBadge tone="grey">Closed</ToneBadge>}
                      </div>
                      <Money paise={a.balancePaise} className={`text-xl font-semibold ${a.balancePaise < 0n ? "text-red-700" : ""}`} />
                      {manage && a.kind === "BANK" && a.unreconciled > 0 && <span className="text-xs text-amber-700">{a.unreconciled} entries not yet matched with the statement</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          ))
      )}

      {all && (
        <Section
          title="Month lock"
          description="Lock months whose accounts are checked so nothing dated in them can be added, changed or reversed."
          actions={
            can(user, "periods.lock") && (
              <>
                <LockPeriodDialog current={lockActive?.lockedUpTo ?? null} />
                {lockActive && (
                  <ConfirmAction
                    trigger={
                      <Button variant="ghost" size="lg">
                        <Unlock className="size-4" /> Remove lock
                      </Button>
                    }
                    title="Remove the month lock?"
                    description="Old entries can be added or reversed again. This is recorded in the audit log."
                    confirmLabel="Remove lock"
                    reason={{ label: "Why?", required: true }}
                    action={unlockPeriodAction}
                  />
                )}
              </>
            )
          }
        >
          {lockActive ? (
            <p className="flex items-center gap-2 text-sm">
              <Lock className="size-4 text-muted-foreground" />
              Entries up to <strong>{formatDate(lockActive.lockedUpTo)}</strong> are locked
              {lockActive.lockedBy && <> by {lockActive.lockedBy.name}</>}
              {lockActive.reason && <span className="text-muted-foreground"> — “{lockActive.reason}”</span>}.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">No months are locked.</p>
          )}
        </Section>
      )}
    </div>
  );
}
