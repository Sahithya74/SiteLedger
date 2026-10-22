import { Suspense } from "react";
import type { Metadata } from "next";
import { NoAccess } from "@/components/app/no-access";
import { PageHeader } from "@/components/app/page-header";
import { FormSkeleton } from "@/components/app/skeletons";
import { createInvoiceAction } from "@/features/billing/actions";
import { InvoiceForm } from "@/features/billing/bill-forms";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";
import { db } from "@/server/db";
import { projectOptions } from "@/server/services/projects";

export const metadata: Metadata = { title: "New client bill" };

export default function NewBillPage(props: PageProps<"/clients/bills/new">) {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <NewBill searchParams={props.searchParams} />
    </Suspense>
  );
}

async function NewBill({ searchParams }: { searchParams: PageProps<"/clients/bills/new">["searchParams"] }) {
  const user = await requireUser();
  if (!can(user, "quotations.manage")) return <NoAccess />;
  const [projects, sp] = await Promise.all([projectOptions(user), searchParams]);
  const ra = await db.invoice.groupBy({ by: ["projectId"], where: { kind: "RUNNING", projectId: { in: projects.map((p) => p.id) } }, _max: { raNumber: true } });
  const nextRa = Object.fromEntries(projects.map((p) => [p.id, (ra.find((r) => r.projectId === p.id)?._max.raNumber ?? 0) + 1]));
  return (
    <div className="page-enter">
      <PageHeader title="New client bill" description="The bill number and RA number are given automatically." back={{ href: "/clients/bills", label: "Client bills" }} />
      <InvoiceForm
        action={createInvoiceAction}
        projects={projects.map((p) => ({ value: p.id, label: p.name, client: p.client.name }))}
        defaultProjectId={typeof sp.project === "string" ? sp.project : undefined}
        nextRa={nextRa}
      />
    </div>
  );
}
