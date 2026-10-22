import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Plus, ShoppingCart } from "lucide-react";
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
import { describeDue, formatDate } from "@/lib/dates";
import { DELIVERY_STATUS, PAY_STATUS } from "@/lib/labels";
import { sumPaise } from "@/lib/money";
import { resolvePeriod } from "@/lib/period";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";
import { stockLocations } from "@/server/services/materials";
import { listPurchases } from "@/server/services/purchases";
import { supplierOptions } from "@/server/services/suppliers";

export const metadata: Metadata = { title: "Purchases" };

export default function PurchasesPage(props: PageProps<"/materials/purchases">) {
  return (
    <Suspense fallback={<PageSkeleton tiles={3} rows={10} />}>
      <Purchases searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Purchases({ searchParams }: { searchParams: PageProps<"/materials/purchases">["searchParams"] }) {
  const user = await requireUser();
  const sp = await searchParams;
  const period = resolvePeriod(sp, "this-fy");
  const payStatus = param(sp, "pay") as "PAID" | "PARTIALLY_PAID" | "PENDING" | undefined;
  const delivery = param(sp, "delivery") as "ORDERED" | "DELIVERED" | "CANCELLED" | undefined;
  const [rows, suppliers, locations] = await Promise.all([
    listPurchases(user, { from: period.from, to: period.to, location: param(sp, "location"), supplierId: param(sp, "supplier"), payStatus, delivery }),
    supplierOptions(),
    stockLocations(user),
  ]);
  const showMoney = can(user, "purchases.record") || can(user, "projects.viewMoney");
  const live = rows.filter((r) => r.deliveryStatus !== "CANCELLED");

  return (
    <div className="page-enter">
      <PageHeader
        title="Purchases"
        description={`Material bills from suppliers · ${period.label}`}
        actions={
          can(user, "purchases.record") && (
            <Button asChild size="lg">
              <Link href="/materials/purchases/new">
                <Plus className="size-4" /> New purchase
              </Link>
            </Button>
          )
        }
      />
      <MaterialsTabs />
      {showMoney && (
        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile label="Bought" value={<Money paise={sumPaise(live.map((r) => r.totalPaise))} short />} sub={`${live.length} bills`} />
          <StatTile label="Paid" value={<Money paise={sumPaise(live.map((r) => r.paidPaise))} short />} tone="good" />
          <StatTile label="Still to pay" value={<Money paise={sumPaise(live.map((r) => r.balancePaise))} short />} tone="warn" href="/materials/purchases?pay=PENDING" />
          <StatTile label="Awaiting delivery" value={live.filter((r) => r.deliveryStatus === "ORDERED").length} href="/materials/purchases?delivery=ORDERED" />
        </div>
      )}
      <FilterBar
        action="/materials/purchases"
        values={sp}
        fields={[
          { type: "period" },
          { type: "select", name: "location", label: "Site", options: locations, allLabel: "All sites" },
          { type: "select", name: "supplier", label: "Supplier", options: suppliers.map((s) => ({ value: s.id, label: s.name })) },
          { type: "select", name: "pay", label: "Payment", options: Object.entries(PAY_STATUS).map(([value, s]) => ({ value, label: s.label })) },
          { type: "select", name: "delivery", label: "Delivery", options: Object.entries(DELIVERY_STATUS).map(([value, s]) => ({ value, label: s.label })) },
        ]}
      />
      {rows.length === 0 ? (
        <EmptyState icon={ShoppingCart} title="No purchases in this period" description="Record a purchase when material is bought — it adds stock and keeps track of what you owe the supplier." />
      ) : (
        <SimpleTable
          rows={rows}
          rowKey={(r) => r.id}
          rowClassName={(r) => (r.deliveryStatus === "CANCELLED" ? "text-muted-foreground" : undefined)}
          columns={[
            { header: "Bill", cell: (r) => <Cell2 main={<Link href={`/materials/purchases/${r.id}`} className="hover:underline">{r.number}</Link>} sub={formatDate(r.date)} /> },
            { header: "Supplier", cell: (r) => <Cell2 main={r.supplier.name} sub={r.summary} /> },
            { header: "Site", hide: "lg", cell: (r) => r.project?.name ?? "Main store" },
            { header: "Delivery", hide: "md", cell: (r) => <ToneBadge tone={DELIVERY_STATUS[r.deliveryStatus].tone}>{DELIVERY_STATUS[r.deliveryStatus].label}</ToneBadge> },
            ...(showMoney
              ? [
                  { header: "Total", align: "right" as const, cell: (r: (typeof rows)[number]) => <Money paise={r.totalPaise} wholeRupees /> },
                  {
                    header: "Payment",
                    cell: (r: (typeof rows)[number]) =>
                      r.deliveryStatus === "CANCELLED" ? (
                        "—"
                      ) : (
                        <div className="flex flex-col items-start gap-0.5">
                          <ToneBadge tone={PAY_STATUS[r.payStatus].tone}>{PAY_STATUS[r.payStatus].label}</ToneBadge>
                          {r.balancePaise > 0n && r.dueDate && <span className="text-xs text-muted-foreground">{describeDue(r.dueDate)}</span>}
                        </div>
                      ),
                  },
                ]
              : []),
          ]}
        />
      )}
    </div>
  );
}
