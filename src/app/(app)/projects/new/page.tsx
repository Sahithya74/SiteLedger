import { Suspense } from "react";
import type { Metadata } from "next";
import { NoAccess } from "@/components/app/no-access";
import { PageHeader } from "@/components/app/page-header";
import { FormSkeleton } from "@/components/app/skeletons";
import { createProjectAction } from "@/features/projects/actions";
import { EMPTY_PROJECT } from "@/features/projects/form-values";
import { ProjectForm } from "@/features/projects/project-form";
import { todayIST } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";
import { clientOptions } from "@/server/services/clients";
import { getQuotation } from "@/server/services/billing";
import { paiseToInput } from "@/lib/money";

export const metadata: Metadata = { title: "New project" };

export default function NewProjectPage(props: PageProps<"/projects/new">) {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <NewProject searchParams={props.searchParams} />
    </Suspense>
  );
}

async function NewProject({ searchParams }: { searchParams: PageProps<"/projects/new">["searchParams"] }) {
  const user = await requireUser();
  if (!can(user, "projects.create")) return <NoAccess />;
  const [clients, params] = await Promise.all([clientOptions(user), searchParams]);
  const clientId = typeof params.clientId === "string" ? params.clientId : "";
  // Coming from an accepted quotation: start with its title and amount.
  const quote = typeof params.quote === "string" ? await getQuotation(user, params.quote) : null;
  const fromQuote = quote ? { name: quote.title, quoted: paiseToInput(quote.totalPaise), contract: paiseToInput(quote.totalPaise), clientId: quote.clientId } : {};
  return (
    <div className="page-enter">
      <PageHeader title="New project" description="Fill in what you know now — everything can be changed later." back={{ href: "/projects", label: "Projects" }} />
      <ProjectForm
        action={createProjectAction}
        values={{ ...EMPTY_PROJECT, clientId, startDate: todayIST(), ...fromQuote }}
        clients={clients}
        showMoney={can(user, "projects.viewMoney")}
        canChangeStatus
        submitLabel="Create project"
        cancelHref="/projects"
      />
    </div>
  );
}
