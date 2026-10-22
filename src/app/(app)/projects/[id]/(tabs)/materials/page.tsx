import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardPlus, ShoppingCart } from "lucide-react";
import { ToneBadge } from "@/components/app/badges";
import { Money } from "@/components/app/money";
import { Section } from "@/components/app/page-header";
import { Cell2, SimpleTable } from "@/components/app/simple-table";
import { TableSkeleton } from "@/components/app/skeletons";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/dates";
import { formatQuantity } from "@/lib/format";
import { DELIVERY_STATUS, REQUEST_STATUS, STOCK_STATUS } from "@/lib/labels";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";
import { listMaterialRequests } from "@/server/services/material-requests";
import { getProject } from "@/server/services/projects";
import { listPurchases } from "@/server/services/purchases";
import { stockLevels } from "@/server/services/stock";

export const metadata: Metadata = { title: "Project materials" };

export default function ProjectMaterialsPage(props: PageProps<"/projects/[id]/materials">) {
  return (
    <Suspense fallback={<TableSkeleton rows={10} />}>
      <ProjectMaterials params={props.params} />
    </Suspense>
  );
}

async function ProjectMaterials({ params }: { params: PageProps<"/projects/[id]/materials">["params"] }) {
  const { id } = await params;
  const user = await requireUser();
  const project = await getProject(user, id);
  if (!project) return null;
  const showMoney = can(user, "purchases.record") || can(user, "projects.viewMoney");
  const [stock, purchases, requests] = await Promise.all([
    stockLevels([id]),
    listPurchases(user, { location: id }),
    listMaterialRequests(user, { projectId: id }),
  ]);
  const low = stock.filter((s) => s.status !== "AVAILABLE");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2">
        {can(user, "materials.record") && (
          <Button asChild variant="outline" size="lg">
            <Link href={`/materials/requests/new?project=${id}`}>
              <ClipboardPlus className="size-4" /> Ask for material
            </Link>
          </Button>
        )}
        {can(user, "purchases.record") && (
          <Button asChild variant="outline" size="lg">
            <Link href={`/materials/purchases/new?location=${id}`}>
              <ShoppingCart className="size-4" /> Record purchase
            </Link>
          </Button>
        )}
      </div>

      <Section title="Stock at this site" description={low.length ? `${low.length} running low or out` : "Everything in stock."}>
        {stock.length === 0 ? (
          <p className="text-sm text-muted-foreground">No material has come to this site yet.</p>
        ) : (
          <SimpleTable
            rows={stock}
            rowKey={(s) => s.materialId}
            rowClassName={(s) => (s.status === "OUT_OF_STOCK" ? "bg-red-50/60" : s.status === "LOW_STOCK" ? "bg-amber-50/60" : undefined)}
            columns={[
              { header: "Material", cell: (s) => <Cell2 main={<Link href={`/materials/${s.materialId}`} className="hover:underline">{s.materialName}</Link>} sub={s.category} /> },
              { header: "Received", align: "right", hide: "md", cell: (s) => formatQuantity(s.purchased, s.unit) },
              { header: "Used", align: "right", hide: "sm", cell: (s) => formatQuantity(s.used, s.unit) },
              { header: "Left", align: "right", cell: (s) => <span className="font-medium">{formatQuantity(s.remaining, s.unit)}</span> },
              { header: "Status", cell: (s) => <ToneBadge tone={STOCK_STATUS[s.status].tone}>{STOCK_STATUS[s.status].label}</ToneBadge> },
              ...(showMoney ? [{ header: "Value", align: "right" as const, hide: "lg" as const, cell: (s: (typeof stock)[number]) => <Money paise={s.valuePaise} wholeRupees /> }] : []),
            ]}
          />
        )}
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section
          title="Material requests"
          actions={
            <Button asChild variant="ghost" size="sm">
              <Link href={`/materials/requests?project=${id}`}>All</Link>
            </Button>
          }
        >
          {requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">No requests from this site.</p>
          ) : (
            <SimpleTable
              rows={requests.slice(0, 8)}
              rowKey={(r) => r.id}
              columns={[
                { header: "Request", cell: (r) => <Cell2 main={r.number} sub={formatDate(r.requestedOn)} /> },
                { header: "Items", cell: (r) => <span className="line-clamp-2 text-sm">{r.itemsText}</span> },
                { header: "Status", cell: (r) => <ToneBadge tone={REQUEST_STATUS[r.status].tone}>{REQUEST_STATUS[r.status].label}</ToneBadge> },
              ]}
            />
          )}
        </Section>
        <Section
          title="Purchases for this site"
          actions={
            <Button asChild variant="ghost" size="sm">
              <Link href={`/materials/purchases?location=${id}&period=all`}>All</Link>
            </Button>
          }
        >
          {purchases.length === 0 ? (
            <p className="text-sm text-muted-foreground">No purchases yet.</p>
          ) : (
            <SimpleTable
              rows={purchases.slice(0, 8)}
              rowKey={(p) => p.id}
              columns={[
                { header: "Bill", cell: (p) => <Cell2 main={<Link href={`/materials/purchases/${p.id}`} className="hover:underline">{p.number}</Link>} sub={`${formatDate(p.date)} · ${p.supplier.name}`} /> },
                { header: "Delivery", hide: "sm", cell: (p) => <ToneBadge tone={DELIVERY_STATUS[p.deliveryStatus].tone}>{DELIVERY_STATUS[p.deliveryStatus].label}</ToneBadge> },
                ...(showMoney ? [{ header: "Total", align: "right" as const, cell: (p: (typeof purchases)[number]) => <Money paise={p.totalPaise} wholeRupees /> }] : []),
              ]}
            />
          )}
        </Section>
      </div>
    </div>
  );
}
