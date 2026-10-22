import { Suspense } from "react";
import type { Metadata } from "next";
import { NoAccess } from "@/components/app/no-access";
import { PageHeader } from "@/components/app/page-header";
import { FormSkeleton } from "@/components/app/skeletons";
import { createClientAction } from "@/features/clients/actions";
import { ClientForm } from "@/features/clients/client-form";
import { EMPTY_CLIENT } from "@/features/clients/form-values";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";

export const metadata: Metadata = { title: "Add client" };

export default function NewClientPage(props: PageProps<"/clients/new">) {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <NewClient searchParams={props.searchParams} />
    </Suspense>
  );
}

async function NewClient({ searchParams }: { searchParams: PageProps<"/clients/new">["searchParams"] }) {
  const user = await requireUser();
  if (!can(user, "clients.manage")) return <NoAccess />;
  const { returnTo } = await searchParams;
  return (
    <div className="page-enter">
      <PageHeader title="Add client" back={{ href: "/clients", label: "Clients" }} />
      <ClientForm
        action={createClientAction}
        values={EMPTY_CLIENT}
        submitLabel="Save client"
        cancelHref="/clients"
        returnTo={returnTo === "/projects/new" ? returnTo : undefined}
      />
    </div>
  );
}
