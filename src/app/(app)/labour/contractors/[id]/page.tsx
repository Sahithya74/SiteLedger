import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Check, CheckCircle2, XCircle } from "lucide-react";
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
import { approveContractorBillAction, cancelContractorBillAction, setWorkOrderStatusAction } from "@/features/labour/actions";
import { ContractorBillDialog, EditContractorDialog, WorkOrderDialog } from "@/features/labour/contractor-dialogs";
import { PayPersonDialog } from "@/features/money/pay-person-dialog";
import { formatDate } from "@/lib/dates";
import { formatQuantity } from "@/lib/format";
import { LABOUR_CATEGORY, PAYMENT_METHOD, PAYMENT_PURPOSE, WORK_ORDER_TYPE } from "@/lib/labels";
import { formatINR, paiseToInput } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";
import { getContractor } from "@/server/services/contractors";
import { accountOptions } from "@/server/services/ledger";
import { projectOptions } from "@/server/services/projects";

export const metadata: Metadata = { title: "Labour contractor" };

const BILL_TONE = { DRAFT: "amber", APPROVED: "green", CANCELLED: "grey" } as const;

export default function ContractorPage(props: PageProps<"/labour/contractors/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton tiles={4} />}>
      <ContractorDetail params={props.params} />
    </Suspense>
  );
}

