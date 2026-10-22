import { Suspense } from "react";
import type { Metadata } from "next";
import { ActionForm } from "@/components/app/form";
import { NoAccess, NotFoundPanel } from "@/components/app/no-access";
import { PageHeader } from "@/components/app/page-header";
import { FormSkeleton } from "@/components/app/skeletons";
import { updateWorkerAction } from "@/features/labour/actions";
import { WorkerFields } from "@/features/labour/worker-fields";
import { paiseToInput } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";
import { contractorOptions } from "@/server/services/contractors";
import { getWorker } from "@/server/services/labour";

export const metadata: Metadata = { title: "Edit worker" };

export default function EditWorkerPage(props: PageProps<"/labour/[id]/edit">) {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <EditWorker params={props.params} />
    </Suspense>
  );
}

async function EditWorker({ params }: { params: PageProps<"/labour/[id]/edit">["params"] }) {
  const { id } = await params;
  const user = await requireUser();
  if (!can(user, "labour.manage")) return <NoAccess />;
  const [w, contractors] = await Promise.all([getWorker(user, id), contractorOptions()]);
  if (!w) return <NotFoundPanel what="worker" backHref="/labour" backLabel="Back to labour" />;
  const showWages = can(user, "wages.view");
  return (
    <div className="page-enter">
      <PageHeader title={`Edit ${w.name}`} back={{ href: `/labour/${id}`, label: w.name }} />
      <ActionForm action={updateWorkerAction.bind(null, id)} submitLabel="Save changes" cancelHref={`/labour/${id}`}>
        <WorkerFields
          contractors={contractors.map((c) => ({ value: c.id, label: c.name }))}
          showWages={showWages}
          values={{
            name: w.name,
            phone: w.phone ?? "",
            category: w.category,
            contractorId: w.contractorId ?? "",
            dailyWage: showWages ? paiseToInput(w.dailyWagePaise) : "",
            overtimeRate: showWages ? paiseToInput(w.overtimeRatePaise) : "",
            address: w.address ?? "",
            emergencyContact: w.emergencyContact ?? "",
            upiId: w.upiId ?? "",
            joinedOn: w.joinedOn ?? "",
            notes: w.notes ?? "",
          }}
        />
      </ActionForm>
    </div>
  );
}
