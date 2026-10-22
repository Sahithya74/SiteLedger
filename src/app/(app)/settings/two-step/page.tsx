import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { PageHeader, Section } from "@/components/app/page-header";
import { FormSkeleton } from "@/components/app/skeletons";
import { EnableTwoStepForm } from "@/features/users/two-step-widgets";
import { requireUser } from "@/server/auth/current-user";
import { beginTotpSetup, totpStatus } from "@/server/services/users";

export const metadata: Metadata = { title: "2-step login" };

export default function TwoStepPage() {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <TwoStep />
    </Suspense>
  );
}

async function TwoStep() {
  const user = await requireUser();
  const status = await totpStatus(user);
  if (status.enabled) redirect("/settings");
  const { secret, url } = await beginTotpSetup(user);
  const svg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#1c1917", light: "#ffffff" } });

  return (
    <div className="page-enter flex max-w-3xl flex-col gap-5">
      <PageHeader
        title="Turn on 2-step login"
        description="After this, logging in needs your password and a 6-digit code from your phone. Someone who learns your password still cannot get in."
        back={{ href: "/settings", label: "My account" }}
        className="mb-0"
      />
      <Section title="1. Install an authenticator app">
        <p className="text-sm">Google Authenticator or Microsoft Authenticator (free, from the Play Store or App Store).</p>
      </Section>
      <Section title="2. Scan this code with the app">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          {/* QR code generated on the server from the secret below; nothing is sent to other websites. */}
          <div className="size-48 shrink-0 rounded-lg border bg-white p-2 [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: svg }} />
          <div className="text-sm">
            <p>In the app tap “+” and “Scan a QR code”.</p>
            <p className="mt-3 text-muted-foreground">Can’t scan? Choose “Enter a setup key” and type:</p>
            <p className="tabular mt-1 rounded-md bg-muted px-2 py-1.5 font-mono text-sm break-all select-all">{secret.match(/.{1,4}/g)?.join(" ")}</p>
            <p className="mt-2 text-xs text-muted-foreground">Keep this key private. Anyone with it can make your codes.</p>
          </div>
        </div>
      </Section>
      <Section title="3. Type the code the app shows">
        <EnableTwoStepForm />
      </Section>
      <p className="text-sm text-muted-foreground">
        Lost your phone later? A manager’s 2-step login is turned off when the owner resets their password. The owner can turn off their own from this computer with{" "}
        <code className="rounded bg-muted px-1">npm run user:disable-2fa -- {status.username}</code>.
      </p>
    </div>
  );
}
