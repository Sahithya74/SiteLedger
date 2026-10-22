import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { DatabaseBackup, KeyRound, ShieldCheck, UserCog } from "lucide-react";
import { PageHeader, Section } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/skeletons";
import { Button } from "@/components/ui/button";
import { CompanyProfileForm, SessionsList } from "@/features/users/account-widgets";
import { formatDateTime } from "@/lib/dates";
import { roleLabel } from "@/lib/labels";
import { PERMISSIONS } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";
import { companyProfile, emailStatus, listSessions, totpStatus } from "@/server/services/users";
import { EmailSettings } from "@/features/users/email-widgets";
import { DisableTwoStepDialog } from "@/features/users/two-step-widgets";

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
  const [sessions, company, twoStep, mail] = await Promise.all([listSessions(user), companyProfile(), totpStatus(user), emailStatus(user)]);
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

      <Section
        title="Email for “Forgot password”"
        description="If you forget your password, a code is sent here so you can set a new one. The address is confirmed with a code first."
      >
        {!mail.emailConfigured && (
          <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Sending email is not set up on this computer yet{isOwner ? " — add the SMTP settings to the .env file (see README → Email)." : ". Ask the owner."}
          </p>
        )}
        <EmailSettings email={mail.email} verified={mail.verified} />
      </Section>

      <Section
        title="2-step login"
        description="A 6-digit code from your phone is needed as well as your password."
        actions={
          twoStep.enabled ? (
            <DisableTwoStepDialog />
          ) : (
            <Button asChild variant={isOwner ? "default" : "outline"}>
              <Link href="/settings/two-step">
                <ShieldCheck className="size-4" /> Turn on
              </Link>
            </Button>
          )
        }
      >
        {twoStep.enabled ? (
          <p className="flex items-center gap-2 text-sm font-medium text-emerald-700">
            <ShieldCheck className="size-4" /> On — your account is protected by a code from your phone.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Off.{isOwner && " Recommended for the owner, because this account can see and change everything."}
          </p>
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

      {isOwner && (
        <Section
          title="Backup"
          description="A complete copy of all records in one file. Keep it somewhere safe (a pen drive or your own cloud storage) — it contains everything, including login details."
          actions={
            <Button asChild>
              <a href="/api/backup" download>
                <DatabaseBackup className="size-4" /> Download backup
              </a>
            </Button>
          }
        >
          <p className="text-sm text-muted-foreground">
            Take one at least every week. On this computer you can also run <code className="rounded bg-muted px-1">npm run backup</code> (it saves into the backups folder). Restoring is done on the computer
            by the owner — see README → Backup and restore.
          </p>
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
