import { Suspense } from "react";
import type { Metadata } from "next";
import { ToneBadge } from "@/components/app/badges";
import { NoAccess, NotFoundPanel } from "@/components/app/no-access";
import { PageHeader, Section } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/skeletons";
import {
  ActiveToggle,
  ManagerProjectsEditor,
  PermissionsEditor,
  ResetPasswordForm,
  UserDetailsForm,
} from "@/features/users/manager-widgets";
import { formatDateTime } from "@/lib/dates";
import { roleLabel } from "@/lib/labels";
import { requireUser } from "@/server/auth/current-user";
import { projectOptions } from "@/server/services/projects";
import { getManagedUser } from "@/server/services/users";

export const metadata: Metadata = { title: "User" };

export default function UserPage(props: PageProps<"/settings/users/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton tiles={0} rows={8} />}>
      <UserDetail params={props.params} />
    </Suspense>
  );
}

async function UserDetail({ params }: { params: PageProps<"/settings/users/[id]">["params"] }) {
  const { id } = await params;
  const me = await requireUser();
  if (me.role !== "ADMIN") return <NoAccess message="Only the owner can manage users." />;
  const [target, projects] = await Promise.all([getManagedUser(me, id), projectOptions(me, { includeClosed: true })]);
  if (!target) return <NotFoundPanel what="user" backHref="/settings/users" backLabel="Back to users" />;
  const isManager = target.role === "MANAGER";
  const isSelf = target.id === me.id;

  return (
    <div className="page-enter flex flex-col gap-6">
      <PageHeader
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            {target.name}
            <ToneBadge tone={isManager ? "blue" : "violet"}>{roleLabel(target.role)}</ToneBadge>
            {!target.isActive && <ToneBadge tone="grey">Deactivated</ToneBadge>}
          </span>
        }
        description={`Login name: ${target.username} · Last login: ${target.lastLoginAt ? formatDateTime(target.lastLoginAt) : "never"}`}
        back={{ href: "/settings/users", label: "Users & permissions" }}
        className="mb-0"
      />

      <Section title="Details">
        <UserDetailsForm userId={target.id} name={target.name} phone={target.phone ?? ""} />
      </Section>

      {isManager && (
        <>
          <Section title="What this manager can do" description="Owner-only actions (users, settings, bank accounts, reversing payments, deleting projects) can never be given to a manager.">
            <PermissionsEditor userId={target.id} current={target.permissions} />
          </Section>
          <Section title="Projects this manager can see" description="Unless “See all projects” is allowed above, managers only see the projects ticked here.">
            <ManagerProjectsEditor userId={target.id} projects={projects} current={target.projectIds} />
          </Section>
        </>
      )}

      <Section title="Password">
        <ResetPasswordForm userId={target.id} isSelf={isSelf} />
      </Section>

      {!isSelf && (
        <Section title="Account">
          <ActiveToggle userId={target.id} name={target.name} active={target.isActive} />
        </Section>
      )}
    </div>
  );
}
