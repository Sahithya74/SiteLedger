import { Suspense } from "react";
import type { Metadata } from "next";
import { ActionForm } from "@/components/app/form";
import { NoAccess } from "@/components/app/no-access";
import { PageHeader } from "@/components/app/page-header";
import { FormSkeleton } from "@/components/app/skeletons";
import { param } from "@/components/app/filter-bar";
import { createPurchaseAction } from "@/features/materials/actions";
import { PurchaseFormFields } from "@/features/materials/purchase-widgets";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";
import { accountOptions } from "@/server/services/ledger";
import { getMaterialRequest } from "@/server/services/material-requests";
import { materialOptions, stockLocations } from "@/server/services/materials";
import { supplierOptions } from "@/server/services/suppliers";

export const metadata: Metadata = { title: "New purchase" };

export default function NewPurchasePage(props: PageProps<"/materials/purchases/new">) {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <NewPurchase searchParams={props.searchParams} />
    </Suspense>
  );
}

async function NewPurchase({ searchParams }: { searchParams: PageProps<"/materials/purchases/new">["searchParams"] }) {
  const user = await requireUser();
  if (!can(user, "purchases.record")) return <NoAccess />;
  const sp = await searchParams;
  const requestId = param(sp, "request");
  const [suppliers, locations, materials, accounts, request] = await Promise.all([
    supplierOptions(),
    stockLocations(user),
    materialOptions(),
    accountOptions(user),
    requestId ? getMaterialRequest(user, requestId) : Promise.resolve(null),
  ]);
  return (
    <div className="page-enter">
      <PageHeader
        title="New purchase"
        description={request ? `From material request ${request.number} for ${request.project.name}` : "Record a supplier bill. Received material is added to the site's stock."}
        back={{ href: "/materials/purchases", label: "Purchases" }}
      />
      <ActionForm action={createPurchaseAction} submitLabel="Save purchase" cancelHref="/materials/purchases" className="max-w-5xl">
        <PurchaseFormFields
          suppliers={suppliers}
          locations={locations}
          materials={materials}
          accounts={accounts}
          defaults={{
            location: request?.projectId ?? param(sp, "location"),
            materialRequestId: request?.id,
            items: request?.items.map((i) => ({ materialId: i.materialId, quantity: i.quantity.toString() })),
          }}
        />
      </ActionForm>
    </div>
  );
}
