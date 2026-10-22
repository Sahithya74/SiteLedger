import { Suspense } from "react";
import type { Metadata } from "next";
import { NoAccess, NotFoundPanel } from "@/components/app/no-access";
import { PageHeader } from "@/components/app/page-header";
import { FormSkeleton } from "@/components/app/skeletons";
import { updateClientAction } from "@/features/clients/actions";
import { ClientForm } from "@/features/clients/client-form";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";
import { getClient } from "@/server/services/clients";

export const metadata: Metadata = { title: "Edit client" };

export default function EditClientPage(props: PageProps<"/clients/[id]/edit">) {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <EditClient params={props.params} />
    </Suspense>
  );
}

async function EditClient({ params }: { params: PageProps<"/clients/[id]/edit">["params"] }) {
  const { id } = await params;
  const user = await requireUser();
  if (!can(user, "clients.manage")) return <NoAccess />;
  const client = await getClient(user, id);
  if (!client) return <NotFoundPanel what="client" backHref="/clients" backLabel="Back to clients" />;
  return (
    <div className="page-enter">
      <PageHeader title={`Edit ${client.name}`} back={{ href: `/clients/${id}`, label: client.name }} />
      <ClientForm
        action={updateClientAction.bind(null, id)}
        values={{
          name: client.name,
          phone: client.phone ?? "",
          altPhone: client.altPhone ?? "",
          email: client.email ?? "",
          address: client.address ?? "",
          city: client.city ?? "",
          gstin: client.gstin ?? "",
          pan: client.pan ?? "",
          notes: client.notes ?? "",
        }}
        submitLabel="Save changes"
        cancelHref={`/clients/${id}`}
      />
    </div>
  );
}
