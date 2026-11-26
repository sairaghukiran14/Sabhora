import type { Metadata } from "next";
import NextLink from "next/link";
import AuthShell from "@/components/auth/AuthShell";
import { ForgotForm } from "@/components/auth/AuthForms";

export const metadata: Metadata = { title: "Reset your password · Sabhora" };

export default function ForgotPage() {
  return (
    <AuthShell
      title="Reset your password"
      sub="Enter the email you signed up with and we'll send you a link to set a new password."
      footer={
        <>
          Remembered it?{" "}
          <NextLink href="/login" className="font-medium text-brand-ink hover:underline">
            Log in
          </NextLink>
        </>
      }
    >
      <ForgotForm />
    </AuthShell>
  );
}
