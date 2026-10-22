import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { EyeOff, Pencil, RotateCcw } from "lucide-react";
import { ToneBadge } from "@/components/app/badges";
import { ConfirmAction } from "@/components/app/confirm-action";
import { ContactLinks } from "@/components/app/contact-links";
import { Money } from "@/components/app/money";
import { NotFoundPanel } from "@/components/app/no-access";
import { PageHeader, Section } from "@/components/app/page-header";
import { Cell2, SimpleTable } from "@/components/app/simple-table";
import { PageSkeleton } from "@/components/app/skeletons";
import { StatTile } from "@/components/app/stat-tile";
import { Button } from "@/components/ui/button";
import { Attachments } from "@/features/documents/attachments";
import { setSupplierActiveAction } from "@/features/materials/actions";
import { PaySupplierDialog } from "@/features/materials/purchase-widgets";
import { formatDate } from "@/lib/dates";
import { DELIVERY_STATUS, PAY_STATUS, PAYMENT_METHOD, SUPPLIER_CATEGORY } from "@/lib/labels";
import { formatINR, paiseToInput } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";
import { accountOptions } from "@/server/services/ledger";
import { getSupplier } from "@/server/services/suppliers";

export const metadata: Metadata = { title: "Supplier" };

export default function SupplierPage(props: PageProps<"/materials/suppliers/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton tiles={3} />}>
      <SupplierDetail params={props.params} />
    </Suspense>
  );
}

