import { Suspense } from "react";
import type { Metadata } from "next";
import { NotFoundPanel } from "@/components/app/no-access";
import { PrintToolbar } from "@/components/print/print-toolbar";
import { BillDocument } from "@/features/billing/bill-document";
import { formatDate } from "@/lib/dates";
import { requireUser } from "@/server/auth/current-user";
import { getQuotation } from "@/server/services/billing";
import { companyProfile } from "@/server/services/users";

export const metadata: Metadata = { title: "Print quotation" };

export default function PrintQuotationPage(props: PageProps<"/print/quotation/[id]">) {
  return (
    <Suspense>
      <PrintQuotation params={props.params} />
    </Suspense>
  );
}

async function PrintQuotation({ params }: { params: PageProps<"/print/quotation/[id]">["params"] }) {
  const user = await requireUser();
  const { id } = await params;
  const [q, company] = await Promise.all([getQuotation(user, id), companyProfile()]);
  if (!q) return <NotFoundPanel what="quotation" backHref="/clients/quotations" backLabel="Back to quotations" />;
  return (
    <>
      <PrintToolbar title={`Quotation ${q.number} — ${q.client.name}`} />
      <main className="print-sheet mx-auto max-w-[220mm] p-4 sm:p-8">
        <BillDocument
          company={company}
          heading="Quotation"
          number={q.number}
          date={q.date}
          extraMeta={q.validUntil ? [{ label: "Valid until", value: formatDate(q.validUntil) }] : []}
          to={{
            name: q.client.name,
            address: [q.client.address, q.client.city].filter(Boolean).join(", ") || null,
            phone: q.client.phone,
            gstin: q.client.gstin,
            site: q.project ? [q.project.name, q.project.address, q.project.city].filter(Boolean).join("\n") : null,
          }}
          subject={q.title}
          lines={q.items}
          totals={q.totals}
          taxMode={q.taxMode}
          taxPercent={q.taxPercent.toString()}
          terms={q.terms}
        />
      </main>
    </>
  );
}
