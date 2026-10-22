import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Search, Users } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { Money } from "@/components/app/money";
import { NoAccess } from "@/components/app/no-access";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/skeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPhone } from "@/lib/contact";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";
import { listClients } from "@/server/services/clients";
import { ClientsTabs } from "@/features/billing/nav";

export const metadata: Metadata = { title: "Clients" };

export default function ClientsPage(props: PageProps<"/clients">) {
  return (
    <Suspense fallback={<PageSkeleton tiles={0} />}>
      <Clients searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Clients({ searchParams }: { searchParams: PageProps<"/clients">["searchParams"] }) {
  const user = await requireUser();
  if (!can(user, "clients.view")) return <NoAccess />;
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const clients = await listClients(user, q);
  const showMoney = can(user, "projects.viewMoney");

  return (
    <div className="page-enter">
      <PageHeader
        title="Clients"
        description="The people and companies you build for."
        actions={
          can(user, "clients.manage") && (
            <Button asChild size="lg">
              <Link href="/clients/new">
                <Plus className="size-4" /> Add client
              </Link>
            </Button>
          )
        }
      />
      {can(user, "quotations.manage") || can(user, "projects.viewMoney") || can(user, "clientPayments.record") ? <ClientsTabs /> : null}
      <form action="/clients" className="relative mb-4 w-full md:w-80">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input name="q" defaultValue={q} placeholder="Search name, phone, city…" className="h-10 pl-9" aria-label="Search clients" />
      </form>

      {clients.length === 0 ? (
        <EmptyState
          icon={Users}
          title={q ? `No clients match “${q}”` : "No clients yet"}
          description={q ? "Try a shorter word or a phone number." : "Add a client before creating their project."}
          action={
            !q && can(user, "clients.manage") ? (
              <Button asChild>
                <Link href="/clients/new">
                  <Plus className="size-4" /> Add client
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
                <TableHead>Client</TableHead>
                <TableHead className="hidden sm:table-cell">Phone</TableHead>
                <TableHead className="hidden md:table-cell">Projects</TableHead>
                {showMoney && <TableHead className="hidden text-right lg:table-cell">Project value</TableHead>}
                {showMoney && <TableHead className="hidden text-right lg:table-cell">Received</TableHead>}
                {showMoney && <TableHead className="text-right">Pending</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="py-3">
                    <Link href={`/clients/${c.id}`} className="font-medium hover:underline">
                      {c.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {c.code}
                      {c.city && ` · ${c.city}`}
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-sm sm:table-cell">{formatPhone(c.phone)}</TableCell>
                  <TableCell className="hidden text-sm md:table-cell">
                    {c.projectCount}
                    {c.activeProjects > 0 && <span className="text-muted-foreground"> ({c.activeProjects} active)</span>}
                  </TableCell>
                  {showMoney && (
                    <TableCell className="hidden text-right lg:table-cell">
                      <Money paise={c.valuePaise} short />
                    </TableCell>
                  )}
                  {showMoney && (
                    <TableCell className="hidden text-right lg:table-cell">
                      <Money paise={c.receivedPaise} short />
                    </TableCell>
                  )}
                  {showMoney && (
                    <TableCell className="text-right font-medium">
                      <Money paise={c.pendingPaise} short />
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
