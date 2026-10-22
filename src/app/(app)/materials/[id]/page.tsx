import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ToneBadge } from "@/components/app/badges";
import { Money } from "@/components/app/money";
import { NotFoundPanel } from "@/components/app/no-access";
import { PageHeader, Section } from "@/components/app/page-header";
import { Cell2, SimpleTable } from "@/components/app/simple-table";
import { PageSkeleton } from "@/components/app/skeletons";
import { EditMaterialDialog } from "@/features/materials/material-forms";
import { formatDate } from "@/lib/dates";
import { formatQuantity } from "@/lib/format";
import { INVENTORY_TXN, STOCK_STATUS } from "@/lib/labels";
import { paiseToInput } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";
import { getMaterial, materialCategories } from "@/server/services/materials";
import { priceComparison } from "@/server/services/suppliers";

export const metadata: Metadata = { title: "Material" };

export default function MaterialPage(props: PageProps<"/materials/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton tiles={0} />}>
      <MaterialDetail params={props.params} />
    </Suspense>
  );
}

const OUT_TYPES = new Set(["USAGE", "TRANSFER_OUT", "DAMAGE", "RETURN"]);

async function MaterialDetail({ params }: { params: PageProps<"/materials/[id]">["params"] }) {
  const { id } = await params;
  const user = await requireUser();
  const material = await getMaterial(user, id);
  if (!material) return <NotFoundPanel what="material" backHref="/materials/list" backLabel="Back to materials" />;
  const [categories, prices] = await Promise.all([materialCategories(), priceComparison(id)]);
  const showMoney = can(user, "projects.viewMoney") || can(user, "purchases.record");
  const specs = Object.entries(material.specs).filter(([, v]) => v);

  return (
    <div className="page-enter flex flex-col gap-6">
      <PageHeader
        title={material.name}
        description={`${material.code} · ${material.category.name} · measured in ${material.unit}${specs.length ? ` · ${specs.map(([, v]) => v).join(", ")}` : ""}`}
        back={{ href: "/materials/list", label: "Materials" }}
        className="mb-0"
        actions={
          can(user, "materials.manage") && (
            <EditMaterialDialog
              id={id}
              categories={categories.map((c) => ({ value: c.id, label: c.name }))}
              values={{
                name: material.name,
                categoryId: material.categoryId,
                unit: material.unit,
                reorderLevel: material.reorderLevel.toString(),
                defaultRate: material.defaultRatePaise ? paiseToInput(material.defaultRatePaise) : "",
                brand: material.specs.brand ?? "",
                grade: material.specs.grade ?? "",
                size: material.specs.size ?? "",
                colour: material.specs.colour ?? "",
                thickness: material.specs.thickness ?? "",
                finish: material.specs.finish ?? "",
                notes: material.notes ?? "",
              }}
            />
          )
        }
      />

      <Section title="Stock by place">
        {material.levels.length === 0 ? (
          <p className="text-sm text-muted-foreground">No stock recorded yet.</p>
        ) : (
          <SimpleTable
            rows={material.levels}
            rowKey={(r) => r.projectId ?? "store"}
            columns={[
              { header: "Place", cell: (r) => r.projectName },
              { header: "In stock", align: "right", cell: (r) => <span className="tabular font-semibold">{formatQuantity(r.remaining, r.unit)}</span> },
              { header: "Status", cell: (r) => <ToneBadge tone={STOCK_STATUS[r.status].tone}>{STOCK_STATUS[r.status].label}</ToneBadge> },
              { header: "Opening", align: "right", hide: "lg", cell: (r) => formatQuantity(r.opening, r.unit) },
              { header: "Received", align: "right", hide: "md", cell: (r) => formatQuantity(r.purchased, r.unit) },
              { header: "Moved (net)", align: "right", hide: "lg", cell: (r) => formatQuantity(r.transferredNet, r.unit) },
              { header: "Used", align: "right", hide: "md", cell: (r) => formatQuantity(r.used, r.unit) },
              { header: "Damaged", align: "right", hide: "xl", cell: (r) => formatQuantity(r.damaged, r.unit) },
              ...(showMoney ? [{ header: "Value", align: "right" as const, cell: (r: (typeof material.levels)[number]) => <Money paise={r.valuePaise} short /> }] : []),
            ]}
          />
        )}
      </Section>

      {showMoney && (
        <Section title="Supplier price comparison" description="What each supplier charged for this material (per unit, before GST).">
          {prices.length === 0 ? (
            <p className="text-sm text-muted-foreground">Not bought yet.</p>
          ) : (
            <SimpleTable
              rows={prices}
              rowKey={(p) => p.supplierId}
              columns={[
                { header: "Supplier", cell: (p) => <Link href={`/materials/suppliers/${p.supplierId}`} className="font-medium hover:underline">{p.supplier}</Link> },
                { header: "Last rate", align: "right", cell: (p) => <Money paise={p.lastRatePaise} /> },
                { header: "Lowest paid", align: "right", hide: "sm", cell: (p) => <Money paise={p.lowestPaise} /> },
                { header: "Last bought", hide: "md", cell: (p) => formatDate(p.lastDate) },
                { header: "Purchases", align: "right", hide: "md", cell: (p) => p.purchases },
              ]}
            />
          )}
        </Section>
      )}

      <Section title="Stock history" description="Every change to this material's stock (latest first).">
        {material.movements.length === 0 ? (
          <p className="text-sm text-muted-foreground">No changes yet.</p>
        ) : (
          <SimpleTable
            rows={material.movements}
            rowKey={(m) => m.id}
            columns={[
              { header: "Date", cell: (m) => formatDate(m.date) },
              { header: "What", cell: (m) => <Cell2 main={INVENTORY_TXN[m.type]} sub={[m.workItem, m.notes].filter(Boolean).join(" · ") || undefined} /> },
              { header: "Place", hide: "sm", cell: (m) => m.place },
              {
                header: "Quantity",
                align: "right",
                cell: (m) => (
                  <span className={`tabular font-medium ${OUT_TYPES.has(m.type) ? "text-red-700" : "text-emerald-700"}`}>
                    {OUT_TYPES.has(m.type) ? "−" : m.type === "ADJUSTMENT" && m.quantity.startsWith("-") ? "" : "+"}
                    {formatQuantity(m.quantity, material.unit)}
                  </span>
                ),
              },
              { header: "By", hide: "md", cell: (m) => m.by },
            ]}
          />
        )}
      </Section>
    </div>
  );
}
