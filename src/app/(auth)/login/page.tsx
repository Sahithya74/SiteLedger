import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FormSkeleton } from "@/components/app/skeletons";
import { getCurrentUser } from "@/server/auth/current-user";
import { userCount } from "@/server/services/users";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage(props: PageProps<"/login">) {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <LoginGate searchParams={props.searchParams} />
    </Suspense>
  );
}

async function LoginGate({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  if (await getCurrentUser()) redirect("/dashboard");
  if ((await userCount()) === 0) redirect("/setup");
  const { next } = await searchParams;
  return <LoginForm next={typeof next === "string" ? next : undefined} />;
}
