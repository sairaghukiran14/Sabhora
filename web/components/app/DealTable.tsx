"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { motion } from "framer-motion";
import { decideDeal } from "@/app/actions/runs";
import type { Ask, DealReason, Offer, RunEvent, TableItem } from "@/lib/events";
import { money, valuationLakh } from "@/lib/money";
import { Alert, Check, Clock } from "../icons";
import { btn, cx } from "../ui";
import { inputBase } from "../forms";

/** The Sharks deal table: offers, the founder's accept / counter / walk, and the outcome. */

type Choice = Extract<RunEvent, { type: "founder_choice" }>;
type Deal = Extract<RunEvent, { type: "deal" }>;
type Move = Parameters<typeof decideDeal>[1];

const ACTION: Record<string, { label: string; cls: string }> = {
  offer: { label: "Offer", cls: "bg-success-soft text-success-ink" },
  join: { label: "Teams up", cls: "bg-success-soft text-success-ink" },
  improve: { label: "Raises the offer", cls: "bg-success-soft text-success-ink" },
  hold: { label: "Holds", cls: "bg-accent-soft text-accent-ink" },
  revise: { label: "Final offer", cls: "bg-accent-soft text-accent-ink" },
  accept: { label: "Accepts your counter", cls: "bg-success text-white" },
  withdraw: { label: "Withdraws", cls: "bg-danger text-white" },
  out: { label: "I'm out", cls: "bg-danger text-white" },
};

const OUTCOME: Record<DealReason, string> = {
  accepted: "You took the offer.",
  counter_accepted: "Your counter was accepted.",
  walked: "You walked away.",
  timeout: "Time ran out before you chose.",
  withdrawn: "Every offer was withdrawn.",
  all_out: "Every shark went out.",
  no_offers: "No offers came in.",
};

