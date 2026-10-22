import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ToneBadge } from "@/components/app/badges";
import { NoAccess } from "@/components/app/no-access";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/skeletons";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AddManagerDialog } from "@/features/users/manager-widgets";
import { formatDateTime } from "@/lib/dates";
import { roleLabel } from "@/lib/labels";
import { requireUser } from "@/server/auth/current-user";
import { listUsers } from "@/server/services/users";

export const metadata: Metadata = { title: "Users & permissions" };

export default function UsersPage() {
  return (
    <Suspense fallback={<PageSkeleton tiles={0} rows={4} />}>
      <Users />
    </Suspense>
  );
}

async function Users() {
  const user = await requireUser();
  if (user.role !== "ADMIN") return <NoAccess message="Only the owner can manage users." />;
  const users = await listUsers(user);
  return (
    <div className="page-enter">
      <PageHeader
        title="Users & permissions"
        description="Only the owner and managers can log in. Clients, workers and engineers never get accounts."
        back={{ href: "/settings", label: "Settings" }}
        actions={<AddManagerDialog />}
      />
      <div className="overflow-hidden rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="hidden md:table-cell">Access</TableHead>
              <TableHead className="hidden sm:table-cell">Last login</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="py-3">
                  {u.role === "MANAGER" || u.id === user.id ? (
                    <Link href={`/settings/users/${u.id}`} className="font-medium hover:underline">
                      {u.name}
                    </Link>
                  ) : (
                    <span className="font-medium">{u.name}</span>
                  )}
                  <div className="text-xs text-muted-foreground">{u.username}</div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    <ToneBadge tone={u.role === "ADMIN" ? "violet" : "blue"}>{roleLabel(u.role)}</ToneBadge>
                    {!u.isActive && <ToneBadge tone="grey">Deactivated</ToneBadge>}
                    {u.mustChangePassword && u.isActive && <ToneBadge tone="amber">Must set password</ToneBadge>}
                  </div>
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                  {u.role === "ADMIN"
                    ? "Everything"
                    : `${u._count.permissions} permissions · ${u._count.projectAssignments} project${u._count.projectAssignments === 1 ? "" : "s"}`}
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "Never"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
