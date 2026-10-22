import { Suspense } from "react";
import type { Metadata } from "next";
import { NoAccess } from "@/components/app/no-access";
import { PageHeader } from "@/components/app/page-header";
import { FormSkeleton } from "@/components/app/skeletons";
import { createEngineerAction } from "@/features/engineers/actions";
import { EngineerForm } from "@/features/engineers/engineer-form";
import { EMPTY_ENGINEER } from "@/features/engineers/form-values";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";
import { projectOptions } from "@/server/services/projects";

export const metadata: Metadata = { title: "Add engineer" };

export default function NewEngineerPage() {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <NewEngineer />
    </Suspense>
  );
}

async function NewEngineer() {
  const user = await requireUser();
  if (!can(user, "engineers.manage")) return <NoAccess />;
  const projects = await projectOptions(user);
  return (
    <div className="page-enter">
      <PageHeader title="Add engineer" back={{ href: "/engineers", label: "Engineers" }} />
      <EngineerForm
        action={createEngineerAction}
        values={EMPTY_ENGINEER}
        projects={projects}
        showPay={can(user, "wages.view")}
        submitLabel="Save engineer"
        cancelHref="/engineers"
      />
    </div>
  );
}
