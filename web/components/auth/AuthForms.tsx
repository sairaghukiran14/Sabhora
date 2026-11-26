"use client";

import { useActionState } from "react";
import NextLink from "next/link";
import { useSearchParams } from "next/navigation";
import { login, requestPasswordReset, resetPassword, signup } from "@/app/actions/auth";
import { Checkbox, FormMessage, PasswordInput, SubmitButton, TextInput } from "../forms";
import { Arrow, Mail } from "../icons";
import { btn } from "../ui";

export function SignupForm() {
  const [state, action] = useActionState(signup, undefined);
  const next = useSearchParams().get("next") ?? "";
  const fe = state?.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="hidden" name="next" value={next} />
      <FormMessage error={state?.error} />
      <TextInput
        label="Full name"
        name="name"
        autoComplete="name"
        placeholder="Ananya Sharma"
        defaultValue={state?.values?.name}
        error={fe.name}
        required
      />
      <TextInput
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        placeholder="you@startup.in"
        defaultValue={state?.values?.email}
        error={fe.email}
        required
      />
      <PasswordInput name="password" autoComplete="new-password" showRules error={fe.password} required />
      <Checkbox
        name="terms"
        key={state?.values?.terms}
        defaultChecked={state?.values?.terms === "on"}
        error={fe.terms}
        label={
          <>
            I agree to the <span className="text-ink underline underline-offset-2">terms</span> and{" "}
            <span className="text-ink underline underline-offset-2">privacy policy</span>.
          </>
        }
      />
      <SubmitButton pendingText="Creating your account…" className="w-full">
        Create account · get 50 credits <Arrow size={18} />
      </SubmitButton>
    </form>
  );
}

export function LoginForm() {
  const [state, action] = useActionState(login, undefined);
  const next = useSearchParams().get("next") ?? "";
  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="hidden" name="next" value={next} />
      <FormMessage error={state?.error} />
      <TextInput
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        placeholder="you@startup.in"
        defaultValue={state?.values?.email}
        required
      />
      <PasswordInput
        name="password"
        autoComplete="current-password"
        required
        aside={
          <NextLink href="/forgot-password" className="text-[13px] font-medium text-brand-ink hover:underline">
            Forgot password?
          </NextLink>
        }
      />
      <Checkbox name="remember" defaultChecked label="Keep me signed in for 30 days" />
      <SubmitButton pendingText="Logging in…" className="w-full">
        Log in <Arrow size={18} />
      </SubmitButton>
    </form>
  );
}

export function ForgotForm() {
  const [state, action] = useActionState(requestPasswordReset, undefined);
  if (state?.ok) {
    return (
      <div className="space-y-6 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-soft text-brand-ink">
          <Mail size={26} />
        </span>
        <p className="text-[15px] leading-relaxed text-muted">{state.ok}</p>
        <NextLink href="/login" className={btn("secondary", "lg", "w-full")}>
          Back to log in
        </NextLink>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormMessage error={state?.error} />
      <TextInput
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        placeholder="you@startup.in"
        defaultValue={state?.values?.email}
        error={state?.fieldErrors?.email}
        required
      />
      <SubmitButton pendingText="Sending…" className="w-full">
        Send reset link
      </SubmitButton>
    </form>
  );
}

export function ResetForm() {
  const [state, action] = useActionState(resetPassword, undefined);
  const token = useSearchParams().get("token") ?? "";
  if (!token) {
    return (
      <div className="space-y-5">
        <FormMessage error="This reset link is missing its token. Request a new link." />
        <NextLink href="/forgot-password" className={btn("brand", "lg", "w-full")}>
          Request a new link
        </NextLink>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="hidden" name="token" value={token} />
      <FormMessage error={state?.error} />
      <PasswordInput label="New password" name="password" autoComplete="new-password" showRules error={state?.fieldErrors?.password} required />
      <SubmitButton pendingText="Saving…" className="w-full">
        Set new password
      </SubmitButton>
    </form>
  );
}
