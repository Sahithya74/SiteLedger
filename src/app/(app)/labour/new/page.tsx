import { Suspense } from "react";
import type { Metadata } from "next";
import { ActionForm } from "@/components/app/form";
import { NoAccess } from "@/components/app/no-access";
import { PageHeader } from "@/components/app/page-header";
import { FormSkeleton } from "@/components/app/skeletons";
import { createWorkerAction } from "@/features/labour/actions";
import { WorkerFields } from "@/features/labour/worker-fields";
import { todayIST } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";
import { contractorOptions } from "@/server/services/contractors";

export const metadata: Metadata = { title: "Add worker" };

export default function NewWorkerPage() {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <NewWorker />
    </Suspense>
  );
}

async function NewWorker() {
  const user = await requireUser();
  if (!can(user, "labour.manage")) return <NoAccess />;
  const contractors = await contractorOptions();
  return (
    <div className="page-enter">
      <PageHeader title="Add worker" back={{ href: "/labour", label: "Labour" }} />
      <ActionForm action={createWorkerAction} submitLabel="Save worker" cancelHref="/labour">
        {/* Whoever adds a worker agrees the wage, so the wage is always asked here. */}
        <WorkerFields contractors={contractors.map((c) => ({ value: c.id, label: c.name }))} showWages values={{ joinedOn: todayIST() }} />
      </ActionForm>
    </div>
  );
}
