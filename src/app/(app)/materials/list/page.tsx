import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Boxes } from "lucide-react";
import { ToneBadge } from "@/components/app/badges";
import { EmptyState } from "@/components/app/empty-state";
import { FilterBar, param } from "@/components/app/filter-bar";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { Cell2, SimpleTable } from "@/components/app/simple-table";
import { PageSkeleton } from "@/components/app/skeletons";
import { AddCategoryDialog, AddMaterialDialog } from "@/features/materials/material-forms";
import { MaterialsTabs } from "@/features/materials/nav";
import { formatQuantity } from "@/lib/format";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";
import { listMaterials, materialCategories } from "@/server/services/materials";

export const metadata: Metadata = { title: "Materials" };

export default function MaterialsListPage(props: PageProps<"/materials/list">) {
  return (
    <Suspense fallback={<PageSkeleton tiles={0} />}>
      <MaterialsList searchParams={props.searchParams} />
    </Suspense>
  );
}

async function MaterialsList({ searchParams }: { searchParams: PageProps<"/materials/list">["searchParams"] }) {
  const user = await requireUser();
  const sp = await searchParams;
  const [materials, categories] = await Promise.all([
    listMaterials({ q: param(sp, "q"), categoryId: param(sp, "category") }),
    materialCategories(),
  ]);
  const catOptions = categories.map((c) => ({ value: c.id, label: c.name }));
  const showMoney = can(user, "projects.viewMoney") || can(user, "purchases.record");
  return (
    <div className="page-enter">
      <PageHeader
        title="Materials"
        description="Every material you buy, with its unit and reorder level."
        actions={
          can(user, "materials.manage") && (
            <>
              <AddMaterialDialog categories={catOptions} />
              <AddCategoryDialog />
            </>
          )
        }
      />
      <MaterialsTabs />
      <FilterBar
        action="/materials/list"
        values={sp}
        fields={[
          { type: "search", placeholder: "Material name…" },
          { type: "select", name: "category", label: "Category", options: catOptions },
        ]}
      />
      {materials.length === 0 ? (
        <EmptyState icon={Boxes} title="No materials yet" description="Add the materials you buy — cement, steel, sand, bricks…" />
      ) : (
        <SimpleTable
          rows={materials}
          rowKey={(m) => m.id}
          columns={[
            { header: "Material", cell: (m) => <Cell2 main={<Link href={`/materials/${m.id}`} className="hover:underline">{m.name}</Link>} sub={`${m.code} · ${m.category}`} /> },
            { header: "Unit", cell: (m) => m.unit, hide: "sm" },
            { header: "Total in stock", align: "right", cell: (m) => <span className="tabular font-medium">{formatQuantity(m.totalStock, m.unit)}</span> },
            {
              header: "Alerts",
              hide: "md",
              cell: (m) => (m.lowAt > 0 ? <ToneBadge tone="amber">Low at {m.lowAt} place{m.lowAt === 1 ? "" : "s"}</ToneBadge> : <span className="text-xs text-muted-foreground">—</span>),
            },
            { header: "Reorder level", align: "right", hide: "lg", cell: (m) => (Number(m.reorderLevel) > 0 ? formatQuantity(m.reorderLevel, m.unit) : "—") },
            ...(showMoney
              ? [
                  { header: "Usual rate", align: "right" as const, hide: "lg" as const, cell: (m: (typeof materials)[number]) => <Money paise={m.defaultRatePaise} /> },
                  { header: "Stock value", align: "right" as const, hide: "md" as const, cell: (m: (typeof materials)[number]) => <Money paise={m.valuePaise} short /> },
                ]
              : []),
          ]}
        />
      )}
    </div>
  );
}