async function ContractorDetail({ params }: { params: PageProps<"/labour/contractors/[id]">["params"] }) {
  const { id } = await params;
  const user = await requireUser();
  const c = await getContractor(user, id);
  if (!c) return <NotFoundPanel what="contractor" backHref="/labour/contractors" backLabel="Back to contractors" />;
  const canManage = can(user, "labour.manage");
  const canPay = can(user, "payments.record");
  const showMoney = canPay || can(user, "wages.view");
  const [projects, accounts] = await Promise.all([projectOptions(user), canPay ? accountOptions(user) : Promise.resolve([])]);
  const projectOpts = projects.map((p) => ({ value: p.id, label: p.name }));
  const unpaidBills = c.bills.filter((b) => b.status === "APPROVED" && b.paidPaise < b.netPaise);

  return (
    <div className="page-enter flex flex-col gap-6">
      <PageHeader
        title={c.name}
        description={[c.code, c.trade ? LABOUR_CATEGORY[c.trade] : null, c.pan ? `PAN ${c.pan}` : null].filter(Boolean).join(" · ")}
        back={{ href: "/labour/contractors", label: "Labour contractors" }}
        className="mb-0"
        actions={
          <>
            {canManage && <ContractorBillDialog contractorId={id} projects={projectOpts} workOrders={c.workOrders.filter((w) => w.status === "OPEN").map((w) => ({ value: w.id, label: `${w.number} · ${w.title}`, projectId: w.projectId, retention: w.retentionPercent.toString(), tds: w.tdsPercent.toString(), perUnit: w.type !== "LUMP_SUM" }))} />}
            {canPay && (
              <PayPersonDialog
                payeeType="CONTRACTOR"
                personId={id}
                personName={c.name}
                purposes={["CONTRACTOR_BILL", "ADVANCE"]}
                accounts={accounts}
                projects={projectOpts}
                bills={unpaidBills.map((b) => ({ value: b.id, label: `${b.number} · ${formatINR(b.netPaise - b.paidPaise, { paise: false })} due` }))}
                defaultAmount={c.balance.owedPaise > 0n ? paiseToInput(c.balance.owedPaise) : undefined}
                label="Pay"
                variant="outline"
              />
            )}
            {canManage && <WorkOrderDialog contractorId={id} projects={projectOpts} />}
            {canManage && (
              <EditContractorDialog id={id} values={{ name: c.name, phone: c.phone ?? "", trade: c.trade ?? "", address: c.address ?? "", pan: c.pan ?? "", gstin: c.gstin ?? "", notes: c.notes ?? "" }} />
            )}
          </>
        }
      />

      {showMoney && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile label="Billed (after deductions)" value={<Money paise={c.balance.billedPaise} short />} />
          <StatTile label="Paid" value={<Money paise={c.balance.paidPaise} short />} tone="good" />
          <StatTile label={c.balance.owedPaise >= 0n ? "We owe" : "Advance with them"} value={<Money paise={c.balance.owedPaise >= 0n ? c.balance.owedPaise : -c.balance.owedPaise} short />} tone={c.balance.owedPaise > 0n ? "warn" : "default"} />
          <StatTile label="Retention held" value={<Money paise={c.balance.retentionHeldPaise} short />} sub="to release when work is done" />
        </div>
      )}

      <Section title="Work orders">
        {c.workOrders.length === 0 ? (
          <p className="text-sm text-muted-foreground">No work orders yet.</p>
        ) : (
          <SimpleTable
            rows={c.workOrders}
            rowKey={(w) => w.id}
            columns={[
              { header: "Work", cell: (w) => <Cell2 main={w.title} sub={`${w.number} · ${w.project.name}`} /> },
              {
                header: "Rate",
                hide: "md",
                cell: (w) => (w.type === "LUMP_SUM" ? <Cell2 main={<Money paise={w.lumpSumPaise} wholeRupees />} sub="Lump sum" /> : <Cell2 main={<><Money paise={w.ratePaise} /> / {w.unit ?? "unit"}</>} sub={WORK_ORDER_TYPE[w.type]} />),
              },
              { header: "Billed so far", align: "right", hide: "sm", cell: (w) => <Cell2 main={<Money paise={w.billedPaise} wholeRupees />} sub={w.type !== "LUMP_SUM" && Number(w.billedQty) ? formatQuantity(w.billedQty, w.unit ?? "unit") : undefined} /> },
              { header: "Status", cell: (w) => <ToneBadge tone={w.status === "OPEN" ? "blue" : w.status === "COMPLETED" ? "green" : "grey"}>{w.status === "OPEN" ? "Ongoing" : w.status === "COMPLETED" ? "Completed" : "Cancelled"}</ToneBadge> },
              {
                header: "",
                align: "right",
                cell: (w) =>
                  canManage && w.status === "OPEN" ? (
                    <ConfirmAction
                      trigger={<Button size="sm" variant="ghost"><CheckCircle2 className="size-4" /> Complete</Button>}
                      title={`Mark ${w.number} as completed?`}
                      description="No more bills are expected for this work order."
                      confirmLabel="Completed"
                      action={setWorkOrderStatusAction.bind(null, w.id, "COMPLETED")}
                    />
                  ) : null,
              },
            ]}
          />
        )}
      </Section>

      <Section title="Bills">
        {c.bills.length === 0 ? (
          <p className="text-sm text-muted-foreground">No bills yet.</p>
        ) : (
          <SimpleTable
            rows={c.bills}
            rowKey={(b) => b.id}
            columns={[
              { header: "Bill", cell: (b) => <Cell2 main={b.number} sub={`${formatDate(b.billDate)} · ${b.project.name}`} /> },
              { header: "For", hide: "lg", cell: (b) => b.workOrder?.title ?? "—" },
              { header: "Gross", align: "right", hide: "md", cell: (b) => <Money paise={b.grossPaise} wholeRupees /> },
              { header: "Deductions", align: "right", hide: "lg", cell: (b) => <span title="Retention + TDS + other"><Money paise={b.retentionPaise + b.tdsPaise + b.otherDeductionPaise} wholeRupees /></span> },
              { header: "Net payable", align: "right", cell: (b) => <Money paise={b.netPaise} wholeRupees /> },
              { header: "Paid", align: "right", hide: "sm", cell: (b) => <Money paise={b.paidPaise} wholeRupees /> },
              { header: "Status", cell: (b) => <ToneBadge tone={BILL_TONE[b.status]}>{b.status === "DRAFT" ? "Waiting approval" : b.status === "APPROVED" ? "Approved" : "Cancelled"}</ToneBadge> },
              {
                header: "",
                align: "right",
                cell: (b) => (
                  <div className="flex justify-end gap-1">
                    {canPay && b.status === "DRAFT" && (
                      <ConfirmAction
                        trigger={<Button size="sm"><Check className="size-4" /> Approve</Button>}
                        title={`Approve bill ${b.number}?`}
                        description={`${formatINR(b.netPaise)} becomes payable to ${c.name}.`}
                        confirmLabel="Approve"
                        action={approveContractorBillAction.bind(null, b.id)}
                      />
                    )}
                    {canPay && b.status !== "CANCELLED" && b.paidPaise === 0n && (
                      <ConfirmAction
                        trigger={<Button size="sm" variant="ghost"><XCircle className="size-4" /></Button>}
                        title={`Cancel bill ${b.number}?`}
                        description="Use this for a wrong entry. The record stays, marked as cancelled."
                        confirmLabel="Cancel bill"
                        destructive
                        reason={{ label: "Reason", required: true }}
                        action={cancelContractorBillAction.bind(null, b.id)}
                      />
                    )}
                  </div>
                ),
              },
            ]}
          />
        )}
      </Section>

      <div className="grid gap-6 lg:grid-cols-3">
        {showMoney && (
          <Section title="Payments" className="lg:col-span-2">
            {c.payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payments yet.</p>
            ) : (
              <SimpleTable
                rows={c.payments}
                rowKey={(p) => p.id}
                columns={[
                  { header: "Date", cell: (p) => <Cell2 main={formatDate(p.date)} sub={p.number} /> },
                  { header: "For", cell: (p) => <Cell2 main={PAYMENT_PURPOSE[p.purpose]} sub={p.contractorBill?.number} /> },
                  { header: "How", hide: "md", cell: (p) => <Cell2 main={PAYMENT_METHOD[p.method]} sub={p.account.name} /> },
                  { header: "Amount", align: "right", cell: (p) => <Money paise={p.amountPaise} colorNegative /> },
                ]}
              />
            )}
          </Section>
        )}
        <Section title="Contact & gang">
          <dl className="flex flex-col gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Phone</dt>
              <dd><ContactLinks phone={c.phone} /></dd>
            </div>
            {c.address && (
              <div>
                <dt className="text-muted-foreground">Address</dt>
                <dd>{c.address}</dd>
              </div>
            )}
            <div>
              <dt className="text-muted-foreground">Workers with this contractor</dt>
              <dd>
                {c.workers.length === 0 ? (
                  "None linked"
                ) : (
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {c.workers.map((w) => (
                      <li key={w.id}>
                        <Link href={`/labour/${w.id}`} className="hover:underline">{w.name}</Link> <span className="text-muted-foreground">· {LABOUR_CATEGORY[w.category]}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </dd>
            </div>
          </dl>
        </Section>
      </div>
    </div>
  );
}
