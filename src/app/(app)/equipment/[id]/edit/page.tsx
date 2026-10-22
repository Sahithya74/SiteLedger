import { Suspense } from "react";
import type { Metadata } from "next";
import { NoAccess, NotFoundPanel } from "@/components/app/no-access";
import { PageHeader } from "@/components/app/page-header";
import { FormSkeleton } from "@/components/app/skeletons";
import { saveEquipmentAction } from "@/features/equipment/actions";
import { EquipmentForm } from "@/features/equipment/equipment-widgets";
import { paiseToInput } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";
import { getEquipment } from "@/server/services/equipment";
import { supplierOptions } from "@/server/services/suppliers";

export const metadata: Metadata = { title: "Edit equipment" };

export default function EditEquipmentPage(props: PageProps<"/equipment/[id]/edit">) {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <EditEquipment params={props.params} />
    </Suspense>
  );
}

async function EditEquipment({ params }: { params: PageProps<"/equipment/[id]/edit">["params"] }) {
  const user = await requireUser();
  if (!can(user, "equipment.manage")) return <NoAccess />;
  const { id } = await params;
  const [e, suppliers] = await Promise.all([getEquipment(user, id), supplierOptions()]);
  if (!e) return <NotFoundPanel what="equipment" backHref="/equipment" backLabel="Back to equipment" />;
  return (
    <div className="page-enter">
      <PageHeader title={`Edit ${e.name}`} back={{ href: `/equipment/${id}`, label: e.name }} />
      <EquipmentForm
        action={saveEquipmentAction.bind(null, id)}
        values={{
          name: e.name,
          type: e.type,
          ownership: e.ownership,
          supplierId: e.supplierId ?? "",
          rentalRate: paiseToInput(e.rentalRatePaise),
          rentalUnit: e.rentalUnit ?? "DAY",
          registrationNo: e.registrationNo ?? "",
          purchaseDate: e.purchaseDate ?? "",
          purchaseCost: paiseToInput(e.purchaseCostPaise),
          operatorName: e.operatorName ?? "",
          notes: e.notes ?? "",
        }}
        suppliers={suppliers.map((s) => ({ value: s.id, label: s.name }))}
        cancelHref={`/equipment/${id}`}
        submitLabel="Save changes"
      />
    </div>
  );
}