async function SupplierDetail({ params }: { params: PageProps<"/materials/suppliers/[id]">["params"] }) {
  const { id } = await params;
  const user = await requireUser();
  const s = await getSupplier(id);
  if (!s) return <NotFoundPanel what="supplier" backHref="/materials/suppliers" backLabel="Back to suppliers" />;
  const showMoney = can(user, "purchases.record") || can(user, "projects.viewMoney");
  const canPay = can(user, "payments.record");
  const accounts = canPay ? await accountOptions(user) : [];
  const unpaid = s.purchases.filter((p) => !p.cancelled && p.status !== "PAID");

  return (
    <div className="page-enter flex flex-col gap-6">
      <PageHeader
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            {s.name}
            {!s.isActive && <ToneBadge tone="grey">Not used any more</ToneBadge>}
          </span>
        }
        description={[s.code, s.categories.map((c) => SUPPLIER_CATEGORY[c]).join(" · "), s.city].filter(Boolean).join(" · ")}
        back={{ href: "/materials/suppliers", label: "Suppliers" }}
        className="mb-0"
        actions={
          <>
            {showMoney && canPay && (
              <PaySupplierDialog
                supplierId={id}
                supplierName={s.name}
                accounts={accounts}
                purchases={unpaid.map((p) => ({ value: p.id, label: `${p.number} · ${formatDate(p.date)} · ${formatINR(p.totalPaise - p.paidPaise, { paise: false })} due` }))}
                defaultAmount={s.balance.outstandingPaise > 0n ? paiseToInput(s.balance.outstandingPaise) : undefined}
              />
            )}
            {can(user, "materials.manage") && (
              <>
                <Button asChild variant="outline" size="lg">
                  <Link href={`/materials/suppliers/${id}/edit`}>
                    <Pencil className="size-4" /> Edit
                  </Link>
                </Button>
                <ConfirmAction
                  trigger={
                    <Button variant="ghost" size="lg">
                      {s.isActive ? <EyeOff className="size-4" /> : <RotateCcw className="size-4" />} {s.isActive ? "Stop using" : "Use again"}
                    </Button>
                  }
                  title={s.isActive ? `Stop using ${s.name}?` : `Use ${s.name} again?`}
                  description={s.isActive ? "They are hidden from supplier lists. Their purchases and payments stay." : "They appear in supplier lists again."}
                  confirmLabel="Confirm"
                  action={setSupplierActiveAction.bind(null, id, !s.isActive)}
                />
              </>
            )}
          </>
        }
      />

      {showMoney && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile label="Bought from them" value={<Money paise={s.balance.boughtPaise} short />} />
          <StatTile label="Paid" value={<Money paise={s.balance.paidPaise} short />} tone="good" />
          <StatTile label="We owe" value={<Money paise={s.balance.outstandingPaise > 0n ? s.balance.outstandingPaise : 0n} short />} tone={s.balance.outstandingPaise > 0n ? "warn" : "good"} />
          <StatTile label="Last purchase" value={formatDate(s.balance.lastPurchase)} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          <Section title="Purchases">
            {s.purchases.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing bought yet.</p>
            ) : (
              <SimpleTable
                rows={s.purchases}
                rowKey={(p) => p.id}
                columns={[
                  { header: "Bill", cell: (p) => <Cell2 main={<Link href={`/materials/purchases/${p.id}`} className="hover:underline">{p.number}</Link>} sub={formatDate(p.date)} /> },
                  { header: "Site", hide: "sm", cell: (p) => p.project?.name ?? "Main store" },
                  { header: "Delivery", hide: "md", cell: (p) => <ToneBadge tone={DELIVERY_STATUS[p.cancelled ? "CANCELLED" : p.deliveryStatus].tone}>{DELIVERY_STATUS[p.cancelled ? "CANCELLED" : p.deliveryStatus].label}</ToneBadge> },
                  ...(showMoney
                    ? [
                        { header: "Total", align: "right" as const, cell: (p: (typeof s.purchases)[number]) => <Money paise={p.totalPaise} wholeRupees /> },
                        { header: "Paid?", cell: (p: (typeof s.purchases)[number]) => (p.cancelled ? "—" : <ToneBadge tone={PAY_STATUS[p.status].tone}>{PAY_STATUS[p.status].label}</ToneBadge>) },
                      ]
                    : []),
                ]}
              />
            )}
          </Section>
          {showMoney && (
            <Section title="Payments made">
              {s.payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No payments yet.</p>
              ) : (
                <SimpleTable
                  rows={s.payments}
                  rowKey={(p) => p.id}
                  columns={[
                    { header: "Date", cell: (p) => <Cell2 main={formatDate(p.date)} sub={p.number} /> },
                    { header: "For bill", hide: "sm", cell: (p) => p.purchase?.number ?? "General" },
                    { header: "How", hide: "md", cell: (p) => <Cell2 main={PAYMENT_METHOD[p.method]} sub={p.account.name} /> },
                    { header: "Amount", align: "right", cell: (p) => <Money paise={p.amountPaise} colorNegative /> },
                  ]}
                />
              )}
            </Section>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <Section title="Contact">
            <dl className="flex flex-col gap-3 text-sm">
              {s.contactPerson && <Item label="Contact person" value={s.contactPerson} />}
              <Item label="Phone" value={<ContactLinks phone={s.phone} />} />
              {s.altPhone && <Item label="Other phone" value={<ContactLinks phone={s.altPhone} />} />}
              {s.email && <Item label="Email" value={s.email} />}
              {s.address && <Item label="Address" value={`${s.address}${s.city ? `, ${s.city}` : ""}`} />}
              {s.paymentTerms && <Item label="Payment terms" value={`${s.paymentTerms}${s.creditDays ? ` (${s.creditDays} days)` : ""}`} />}
              {s.materialsSupplied && <Item label="Supplies" value={s.materialsSupplied} />}
              {s.priceRangeNote && <Item label="Typical prices" value={s.priceRangeNote} />}
              {(s.gstin || s.pan) && <Item label="GSTIN / PAN" value={`${s.gstin ?? "—"} / ${s.pan ?? "—"}`} />}
            </dl>
          </Section>
          {showMoney && s.prices.length > 0 && (
            <Section title="Their latest rates">
              <ul className="flex flex-col gap-1.5 text-sm">
                {s.prices.map((p) => (
                  <li key={p.materialId} className="flex justify-between gap-2">
                    <Link href={`/materials/${p.materialId}`} className="truncate hover:underline">{p.material}</Link>
                    <span className="tabular shrink-0">
                      <Money paise={p.ratePaise} /> / {p.unit}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {s.projects.length > 0 && (
            <Section title="Supplies to projects">
              <ul className="flex flex-col gap-1 text-sm">
                {s.projects.map((sp) => (
                  <li key={sp.projectId}>
                    <Link href={`/projects/${sp.projectId}`} className="hover:underline">{sp.project.name}</Link>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          <Attachments entityType="SUPPLIER" entityId={id} title="Documents" camera={false} />
        </div>
      </div>
    </div>
  );
}

function Item({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
