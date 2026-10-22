import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Building2, Pencil, Plus } from "lucide-react";
import { ProjectStatusBadge, ToneBadge } from "@/components/app/badges";
import { ContactLinks } from "@/components/app/contact-links";
import { EmptyState } from "@/components/app/empty-state";
import { Money } from "@/components/app/money";
import { NoAccess, NotFoundPanel } from "@/components/app/no-access";
import { PageHeader, Section } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/skeletons";
import { StatTile } from "@/components/app/stat-tile";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DeleteClientButton } from "@/features/clients/delete-client-button";
import { formatDate } from "@/lib/dates";
import { PAYMENT_METHOD } from "@/lib/labels";
import { formatINRShort } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";
import { getClient } from "@/server/services/clients";

export const metadata: Metadata = { title: "Client" };

export default function ClientPage(props: PageProps<"/clients/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton tiles={4} />}>
      <ClientDetail params={props.params} />
    </Suspense>
  );
}

async function ClientDetail({ params }: { params: PageProps<"/clients/[id]">["params"] }) {
  const { id } = await params;
  const user = await requireUser();
  if (!can(user, "clients.view")) return <NoAccess />;
  const client = await getClient(user, id);
  if (!client) return <NotFoundPanel what="client" backHref="/clients" backLabel="Back to clients" />;

  return (
    <div className="page-enter flex flex-col gap-6">
      <PageHeader
        title={client.name}
        description={[client.code, client.city].filter(Boolean).join(" · ")}
        back={{ href: "/clients", label: "Clients" }}
        className="mb-0"
        actions={
          <>
            {can(user, "projects.create") && (
              <Button asChild size="lg">
                <Link href={`/projects/new?clientId=${client.id}`}>
                  <Plus className="size-4" /> New project
                </Link>
              </Button>
            )}
            {can(user, "clients.manage") && (
              <Button asChild variant="outline" size="lg">
                <Link href={`/clients/${client.id}/edit`}>
                  <Pencil className="size-4" /> Edit
                </Link>
              </Button>
            )}
            {user.role === "ADMIN" && client.projects.length === 0 && <DeleteClientButton clientId={client.id} name={client.name} />}
          </>
        }
      />

      {client.totals && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile label="Total contract" value={formatINRShort(client.totals.valuePaise)} sub={`${client.projects.length} project${client.projects.length === 1 ? "" : "s"}`} />
          <StatTile label="Total billed" value={formatINRShort(client.totals.billedPaise)} />
          <StatTile label="Total received" value={formatINRShort(client.totals.receivedPaise)} tone="good" />
          <StatTile label="Total pending" value={formatINRShort(client.totals.pendingPaise)} tone={client.totals.pendingPaise > 0n ? "warn" : "good"} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          <Section title="Projects">
            {client.projects.length === 0 ? (
              <EmptyState icon={Building2} title="No projects yet" description="Create a project for this client to start tracking work and payments." className="py-6" />
            ) : (
              <ul className="flex flex-col divide-y">
                {client.projects.map((p) => (
                  <li key={p.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <Link href={`/projects/${p.id}`} className="font-medium hover:underline">
                        {p.name}
                      </Link>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{p.code}</span>
                        {p.city && <span>{p.city}</span>}
                        <ProjectStatusBadge status={p.status} />
                        {p.archivedAt && <ToneBadge tone="grey">Archived</ToneBadge>}
                      </div>
                    </div>
                    {p.money && (
                      <dl className="grid grid-cols-3 gap-4 text-right text-xs">
                        <div>
                          <dt className="text-muted-foreground">Value</dt>
                          <dd className="text-sm font-medium"><Money paise={p.money.projectValuePaise} short /></dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Received</dt>
                          <dd className="text-sm font-medium"><Money paise={p.money.receivedPaise} short /></dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Pending</dt>
                          <dd className="text-sm font-medium"><Money paise={p.money.pendingFromClientPaise} short /></dd>
                        </div>
                      </dl>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {client.totals && (
            <Section title="Payment history" description="Money received from this client. Recording payments is added in Stage 3.">
              {client.payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead className="hidden sm:table-cell">Project</TableHead>
                      <TableHead className="hidden md:table-cell">Method</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {client.payments.map((p) => (
                      <TableRow key={p.id} className={p.reversalOfId ? "text-muted-foreground" : undefined}>
                        <TableCell className="text-sm whitespace-nowrap">
                          {formatDate(p.date)}
                          <div className="text-xs text-muted-foreground">
                            {p.receiptNumber}
                            {p.milestone && ` · ${p.milestone}`}
                            {p.reversalOfId && " · reversal"}
                          </div>
                        </TableCell>
                        <TableCell className="hidden text-sm sm:table-cell">{p.project.name}</TableCell>
                        <TableCell className="hidden text-sm md:table-cell">
                          {PAYMENT_METHOD[p.method]}
                          {p.reference && <div className="text-xs text-muted-foreground">Ref: {p.reference}</div>}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          <Money paise={p.amountPaise} colorNegative />
                          {p.tdsDeductedPaise !== 0n && (
                            <div className="text-xs font-normal text-muted-foreground">
                              + TDS <Money paise={p.tdsDeductedPaise} />
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Section>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Section title="Contact">
            <dl className="flex flex-col gap-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Phone</dt>
                <dd><ContactLinks phone={client.phone} /></dd>
              </div>
              {client.altPhone && (
                <div>
                  <dt className="text-muted-foreground">Other phone</dt>
                  <dd><ContactLinks phone={client.altPhone} /></dd>
                </div>
              )}
              {client.email && (
                <div>
                  <dt className="text-muted-foreground">Email</dt>
                  <dd><a href={`mailto:${client.email}`} className="hover:underline">{client.email}</a></dd>
                </div>
              )}
              {client.address && (
                <div>
                  <dt className="text-muted-foreground">Address</dt>
                  <dd className="whitespace-pre-line">{client.address}</dd>
                </div>
              )}
              {(client.gstin || client.pan) && (
                <div className="grid grid-cols-2 gap-2 border-t pt-3">
                  <div>
                    <dt className="text-muted-foreground">GSTIN</dt>
                    <dd className="font-mono text-xs">{client.gstin ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">PAN</dt>
                    <dd className="font-mono text-xs">{client.pan ?? "—"}</dd>
                  </div>
                </div>
              )}
            </dl>
          </Section>
          {client.notes && (
            <Section title="Notes">
              <p className="text-sm whitespace-pre-line">{client.notes}</p>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}
