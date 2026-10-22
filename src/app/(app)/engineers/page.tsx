import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { HardHat, Plus, Search } from "lucide-react";
import { ToneBadge } from "@/components/app/badges";
import { EmptyState } from "@/components/app/empty-state";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/skeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPhone } from "@/lib/contact";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";
import { listEngineers } from "@/server/services/engineers";

export const metadata: Metadata = { title: "Engineers" };

export default function EngineersPage(props: PageProps<"/engineers">) {
  return (
    <Suspense fallback={<PageSkeleton tiles={0} />}>
      <Engineers searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Engineers({ searchParams }: { searchParams: PageProps<"/engineers">["searchParams"] }) {
  const user = await requireUser();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const showInactive = params.all === "1";
  const engineers = await listEngineers(user, { q, showInactive });
  const showPay = can(user, "wages.view");

  return (
    <div className="page-enter">
      <PageHeader
        title="Engineers"
        description="Site engineers and supervisors — their projects and the work they are responsible for. Engineers do not log in."
        actions={
          can(user, "engineers.manage") && (
            <Button asChild size="lg">
              <Link href="/engineers/new">
                <Plus className="size-4" /> Add engineer
              </Link>
            </Button>
          )
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <form action="/engineers" className="relative w-full md:w-80">
          {showInactive && <input type="hidden" name="all" value="1" />}
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={q} placeholder="Search name, phone, role…" className="h-10 pl-9" aria-label="Search engineers" />
        </form>
        <Link href={showInactive ? "/engineers" : "/engineers?all=1"} className="text-sm text-muted-foreground hover:text-foreground hover:underline">
          {showInactive ? "Hide former engineers" : "Show former engineers too"}
        </Link>
      </div>

      {engineers.length === 0 ? (
        <EmptyState
          icon={HardHat}
          title={q ? `No engineers match “${q}”` : "No engineers yet"}
          description="Add your site engineers so you can assign work and track deadlines."
          action={
            !q && can(user, "engineers.manage") ? (
              <Button asChild>
                <Link href="/engineers/new">
                  <Plus className="size-4" /> Add engineer
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Engineer</TableHead>
                <TableHead className="hidden sm:table-cell">Phone</TableHead>
                <TableHead className="hidden md:table-cell">Projects</TableHead>
                <TableHead>Open work</TableHead>
                {showPay && <TableHead className="hidden text-right lg:table-cell">Pay</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {engineers.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="py-3">
                    <Link href={`/engineers/${e.id}`} className="font-medium hover:underline">
                      {e.name}
                    </Link>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {e.role ?? "Engineer"}
                      {e.qualification && ` · ${e.qualification}`}
                      {!e.isActive && <ToneBadge tone="grey">Former</ToneBadge>}
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-sm sm:table-cell">{formatPhone(e.phone)}</TableCell>
                  <TableCell className="hidden max-w-72 text-sm md:table-cell">
                    {e.projects.length === 0 ? <span className="text-muted-foreground">None</span> : e.projects.map((p) => p.name).join(", ")}
                  </TableCell>
                  <TableCell className="text-sm">
                    {e.openWork}
                    {e.overdueWork > 0 && <span className="ml-1 font-medium text-red-700">({e.overdueWork} late)</span>}
                  </TableCell>
                  {showPay && (
                    <TableCell className="hidden text-right text-sm lg:table-cell">
                      {e.payFrequency === "DAILY" ? (
                        <>
                          <Money paise={e.dailyWagePaise} wholeRupees /> <span className="text-muted-foreground">/day</span>
                        </>
                      ) : (
                        <>
                          <Money paise={e.salaryPaise} wholeRupees /> <span className="text-muted-foreground">/{e.payFrequency === "WEEKLY" ? "week" : "month"}</span>
                        </>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
