import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound, UserCog } from "lucide-react";
import { PageHeader, Section } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/skeletons";
import { Button } from "@/components/ui/button";
import { CompanyProfileForm, SessionsList } from "@/features/users/account-widgets";
import { formatDateTime } from "@/lib/dates";
import { roleLabel } from "@/lib/labels";
import { PERMISSIONS } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";
import { companyProfile, listSessions } from "@/server/services/users";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <Suspense fallback={<PageSkeleton tiles={0} rows={6} />}>
      <Settings />
    </Suspense>
  );
}

function describeDevice(userAgent: string | null): string {
  if (!userAgent) return "Unknown device";
  const os = /Android/i.test(userAgent)
    ? "Android phone"
    : /iPhone|iPad/i.test(userAgent)
      ? "iPhone / iPad"
      : /Windows/i.test(userAgent)
        ? "Windows computer"
        : /Mac OS/i.test(userAgent)
          ? "Mac"
          : /Linux/i.test(userAgent)
            ? "Linux computer"
            : "Device";
  const browser = /Edg\//.test(userAgent) ? "Edge" : /Chrome\//.test(userAgent) ? "Chrome" : /Firefox\//.test(userAgent) ? "Firefox" : /Safari\//.test(userAgent) ? "Safari" : "browser";
  return `${os} · ${browser}`;
}

async function Settings() {
  const user = await requireUser();
  const [sessions, company] = await Promise.all([listSessions(user), companyProfile()]);
  const isOwner = user.role === "ADMIN";

  return (
    <div className="page-enter flex flex-col gap-6">
      <PageHeader title="My account" description="Your login, password and the devices you are signed in on." className="mb-0" />

      <Section
        title="Your details"
        actions={
          <Button asChild variant="outline">
            <Link href="/change-password">
              <KeyRound className="size-4" /> Change password
            </Link>
          </Button>
        }
      >
        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Name</dt>
            <dd className="font-medium">{user.name}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Login name</dt>
            <dd className="font-medium">{user.username}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Role</dt>
            <dd className="font-medium">{roleLabel(user.role)}</dd>
          </div>
        </dl>
        {!isOwner && (
          <div className="mt-4 border-t pt-4">
            <p className="mb-2 text-sm font-medium">What you can do</p>
            {user.permissions.length === 0 ? (
              <p className="text-sm text-muted-foreground">You can view your assigned projects. Ask the owner for more access.</p>
            ) : (
              <ul className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
                {user.permissions.map((p) => (
                  <li key={p}>• {PERMISSIONS[p].label}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Section>

      {isOwner && (
        <Section
          title="Company"
          description="Printed on quotations, bills and receipts."
          actions={
            <Button asChild variant="outline">
              <Link href="/settings/users">
                <UserCog className="size-4" /> Users & permissions
              </Link>
            </Button>
          }
        >
          <CompanyProfileForm profile={company} />
        </Section>
      )}

      <Section
        title={isOwner ? "Signed-in devices (everyone)" : "Your signed-in devices"}
        description="If you see a device you don't recognise, sign it out and change your password."
      >
        <SessionsList
          showWho={isOwner}
          sessions={sessions.map((s) => ({
            id: s.id,
            current: s.id === user.sessionId,
            who: s.user.name,
            device: describeDevice(s.userAgent),
            ip: s.ipAddress,
            lastSeen: formatDateTime(s.lastSeenAt),
            started: formatDateTime(s.createdAt),
          }))}
        />
      </Section>
    </div>
  );
}
