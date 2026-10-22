import { Suspense } from "react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/app/empty-state";
import { NoAccess, NotFoundPanel } from "@/components/app/no-access";
import { PageHeader } from "@/components/app/page-header";
import { FormSkeleton } from "@/components/app/skeletons";
import { saveQuotationAction } from "@/features/billing/actions";
import { toEditorLines } from "@/features/billing/bill-editor";
import { QuotationForm } from "@/features/billing/bill-forms";
import { paiseToInput } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";
import { getQuotation } from "@/server/services/billing";
import { clientOptions } from "@/server/services/clients";
import { projectOptions } from "@/server/services/projects";

export const metadata: Metadata = { title: "Edit quotation" };

export default function EditQuotationPage(props: PageProps<"/clients/quotations/[id]/edit">) {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <EditQuotation params={props.params} />
    </Suspense>
  );
}

async function EditQuotation({ params }: { params: PageProps<"/clients/quotations/[id]/edit">["params"] }) {
  const user = await requireUser();
  if (!can(user, "quotations.manage")) return <NoAccess />;
  const { id } = await params;
  const [q, clients, projects] = await Promise.all([getQuotation(user, id), clientOptions(user), projectOptions(user)]);
  if (!q) return <NotFoundPanel what="quotation" backHref="/clients/quotations" backLabel="Back to quotations" />;
  if (q.status !== "DRAFT") {
    return (
      <EmptyState
        title="Only draft quotations can be edited"
        description="This quotation was already sent. Use “Make a revised copy” on the quotation to change it — the original stays on record."
      />
    );
  }
  return (
    <div className="page-enter">
      <PageHeader title={`Edit ${q.number}`} back={{ href: `/clients/quotations/${id}`, label: q.number }} />
      <QuotationForm
        action={saveQuotationAction.bind(null, id)}
        clients={clients.map((c) => ({ value: c.id, label: c.name }))}
        projects={projects.map((p) => ({ value: p.id, label: p.name, clientId: p.clientId }))}
        initial={{
          clientId: q.clientId,
          projectId: q.projectId ?? "",
          title: q.title,
          date: q.date,
          validUntil: q.validUntil ?? "",
          taxMode: q.taxMode,
          taxPercent: q.taxPercent.toString(),
          discount: q.discountPaise > 0n ? paiseToInput(q.discountPaise) : "",
          terms: q.terms ?? "",
          notes: q.notes ?? "",
          lines: toEditorLines(q.items),
        }}
        cancelHref={`/clients/quotations/${id}`}
        submitLabel="Save changes"
      />
    </div>
  );
}
