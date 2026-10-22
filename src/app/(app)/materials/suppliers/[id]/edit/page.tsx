import { Suspense } from "react";
import type { Metadata } from "next";
import { ActionForm } from "@/components/app/form";
import { NoAccess, NotFoundPanel } from "@/components/app/no-access";
import { PageHeader } from "@/components/app/page-header";
import { FormSkeleton } from "@/components/app/skeletons";
import { updateSupplierAction } from "@/features/materials/actions";
import { SupplierFields } from "@/features/materials/supplier-fields";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";
import { getSupplier } from "@/server/services/suppliers";

export const metadata: Metadata = { title: "Edit supplier" };

export default function EditSupplierPage(props: PageProps<"/materials/suppliers/[id]/edit">) {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <EditSupplier params={props.params} />
    </Suspense>
  );
}

async function EditSupplier({ params }: { params: PageProps<"/materials/suppliers/[id]/edit">["params"] }) {
  const { id } = await params;
  const user = await requireUser();
  if (!can(user, "materials.manage")) return <NoAccess />;
  const s = await getSupplier(id);
  if (!s) return <NotFoundPanel what="supplier" backHref="/materials/suppliers" backLabel="Back to suppliers" />;
  return (
    <div className="page-enter">
      <PageHeader title={`Edit ${s.name}`} back={{ href: `/materials/suppliers/${id}`, label: s.name }} />
      <ActionForm action={updateSupplierAction.bind(null, id)} submitLabel="Save changes" cancelHref={`/materials/suppliers/${id}`}>
        <SupplierFields
          values={{
            name: s.name,
            categories: s.categories,
            contactPerson: s.contactPerson ?? "",
            phone: s.phone ?? "",
            altPhone: s.altPhone ?? "",
            email: s.email ?? "",
            address: s.address ?? "",
            city: s.city ?? "",
            latitude: s.latitude?.toString() ?? "",
            longitude: s.longitude?.toString() ?? "",
            gstin: s.gstin ?? "",
            pan: s.pan ?? "",
            materialsSupplied: s.materialsSupplied ?? "",
            priceRangeNote: s.priceRangeNote ?? "",
            paymentTerms: s.paymentTerms ?? "",
            creditDays: s.creditDays?.toString() ?? "",
            rating: s.rating?.toString() ?? "",
            notes: s.notes ?? "",
          }}
        />
      </ActionForm>
    </div>
  );
}
