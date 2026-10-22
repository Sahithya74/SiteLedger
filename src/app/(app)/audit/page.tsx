import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Filter, ScrollText } from "lucide-react";
import { ToneBadge } from "@/components/app/badges";
import { EmptyState } from "@/components/app/empty-state";
import { NativeSelect } from "@/components/app/form";
import { NoAccess } from "@/components/app/no-access";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/skeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuditAction } from "@/generated/prisma/enums";
import { formatDateTime, isISODate } from "@/lib/dates";
import type { Tone } from "@/lib/labels";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";
import { listAuditLog } from "@/server/services/audit-log";

export const metadata: Metadata = { title: "Audit log" };

const ACTION_LABEL: Record<AuditAction, { label: string; tone: Tone }> = {
  CREATE: { label: "Added", tone: "green" },
  UPDATE: { label: "Changed", tone: "blue" },
  DELETE: { label: "Removed", tone: "red" },
  ARCHIVE: { label: "Archived", tone: "grey" },
  RESTORE: { label: "Restored", tone: "green" },
  STATUS_CHANGE: { label: "Status", tone: "violet" },
  REVERSE: { label: "Reversed", tone: "red" },
  LOGIN: { label: "Login", tone: "grey" },
  LOGIN_FAILED: { label: "Failed login", tone: "amber" },
  LOGOUT: { label: "Logout", tone: "grey" },
  PASSWORD_CHANGE: { label: "Password", tone: "amber" },
  PERMISSION_CHANGE: { label: "Access", tone: "amber" },
  EXPORT: { label: "Export", tone: "blue" },
  LOCK_PERIOD: { label: "Month lock", tone: "violet" },
};

export default function AuditPage(props: PageProps<"/audit">) {
  return (
    <Suspense fallback={<PageSkeleton tiles={0} rows={12} />}>
      <Audit searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Audit({ searchParams }: { searchParams: PageProps<"/audit">["searchParams"] }) {
  const user = await requireUser();
  if (!can(user, "audit.view")) return <NoAccess />;
  const params = await searchParams;
  const str = (k: string) => (typeof params[k] === "string" && params[k] ? (params[k] as string) : undefined);
  const action = str("action");
  const filter = {
    userId: str("user"),
    entityType: str("entity"),
    action: action && action in ACTION_LABEL ? (action as AuditAction) : undefined,
    from: str("from") && isISODate(str("from")) ? str("from") : undefined,
    to: str("to") && isISODate(str("to")) ? str("to") : undefined,
    q: str("q"),
    page: Number(str("page") ?? 1) || 1,
  };
  const log = await listAuditLog(user, filter);
  const query = (page: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries({ user: filter.userId, entity: filter.entityType, action: filter.action, from: filter.from, to: filter.to, q: filter.q })) {
      if (v) sp.set(k, v);
    }
    sp.set("page", String(page));
    return `/audit?${sp.toString()}`;
  };

  return (
    <div className="page-enter">
      <PageHeader
        title="Audit log"
        description="Every important change, who made it and when. Entries can never be edited or deleted."
      />
      <form action="/audit" className="mb-4 grid gap-2 rounded-xl border bg-card p-3 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
        <label className="flex flex-col gap-1 text-sm lg:col-span-2">
          <span className="text-muted-foreground">Search</span>
          <Input name="q" defaultValue={filter.q} placeholder="e.g. cement, Green Villa, ₹50,000" className="h-10" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Person</span>
          <NativeSelect name="user" defaultValue={filter.userId ?? ""}>
            <option value="">Everyone</option>
            {log.users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Type of change</span>
          <NativeSelect name="action" defaultValue={filter.action ?? ""}>
            <option value="">All</option>
            {Object.entries(ACTION_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">From</span>
          <Input type="date" name="from" defaultValue={filter.from} className="h-10" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">To</span>
          <Input type="date" name="to" defaultValue={filter.to} className="h-10" />
        </label>
        <div className="flex gap-2 lg:col-span-6">
          <Button type="submit" variant="secondary" size="lg">
            <Filter className="size-4" /> Show
          </Button>
          <Button asChild variant="ghost" size="lg">
            <Link href="/audit">Clear</Link>
          </Button>
          <span className="ml-auto self-center text-sm text-muted-foreground">{log.total.toLocaleString("en-IN")} entries</span>
        </div>
      </form>

      {log.rows.length === 0 ? (
        <EmptyState icon={ScrollText} title="No entries" description="Nothing matches these filters." />
      ) : (
        <ol className="flex flex-col divide-y rounded-xl border bg-card">
          {log.rows.map((row) => (
            <li key={row.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:gap-4">
              <div className="w-40 shrink-0 text-xs text-muted-foreground">{formatDateTime(row.createdAt)}</div>
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <ToneBadge tone={ACTION_LABEL[row.action].tone} className="mr-2 align-middle">
                    {ACTION_LABEL[row.action].label}
                  </ToneBadge>
                  <span className="font-medium">{row.userName}</span> {row.summary}
                </p>
                {(row.before !== null || row.after !== null) && row.action !== "CREATE" && (
                  <details className="mt-1 text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Show recorded values</summary>
                    <div className="mt-2 grid gap-2 md:grid-cols-2">
                      {row.before !== null && (
                        <pre className="overflow-x-auto rounded-md bg-muted p-2 text-[11px] leading-relaxed">Before: {JSON.stringify(row.before, null, 2)}</pre>
                      )}
                      {row.after !== null && (
                        <pre className="overflow-x-auto rounded-md bg-muted p-2 text-[11px] leading-relaxed">After: {JSON.stringify(row.after, null, 2)}</pre>
                      )}
                    </div>
                  </details>
                )}
              </div>
              <div className="shrink-0 text-xs text-muted-foreground">{row.entityType}</div>
            </li>
          ))}
        </ol>
      )}

      {log.pages > 1 && (
        <nav className="mt-4 flex items-center justify-between text-sm">
          {log.page > 1 ? (
            <Button asChild variant="outline">
              <Link href={query(log.page - 1)}>
                <ChevronLeft className="size-4" /> Newer
              </Link>
            </Button>
          ) : (
            <span />
          )}
          <span className="text-muted-foreground">
            Page {log.page} of {log.pages}
          </span>
          {log.page < log.pages ? (
            <Button asChild variant="outline">
              <Link href={query(log.page + 1)}>
                Older <ChevronRight className="size-4" />
              </Link>
            </Button>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
