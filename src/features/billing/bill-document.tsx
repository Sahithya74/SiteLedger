import { formatDate, formatDateLong } from "@/lib/dates";
import { formatQuantity } from "@/lib/format";
import { amountInWords, formatINR, type Paise } from "@/lib/money";
import type { CompanyProfile } from "@/server/services/users";

export type DocLine = { id: string; section?: string | null; description: string; quantity: { toString(): string }; unit: string; ratePaise: Paise; amountPaise: Paise; hsnSac?: string | null };

export type DocTotals = {
  subtotalPaise: Paise;
  discountPaise: Paise;
  cgstPaise: Paise;
  sgstPaise: Paise;
  igstPaise: Paise;
  totalPaise: Paise;
  retentionPaise?: Paise;
};

/**
 * A quotation or client bill laid out like the paper version. Used inside the
 * app and on the print page (Save as PDF from the browser's print dialog).
 */
export function BillDocument({
  company,
  heading,
  number,
  date,
  extraMeta = [],
  to,
  subject,
  lines,
  totals,
  taxMode,
  taxPercent,
  terms,
  footerNote,
  showSignature = true,
}: {
  company: CompanyProfile;
  heading: string;
  number: string;
  date: string;
  extraMeta?: { label: string; value: string }[];
  to: { name: string; address?: string | null; phone?: string | null; gstin?: string | null; site?: string | null };
  subject?: string | null;
  lines: DocLine[];
  totals: DocTotals;
  taxMode: string;
  taxPercent: string;
  terms?: string | null;
  footerNote?: string | null;
  showSignature?: boolean;
}) {
  const half = (Number(taxPercent) / 2).toString();
  // Print a section heading only where the section changes.
  const headings: (string | null)[] = [];
  let current: string | null = null;
  for (const l of lines) {
    headings.push(l.section && l.section !== current ? l.section : null);
    if (l.section) current = l.section;
  }
  const showHsn = lines.some((l) => l.hsnSac);
  return (
    <article className="bill-doc mx-auto w-full max-w-[210mm] rounded-xl border bg-white p-5 text-[13px] leading-snug text-stone-900 shadow-xs sm:p-8 print:rounded-none print:border-0 print:p-0 print:shadow-none">
      <header className="flex flex-col gap-4 border-b-2 border-stone-800 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="text-xl font-bold tracking-tight">{company.name}</div>
          {company.address && <div className="whitespace-pre-line text-stone-600">{company.address}</div>}
          <div className="text-stone-600">
            {[company.phone && `Ph: ${company.phone}`, company.email].filter(Boolean).join(" · ")}
          </div>
          {(company.gstin || company.pan) && (
            <div className="text-stone-600">{[company.gstin && `GSTIN: ${company.gstin}`, company.pan && `PAN: ${company.pan}`].filter(Boolean).join(" · ")}</div>
          )}
        </div>
        <div className="sm:text-right">
          <div className="text-lg font-semibold tracking-wide uppercase">{heading}</div>
          <div className="tabular">No. {number}</div>
          <div>Date: {formatDate(date)}</div>
          {extraMeta.map((m) => (
            <div key={m.label}>
              {m.label}: {m.value}
            </div>
          ))}
        </div>
      </header>

      <section className="grid gap-4 py-4 sm:grid-cols-2">
        <div>
          <div className="text-xs font-semibold tracking-wide text-stone-500 uppercase">To</div>
          <div className="font-semibold">{to.name}</div>
          {to.address && <div className="whitespace-pre-line text-stone-600">{to.address}</div>}
          {to.phone && <div className="text-stone-600">Ph: {to.phone}</div>}
          {to.gstin && <div className="text-stone-600">GSTIN: {to.gstin}</div>}
        </div>
        {to.site && (
          <div>
            <div className="text-xs font-semibold tracking-wide text-stone-500 uppercase">Site</div>
            <div className="whitespace-pre-line">{to.site}</div>
          </div>
        )}
      </section>
      {subject && (
        <p className="pb-3">
          <span className="font-semibold">Subject:</span> {subject}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="border-y border-stone-400 bg-stone-100 text-left print:bg-stone-100">
              <th className="w-8 px-2 py-1.5">#</th>
              <th className="px-2 py-1.5">Description</th>
              {showHsn && <th className="px-2 py-1.5">HSN/SAC</th>}
              <th className="px-2 py-1.5 text-right">Qty</th>
              <th className="px-2 py-1.5 text-right">Rate (₹)</th>
              <th className="px-2 py-1.5 text-right">Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            {lines.flatMap((l, i) => {
              const rows = [];
              if (headings[i]) {
                rows.push(
                  <tr key={`s-${l.id}`} className="border-b border-stone-200">
                    <td />
                    <td colSpan={showHsn ? 5 : 4} className="px-2 pt-2.5 pb-1 font-semibold">
                      {headings[i]}
                    </td>
                  </tr>,
                );
              }
              rows.push(
                <tr key={l.id} className="border-b border-stone-200 align-top">
                  <td className="tabular px-2 py-1.5 text-stone-500">{i + 1}</td>
                  <td className="px-2 py-1.5">{l.description}</td>
                  {showHsn && <td className="px-2 py-1.5">{l.hsnSac}</td>}
                  <td className="tabular px-2 py-1.5 text-right whitespace-nowrap">{formatQuantity(l.quantity.toString(), l.unit)}</td>
                  <td className="tabular px-2 py-1.5 text-right">{formatINR(l.ratePaise, { symbol: false })}</td>
                  <td className="tabular px-2 py-1.5 text-right">{formatINR(l.amountPaise, { symbol: false })}</td>
                </tr>,
              );
              return rows;
            })}
          </tbody>
        </table>
      </div>

      <section className="mt-4 flex flex-col gap-4 sm:flex-row sm:justify-between">
        <p className="max-w-sm pt-1 text-stone-700 italic">{amountInWords(totals.totalPaise)}</p>
        <dl className="grid min-w-64 grid-cols-[1fr_auto] gap-x-6 gap-y-1">
          <dt>Subtotal</dt>
          <dd className="tabular text-right">{formatINR(totals.subtotalPaise)}</dd>
          {totals.discountPaise > 0n && (
            <>
              <dt>Discount</dt>
              <dd className="tabular text-right">− {formatINR(totals.discountPaise)}</dd>
            </>
          )}
          {taxMode === "CGST_SGST" && (
            <>
              <dt>CGST @ {half}%</dt>
              <dd className="tabular text-right">{formatINR(totals.cgstPaise)}</dd>
              <dt>SGST @ {half}%</dt>
              <dd className="tabular text-right">{formatINR(totals.sgstPaise)}</dd>
            </>
          )}
          {taxMode === "IGST" && (
            <>
              <dt>IGST @ {taxPercent}%</dt>
              <dd className="tabular text-right">{formatINR(totals.igstPaise)}</dd>
            </>
          )}
          <dt className="border-t border-stone-800 pt-1 text-[15px] font-bold">Total</dt>
          <dd className="tabular border-t border-stone-800 pt-1 text-right text-[15px] font-bold">{formatINR(totals.totalPaise)}</dd>
          {totals.retentionPaise !== undefined && totals.retentionPaise > 0n && (
            <>
              <dt className="text-stone-600">Less retention</dt>
              <dd className="tabular text-right text-stone-600">− {formatINR(totals.retentionPaise)}</dd>
              <dt className="font-semibold">Payable now</dt>
              <dd className="tabular text-right font-semibold">{formatINR(totals.totalPaise - totals.retentionPaise)}</dd>
            </>
          )}
        </dl>
      </section>

      {terms && (
        <section className="mt-6 border-t pt-3">
          <div className="text-xs font-semibold tracking-wide text-stone-500 uppercase">Terms</div>
          <p className="whitespace-pre-line text-stone-700">{terms}</p>
        </section>
      )}
      {company.bankDetails && (
        <section className="mt-4 border-t pt-3">
          <div className="text-xs font-semibold tracking-wide text-stone-500 uppercase">Payment details</div>
          <p className="whitespace-pre-line text-stone-700">{company.bankDetails}</p>
        </section>
      )}
      {footerNote && <p className="mt-4 text-stone-600">{footerNote}</p>}
      {showSignature && (
        <footer className="mt-12 flex justify-end">
          <div className="text-center">
            <div className="h-10" />
            <div className="border-t border-stone-500 px-6 pt-1">For {company.name}</div>
          </div>
        </footer>
      )}
    </article>
  );
}

export function printedOn(): string {
  return formatDateLong(new Date());
}
