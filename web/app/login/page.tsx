import { Suspense } from "react";
import type { Metadata } from "next";
import NextLink from "next/link";
import AuthShell, { FormSkeleton } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/AuthForms";

export const metadata: Metadata = { title: "Log in · Sabhora" };

export default function LoginPage() {
  return (
    <AuthShell
      title="Welcome back"
      sub="Log in to see your verdicts and start a new run."
      footer={
        <>
          New to Sabhora?{" "}
          <NextLink href="/signup" className="font-medium text-brand-ink hover:underline">
            Create a free account
          </NextLink>
        </>
      }
    >
      <Suspense fallback={<FormSkeleton rows={2} />}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
