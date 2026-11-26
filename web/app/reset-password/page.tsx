import { Suspense } from "react";
import type { Metadata } from "next";
import AuthShell, { FormSkeleton } from "@/components/auth/AuthShell";
import { ResetForm } from "@/components/auth/AuthForms";

export const metadata: Metadata = { title: "Set a new password · Sabhora" };

export default function ResetPage() {
  return (
    <AuthShell title="Set a new password" sub="Choose a strong password. You'll be signed out everywhere else.">
      <Suspense fallback={<FormSkeleton rows={1} />}>
        <ResetForm />
      </Suspense>
    </AuthShell>
  );
}
