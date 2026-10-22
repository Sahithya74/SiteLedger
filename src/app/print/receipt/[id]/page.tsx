import { Suspense } from "react";
import type { Metadata } from "next";
import { NotFoundPanel } from "@/components/app/no-access";
import { PrintToolbar } from "@/components/print/print-toolbar";
import { formatDate } from "@/lib/dates";
import { PAYMENT_METHOD } from "@/lib/labels";
import { amountInWords, formatINR } from "@/lib/money";
import { requireUser } from "@/server/auth/current-user";
import { getClientPaymentReceipt } from "@/server/services/money-lists";
import { companyProfile } from "@/server/services/users";

export const metadata: Metadata = { title: "Print receipt" };

export default function PrintReceiptPage(props: PageProps<"/print/receipt/[id]">) {
  return (
    <Suspense>
      <PrintReceipt params={props.params} />
    </Suspense>
  );
}

async function PrintReceipt({ params }: { params: PageProps<"/print/receipt/[id]">["params"] }) {
  const user = await requireUser();
  const { id } = await params;
  const [p, company] = await Promise.all([getClientPaymentReceipt(user, id), companyProfile()]);
  if (!p) return <NotFoundPanel what="receipt" backHref="/clients/payments" backLabel="Back to payments" />;
  const total = p.amountPaise + p.tdsDeductedPaise;
  return (
    <>
      <PrintToolbar title={`Receipt ${p.receiptNumber} — ${p.client.name}`} />
      <main className="print-sheet mx-auto max-w-[220mm] p-4 sm:p-8">
        <article className="rounded-xl border bg-white p-6 text-[14px] leading-relaxed text-stone-900 shadow-xs sm:p-10 print:rounded-none print:border-0 print:p-0 print:shadow-none">
          <header className="flex flex-col gap-3 border-b-2 border-stone-800 pb-4 sm:flex-row sm:justify-between">
            <div>
              <div className="text-xl font-bold">{company.name}</div>
              {company.address && <div className="whitespace-pre-line text-stone-600">{company.address}</div>}
              <div className="text-stone-600">{[company.phone && `Ph: ${company.phone}`, company.gstin && `GSTIN: ${company.gstin}`].filter(Boolean).join(" · ")}</div>
            </div>
            <div className="sm:text-right">
              <div className="text-lg font-semibold tracking-wide uppercase">Payment receipt</div>
              <div className="tabular">No. {p.receiptNumber}</div>
              <div>Date: {formatDate(p.date)}</div>
            </div>
          </header>
          {p.reversalOfId || p.amountPaise < 0n ? (
            <p className="mt-6 font-semibold text-red-700">This entry is a reversal and is not a receipt.</p>
          ) : (
            <>
              <p className="mt-6">
                Received with thanks from <strong>{p.client.name}</strong> the sum of <strong>{formatINR(p.amountPaise)}</strong> (
                <em>{amountInWords(p.amountPaise)}</em>) by {PAYMENT_METHOD[p.method].toLowerCase()}
                {p.reference ? ` (ref. ${p.reference})` : ""} towards <strong>{p.project.name}</strong>
                {p.milestone ? ` — ${p.milestone}` : ""}
                {p.invoice ? `, against bill ${p.invoice.number}${p.invoice.raNumber ? ` (RA-${p.invoice.raNumber})` : ""}` : ""}.
              </p>
              <dl className="mt-6 grid max-w-sm grid-cols-[1fr_auto] gap-x-6 gap-y-1">
                <dt>Amount received</dt>
                <dd className="tabular text-right">{formatINR(p.amountPaise)}</dd>
                {p.tdsDeductedPaise > 0n && (
                  <>
                    <dt>TDS deducted by client</dt>
                    <dd className="tabular text-right">{formatINR(p.tdsDeductedPaise)}</dd>
                    <dt className="border-t pt-1 font-semibold">Total settled</dt>
                    <dd className="tabular border-t pt-1 text-right font-semibold">{formatINR(total)}</dd>
                  </>
                )}
              </dl>
            </>
          )}
          <footer className="mt-16 flex justify-end">
            <div className="text-center">
              <div className="h-10" />
              <div className="border-t border-stone-500 px-6 pt-1">For {company.name}</div>
            </div>
          </footer>
        </article>
      </main>
    </>
  );
}
