import { Suspense } from "react";
import type { Metadata } from "next";
import { ActionForm } from "@/components/app/form";
import { NoAccess } from "@/components/app/no-access";
import { PageHeader } from "@/components/app/page-header";
import { FormSkeleton } from "@/components/app/skeletons";
import { createSupplierAction } from "@/features/materials/actions";
import { SupplierFields } from "@/features/materials/supplier-fields";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";

export const metadata: Metadata = { title: "Add supplier" };

export default function NewSupplierPage() {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <NewSupplier />
    </Suspense>
  );
}

async function NewSupplier() {
  const user = await requireUser();
  if (!can(user, "materials.manage")) return <NoAccess />;
  return (
    <div className="page-enter">
      <PageHeader title="Add supplier" back={{ href: "/materials/suppliers", label: "Suppliers" }} />
      <ActionForm action={createSupplierAction} submitLabel="Save supplier" cancelHref="/materials/suppliers">
        <SupplierFields />
      </ActionForm>
    </div>
  );
}
