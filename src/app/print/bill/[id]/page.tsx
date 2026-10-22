import { Suspense } from "react";
import type { Metadata } from "next";
import { NotFoundPanel } from "@/components/app/no-access";
import { PrintToolbar } from "@/components/print/print-toolbar";
import { BillDocument } from "@/features/billing/bill-document";
import { formatDate } from "@/lib/dates";
import { INVOICE_KIND } from "@/lib/labels";
import { requireUser } from "@/server/auth/current-user";
import { getInvoice } from "@/server/services/billing";
import { companyProfile } from "@/server/services/users";

export const metadata: Metadata = { title: "Print bill" };

export default function PrintBillPage(props: PageProps<"/print/bill/[id]">) {
  return (
    <Suspense>
      <PrintBill params={props.params} />
    </Suspense>
  );
}

async function PrintBill({ params }: { params: PageProps<"/print/bill/[id]">["params"] }) {
  const user = await requireUser();
  const { id } = await params;
  const [inv, company] = await Promise.all([getInvoice(user, id), companyProfile()]);
  if (!inv) return <NotFoundPanel what="bill" backHref="/clients/bills" backLabel="Back to bills" />;
  return (
    <>
      <PrintToolbar title={`Bill ${inv.number} — ${inv.client.name}`} />
      <main className="print-sheet mx-auto max-w-[220mm] p-4 sm:p-8">
        {inv.status !== "ISSUED" && (
          <p className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-center text-sm font-semibold text-amber-900">
            {inv.status === "DRAFT" ? "DRAFT — not yet issued" : "CANCELLED"}
          </p>
        )}
        <BillDocument
          company={company}
          heading={inv.kind === "RUNNING" ? `Running Bill RA-${inv.raNumber}` : INVOICE_KIND[inv.kind]}
          number={inv.number}
          date={inv.date}
          extraMeta={[...(inv.dueDate ? [{ label: "Due by", value: formatDate(inv.dueDate) }] : []), ...(inv.milestone ? [{ label: "Stage", value: inv.milestone }] : [])]}
          to={{
            name: inv.client.name,
            address: [inv.client.address, inv.client.city].filter(Boolean).join(", ") || null,
            phone: inv.client.phone,
            gstin: inv.client.gstin,
            site: [inv.project.name, inv.project.address, inv.project.city].filter(Boolean).join("\n"),
          }}
          lines={inv.items}
          totals={{ ...inv.totals, retentionPaise: inv.retentionPaise }}
          taxMode={inv.taxMode}
          taxPercent={inv.taxPercent.toString()}
          footerNote={inv.notes}
        />
      </main>
    </>
  );
}
