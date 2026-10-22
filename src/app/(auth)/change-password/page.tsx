import { Suspense } from "react";
import type { Metadata } from "next";
import { FormSkeleton } from "@/components/app/skeletons";
import { requireUser } from "@/server/auth/current-user";
import { ChangePasswordForm } from "@/features/users/change-password-form";

export const metadata: Metadata = { title: "Change password" };

export default function ChangePasswordPage() {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <Gate />
    </Suspense>
  );
}

async function Gate() {
  const user = await requireUser({ allowPasswordChange: true });
  return <ChangePasswordForm firstLogin={user.mustChangePassword} name={user.name} />;
}
