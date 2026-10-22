import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { FormSkeleton } from "@/components/app/skeletons";
import { userCount } from "@/server/services/users";
import { SetupForm } from "./setup-form";

export const metadata: Metadata = { title: "Set up" };

export default function SetupPage() {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <SetupGate />
    </Suspense>
  );
}

/** First-run setup is only available while no user exists. */
async function SetupGate() {
  await connection(); // always check the live database, never a build-time snapshot
  if ((await userCount()) > 0) redirect("/login");
  return <SetupForm />;
}
