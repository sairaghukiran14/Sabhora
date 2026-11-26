import { Suspense } from "react";
import type { Metadata } from "next";
import NextLink from "next/link";
import AuthShell, { FormSkeleton } from "@/components/auth/AuthShell";
import { SignupForm } from "@/components/auth/AuthForms";

export const metadata: Metadata = { title: "Create your account · Sabhora" };

export default function SignupPage() {
  return (
    <AuthShell
      title="Create your free account"
      sub="50 free credits, no card needed. Your first verdict takes about two minutes."
      footer={
        <>
          Already have an account?{" "}
          <NextLink href="/login" className="font-medium text-brand-ink hover:underline">
            Log in
          </NextLink>
        </>
      }
    >
      <Suspense fallback={<FormSkeleton rows={3} />}>
        <SignupForm />
      </Suspense>
    </AuthShell>
  );
}
