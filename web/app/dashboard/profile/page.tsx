import type { Metadata } from "next";
import { getCurrentUser, getStats } from "@/lib/dal";
import { PageHeader, Section } from "@/components/app/bits";
import { ProfileForm } from "@/components/app/AccountForms";
import { formatDate, Initials } from "@/components/ui";

export const metadata: Metadata = { title: "Profile · Sabhora" };

export default async function ProfilePage() {
  const user = await getCurrentUser();
  const stats = await getStats();
  const tier = user.tier === "free" ? "Free" : user.tier === "pro" ? "Pro" : "Deep";

  return (
    <div className="space-y-6">
      <PageHeader title="Profile" sub="How you appear on shared verdicts, and a little context for the panel." />

      <div className="grid gap-6 lg:grid-cols-[300px_1fr] lg:items-start">
        <aside className="rounded-2xl border border-edge bg-surface p-6 shadow-soft lg:sticky lg:top-24">
          <div className="flex items-center gap-4 lg:flex-col lg:items-start">
            <Initials name={user.name} className="h-16 w-16 text-xl lg:h-20 lg:w-20 lg:text-2xl" />
            <div className="min-w-0">
              <p className="truncate font-display text-xl">{user.name}</p>
              <p className="truncate text-sm text-muted">{user.email}</p>
              {(user.role || user.company) && (
                <p className="mt-1 truncate text-[13px] text-muted">
                  {[user.role, user.company].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
          </div>
          <dl className="mt-6 grid grid-cols-3 gap-2 border-t border-edge pt-5 text-center lg:grid-cols-1 lg:text-left">
            <div className="lg:flex lg:justify-between">
              <dt className="text-[12px] text-muted lg:text-sm">Plan</dt>
              <dd className="mt-1 text-sm font-medium lg:mt-0">{tier}</dd>
            </div>
            <div className="lg:flex lg:justify-between">
              <dt className="text-[12px] text-muted lg:text-sm">Runs</dt>
              <dd className="mt-1 text-sm font-medium tabular-nums lg:mt-0">{stats.total}</dd>
            </div>
            <div className="lg:flex lg:justify-between">
              <dt className="text-[12px] text-muted lg:text-sm">Member since</dt>
              <dd className="mt-1 text-sm font-medium lg:mt-0">{formatDate(user.createdAt)}</dd>
            </div>
          </dl>
        </aside>

        <Section title="Your details" sub="Only your first name is shown on verdicts you share.">
          <ProfileForm user={user} />
        </Section>
      </div>
    </div>
  );
}
