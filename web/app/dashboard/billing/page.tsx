import type { Metadata } from "next";
import { getCurrentUser, listLedger } from "@/lib/dal";
import { CREDIT_PACKS, PLANS } from "@/lib/pricing";
import { PageHeader, Section } from "@/components/app/bits";
import { CheckoutButton } from "@/components/app/AccountForms";
import { Check, Coins, Shield } from "@/components/icons";
import { cx, formatDate } from "@/components/ui";

export const metadata: Metadata = { title: "Credits & billing · Sabhora" };

const KIND: Record<string, string> = { grant: "Bonus", purchase: "Purchase", reserve: "Run", settle: "Run", refund: "Refund", adjustment: "Adjustment" };

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

export default async function BillingPage() {
  const user = await getCurrentUser();
  const ledger = await listLedger(50);
  const spent = ledger.filter((l) => l.delta < 0).reduce((s, l) => s - l.delta, 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Credits & billing" sub="1 credit ≈ ₹1. Credits are held while a run is in progress and refunded if it doesn't finish." />

      <div className="grid gap-4 md:grid-cols-[1.3fr_1fr]">
        <div className="relative overflow-hidden rounded-2xl bg-[#312e81] p-6 text-white shadow-card">
          <div aria-hidden className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-[#f59e0b] opacity-25 blur-3xl" />
          <p className="relative flex items-center gap-2 text-sm text-white/75">
            <Coins size={17} /> Credit balance
          </p>
          <p className="relative mt-3 font-display text-5xl font-medium tracking-tight tabular-nums">{user.balance}</p>
          <p className="relative mt-2 text-sm text-white/70">
            Enough for {count(Math.floor(user.balance / 15), "Sharks debate")} or {count(Math.floor(user.balance / 5), "Roast")}.
          </p>
        </div>
        <div className="rounded-2xl border border-edge bg-surface p-6 shadow-soft">
          <p className="text-sm text-muted">Current plan</p>
          <p className="mt-2 font-display text-3xl">{PLANS.find((p) => p.id === user.tier)?.name ?? "Free"}</p>
          <p className="mt-2 text-sm text-muted">{spent} credits used across your runs so far.</p>
        </div>
      </div>

      <Section title="Top up credits" sub="One-off packs. Credits never expire.">
        <div className="grid gap-4 sm:grid-cols-3">
          {CREDIT_PACKS.map((p) => (
            <div key={p.id} className={cx("flex flex-col rounded-xl border p-5", p.note.startsWith("Best") ? "border-brand ring-4 ring-brand/10" : "border-edge")}>
              <p className="text-[13px] font-medium text-accent-ink">{p.note || "Starter"}</p>
              <p className="mt-2 font-display text-3xl font-medium tabular-nums">{p.credits}</p>
              <p className="text-sm text-muted">credits for {p.inr}</p>
              <div className="mt-5">
                <CheckoutButton label={`Buy for ${p.inr}`} variant={p.note.startsWith("Best") ? "brand" : "secondary"} />
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 flex items-center gap-2 text-[13px] text-muted">
          <Shield size={15} /> Payments will run through Razorpay (UPI, cards, netbanking). We never see your card details.
        </p>
      </Section>

      <Section title="Plans" sub="Monthly credits plus bigger crowds. Cancel any time.">
        <div className="grid gap-4 lg:grid-cols-3">
          {PLANS.map((p) => {
            const current = p.id === user.tier;
            return (
              <div key={p.id} className={cx("flex flex-col rounded-xl border p-5", p.featured ? "border-brand" : "border-edge")}>
                <div className="flex items-center justify-between">
                  <p className="font-display text-xl">{p.name}</p>
                  {current && <span className="rounded-full bg-success-soft px-2.5 py-1 text-xs font-medium text-success-ink">Current</span>}
                </div>
                <p className="mt-2">
                  <span className="font-display text-3xl font-medium">{p.price}</span> <span className="text-sm text-faint">{p.period}</span>
                </p>
                <ul className="mt-4 flex-1 space-y-2">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check size={16} className="mt-0.5 shrink-0 text-success" /> {f}
                    </li>
                  ))}
                </ul>
                <div className="mt-5">
                  {current ? (
                    <p className="flex h-11 items-center justify-center rounded-full bg-bg text-sm text-muted">Your plan</p>
                  ) : (
                    <CheckoutButton label={p.id === "free" ? "Switch to Free" : `Upgrade to ${p.name}`} variant={p.featured ? "brand" : "secondary"} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Credit history" sub="Every credit in and out of your account.">
        {ledger.length === 0 ? (
          <p className="text-sm text-muted">No activity yet.</p>
        ) : (
          <ul className="-my-2 divide-y divide-edge">
            {ledger.map((l) => (
              <li key={l.id} className="flex items-center gap-3 py-3">
                <span
                  className={cx(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[12px] font-semibold",
                    l.delta > 0 ? "bg-success-soft text-success-ink" : "bg-bg text-muted",
                  )}
                >
                  {l.delta > 0 ? "+" : "−"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{l.note || KIND[l.kind] || l.kind}</p>
                  <p className="text-[13px] text-muted">
                    {KIND[l.kind] ?? l.kind} · {formatDate(l.createdAt, true)}
                  </p>
                </div>
                <span className={cx("shrink-0 text-sm font-medium tabular-nums", l.delta > 0 ? "text-success-ink" : "text-ink")}>
                  {l.delta > 0 ? `+${l.delta}` : l.delta}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
