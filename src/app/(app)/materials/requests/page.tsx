import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Check, ClipboardList, Plus, ShoppingCart, X } from "lucide-react";
import { PriorityBadge, ToneBadge } from "@/components/app/badges";
import { ConfirmAction } from "@/components/app/confirm-action";
import { EmptyState } from "@/components/app/empty-state";
import { FilterBar, param } from "@/components/app/filter-bar";
import { PageHeader } from "@/components/app/page-header";
import { Cell2, SimpleTable } from "@/components/app/simple-table";
import { PageSkeleton } from "@/components/app/skeletons";
import { Button } from "@/components/ui/button";
import { cancelMaterialRequestAction, decideMaterialRequestAction } from "@/features/materials/actions";
import { MaterialsTabs } from "@/features/materials/nav";
import type { MaterialRequestStatus } from "@/generated/prisma/enums";
import { describeDue, formatDate } from "@/lib/dates";
import { REQUEST_STATUS } from "@/lib/labels";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";
import { listMaterialRequests } from "@/server/services/material-requests";
import { projectOptions } from "@/server/services/projects";

export const metadata: Metadata = { title: "Material requests" };

export default function RequestsPage(props: PageProps<"/materials/requests">) {
  return (
    <Suspense fallback={<PageSkeleton tiles={0} />}>
      <Requests searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Requests({ searchParams }: { searchParams: PageProps<"/materials/requests">["searchParams"] }) {
  const user = await requireUser();
  const sp = await searchParams;
  const status = param(sp, "status") as MaterialRequestStatus | undefined;
  const [rows, projects, pending] = await Promise.all([
    listMaterialRequests(user, { status: status && status in REQUEST_STATUS ? status : undefined, projectId: param(sp, "project") }),
    projectOptions(user),
    listMaterialRequests(user, { status: "PENDING" }),
  ]);
  const canDecide = can(user, "purchases.record");
  return (
    <div className="page-enter">
      <PageHeader
        title="Material requests"
        description="Sites ask for material here; the owner approves and turns the request into a purchase."
        actions={
          can(user, "materials.record") && (
            <Button asChild size="lg">
              <Link href="/materials/requests/new">
                <Plus className="size-4" /> Request material
              </Link>
            </Button>
          )
        }
      />
      <MaterialsTabs requestsPending={pending.length} />
      <FilterBar
        action="/materials/requests"
        values={sp}
        fields={[
          { type: "select", name: "status", label: "Status", options: Object.entries(REQUEST_STATUS).map(([value, s]) => ({ value, label: s.label })) },
          { type: "select", name: "project", label: "Project", options: projects.map((p) => ({ value: p.id, label: p.name })) },
        ]}
      />
      {rows.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No material requests" description="When a site needs material, raise a request so the office can approve and order it." />
      ) : (
        <SimpleTable
          rows={rows}
          rowKey={(r) => r.id}
          columns={[
            { header: "Request", cell: (r) => <Cell2 main={r.number} sub={`${formatDate(r.requestedOn)} · ${r.requestedBy.name}`} /> },
            { header: "Project", hide: "md", cell: (r) => <Link href={`/projects/${r.projectId}`} className="hover:underline">{r.project.name}</Link> },
            { header: "Materials", cell: (r) => <Cell2 main={r.itemsText} sub={r.notes ?? undefined} /> },
            {
              header: "Needed by",
              hide: "lg",
              cell: (r) => (r.neededBy ? <Cell2 main={formatDate(r.neededBy)} sub={r.status === "PENDING" || r.status === "APPROVED" ? describeDue(r.neededBy) : undefined} /> : "—"),
            },
            { header: "Priority", hide: "lg", cell: (r) => <PriorityBadge priority={r.priority} /> },
            {
              header: "Status",
              cell: (r) => (
                <div className="flex flex-col items-start gap-1">
                  <ToneBadge tone={REQUEST_STATUS[r.status].tone}>{REQUEST_STATUS[r.status].label}</ToneBadge>
                  {r.decisionNote && <span className="text-xs text-muted-foreground">{r.decisionNote}</span>}
                  {r.purchases.map((p) => (
                    <Link key={p.id} href={`/materials/purchases/${p.id}`} className="text-xs hover:underline">
                      {p.number}
                    </Link>
                  ))}
                </div>
              ),
            },
            {
              header: "",
              align: "right",
              cell: (r) => (
                <div className="flex flex-wrap justify-end gap-1">
                  {r.status === "PENDING" && canDecide && (
                    <>
                      <ConfirmAction
                        trigger={
                          <Button size="sm">
                            <Check className="size-4" /> Approve
                          </Button>
                        }
                        title={`Approve ${r.number}?`}
                        description={`${r.itemsText} for ${r.project.name}.`}
                        confirmLabel="Approve"
                        reason={{ label: "Note (optional)" }}
                        action={decideMaterialRequestAction.bind(null, r.id, true)}
                      />
                      <ConfirmAction
                        trigger={
                          <Button size="sm" variant="ghost">
                            <X className="size-4" /> Reject
                          </Button>
                        }
                        title={`Reject ${r.number}?`}
                        description="The site will see your reason."
                        confirmLabel="Reject"
                        destructive
                        reason={{ label: "Reason", required: true }}
                        action={decideMaterialRequestAction.bind(null, r.id, false)}
                      />
                    </>
                  )}
                  {r.status === "APPROVED" && can(user, "purchases.record") && (
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/materials/purchases/new?request=${r.id}`}>
                        <ShoppingCart className="size-4" /> Create purchase
                      </Link>
                    </Button>
                  )}
                  {(r.status === "PENDING" || r.status === "APPROVED") && (r.requestedById === user.id || canDecide) && (
                    <ConfirmAction
                      trigger={
                        <Button size="sm" variant="ghost" className="text-muted-foreground">
                          Cancel
                        </Button>
                      }
                      title={`Cancel request ${r.number}?`}
                      description="It will no longer be ordered."
                      confirmLabel="Cancel request"
                      destructive
                      action={cancelMaterialRequestAction.bind(null, r.id)}
                    />
                  )}
                </div>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}
