"use client";

import { useActionState, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  changePassword,
  deleteAccount,
  saveApiKey,
  signOutOtherDevices,
  updatePrefs,
  updateProfile,
} from "@/app/actions/account";
import { Checkbox, FormMessage, PasswordInput, SelectInput, SubmitButton, TextArea, TextInput } from "../forms";
import { useTheme } from "../hooks";
import { Info, Moon, Sun, X } from "../icons";
import { btn, cx } from "../ui";

export function ProfileForm({
  user,
}: {
  user: { name: string; email: string; role: string; company: string; city: string; bio: string };
}) {
  const [state, action] = useActionState(updateProfile, undefined);
  const [bio, setBio] = useState(user.bio);
  const fe = state?.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-5" noValidate>
      <div className="grid gap-5 sm:grid-cols-2">
        <TextInput label="Full name" name="name" autoComplete="name" defaultValue={user.name} error={fe.name} />
        <TextInput
          label="Email"
          name="email_display"
          value={user.email}
          readOnly
          className="cursor-not-allowed bg-bg text-muted"
          hint="Your login email can't be changed yet."
        />
        <SelectInput key={user.role} label="Role" name="role" defaultValue={user.role} error={fe.role}>
          <option value="">Choose a role</option>
          {["Founder", "Co-founder", "Product manager", "Student", "Investor", "Other"].map((r) => (
            <option key={r}>{r}</option>
          ))}
        </SelectInput>
        <TextInput label="Company or project" name="company" defaultValue={user.company} placeholder="Kirana Konnect" maxLength={80} />
        <TextInput label="City" name="city" autoComplete="address-level2" defaultValue={user.city} placeholder="Indore" maxLength={60} />
      </div>
      <TextArea
        label="About you"
        name="bio"
        value={bio}
        onChange={(e) => setBio(e.target.value)}
        maxLength={280}
        className="min-h-[96px]"
        placeholder="Second-time founder building tools for small retailers."
        hint={<span className="flex justify-end tabular-nums">{bio.length}/280</span>}
      />
      <FormMessage error={state?.error} ok={state?.ok} />
      <div className="flex justify-end">
        <SubmitButton size="md" pendingText="Saving…" className="w-full sm:w-auto">
          Save profile
        </SubmitButton>
      </div>
    </form>
  );
}

