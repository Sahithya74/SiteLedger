import { Suspense } from "react";
import type { Metadata } from "next";
import { param } from "@/components/app/filter-bar";
import { ActionForm, FormGrid, FormSection, SelectField, TextAreaField, TextField } from "@/components/app/form";
import { NoAccess } from "@/components/app/no-access";
import { PageHeader } from "@/components/app/page-header";
import { FormSkeleton } from "@/components/app/skeletons";
import { createMaterialRequestAction } from "@/features/materials/actions";
import { RequestItemsEditor } from "@/features/materials/items-editor";
import { addDays, todayIST } from "@/lib/dates";
import { options, PRIORITY } from "@/lib/labels";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";
import { materialOptions } from "@/server/services/materials";
import { projectOptions } from "@/server/services/projects";

export const metadata: Metadata = { title: "Request material" };

export default function NewRequestPage(props: PageProps<"/materials/requests/new">) {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <NewRequest searchParams={props.searchParams} />
    </Suspense>
  );
}

async function NewRequest({ searchParams }: { searchParams: PageProps<"/materials/requests/new">["searchParams"] }) {
  const user = await requireUser();
  if (!can(user, "materials.record")) return <NoAccess />;
  const [projects, materials, sp] = await Promise.all([projectOptions(user), materialOptions(), searchParams]);
  return (
    <div className="page-enter">
      <PageHeader title="Request material" description="The office is told straight away and can approve and order it." back={{ href: "/materials/requests", label: "Material requests" }} />
      <ActionForm action={createMaterialRequestAction} submitLabel="Send request" cancelHref="/materials/requests">
        <FormSection title="For which site">
          <FormGrid>
            <SelectField label="Project" name="projectId" options={projects.map((p) => ({ value: p.id, label: p.name }))} defaultValue={param(sp, "project")} placeholder="Choose…" required />
            <TextField label="Needed by" name="neededBy" type="date" defaultValue={addDays(todayIST(), 3)} />
            <SelectField label="How urgent" name="priority" defaultValue="MEDIUM" options={options(PRIORITY)} />
          </FormGrid>
        </FormSection>
        <FormSection title="Materials needed">
          <RequestItemsEditor materials={materials} />
        </FormSection>
        <TextAreaField label="Note for the office" name="notes" rows={2} placeholder="e.g. For the first-floor slab on Friday" />
      </ActionForm>
    </div>
  );
}
