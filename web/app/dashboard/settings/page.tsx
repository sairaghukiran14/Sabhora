import type { Metadata } from "next";
import { countSessions, getCurrentUser, listApiKeys } from "@/lib/dal";
import { ENTITLEMENTS } from "@/lib/pricing";
import { deleteApiKey } from "@/app/actions/account";
import { PageHeader, Section } from "@/components/app/bits";
import {
  ApiKeyForm, ChangePasswordForm, DeleteAccountForm, PrefsForm, SignOutOthersForm, ThemeChoice,
} from "@/components/app/AccountForms";
import { Key, Trash } from "@/components/icons";
import { btn, formatDate } from "@/components/ui";

export const metadata: Metadata = { title: "Settings · Sabhora" };

const jump = [
  { id: "appearance", label: "Appearance" },
  { id: "security", label: "Security" },
  { id: "api-keys", label: "API keys" },
  { id: "notifications", label: "Notifications" },
  { id: "danger", label: "Danger zone" },
];

export default async function SettingsPage() {
  const user = await getCurrentUser();
  const [keys, sessions] = await Promise.all([listApiKeys(), countSessions()]);
  const byok = ENTITLEMENTS[user.tier].byok;

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" sub="Appearance, security, API keys and notifications." />

      <nav aria-label="Settings sections" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {jump.map((j) => (
          <a key={j.id} href={`#${j.id}`} className="shrink-0 rounded-full border border-edge bg-surface px-4 py-2 text-sm text-muted transition-colors hover:text-ink">
            {j.label}
          </a>
        ))}
      </nav>

      <Section id="appearance" title="Appearance" sub="Light is the default. Your choice is saved on this device.">
        <ThemeChoice />
      </Section>

      <Section id="security" title="Security" sub="Changing your password signs out every other device.">
        <div className="space-y-6">
          <ChangePasswordForm />
          <div className="border-t border-edge pt-6">
            <SignOutOthersForm sessions={sessions} />
          </div>
        </div>
      </Section>

      <Section
        id="api-keys"
        title="Bring your own API key"
        sub="Not used by runs yet. Keys are stored encrypted and never shown again."
        aside={!byok ? <span className="w-fit rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent-ink">Pro</span> : undefined}
      >
        {keys.length > 0 && (
          <ul className="mb-5 divide-y divide-edge rounded-xl border border-edge">
            {keys.map((k) => (
              <li key={k.id} className="flex items-center gap-3 px-4 py-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-bg text-muted">
                  <Key size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium capitalize">{k.provider}</p>
                  <p className="text-[13px] text-muted">
                    ••••{k.last4} · added {formatDate(k.createdAt)}
                  </p>
                </div>
                <form action={deleteApiKey}>
                  <input type="hidden" name="id" value={k.id} />
                  <button type="submit" className={btn("ghost", "sm", "text-danger hover:bg-danger-soft hover:text-danger")} aria-label={`Remove ${k.provider} key`}>
                    <Trash size={15} />
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <ApiKeyForm allowed={byok} />
      </Section>

      <Section id="notifications" title="Notifications" sub={`Sent to ${user.email}.`}>
        <PrefsForm prefs={user.prefs} />
      </Section>

      <section id="danger" className="scroll-mt-24 rounded-2xl border border-danger/30 bg-surface p-5 shadow-soft sm:p-6">
        <h2 className="font-display text-lg text-danger">Danger zone</h2>
        <div className="mt-4">
          <DeleteAccountForm email={user.email} />
        </div>
      </section>
    </div>
  );
}
