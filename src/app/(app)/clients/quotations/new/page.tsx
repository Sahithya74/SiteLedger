import { Suspense } from "react";
import type { Metadata } from "next";
import { NoAccess } from "@/components/app/no-access";
import { PageHeader } from "@/components/app/page-header";
import { FormSkeleton } from "@/components/app/skeletons";
import { saveQuotationAction } from "@/features/billing/actions";
import { QuotationForm } from "@/features/billing/bill-forms";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";
import { clientOptions } from "@/server/services/clients";
import { projectOptions } from "@/server/services/projects";

export const metadata: Metadata = { title: "New quotation" };

export default function NewQuotationPage(props: PageProps<"/clients/quotations/new">) {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <NewQuotation searchParams={props.searchParams} />
    </Suspense>
  );
}

async function NewQuotation({ searchParams }: { searchParams: PageProps<"/clients/quotations/new">["searchParams"] }) {
  const user = await requireUser();
  if (!can(user, "quotations.manage")) return <NoAccess />;
  const [clients, projects, sp] = await Promise.all([clientOptions(user), projectOptions(user), searchParams]);
  const clientId = typeof sp.client === "string" ? sp.client : "";
  return (
    <div className="page-enter">
      <PageHeader title="New quotation" back={{ href: "/clients/quotations", label: "Quotations" }} />
      <QuotationForm
        action={saveQuotationAction.bind(null, null)}
        clients={clients.map((c) => ({ value: c.id, label: c.city ? `${c.name} (${c.city})` : c.name }))}
        projects={projects.map((p) => ({ value: p.id, label: p.name, clientId: p.clientId }))}
        initial={{ clientId }}
        cancelHref="/clients/quotations"
        submitLabel="Save quotation"
      />
    </div>
  );
}
