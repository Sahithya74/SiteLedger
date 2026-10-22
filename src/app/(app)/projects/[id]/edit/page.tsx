import { Suspense } from "react";
import type { Metadata } from "next";
import { NoAccess, NotFoundPanel } from "@/components/app/no-access";
import { PageHeader } from "@/components/app/page-header";
import { FormSkeleton } from "@/components/app/skeletons";
import { updateProjectAction } from "@/features/projects/actions";
import { ProjectForm } from "@/features/projects/project-form";
import { paiseToInput } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";
import { clientOptions } from "@/server/services/clients";
import { getProject } from "@/server/services/projects";

export const metadata: Metadata = { title: "Edit project" };

export default function EditProjectPage(props: PageProps<"/projects/[id]/edit">) {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <EditProject params={props.params} />
    </Suspense>
  );
}

async function EditProject({ params }: { params: PageProps<"/projects/[id]/edit">["params"] }) {
  const { id } = await params;
  const user = await requireUser();
  if (!can(user, "projects.edit")) return <NoAccess />;
  const [project, clients] = await Promise.all([getProject(user, id), clientOptions(user)]);
  if (!project) return <NotFoundPanel what="project" backHref="/projects" backLabel="Back to projects" />;
  const showMoney = can(user, "projects.viewMoney");
  return (
    <div className="page-enter">
      <PageHeader title={`Edit ${project.name}`} back={{ href: `/projects/${id}`, label: project.name }} />
      <ProjectForm
        action={updateProjectAction.bind(null, id)}
        values={{
          name: project.name,
          clientId: project.clientId,
          type: project.type,
          status: project.status,
          description: project.description ?? "",
          address: project.address ?? "",
          city: project.city ?? "",
          state: project.state ?? "",
          pincode: project.pincode ?? "",
          latitude: project.latitude?.toString() ?? "",
          longitude: project.longitude?.toString() ?? "",
          mapUrl: project.mapUrl ?? "",
          startDate: project.startDate ?? "",
          expectedEndDate: project.expectedEndDate ?? "",
          actualEndDate: project.actualEndDate ?? "",
          // Amounts are only sent to people allowed to see them.
          quoted: showMoney ? paiseToInput(project.quotedPaise) : "",
          contract: showMoney ? paiseToInput(project.contractPaise) : "",
          statusNote: project.statusNote ?? "",
        }}
        clients={clients}
        showMoney={showMoney}
        canChangeStatus={can(user, "projects.updateStatus")}
        submitLabel="Save changes"
        cancelHref={`/projects/${id}`}
      />
    </div>
  );
}
