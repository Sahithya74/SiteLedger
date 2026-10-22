import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Check, Copy, Pencil, Printer, Send, Trash2, X } from "lucide-react";
import { ToneBadge } from "@/components/app/badges";
import { ConfirmAction } from "@/components/app/confirm-action";
import { ContactLinks } from "@/components/app/contact-links";
import { NoAccess, NotFoundPanel } from "@/components/app/no-access";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/skeletons";
import { Button } from "@/components/ui/button";
import { deleteQuotationAction, quotationStatusAction, reviseQuotationAction } from "@/features/billing/actions";
import { BillDocument } from "@/features/billing/bill-document";
import { describeDue, formatDate } from "@/lib/dates";
import { QUOTATION_STATUS } from "@/lib/labels";
import { formatINR } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";
import { getQuotation } from "@/server/services/billing";
import { companyProfile } from "@/server/services/users";

export const metadata: Metadata = { title: "Quotation" };

export default function QuotationPage(props: PageProps<"/clients/quotations/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton tiles={0} />}>
      <Quotation params={props.params} />
    </Suspense>
  );
}

async function Quotation({ params }: { params: PageProps<"/clients/quotations/[id]">["params"] }) {
  const user = await requireUser();
  if (!can(user, "quotations.manage") && !can(user, "projects.viewMoney")) return <NoAccess />;
  const { id } = await params;
  const [q, company] = await Promise.all([getQuotation(user, id), companyProfile()]);
  if (!q) return <NotFoundPanel what="quotation" backHref="/clients/quotations" backLabel="Back to quotations" />;
  const manage = can(user, "quotations.manage");
  const status = QUOTATION_STATUS[q.status];

  return (
    <div className="page-enter flex flex-col gap-5">
      <PageHeader
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            Quotation {q.number}
            <ToneBadge tone={status.tone}>{status.label}</ToneBadge>
          </span>
        }
        description={
          <>
            {q.client.name} · {formatDate(q.date)}
            {q.validUntil && q.status === "SENT" && <> · valid {describeDue(q.validUntil)}</>}
            {q.revisionOf && (
              <>
                {" "}
                · revised from{" "}
                <Link href={`/clients/quotations/${q.revisionOf.id}`} className="underline">
                  {q.revisionOf.number}
                </Link>
              </>
            )}
          </>
        }
        back={{ href: "/clients/quotations", label: "Quotations" }}
        className="mb-0"
        actions={
          <>
            <Button asChild variant="outline" size="lg">
              <Link href={`/print/quotation/${q.id}`} target="_blank">
                <Printer className="size-4" /> Print / PDF
              </Link>
            </Button>
            {manage && q.status === "DRAFT" && (
              <>
                <Button asChild variant="outline" size="lg">
                  <Link href={`/clients/quotations/${q.id}/edit`}>
                    <Pencil className="size-4" /> Edit
                  </Link>
                </Button>
                <ConfirmAction
                  trigger={
                    <Button size="lg">
                      <Send className="size-4" /> Mark as sent
                    </Button>
                  }
                  title="Mark this quotation as sent to the client?"
                  description="After this it cannot be edited. To change it later, make a revised copy."
                  confirmLabel="Yes, sent"
                  action={quotationStatusAction.bind(null, q.id, "SENT")}
                />
              </>
            )}
            {manage && (q.status === "SENT" || q.status === "EXPIRED") && (
              <>
                <ConfirmAction
                  trigger={
                    <Button size="lg">
                      <Check className="size-4" /> Client accepted
                    </Button>
                  }
                  title="Client accepted this quotation?"
                  description={`${formatINR(q.totalPaise)} for “${q.title}”. ${q.project ? "" : "Next, create the project for this client and link it."}`}
                  confirmLabel="Yes, accepted"
                  action={quotationStatusAction.bind(null, q.id, "ACCEPTED")}
                />
                <ConfirmAction
                  trigger={
                    <Button variant="outline" size="lg">
                      <X className="size-4" /> Rejected
                    </Button>
                  }
                  title="Client rejected this quotation?"
                  description="It stays on record so you can see your win rate."
                  confirmLabel="Mark rejected"
                  action={quotationStatusAction.bind(null, q.id, "REJECTED")}
                />
              </>
            )}
            {manage && q.status !== "DRAFT" && (
              <ConfirmAction
                trigger={
                  <Button variant="outline" size="lg">
                    <Copy className="size-4" /> Make a revised copy
                  </Button>
                }
                title="Make a revised copy?"
                description="A new draft is created with the same items. This quotation stays unchanged."
                confirmLabel="Make copy"
                action={reviseQuotationAction.bind(null, q.id)}
              />
            )}
            {manage && q.status === "DRAFT" && (
              <ConfirmAction
                trigger={
                  <Button variant="ghost" size="lg" aria-label="Delete draft">
                    <Trash2 className="size-4" />
                  </Button>
                }
                title="Delete this draft?"
                description="Drafts were never sent, so they can be deleted."
                confirmLabel="Delete draft"
                destructive
                action={deleteQuotationAction.bind(null, q.id)}
              />
            )}
          </>
        }
      />
      {q.status === "ACCEPTED" && !q.project && manage && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <span>Accepted — create the project to start tracking work and money.</span>
          <Button asChild size="sm">
            <Link href={`/projects/new?clientId=${q.clientId}&quote=${q.id}`}>Create project</Link>
          </Button>
        </div>
      )}
      {q.client.phone && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          Send to {q.client.name}:
          <ContactLinks
            phone={q.client.phone}
            message={`Dear ${q.client.name}, please find our quotation ${q.number} for "${q.title}" amounting to ${formatINR(q.totalPaise)}. — ${company.name}`}
          />
        </div>
      )}
      {q.revisions.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Revised copies:{" "}
          {q.revisions.map((r, i) => (
            <span key={r.id}>
              {i > 0 && ", "}
              <Link href={`/clients/quotations/${r.id}`} className="underline">
                {r.number}
              </Link>{" "}
              ({QUOTATION_STATUS[r.status].label.toLowerCase()})
            </span>
          ))}
        </p>
      )}
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
      {q.notes && manage && (
        <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Internal note:</span> {q.notes}
        </p>
      )}
    </div>
  );
}
