import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { PackageCheck, XCircle } from "lucide-react";
import { ToneBadge } from "@/components/app/badges";
import { ConfirmAction } from "@/components/app/confirm-action";
import { Money } from "@/components/app/money";
import { NotFoundPanel } from "@/components/app/no-access";
import { PageHeader, Section } from "@/components/app/page-header";
import { Cell2, SimpleTable } from "@/components/app/simple-table";
import { PageSkeleton } from "@/components/app/skeletons";
import { Button } from "@/components/ui/button";
import { Attachments } from "@/features/documents/attachments";
import { cancelPurchaseAction, receivePurchaseAction } from "@/features/materials/actions";
import { PaySupplierDialog } from "@/features/materials/purchase-widgets";
import { describeDue, formatDate } from "@/lib/dates";
import { formatQuantity } from "@/lib/format";
import { DELIVERY_STATUS, PAY_STATUS, PAYMENT_METHOD } from "@/lib/labels";
import { paiseToInput } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";
import { accountOptions } from "@/server/services/ledger";
import { getPurchase } from "@/server/services/purchases";

export const metadata: Metadata = { title: "Purchase" };

export default function PurchasePage(props: PageProps<"/materials/purchases/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton tiles={0} />}>
      <PurchaseDetail params={props.params} />
    </Suspense>
  );
}