export function ThemeChoice() {
  const [theme, choose] = useTheme();
  const opts = [
    { id: "light" as const, label: "Light", Icon: Sun, note: "Default" },
    { id: "dark" as const, label: "Dark", Icon: Moon, note: "Easier at night" },
  ];
  return (
    <div role="radiogroup" aria-label="Theme" className="grid gap-3 sm:grid-cols-2">
      {opts.map(({ id, label, Icon, note }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={theme === id}
          onClick={() => choose(id)}
          className={cx(
            "flex items-center gap-3 rounded-xl border p-4 text-left transition-[border-color,box-shadow]",
            theme === id ? "border-brand shadow-[0_0_0_3px_rgb(79_70_229/0.15)]" : "border-edge hover:border-edge-strong",
          )}
        >
          <span
            className={cx(
              "flex h-10 w-10 items-center justify-center rounded-lg",
              id === "light" ? "bg-[#faf9f6] text-[#1c1917] ring-1 ring-[#e7e5e4]" : "bg-[#1a1714] text-[#f5f3ef]",
            )}
          >
            <Icon size={18} />
          </span>
          <span>
            <span className="block text-sm font-medium">{label}</span>
            <span className="block text-[13px] text-muted">{note}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

export function PrefsForm({ prefs }: { prefs: { emailOnFinish: boolean; productUpdates: boolean } }) {
  const [state, action] = useActionState(updatePrefs, undefined);
  return (
    <form action={action} className="space-y-4">
      <Checkbox name="emailOnFinish" defaultChecked={prefs.emailOnFinish} label={<><span className="font-medium text-ink">Run finished</span> · email me when a verdict is ready</>} />
      <Checkbox name="productUpdates" defaultChecked={prefs.productUpdates} label={<><span className="font-medium text-ink">Product updates</span> · new rooms and features, about once a month</>} />
      <FormMessage error={state?.error} ok={state?.ok} />
      <div className="flex justify-end">
        <SubmitButton size="md" variant="secondary" pendingText="Saving…" className="w-full sm:w-auto">
          Save preferences
        </SubmitButton>
      </div>
    </form>
  );
}

export function ChangePasswordForm() {
  const [state, action] = useActionState(changePassword, undefined);
  const fe = state?.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="text" name="username" autoComplete="username" hidden readOnly />
      <PasswordInput label="Current password" name="current" autoComplete="current-password" error={fe.current} />
      <PasswordInput label="New password" name="password" autoComplete="new-password" showRules error={fe.password} />
      <FormMessage error={state?.error} ok={state?.ok} />
      <div className="flex justify-end">
        <SubmitButton size="md" pendingText="Updating…" className="w-full sm:w-auto">
          Update password
        </SubmitButton>
      </div>
    </form>
  );
}

export function SignOutOthersForm({ sessions }: { sessions: number }) {
  const [state, action] = useActionState(signOutOtherDevices, undefined);
  return (
    <form action={action} className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium">Active sessions</p>
          <p className="text-[13px] text-muted">
            You&apos;re signed in on {sessions} device{sessions === 1 ? "" : "s"}, including this one.
          </p>
        </div>
        <SubmitButton size="sm" variant="secondary" pendingText="Signing out…">
          Sign out other devices
        </SubmitButton>
      </div>
      <FormMessage error={state?.error} ok={state?.ok} />
    </form>
  );
}

export function ApiKeyForm({ allowed }: { allowed: boolean }) {
  const [state, action] = useActionState(saveApiKey, undefined);
  const fe = state?.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
        <SelectInput label="Provider" name="provider" defaultValue="anthropic" error={fe.provider}>
          <option value="anthropic">Anthropic (Claude)</option>
          <option value="sarvam">Sarvam</option>
        </SelectInput>
        <TextInput label="API key" name="key" type="password" autoComplete="off" spellCheck={false} placeholder="sk-ant-…" error={fe.key} />
      </div>
      {!allowed && (
        <p className="flex items-start gap-2 rounded-xl bg-bg px-3.5 py-3 text-[13px] text-muted">
          <Info size={16} className="mt-px shrink-0" /> Bring your own key is part of Pro and Deep. Your key would be encrypted
          with AES-256 and never shown again.
        </p>
      )}
      <FormMessage error={state?.error} ok={state?.ok} />
      <div className="flex justify-end">
        <SubmitButton size="md" variant="secondary" pendingText="Saving…" className="w-full sm:w-auto">
          Save key
        </SubmitButton>
      </div>
    </form>
  );
}

export function DeleteAccountForm({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(deleteAccount, undefined);
  const fe = state?.fieldErrors ?? {};
  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium">Delete account</p>
          <p className="text-[13px] text-muted">Permanently removes your profile, runs, credits and keys. This can&apos;t be undone.</p>
        </div>
        {!open && (
          <button type="button" onClick={() => setOpen(true)} className={btn("secondary", "sm", "border-danger/40 text-danger hover:border-danger hover:bg-danger-soft")}>
            Delete account
          </button>
        )}
      </div>
      <AnimatePresence>
        {open && (
          <motion.form
            action={action}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
            noValidate
          >
            <div className="mt-4 space-y-4 rounded-xl border border-danger/30 bg-danger-soft/40 p-4">
              <TextInput
                label={`Type ${email} to confirm`}
                name="confirm"
                autoComplete="off"
                spellCheck={false}
                error={fe.confirm}
              />
              <PasswordInput label="Your password" name="password" autoComplete="current-password" error={fe.password} />
              <FormMessage error={state?.error} />
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setOpen(false)} className={btn("ghost", "md")}>
                  <X size={16} /> Cancel
                </button>
                <SubmitButton size="md" variant="danger" pendingText="Deleting…">
                  Permanently delete
                </SubmitButton>
              </div>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Payments aren't connected yet: explain instead of pretending to charge. */
export function CheckoutButton({ label, variant = "secondary" }: { label: string; variant?: "brand" | "secondary" }) {
  const [note, setNote] = useState(false);
  return (
    <div className="w-full">
      <button type="button" onClick={() => setNote(true)} className={btn(variant, "md", "w-full")}>
        {label}
      </button>
      <AnimatePresence>
        {note && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            role="status"
            className="mt-2.5 flex items-start gap-1.5 text-[13px] leading-relaxed text-muted"
          >
            <Info size={15} className="mt-px shrink-0" />
            Razorpay checkout isn&apos;t connected yet, so no payment was taken.
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
