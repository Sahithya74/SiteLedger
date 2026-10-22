import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Package, ShoppingCart } from "lucide-react";
import { ToneBadge } from "@/components/app/badges";
import { EmptyState } from "@/components/app/empty-state";
import { FilterBar, param } from "@/components/app/filter-bar";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { Cell2, SimpleTable } from "@/components/app/simple-table";
import { PageSkeleton } from "@/components/app/skeletons";
import { StatTile } from "@/components/app/stat-tile";
import { Button } from "@/components/ui/button";
import { MaterialsTabs } from "@/features/materials/nav";
import { OtherStockChangeDialog, RecordUsageDialog, TransferDialog } from "@/features/materials/stock-dialogs";
import { formatQuantity } from "@/lib/format";
import { STOCK_STATUS } from "@/lib/labels";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";
import { inventory, materialCategories, materialOptions, stockLocations } from "@/server/services/materials";

export const metadata: Metadata = { title: "Material stock" };

export default function StockPage(props: PageProps<"/materials">) {
  return (
    <Suspense fallback={<PageSkeleton tiles={3} rows={10} />}>
      <Stock searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Stock({ searchParams }: { searchParams: PageProps<"/materials">["searchParams"] }) {
  const user = await requireUser();
  const sp = await searchParams;
  const status = param(sp, "status");
  const [rows, all, locations, materials, categories] = await Promise.all([
    inventory(user, {
      location: param(sp, "location"),
      status: status === "attention" ? undefined : status,
      categoryId: param(sp, "category"),
      q: param(sp, "q"),
    }),
    inventory(user),
    stockLocations(user),
    materialOptions(),
    materialCategories(),
  ]);
  const shown = status === "attention" ? rows.filter((r) => r.status !== "AVAILABLE" && Number(r.reorderLevel) > 0) : rows;
  const showValue = can(user, "projects.viewMoney") || can(user, "purchases.record");
  const low = all.filter((r) => r.status === "LOW_STOCK" && Number(r.reorderLevel) > 0).length;
  const out = all.filter((r) => r.status === "OUT_OF_STOCK" && Number(r.reorderLevel) > 0).length;
  const value = all.reduce((s, r) => s + r.valuePaise, 0n);
  const materialOpts = materials.map((m) => ({ value: m.id, label: `${m.name} (${m.unit})` }));
  const canRecord = can(user, "materials.record");

  return (
    <div className="page-enter">
      <PageHeader
        title="Materials"
        description="What is in stock at each site and in the godown. Stock changes only through purchases, use, moves and corrections — every change is recorded."
        actions={
          canRecord && (
            <>
              <RecordUsageDialog materials={materialOpts} locations={locations} defaultLocation={param(sp, "location")} />
              <TransferDialog materials={materialOpts} locations={locations} />
              <OtherStockChangeDialog materials={materialOpts} locations={locations} defaultLocation={param(sp, "location")} />
              {can(user, "purchases.record") && (
                <Button asChild variant="outline" size="lg">
                  <Link href="/materials/purchases/new">
                    <ShoppingCart className="size-4" /> New purchase
                  </Link>
                </Button>
              )}
            </>
          )
        }
      />
      <MaterialsTabs />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Stock lines" value={all.length} sub="material × place" />
        <StatTile label="Low stock" value={low} tone={low ? "warn" : "good"} href="/materials?status=LOW_STOCK" />
        <StatTile label="Run out" value={out} tone={out ? "bad" : "good"} href="/materials?status=OUT_OF_STOCK" />
        {showValue && <StatTile label="Stock value" value={<Money paise={value} short />} sub="at average purchase rate" />}
      </div>

      <FilterBar
        action="/materials"
        values={sp}
        fields={[
          { type: "search", placeholder: "Material or site…" },
          { type: "select", name: "location", label: "Place", options: locations, allLabel: "All places" },
          {
            type: "select",
            name: "status",
            label: "Status",
            options: [
              { value: "attention", label: "Low or run out" },
              ...Object.entries(STOCK_STATUS).map(([value, s]) => ({ value, label: s.label })),
            ],
          },
          { type: "select", name: "category", label: "Category", options: categories.map((c) => ({ value: c.id, label: c.name })) },
        ]}
      />

      {shown.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No stock to show"
          description="Stock appears here when a purchase is received, or when you enter opening stock with “Other change”."
        />
      ) : (
        <SimpleTable
          rows={shown}
          rowKey={(r) => `${r.materialId}-${r.projectId ?? "store"}`}
          rowClassName={(r) => (r.status === "OUT_OF_STOCK" && Number(r.reorderLevel) > 0 ? "bg-red-50/60" : undefined)}
          columns={[
            {
              header: "Material",
              cell: (r) => <Cell2 main={<Link href={`/materials/${r.materialId}`} className="hover:underline">{r.materialName}</Link>} sub={r.category} />,
            },
            { header: "Place", cell: (r) => r.projectName, hide: "md" },
            { header: "In stock", align: "right", cell: (r) => <span className="tabular font-semibold">{formatQuantity(r.remaining, r.unit)}</span> },
            {
              header: "Status",
              cell: (r) =>
                Number(r.reorderLevel) > 0 || r.status === "OUT_OF_STOCK" ? (
                  <ToneBadge tone={STOCK_STATUS[r.status].tone}>{STOCK_STATUS[r.status].label}</ToneBadge>
                ) : (
                  <span className="text-xs text-muted-foreground">No reorder level</span>
                ),
            },
            { header: "Reorder at", align: "right", hide: "lg", cell: (r) => (Number(r.reorderLevel) > 0 ? formatQuantity(r.reorderLevel, r.unit) : "—") },
            { header: "Received", align: "right", hide: "xl", cell: (r) => formatQuantity(r.purchased, r.unit) },
            { header: "Used", align: "right", hide: "xl", cell: (r) => formatQuantity(r.used, r.unit) },
            ...(showValue ? [{ header: "Value", align: "right" as const, hide: "lg" as const, cell: (r: (typeof shown)[number]) => <Money paise={r.valuePaise} short /> }] : []),
          ]}
        />
      )}
    </div>
  );
}