export function Terms({ offer }: { offer: Offer }) {
  const rows: [string, string][] = [];
  if (offer.investment_lakh > 0) rows.push(["Equity deal", `${money(offer.investment_lakh)} for ${offer.equity_pct}%`]);
  if (offer.debt_lakh > 0) rows.push(["Debt", `${money(offer.debt_lakh)} at ${offer.debt_interest_pct}% a year`]);
  if (offer.royalty_pct > 0) rows.push(["Royalty", `${offer.royalty_pct}% of revenue until ${money(offer.royalty_until_lakh)} is repaid`]);
  if (offer.valuation_lakh) rows.push(["Valuation", money(offer.valuation_lakh)]);
  return (
    <dl className="space-y-1 text-[13px]">
      {rows.map(([k, v]) => (
        <div key={k} className="flex flex-wrap justify-between gap-x-4">
          <dt className="text-muted">{k}</dt>
          <dd className="font-medium tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function AskChip({ ask }: { ask: Ask }) {
  return (
    <p className="rounded-xl border border-dashed border-edge-strong bg-surface px-4 py-3 text-sm">
      <span className="text-muted">The ask: </span>
      <span className="font-medium">
        {money(ask.investment_lakh)} for {ask.equity_pct}%
      </span>
      <span className="text-muted"> · valuing the company at {money(ask.valuation_lakh)}</span>
    </p>
  );
}

export function DealResult({ deal }: { deal: Deal }) {
  const won = deal.outcome === "deal" && deal.offer;
  return (
    <div className={cx("rounded-xl border p-4", won ? "border-success/40 bg-success-soft" : "border-edge bg-bg")}>
      <p className="font-display text-lg">{won ? `Deal with ${deal.offer!.names.join(" and ")}` : "No deal"}</p>
      <p className="mt-0.5 text-[13px] text-muted">{OUTCOME[deal.reason]}</p>
      {won && (
        <div className="mt-3">
          <Terms offer={deal.offer!} />
        </div>
      )}
      {won && <p className="mt-3 text-[12px] text-muted">A practice deal with AI characters. No money or equity changes hands.</p>}
    </div>
  );
}

export default function DealTable({
  items,
  choice,
  runId,
  deal,
  avatar,
}: {
  items: TableItem[];
  choice: Choice | null;
  /** Set only for the signed-in owner of a live run. */
  runId: string | null;
  deal: Deal | null;
  avatar: (id: string, name: string) => ReactNode;
}) {
  return (
    <section aria-label="Deal table" className="space-y-4">
      <div className="rounded-2xl border border-mode/30 bg-surface p-4 shadow-soft sm:p-6">
        <p className="text-[13px] font-medium text-muted">
          <span className="rounded-full bg-mode-soft px-2 py-0.5 text-[11px] text-mode-ink">Deal table</span>
        </p>
        <div className="mt-4 space-y-4">
          {items.map((item) => {
            if (item.type === "notice") {
              return (
                <p key={item.id} className="text-center text-[13px] text-muted">
                  {item.text}
                </p>
              );
            }
            if (item.type === "founder_deal") {
              return (
                <motion.div key={item.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end">
                  <div className="w-full max-w-[85%] rounded-2xl rounded-tr-sm bg-brand-soft p-4">
                    <p className="text-sm font-medium">
                      {item.action === "walk" ? "You walked away" : item.action === "accept" ? "You accepted" : "Your counter-offer"}
                      {item.offer ? ` · ${item.offer.names.join(" and ")}` : ""}
                    </p>
                    {item.offer && (
                      <div className="mt-2">
                        <Terms offer={item.offer} />
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            }
            return (
              <motion.div key={item.id} initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="flex gap-3">
                {avatar(item.speaker, item.name)}
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 text-sm">
                    <span className="font-medium">{item.name}</span>
                    <span className={cx("rounded-full px-2 py-0.5 text-[11px] font-medium", ACTION[item.action].cls)}>{ACTION[item.action].label}</span>
                  </p>
                  <div className="mt-1.5 rounded-2xl rounded-tl-sm border border-edge bg-bg px-4 py-3">
                    <p className="break-words text-[15px] leading-relaxed">{item.text}</p>
                    {item.offer && (
                      <div className="mt-3 border-t border-edge pt-3">
                        {item.offer.sharks.length > 1 && <p className="mb-1.5 text-[12px] text-faint">Joint offer: {item.offer.names.join(" and ")}</p>}
                        <Terms offer={item.offer} />
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
      {runId && choice && <YourCall key={choice.id} runId={runId} choice={choice} />}
      {deal && <DealResult deal={deal} />}
    </section>
  );
}

function YourCall({ runId, choice }: { runId: string; choice: Choice }) {
  const waitS = choice.wait_s;
  const [left, setLeft] = useState(Math.round(waitS));
  const [countering, setCountering] = useState<Offer | null>(null);
  const [state, setState] = useState<"open" | "sending" | "sent">("open");
  const [error, setError] = useState("");

  useEffect(() => {
    const deadline = choice.expires_at ? choice.expires_at * 1000 : Date.now() + waitS * 1000;
    const tick = () => setLeft(Math.round(Math.min(waitS, Math.max(0, (deadline - Date.now()) / 1000))));
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 500);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [waitS, choice.expires_at]);

  async function send(move: Move) {
    setState("sending");
    setError("");
    const result = await decideDeal(runId, move).catch(() => ({ error: "Couldn't send that. Try again." }));
    if ("error" in result) {
      setError(result.error);
      setState("open");
    } else setState("sent");
  }

  if (state === "sent") {
    return (
      <p role="status" className="flex items-center gap-2 rounded-2xl bg-success-soft px-4 py-3 text-sm text-success-ink">
        <Check size={16} /> Sent.
      </p>
    );
  }
  const busy = state === "sending";

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border-2 border-mode bg-surface p-4 shadow-card sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="font-display text-lg">Your call</p>
        <span className={cx("flex items-center gap-1.5 text-sm font-medium tabular-nums", left <= 15 ? "text-danger" : "text-muted")}>
          <Clock size={15} /> {left}s
        </span>
      </div>
      <p className="mt-1 text-[13px] text-muted">
        {choice.can_counter ? "Accept an offer, counter one of them (you get one counter), or walk away." : "You've used your counter. Accept an offer or walk away."}
      </p>

      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {choice.offers.map((offer) => (
          <li key={offer.id} className={cx("flex flex-col rounded-xl border p-3.5", countering?.id === offer.id ? "border-mode bg-mode-soft/40" : "border-edge")}>
            <p className="text-sm font-medium">{offer.names.join(" and ")}</p>
            <div className="mt-2 flex-1">
              <Terms offer={offer} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={() => send({ action: "accept", offer_id: offer.id })} className={btn("brand", "sm")} aria-label={`Accept the offer from ${offer.names.join(" and ")}`}>
                Accept
              </button>
              {choice.can_counter && (
                <button type="button" disabled={busy} onClick={() => setCountering(offer)} className={btn("ghost", "sm")} aria-label={`Counter the offer from ${offer.names.join(" and ")}`}>
                  Counter
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {countering && choice.can_counter && <CounterForm key={countering.id} offer={countering} busy={busy} onSend={send} onCancel={() => setCountering(null)} />}

      {error && (
        <p role="alert" className="mt-3 flex items-center gap-1.5 text-[13px] text-danger">
          <Alert size={14} /> {error}
        </p>
      )}
      <div className="mt-4 flex justify-end border-t border-edge pt-3">
        <button type="button" disabled={busy} onClick={() => send({ action: "walk" })} className={btn("ghost", "sm")}>
          Walk away
        </button>
      </div>
    </motion.div>
  );
}

function CounterForm({ offer, busy, onSend, onCancel }: { offer: Offer; busy: boolean; onSend: (m: Move) => void; onCancel: () => void }) {
  const [amount, setAmount] = useState(String(offer.investment_lakh || offer.debt_lakh));
  const [equity, setEquity] = useState(String(offer.equity_pct || ""));
  const [royalty, setRoyalty] = useState(String(offer.royalty_pct));
  const value = valuationLakh(Number(amount), Number(equity));
  const ok = Number(amount) >= 1 && Number(equity) >= 0.1 && Number(equity) <= 100 && Number(royalty) >= 0 && Number(royalty) <= 15;
  const field = (label: string, v: string, set: (s: string) => void) => (
    <label className="block text-[13px] font-medium">
      {label}
      <input value={v} onChange={(e) => set(e.target.value)} inputMode="decimal" className={cx(inputBase, "mt-1 h-11 border-edge-strong")} />
    </label>
  );

  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        if (ok) onSend({ action: "counter", offer_id: offer.id, investment_lakh: Number(amount), equity_pct: Number(equity), royalty_pct: Number(royalty) });
      }}
      className="mt-4 rounded-xl bg-bg p-3.5"
    >
      <p className="text-sm font-medium">Your counter to {offer.names.join(" and ")}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {field("Amount (₹ lakh)", amount, setAmount)}
        {field("Equity (%)", equity, setEquity)}
        {field("Royalty (%)", royalty, setRoyalty)}
      </div>
      <p className="mt-2 text-[13px] text-muted" aria-live="polite">
        {value ? `Values your company at ${money(value)}.` : "Enter an amount and equity."}
        {offer.debt_lakh > 0 ? ` The ${money(offer.debt_lakh)} debt stays as offered.` : ""}
      </p>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onCancel} className={btn("ghost", "sm")}>
          Cancel
        </button>
        <button type="submit" disabled={!ok || busy} className={btn("brand", "sm")}>
          Send counter
        </button>
      </div>
    </form>
  );
}
