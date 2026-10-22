import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Store } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { FilterBar, param } from "@/components/app/filter-bar";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { Cell2, SimpleTable } from "@/components/app/simple-table";
import { PageSkeleton } from "@/components/app/skeletons";
import { Button } from "@/components/ui/button";
import { MaterialsTabs } from "@/features/materials/nav";
import type { SupplierCategory } from "@/generated/prisma/enums";
import { formatPhone } from "@/lib/contact";
import { formatDate } from "@/lib/dates";
import { SUPPLIER_CATEGORY } from "@/lib/labels";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";
import { listSuppliers } from "@/server/services/suppliers";

export const metadata: Metadata = { title: "Suppliers" };

export default function SuppliersPage(props: PageProps<"/materials/suppliers">) {
  return (
    <Suspense fallback={<PageSkeleton tiles={0} />}>
      <Suppliers searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Suppliers({ searchParams }: { searchParams: PageProps<"/materials/suppliers">["searchParams"] }) {
  const user = await requireUser();
  const sp = await searchParams;
  const category = param(sp, "category") as SupplierCategory | undefined;
  const suppliers = await listSuppliers({ q: param(sp, "q"), category: category && category in SUPPLIER_CATEGORY ? category : undefined, showInactive: param(sp, "all") === "1" });
  const showMoney = can(user, "purchases.record") || can(user, "projects.viewMoney");
  return (
    <div className="page-enter">
      <PageHeader
        title="Suppliers & shops"
        description="Where you buy materials and hire transport — with what you owe each one."
        actions={
          can(user, "materials.manage") && (
            <Button asChild size="lg">
              <Link href="/materials/suppliers/new">
                <Plus className="size-4" /> Add supplier
              </Link>
            </Button>
          )
        }
      />
      <MaterialsTabs />
      <FilterBar
        action="/materials/suppliers"
        values={sp}
        fields={[
          { type: "search", placeholder: "Name, city, phone, material…" },
          { type: "select", name: "category", label: "Supplies", options: Object.entries(SUPPLIER_CATEGORY).map(([value, label]) => ({ value, label })) },
          { type: "checkbox", name: "all", label: "Include suppliers no longer used" },
        ]}
      />
      {suppliers.length === 0 ? (
        <EmptyState icon={Store} title="No suppliers found" description="Add the shops and dealers you buy from. With an address on the map they appear as 'nearby' on project maps." />
      ) : (
        <SimpleTable
          rows={suppliers}
          rowKey={(s) => s.id}
          rowClassName={(s) => (s.isActive ? undefined : "text-muted-foreground")}
          columns={[
            {
              header: "Supplier",
              cell: (s) => (
                <Cell2
                  main={<Link href={`/materials/suppliers/${s.id}`} className="hover:underline">{s.name}</Link>}
                  sub={s.categories.map((c) => SUPPLIER_CATEGORY[c]).join(" · ") || "—"}
                />
              ),
            },
            { header: "Phone", hide: "sm", cell: (s) => <Cell2 main={formatPhone(s.phone)} sub={s.contactPerson ?? undefined} /> },
            { header: "City", hide: "md", cell: (s) => s.city ?? "—" },
            { header: "Rating", hide: "lg", cell: (s) => (s.rating ? <span className="text-amber-600">{"★".repeat(s.rating)}</span> : "—") },
            { header: "Last purchase", hide: "lg", cell: (s) => formatDate(s.lastPurchase) },
            ...(showMoney
              ? [
                  {
                    header: "We owe",
                    align: "right" as const,
                    cell: (s: (typeof suppliers)[number]) =>
                      s.outstandingPaise > 0n ? <Money paise={s.outstandingPaise} wholeRupees className="font-semibold text-amber-800" /> : <span className="text-muted-foreground">Nothing</span>,
                  },
                ]
              : []),
          ]}
        />
      )}
    </div>
  );
}