async function PurchaseDetail({ params }: { params: PageProps<"/materials/purchases/[id]">["params"] }) {
  const { id } = await params;
  const user = await requireUser();
  const p = await getPurchase(user, id);
  if (!p) return <NotFoundPanel what="purchase" backHref="/materials/purchases" backLabel="Back to purchases" />;
  const showMoney = can(user, "purchases.record") || can(user, "projects.viewMoney");
  const accounts = can(user, "payments.record") ? await accountOptions(user) : [];
  const delivery = p.cancelledAt ? "CANCELLED" : p.deliveryStatus;

  return (
    <div className="page-enter flex flex-col gap-6">
      <PageHeader
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            Purchase {p.number}
            <ToneBadge tone={DELIVERY_STATUS[delivery].tone}>{DELIVERY_STATUS[delivery].label}</ToneBadge>
            {showMoney && !p.cancelledAt && <ToneBadge tone={PAY_STATUS[p.payStatus].tone}>{PAY_STATUS[p.payStatus].label}</ToneBadge>}
          </span>
        }
        description={`${p.supplier.name} · ${formatDate(p.purchaseDate)} · for ${p.project?.name ?? "the main store"}${p.invoiceNumber ? ` · supplier bill ${p.invoiceNumber}` : ""}`}
        back={{ href: "/materials/purchases", label: "Purchases" }}
        className="mb-0"
        actions={
          !p.cancelledAt && (
            <>
              {p.deliveryStatus !== "DELIVERED" && can(user, "materials.record") && (
                <ConfirmAction
                  trigger={
                    <Button size="lg">
                      <PackageCheck className="size-4" /> Material arrived
                    </Button>
                  }
                  title="Mark the material as received today?"
                  description={`All items are added to the stock at ${p.project?.name ?? "the main store"}.`}
                  confirmLabel="Yes, received"
                  action={receivePurchaseAction.bind(null, id)}
                />
              )}
              {showMoney && p.balancePaise > 0n && can(user, "payments.record") && (
                <PaySupplierDialog
                  supplierId={p.supplierId}
                  supplierName={p.supplier.name}
                  accounts={accounts}
                  fixedPurchaseId={id}
                  defaultAmount={paiseToInput(p.balancePaise)}
                  label="Pay this bill"
                />
              )}
              {p.deliveryStatus === "ORDERED" && p.payments.length === 0 && can(user, "purchases.record") && (
                <ConfirmAction
                  trigger={
                    <Button variant="ghost" size="lg" className="text-red-700">
                      <XCircle className="size-4" /> Cancel order
                    </Button>
                  }
                  title={`Cancel purchase ${p.number}?`}
                  description="Use this when the order will not be delivered. The record stays, marked as cancelled."
                  confirmLabel="Cancel order"
                  destructive
                  reason={{ label: "Why is it cancelled?", required: true }}
                  action={cancelPurchaseAction.bind(null, id)}
                />
              )}
            </>
          )
        }
      />
      {p.cancelledAt && <p className="rounded-lg border bg-muted/50 px-3 py-2 text-sm">Cancelled — {p.cancelReason}</p>}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          <Section title="Items">
            <SimpleTable
              rows={p.items}
              rowKey={(i) => i.id}
              columns={[
                { header: "Material", cell: (i) => <Link href={`/materials/${i.material.id}`} className="font-medium hover:underline">{i.material.name}</Link> },
                { header: "Quantity", align: "right", cell: (i) => formatQuantity(i.quantity.toString(), i.unit) },
                ...(showMoney
                  ? [
                      { header: "Rate", align: "right" as const, hide: "sm" as const, cell: (i: (typeof p.items)[number]) => <Money paise={i.ratePaise} /> },
                      { header: "GST", align: "right" as const, hide: "md" as const, cell: (i: (typeof p.items)[number]) => (Number(i.taxPercent) ? `${i.taxPercent}%` : "—") },
                      { header: "Amount", align: "right" as const, cell: (i: (typeof p.items)[number]) => <Money paise={i.amountPaise + i.taxPaise} /> },
                    ]
                  : []),
              ]}
            />
            {showMoney && (
              <dl className="mt-4 ml-auto grid max-w-xs grid-cols-2 gap-y-1 text-sm">
                <dt className="text-muted-foreground">Materials</dt>
                <dd className="text-right"><Money paise={p.subtotalPaise} /></dd>
                <dt className="text-muted-foreground">GST</dt>
                <dd className="text-right"><Money paise={p.taxPaise} /></dd>
                {p.transportPaise > 0n && (
                  <>
                    <dt className="text-muted-foreground">Transport</dt>
                    <dd className="text-right"><Money paise={p.transportPaise} /></dd>
                  </>
                )}
                {p.otherChargesPaise > 0n && (
                  <>
                    <dt className="text-muted-foreground">Other charges</dt>
                    <dd className="text-right"><Money paise={p.otherChargesPaise} /></dd>
                  </>
                )}
                {p.discountPaise > 0n && (
                  <>
                    <dt className="text-muted-foreground">Discount</dt>
                    <dd className="text-right">−<Money paise={p.discountPaise} /></dd>
                  </>
                )}
                <dt className="border-t pt-1 font-semibold">Total</dt>
                <dd className="border-t pt-1 text-right font-semibold"><Money paise={p.totalPaise} /></dd>
              </dl>
            )}
          </Section>

          {showMoney && (
            <Section title="Payments" description={p.balancePaise > 0n ? `Still to pay: ` : "Fully paid."} actions={p.balancePaise > 0n ? <Money paise={p.balancePaise} className="font-semibold text-amber-800" /> : undefined}>
              {p.payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No payments yet.</p>
              ) : (
                <SimpleTable
                  rows={p.payments}
                  rowKey={(x) => x.id}
                  columns={[
                    { header: "Date", cell: (x) => <Cell2 main={formatDate(x.date)} sub={x.number} /> },
                    { header: "How", hide: "sm", cell: (x) => <Cell2 main={PAYMENT_METHOD[x.method]} sub={x.account.name} /> },
                    { header: "Reference", hide: "md", cell: (x) => x.reference ?? "—" },
                    { header: "Amount", align: "right", cell: (x) => <Money paise={x.amountPaise} colorNegative /> },
                  ]}
                />
              )}
            </Section>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <Section title="Details">
            <dl className="flex flex-col gap-2 text-sm">
              <Row label="Supplier" value={<Link href={`/materials/suppliers/${p.supplierId}`} className="hover:underline">{p.supplier.name}</Link>} />
              <Row label="Site" value={p.project ? <Link href={`/projects/${p.project.id}`} className="hover:underline">{p.project.name}</Link> : "Main store"} />
              <Row label="Expected delivery" value={formatDate(p.expectedDelivery)} />
              <Row label="Received on" value={formatDate(p.actualDelivery)} />
              {showMoney && <Row label="Payment due" value={p.dueDate ? `${formatDate(p.dueDate)}${p.balancePaise > 0n ? ` (${describeDue(p.dueDate).toLowerCase()})` : ""}` : "—"} />}
              {p.materialRequest && <Row label="From request" value={<Link href="/materials/requests" className="hover:underline">{p.materialRequest.number}</Link>} />}
              <Row label="Recorded by" value={p.createdBy.name} />
            </dl>
            {p.notes && <p className="mt-3 border-t pt-3 text-sm whitespace-pre-line text-muted-foreground">{p.notes}</p>}
          </Section>
          <Attachments entityType="PURCHASE" entityId={id} projectId={p.projectId} title="Bill photos & documents" />
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
