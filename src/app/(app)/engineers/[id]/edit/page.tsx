import { Suspense } from "react";
import type { Metadata } from "next";
import { NoAccess, NotFoundPanel } from "@/components/app/no-access";
import { PageHeader } from "@/components/app/page-header";
import { FormSkeleton } from "@/components/app/skeletons";
import { updateEngineerAction } from "@/features/engineers/actions";
import { EngineerForm } from "@/features/engineers/engineer-form";
import { paiseToInput } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";
import { getEngineer } from "@/server/services/engineers";
import { projectOptions } from "@/server/services/projects";

export const metadata: Metadata = { title: "Edit engineer" };

export default function EditEngineerPage(props: PageProps<"/engineers/[id]/edit">) {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <EditEngineer params={props.params} />
    </Suspense>
  );
}

async function EditEngineer({ params }: { params: PageProps<"/engineers/[id]/edit">["params"] }) {
  const { id } = await params;
  const user = await requireUser();
  if (!can(user, "engineers.manage")) return <NoAccess />;
  const [engineer, projects] = await Promise.all([getEngineer(user, id), projectOptions(user)]);
  if (!engineer) return <NotFoundPanel what="engineer" backHref="/engineers" backLabel="Back to engineers" />;
  return (
    <div className="page-enter">
      <PageHeader title={`Edit ${engineer.name}`} back={{ href: `/engineers/${id}`, label: engineer.name }} />
      <EngineerForm
        action={updateEngineerAction.bind(null, id)}
        values={{
          name: engineer.name,
          phone: engineer.phone ?? "",
          altPhone: engineer.altPhone ?? "",
          email: engineer.email ?? "",
          qualification: engineer.qualification ?? "",
          role: engineer.role ?? "",
          joiningDate: engineer.joiningDate ?? "",
          payFrequency: engineer.payFrequency,
          salary: engineer.salaryPaise !== null ? paiseToInput(engineer.salaryPaise) : "",
          dailyWage: engineer.dailyWagePaise !== null ? paiseToInput(engineer.dailyWagePaise) : "",
          responsibilities: engineer.responsibilities ?? "",
          notes: engineer.notes ?? "",
          projectIds: engineer.projects.map((p) => p.project.id),
        }}
        projects={projects}
        showPay={can(user, "wages.view")}
        submitLabel="Save changes"
        cancelHref={`/engineers/${id}`}
      />
    </div>
  );
}
