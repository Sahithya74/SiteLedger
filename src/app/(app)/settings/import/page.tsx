import { Suspense } from "react";
import type { Metadata } from "next";
import { NoAccess } from "@/components/app/no-access";
import { PageHeader, Section } from "@/components/app/page-header";
import { FormSkeleton } from "@/components/app/skeletons";
import { ImportPanel } from "@/features/import/import-panel";
import { requireUser } from "@/server/auth/current-user";
import { importTypesFor } from "@/server/services/csv-import";

export const metadata: Metadata = { title: "Import from Excel" };

export default function ImportPage() {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <Import />
    </Suspense>
  );
}

async function Import() {
  const user = await requireUser();
  const types = importTypesFor(user);
  if (types.length === 0) return <NoAccess />;
  return (
    <div className="page-enter flex max-w-4xl flex-col gap-5">
      <PageHeader title="Import from Excel" description="Add many workers, materials or suppliers at once — handy when you start using SITECORE." className="mb-0" />
      <Section title="Upload a sheet">
        <ImportPanel types={types} />
      </Section>
    </div>
  );
}
