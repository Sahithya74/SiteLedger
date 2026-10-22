import { Suspense } from "react";
import type { Metadata } from "next";
import { NoAccess } from "@/components/app/no-access";
import { PageHeader } from "@/components/app/page-header";
import { FormSkeleton } from "@/components/app/skeletons";
import { saveEquipmentAction } from "@/features/equipment/actions";
import { EquipmentForm } from "@/features/equipment/equipment-widgets";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";
import { supplierOptions } from "@/server/services/suppliers";

export const metadata: Metadata = { title: "Add equipment" };

export default function NewEquipmentPage() {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <NewEquipment />
    </Suspense>
  );
}

async function NewEquipment() {
  const user = await requireUser();
  if (!can(user, "equipment.manage")) return <NoAccess />;
  const suppliers = await supplierOptions();
  return (
    <div className="page-enter">
      <PageHeader title="Add equipment" back={{ href: "/equipment", label: "Equipment" }} />
      <EquipmentForm
        action={saveEquipmentAction.bind(null, null)}
        values={{ name: "", type: "CONCRETE_MIXER", ownership: "OWNED", supplierId: "", rentalRate: "", rentalUnit: "DAY", registrationNo: "", purchaseDate: "", purchaseCost: "", operatorName: "", notes: "" }}
        suppliers={suppliers.map((s) => ({ value: s.id, label: s.name }))}
        cancelHref="/equipment"
        submitLabel="Add equipment"
      />
    </div>
  );
}
