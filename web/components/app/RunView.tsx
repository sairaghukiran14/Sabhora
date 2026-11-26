"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import NextLink from "next/link";
import { motion } from "framer-motion";
import {
  deriveRun,
  type CrowdMember,
  type Reaction,
  type RoastVerdict,
  type RunEvent,
  type RunState,
  type Scores,
  type Segments,
  type SharkVerdict,
  type Stance,
  type Vote,
} from "@/lib/events";
import type { RoomMode, RunStatus } from "@/lib/types";
import { Alert, Globe, Info, Message, Play, Refresh } from "../icons";
import { btn, cx } from "../ui";
import DealTable, { AskChip, DealResult } from "./DealTable";
import FounderTurn from "./FounderTurn";
import PanelChat, { type ChatPerson, type PanelChatHandle } from "./PanelChat";
import { useLiveEvents, useReplay, type Connection } from "./useRunEvents";

const SHARK_COLOR: Record<string, string> = { meera: "#4f46e5", arjun: "#d97706", ananya: "#e11d48", vikram: "#0f766e", farah: "#7c3aed" };

const ease = [0.2, 0.8, 0.2, 1] as const;

const STANCE: Record<Stance, { label: string; cls: string }> = {
  invest: { label: "Invest", cls: "bg-success-soft text-success-ink" },
  maybe: { label: "Maybe", cls: "bg-accent-soft text-accent-ink" },
  pass: { label: "Pass", cls: "bg-danger-soft text-danger" },
};

const DECISION: Record<Stance, string> = {
  invest: "The panel would invest",
  maybe: "The panel is on the fence",
  pass: "The panel would pass",
};

const VOTE_STYLE: Record<Vote, { label: string; cls: string }> = {
  agree: { label: "Agree", cls: "bg-success-soft text-success-ink" },
  neutral: { label: "Unsure", cls: "bg-accent-soft text-accent-ink" },
  disagree: { label: "Disagree", cls: "bg-ink/5 text-muted" },
};

function Pill({ cls, children }: { cls: string; children: string }) {
  return <span className={cx("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", cls)}>{children}</span>;
}

function Avatar({ id, name }: { id: string; name: string }) {
  const parts = name.replace(/"[^"]*"/g, "").trim().split(/\s+/);
  const initials = (parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "");
  const color = SHARK_COLOR[id];
  return (
    <span
      className={cx(
        "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold",
        color ? "text-white" : "bg-mode-soft text-mode-ink",
      )}
      style={color ? { backgroundColor: color } : undefined}
    >
      {initials.toUpperCase()}
    </span>
  );
}

/**
 * Keeps the newest message on screen during playback.
 * Stops as soon as the reader scrolls or touches the page themselves.
 */
function useFollow(step: number, playing: boolean) {
  const end = useRef<HTMLDivElement>(null);
  const following = useRef(true);

  useEffect(() => {
    if (!playing) return;
    following.current = true;
    const stop = () => (following.current = false);
    const events = ["wheel", "touchmove", "keydown"] as const;
    events.forEach((e) => window.addEventListener(e, stop, { passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, stop));
  }, [playing]);

  useEffect(() => {
    if (playing && following.current && step > 0) end.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [step, playing]);

  return end;
}

function ProgressBar({ value, label, onSkip }: { value: number; label: string; onSkip?: () => void }) {
  return (
    <div className="sticky top-16 z-20 -mx-4 border-b border-edge bg-bg/90 px-4 py-3 backdrop-blur-lg sm:mx-0 sm:rounded-2xl sm:border sm:px-5">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 text-sm" role="status">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-mode opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-mode" />
          </span>
          <span className="truncate font-medium">{label}</span>
        </span>
        {onSkip && (
          <button type="button" onClick={onSkip} className="shrink-0 text-[13px] font-medium text-muted hover:text-ink">
            Skip to the end
          </button>
        )}
      </div>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-mode-soft">
        <motion.div className="h-full rounded-full bg-mode" initial={{ width: 0 }} animate={{ width: `${Math.round(Math.min(1, value) * 100)}%` }} transition={{ duration: 0.4, ease }} />
      </div>
    </div>
  );
}

type VerdictList = { title: string; items: string[]; tone: "good" | "risk" | "step" };

function VerdictCard({
  figure,
  figureNote,
  label,
  summary,
  lists,
  children,
}: {
  figure: string;
  figureNote: string;
  label: string;
  summary?: string;
  lists: VerdictList[];
  children?: React.ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 18, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, ease }}
      className="overflow-hidden rounded-[22px] border border-mode/30 bg-surface shadow-card"
      aria-label="Verdict"
    >
      <div className="flex flex-col gap-4 bg-mode-soft/50 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="min-w-0">
          <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-mode-ink">Verdict</p>
          <p className="mt-1.5 text-balance font-display text-2xl leading-tight sm:text-[1.65rem]">{label}</p>
        </div>
        <span className="inline-flex shrink-0 items-baseline gap-1 self-start rounded-2xl bg-surface px-4 py-2 font-display text-4xl font-medium tabular-nums text-mode-ink shadow-soft sm:self-auto">
          {figure}
          <span className="text-base text-faint">{figureNote}</span>
        </span>
      </div>
      <div className="space-y-6 p-5 sm:p-6">
        {summary && <p className="text-[16px] leading-relaxed">{summary}</p>}
        {children}
        <div className={cx("grid gap-6", lists.length === 2 && "md:grid-cols-2", lists.length === 3 && "md:grid-cols-3")}>
          {lists.map((l) => (
            <div key={l.title}>
              <p className="text-[13px] font-medium text-muted">{l.title}</p>
              <ul className="mt-3 space-y-2.5">
                {l.items.map((it, i) => (
                  <li key={i} className="flex items-start gap-3 text-[15px] leading-relaxed">
                    <span
                      className={cx(
                        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                        l.tone === "risk" ? "bg-danger-soft text-danger" : l.tone === "good" ? "bg-success-soft text-success-ink" : "bg-mode-soft text-mode-ink",
                      )}
                    >
                      {l.tone === "risk" ? <Alert size={12} /> : i + 1}
                    </span>
                    <span className="min-w-0 break-words">{it}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </motion.section>
  );
}

function Notices({ items }: { items: string[] }) {
  return (
    <>
      {items.map((text, i) => (
        <p key={i} className="flex items-start gap-2 rounded-xl border border-edge bg-surface px-4 py-3 text-sm text-muted">
          <Info size={16} className="mt-0.5 shrink-0" /> {text}
        </p>
      ))}
    </>
  );
}

type ViewProps = {
  state: RunState;
  active: boolean; // live or replaying
  verdictTop: boolean;
};

type Chat = { runId: string } | null;

// ================================================================ Sharks

function SharksView({ state, active, verdictTop, chat, reply }: ViewProps & { chat: Chat; reply: Chat }) {
  const v = state.verdictEvent?.verdict as SharkVerdict | undefined;
  const messages = state.rounds.reduce((n, r) => n + r.items.length, 0);
  const endRef = useFollow(messages + (state.table?.length ?? 0) + (state.choice ? 500 : 0) + (state.founderTurn ? 1000 : 0) + (v ? 2000 : 0), active);
  const chatRef = useRef<PanelChatHandle>(null);
  const titles = new Map(state.panel.map((p) => [p.id, p.title]));

  const verdict = v && (
    <VerdictCard
      figure={String(v.score)}
      figureNote="/10"
      label={DECISION[v.decision]}
      summary={v.one_liner}
      lists={[
        { title: "Biggest risks", items: v.top_risks, tone: "risk" },
        { title: "Next steps", items: v.next_steps, tone: "step" },
      ]}
    >
      {state.deal && <DealResult deal={state.deal} />}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {v.votes.map((vote) => (
          <li key={vote.shark} className="rounded-xl bg-bg p-3.5">
            <p className="flex items-center justify-between gap-2 text-sm font-medium">
              <span className="truncate">{vote.shark}</span>
              <Pill cls={STANCE[vote.stance].cls}>{STANCE[vote.stance].label}</Pill>
            </p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{vote.reason}</p>
          </li>
        ))}
      </ul>
    </VerdictCard>
  );

  const people: ChatPerson[] = state.panel.map((p) => ({
    id: p.id,
    name: p.name,
    subtitle: p.title,
    position: v?.votes.find((x) => x.shark === p.name)?.stance ?? null,
  }));

  return (
    <>
      {verdictTop && verdict}
      {state.ask && <AskChip ask={state.ask} />}
      {state.rounds
        .filter((r) => r.items.length > 0)
        .map((r, i) => (
          <section key={`${r.round}-${i}`} className="rounded-2xl border border-edge bg-surface p-4 shadow-soft sm:p-6">
            <p className="text-[13px] font-medium text-muted">
              <span className="rounded-full bg-mode-soft px-2 py-0.5 text-[11px] text-mode-ink">
                Round {r.round}
                {state.totalRounds ? ` of ${state.totalRounds}` : ""}
              </span>
            </p>
            <div className="mt-4 space-y-4">
              {r.items.map((item) => {
                if (item.kind === "notice") {
                  return (
                    <p key={item.id} className="text-center text-[13px] text-muted">
                      {item.text}
                    </p>
                  );
                }
                if (item.kind === "founder") {
                  return (
                    <motion.div key={item.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end">
                      <div className="max-w-[85%]">
                        <p className="text-right text-[13px] font-medium">You</p>
                        <p className="mt-1 whitespace-pre-wrap break-words rounded-2xl rounded-tr-sm bg-brand px-4 py-3 text-[15px] leading-relaxed text-white">
                          {item.text}
                        </p>
                      </div>
                    </motion.div>
                  );
                }
                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 12, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.35, ease: [0.34, 1.56, 0.64, 1] }}
                    className="flex gap-3"
                  >
                    <Avatar id={item.speaker} name={item.name} />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-x-2 text-sm">
                        <span className="font-medium">{item.name}</span>
                        {item.out ? (
                          <Pill cls="bg-danger text-white">I&apos;m out</Pill>
                        ) : (
                          <Pill cls={STANCE[item.stance].cls}>{STANCE[item.stance].label}</Pill>
                        )}
                      </p>
                      <p className="truncate text-[12px] text-faint">{titles.get(item.speaker)}</p>
                      <p className="mt-1.5 break-words rounded-2xl rounded-tl-sm border border-edge bg-bg px-4 py-3 text-[15px] leading-relaxed">{item.text}</p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </section>
        ))}

      {state.table && (
        <DealTable
          items={state.table}
          choice={state.choice}
          runId={reply?.runId ?? null}
          deal={state.deal}
          avatar={(id, name) => <Avatar id={id} name={name} />}
        />
      )}

      {active && state.typing && (
        <div className="flex items-center gap-3">
          <Avatar id={state.typing.speaker} name={state.typing.name} />
          <span className="flex items-center gap-1 rounded-full border border-edge bg-surface px-3.5 py-2.5" aria-label={`${state.typing.name} is typing`}>
            {[0, 1, 2].map((i) => (
              <motion.span key={i} className="h-1.5 w-1.5 rounded-full bg-muted" animate={{ opacity: [0.25, 1, 0.25] }} transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }} />
            ))}
          </span>
        </div>
      )}
      {reply && state.founderTurn && (
        <FounderTurn key={state.founderTurn.expiresAt ?? messages} runId={reply.runId} waitS={state.founderTurn.waitS} expiresAt={state.founderTurn.expiresAt} />
      )}
      {active && <div ref={endRef} aria-hidden className="!mt-0 scroll-mb-8" />}
      {!verdictTop && verdict}
      {chat && v && <PanelChat ref={chatRef} runId={chat.runId} people={people} />}
    </>
  );
}

// ================================================================ Janta

const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);

function VoteBar({ agree, neutral, disagree }: { agree: number; neutral: number; disagree: number }) {
  const total = agree + neutral + disagree;
  const parts = [
    { l: "Agree", n: agree, cls: "bg-success" },
    { l: "Unsure", n: neutral, cls: "bg-accent" },
    { l: "Disagree", n: disagree, cls: "bg-danger" },
  ];
  return (
    <div>
      <div className="flex h-3.5 overflow-hidden rounded-full bg-edge">
        {parts.map((p) => (
          <motion.span key={p.l} className={p.cls} initial={{ width: 0 }} animate={{ width: `${total ? (p.n / total) * 100 : 0}%` }} transition={{ duration: 0.5, ease }} />
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-muted">
        {parts.map((p) => (
          <span key={p.l} className="flex items-center gap-1.5">
            <span className={cx("h-2 w-2 rounded-full", p.cls)} /> {p.l} {pct(p.n, total)}%
          </span>
        ))}
      </div>
    </div>
  );
}

function SegmentBars({ segments }: { segments: Segments }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {Object.entries(segments).map(([title, groups]) => (
        <div key={title} className="rounded-2xl border border-edge bg-surface p-5 shadow-soft">
          <p className="text-[13px] font-medium text-muted">Would pay, by {title.toLowerCase()}</p>
          <div className="mt-4 space-y-3.5">
            {Object.entries(groups).map(([label, g]) => (
              <div key={label}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">{label}</span>
                  <span className="shrink-0 tabular-nums text-muted">
                    <span className="font-medium text-ink">{pct(g.would_pay, g.n)}%</span> · {g.n} {g.n === 1 ? "person" : "people"}
                  </span>
                </div>
                <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-mode-soft">
                  <motion.div className="h-full rounded-full bg-mode" initial={{ width: 0 }} whileInView={{ width: `${pct(g.would_pay, g.n)}%` }} viewport={{ once: true }} transition={{ duration: 0.8, ease }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const describe = (p?: CrowdMember) => (p ? `${p.age} · ${p.occupation} · ${p.city}` : "");

// The crowd as a grid of cells, one per person (as in the original index.html): grey while
// waiting, then green/amber/red as each votes, with an inset circle for "would pay".
const VOTE_DOT: Record<Vote, string> = { agree: "bg-success", neutral: "bg-accent", disagree: "bg-danger" };

function Dot({ person, reaction }: { person?: CrowdMember; reaction?: Reaction }) {
  const ref = useRef<HTMLDivElement>(null);
  const rid = reaction?.id;
  // A brief pop each time this person reacts (first reply, and again if they change).
  // Driven straight through the DOM so it doesn't re-render all the dots.
  useEffect(() => {
    if (rid == null) return;
    const el = ref.current;
    if (!el || typeof el.animate !== "function") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    el.style.zIndex = "10";
    const anim = el.animate([{ transform: "scale(1.25)" }, { transform: "scale(1)" }], {
      duration: 380,
      easing: "cubic-bezier(0.34, 1.56, 0.64, 1)",
    });
    const clear = () => {
      el.style.zIndex = "";
    };
    anim.addEventListener("finish", clear);
    anim.addEventListener("cancel", clear);
    return () => anim.cancel();
  }, [rid]);
  const label = person
    ? reaction
      ? `${person.name}, ${person.occupation}, ${person.city} — ${VOTE_STYLE[reaction.vote].label.toLowerCase()}${reaction.would_pay ? ", would pay" : ""}`
      : `${person.name}, ${person.occupation}, ${person.city} — waiting`
    : "";
  return (
    <div
      ref={ref}
      title={label}
      aria-label={label}
      className={cx(
        "relative aspect-square rounded-[4px] transition-colors duration-300",
        reaction ? VOTE_DOT[reaction.vote] : "bg-edge-strong",
      )}
    >
      {reaction?.would_pay && <span className="absolute inset-[30%] rounded-full bg-surface" />}
    </div>
  );
}

function CrowdGrid({ crowd, latest }: { crowd: CrowdMember[]; latest: Map<string, Reaction> }) {
  return (
    <div
      className="grid gap-1"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(18px, 1fr))" }}
      role="img"
      aria-label={`Crowd of ${crowd.length}; ${latest.size} have reacted`}
    >
      {crowd.map((p) => (
        <Dot key={p.id} person={p} reaction={latest.get(p.id)} />
      ))}
    </div>
  );
}

function CrowdLegend() {
  const items: [string, string][] = [
    ["bg-success", "Agree"],
    ["bg-accent", "Unsure"],
    ["bg-danger", "Disagree"],
    ["bg-edge-strong", "Waiting"],
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-muted">
      {items.map(([c, l]) => (
        <span key={l} className="flex items-center gap-1.5">
          <span className={cx("h-3 w-3 rounded-[3px]", c)} /> {l}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="relative h-3 w-3 rounded-[3px] bg-success">
          <span className="absolute inset-[30%] rounded-full bg-surface" />
        </span>
        Dot inside = would pay
      </span>
    </div>
  );
}

function JantaView({ state, active, verdictTop, chat }: ViewProps & { chat: Chat }) {
  const [filter, setFilter] = useState<Vote | "all">("all");
  const [showAll, setShowAll] = useState(false);
  const chatRef = useRef<PanelChatHandle>(null);
  const summary = state.verdictEvent?.summary;
  const final = state.verdictEvent?.tally;
  const segments = state.verdictEvent?.segments;
  const reactions = [...state.latest.values()];
  const filtered = reactions.filter((r) => filter === "all" || r.vote === filter);
  const shown = showAll ? filtered : filtered.slice(0, 12);
  const voices = (["agree", "neutral", "disagree"] as const).flatMap((vote) => reactions.filter((r) => r.vote === vote).slice(0, 2));
  const person = (id: string) => state.crowd.get(id);
  const lastVoice = state.feed[state.feed.length - 1];

  const verdict = summary && final && (
    <VerdictCard
      figure={`${final.would_pay_pct}%`}
      figureNote="would pay"
      label={summary.headline}
      // A side nobody voted for has no reasons (the engine sends an empty list), so hide it.
      lists={([
        { title: "Why people agreed", items: summary.reasons_for ?? [], tone: "good" },
        { title: "Why people disagreed", items: summary.reasons_against ?? [], tone: "risk" },
        { title: "What the crowd suggests", items: summary.advice ?? [], tone: "step" },
      ] satisfies VerdictList[]).filter((l) => l.items.length > 0)}
    >
      <VoteBar agree={final.agree} neutral={final.neutral} disagree={final.disagree} />
    </VerdictCard>
  );

  const people: ChatPerson[] = reactions.map((r) => ({
    id: r.persona_id,
    name: person(r.persona_id)?.name ?? "Someone",
    subtitle: describe(person(r.persona_id)),
    position: r.vote,
  }));

  return (
    <>
      {active && state.crowd.size > 0 && (
        <section className="rounded-2xl border border-edge bg-surface p-5 shadow-soft sm:p-6">
          <p className="text-[13px] font-medium text-muted">
            {state.tally && state.tally.total > 0
              ? `${state.tally.would_pay_pct}% would pay · ${state.tally.total} of ${state.size} have reacted`
              : `Gathering ${state.size} people…`}
          </p>
          {state.tally && state.tally.total > 0 && (
            <div className="mt-3">
              <VoteBar agree={state.tally.agree} neutral={state.tally.neutral} disagree={state.tally.disagree} />
            </div>
          )}
          <div className="mt-4">
            <CrowdGrid crowd={[...state.crowd.values()]} latest={state.latest} />
          </div>
          <div className="mt-4">
            <CrowdLegend />
          </div>
          {lastVoice && person(lastVoice.persona_id) && (
            <p className="mt-4 flex items-start gap-2 border-t border-edge pt-3 text-[13px] text-muted">
              <Pill cls={VOTE_STYLE[lastVoice.vote].cls}>{VOTE_STYLE[lastVoice.vote].label}</Pill>
              <span className="min-w-0">
                <span className="font-medium text-ink">{person(lastVoice.persona_id)?.name}:</span>{" "}
                <span className="break-words">“{lastVoice.comment}”</span>
              </span>
            </p>
          )}
        </section>
      )}

      {verdictTop && verdict}
      {summary && segments && <SegmentBars segments={segments} />}
      {summary && state.crowd.size > 0 && (
        <section className="rounded-2xl border border-edge bg-surface p-5 shadow-soft sm:p-6">
          <p className="text-[13px] font-medium text-muted">
            The crowd at a glance{final ? ` · ${final.would_pay_pct}% would pay` : ""}
          </p>
          <div className="mt-4">
            <CrowdGrid crowd={[...state.crowd.values()]} latest={state.latest} />
          </div>
          <div className="mt-4">
            <CrowdLegend />
          </div>
        </section>
      )}
      {!verdictTop && verdict}

      {!active && voices.length > 0 && (
        <section className="rounded-2xl border border-edge bg-surface p-5 shadow-soft sm:p-6">
          <p className="text-[13px] font-medium text-muted">Voices from the crowd</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {voices.map((r) => (
              <figure key={r.persona_id} className="rounded-xl bg-bg p-4">
                <blockquote className="break-words text-[15px] leading-relaxed">“{r.comment}”</blockquote>
                <figcaption className="mt-2.5 flex items-center justify-between gap-2 text-[13px] text-muted">
                  <span className="min-w-0 truncate">
                    {person(r.persona_id)?.name}, {describe(person(r.persona_id))}
                  </span>
                  <Pill cls={VOTE_STYLE[r.vote].cls}>{VOTE_STYLE[r.vote].label}</Pill>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      {!active && reactions.length > 0 && (
        <section className="rounded-2xl border border-edge bg-surface shadow-soft">
          <div className="flex flex-col gap-3 border-b border-edge px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p className="font-display text-lg">Everyone who reacted</p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by vote">
              {(["all", "agree", "neutral", "disagree"] as const).map((f) => (
                <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f} className={cx("rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors", filter === f ? "bg-ink text-bg" : "bg-bg text-muted hover:text-ink")}>
                  {f === "all" ? `All ${reactions.length}` : VOTE_STYLE[f].label}
                </button>
              ))}
            </div>
          </div>
          <ul className="divide-y divide-edge">
            {shown.map((r) => (
              <li key={r.persona_id} className="flex flex-col gap-1.5 px-5 py-3.5 sm:flex-row sm:items-start sm:gap-4 sm:px-6">
                <div className="flex items-center gap-2 sm:w-56 sm:shrink-0">
                  <Pill cls={VOTE_STYLE[r.vote].cls}>{VOTE_STYLE[r.vote].label}</Pill>
                  <span className="truncate text-sm font-medium">{person(r.persona_id)?.name}</span>
                  {r.would_pay && <span className="text-[11px] font-medium text-success-ink">pays</span>}
                </div>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="text-muted">
                    {describe(person(r.persona_id))} (tier {person(r.persona_id)?.city_tier})
                  </p>
                  <p className="mt-0.5 break-words leading-relaxed">“{r.comment}”</p>
                </div>
                {chat && summary && (
                  <button type="button" onClick={() => chatRef.current?.openTo(r.persona_id)} className={btn("ghost", "sm", "self-start")}>
                    <Message size={14} /> Ask why
                  </button>
                )}
              </li>
            ))}
          </ul>
          {filtered.length > 12 && (
            <div className="border-t border-edge p-3 text-center">
              <button type="button" onClick={() => setShowAll((x) => !x)} className={btn("ghost", "sm")}>
                {showAll ? "Show fewer" : `Show all ${filtered.length}`}
              </button>
            </div>
          )}
        </section>
      )}
      <Notices items={state.notices} />
      {chat && summary && <PanelChat ref={chatRef} runId={chat.runId} people={people} />}
    </>
  );
}

// ================================================================ Roast

const CATS = [
  { k: "clarity", l: "Clarity" },
  { k: "trust", l: "Trust" },
  { k: "design", l: "Design" },
  { k: "cta", l: "Call to action" },
] as const;

function MiniBar({ v }: { v: number }) {
  return (
    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-mode-soft">
      <span className={cx("block h-full rounded-full", v < 5 ? "bg-danger" : "bg-mode")} style={{ width: `${v * 10}%` }} />
    </span>
  );
}

function AverageScores({ averages, count }: { averages: Scores; count: number }) {
  return (
    <section className="rounded-2xl border border-edge bg-surface p-5 shadow-soft sm:p-6">
      <p className="text-[13px] font-medium text-muted">Average scores across {count} reviewers</p>
      <div className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2">
        {CATS.map((c) => (
          <div key={c.k}>
            <div className="flex justify-between text-sm">
              <span>{c.l}</span>
              <span className="font-medium tabular-nums">{averages[c.k].toFixed(1)}</span>
            </div>
            <div className="mt-1.5 flex">
              <MiniBar v={averages[c.k]} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function RoastView({ state, active, verdictTop, chat }: ViewProps & { chat: Chat }) {
  const v = state.verdictEvent?.verdict as RoastVerdict | undefined;
  const averages = state.verdictEvent?.averages;
  const endRef = useFollow(state.reviews.length + (v ? 100 : 0), active);
  const chatRef = useRef<PanelChatHandle>(null);
  const verdict = v && (
    <VerdictCard figure={String(v.overall)} figureNote="/10" label={v.one_liner} lists={[{ title: "Fix these first", items: v.top_fixes, tone: "step" }]} />
  );
  const people: ChatPerson[] = state.reviews.map((r) => ({ id: r.roaster, name: r.name, subtitle: r.title, position: null }));

  return (
    <>
      {state.page && (
        <div className="rounded-2xl border border-edge bg-surface p-4 shadow-soft sm:p-5">
          <p className="flex items-center gap-1.5 text-[12px] font-medium text-faint">
            <Globe size={13} /> What the reviewers read
          </p>
          <p className="mt-1.5 break-words text-[15px] font-medium">{state.page.title || state.page.url}</p>
          {state.page.description && <p className="mt-1 break-words text-sm text-muted">{state.page.description}</p>}
        </div>
      )}
      <Notices items={state.notices} />
      {verdictTop && verdict}
      {v && averages && <AverageScores averages={averages} count={state.reviews.length} />}
      <div className="grid gap-4 sm:grid-cols-2">
        {state.reviews.map((r) => (
          <motion.article key={r.id} initial={{ opacity: 0, y: 14, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.35, ease: [0.34, 1.56, 0.64, 1] }} className="flex flex-col rounded-2xl border border-edge bg-surface p-5 shadow-soft">
            <div className="flex items-center gap-3">
              <Avatar id={r.roaster} name={r.name} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{r.name}</p>
                <p className="truncate text-[13px] text-muted">{r.title}</p>
              </div>
            </div>
            <p className="mt-3 flex-1 break-words text-[15px] leading-relaxed">“{r.review.roast}”</p>
            <p className="mt-3 break-words rounded-xl bg-bg px-3 py-2.5 text-[13px] leading-relaxed">
              <span className="font-medium">Fix: </span>
              {r.review.fix}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2">
              {CATS.map((c) => (
                <div key={c.k} className="flex items-center gap-2 text-[12px] text-muted">
                  <span className="w-14 shrink-0 truncate">{c.k === "cta" ? "CTA" : c.l}</span>
                  <MiniBar v={r.review[c.k]} />
                  <span className="w-4 text-right font-medium tabular-nums text-ink">{r.review[c.k]}</span>
                </div>
              ))}
            </div>
          </motion.article>
        ))}
      </div>
      {active && <div ref={endRef} aria-hidden className="!mt-0 scroll-mb-8" />}
      {!verdictTop && verdict}
      {chat && v && <PanelChat ref={chatRef} runId={chat.runId} people={people} />}
    </>
  );
}

// ================================================================ entry

function progressOf(mode: RoomMode, s: RunState): { value: number; label: string } {
  if (s.judging) return { value: 0.95, label: "The judge is writing the verdict…" };
  if (s.verdictEvent) return { value: 1, label: "Verdict is in" };
  if (mode === "sharks") {
    const total = Math.max(1, s.totalRounds * s.panel.length);
    const spoken = s.rounds.reduce((n, r) => n + r.items.filter((i) => i.kind === "message").length, 0);
    if (s.table) {
      const label = s.choice ? "Offers are in. Your call." : s.typing ? `Deal table · ${s.typing.name} is deciding` : "The sharks are talking money…";
      return { value: 0.9, label };
    }
    const label = s.founderTurn
      ? "Waiting for your answer"
      : s.typing
        ? `Round ${s.round} of ${s.totalRounds} · ${s.typing.name} is speaking`
        : "The sharks are gathering…";
    return { value: (spoken / total) * 0.85, label };
  }
  if (mode === "janta") {
    if (!s.round) return { value: 0.02, label: "Gathering the crowd…" };
    const inRound = s.asked ? s.askedThisRound / s.asked : 0;
    return {
      // the engine says how many rounds it will run (JANTA_ROUNDS), so the bar fits one or two
      value: (s.round - 1 + inRound) / (Math.max(s.round, s.totalRounds) + 0.1),
      label: `Round ${s.round} · ${s.askedThisRound} of ${s.asked} have reacted`,
    };
  }
  if (!s.page) return { value: 0.05, label: "Reading your page…" };
  return { value: 0.1 + (s.reviews.length / Math.max(1, s.panel.length)) * 0.8, label: `${s.reviews.length} of ${s.panel.length} reviews are in` };
}

const CONNECTION: Partial<Record<Connection, string>> = {
  reconnecting: "Reconnecting…",
  lost: "Lost the live connection. Refresh the page to check on this run.",
};

export type RunViewProps = {
  runId: string;
  mode: RoomMode;
  status: RunStatus;
  events: RunEvent[];
  /** Why a failed run failed. */
  error?: string | null;
  cost?: number;
  /** The signed-in owner can answer the sharks and chat. Shared links can't. */
  owner?: boolean;
  demo?: boolean;
};

export default function RunView({ runId, mode, status, events: saved, error, cost, owner = false, demo = false }: RunViewProps) {
  const running = status === "running";
  const { events, connection } = useLiveEvents(runId, saved, running);
  const replay = useReplay(events);
  const state = useMemo(() => deriveRun(running ? events : replay.visible), [running, events, replay.visible]);
  // Watching it happen (live or replay) puts the verdict at the end; a saved visit leads with it.
  const [atEnd, setAtEnd] = useState(running);
  const live = running && !state.done;
  const active = live || replay.playing;
  const failure = replay.playing ? null : status === "failed" ? (error ?? state.error) : state.error;
  const progress = progressOf(mode, state);
  const top = useRef<HTMLDivElement>(null);
  const chat: Chat = owner && status === "done" && !replay.playing ? { runId } : null;
  const shared = { state, active, verdictTop: !atEnd, chat };

  return (
    <div ref={top} className={`room-${mode} scroll-mt-20 space-y-6`}>
      {(demo || state.demo) && (
        <p className="flex items-start gap-2 rounded-xl border border-dashed border-accent bg-accent-soft px-4 py-3 text-sm text-accent-ink">
          <Info size={16} className="mt-0.5 shrink-0" />
          <span>
            <span className="font-medium">Demo AI.</span> This run uses placeholder text from the offline provider. It isn&apos;t real
            analysis of your idea.
          </span>
        </p>
      )}
      {/* Every run, live or shared: the panel is AI (IT Rules 2021 as amended in 2026 ask for
          AI-generated content to be labelled; /terms promises this label). */}
      <p className="flex items-center gap-1.5 text-[12px] text-faint">
        <Info size={13} className="shrink-0" />
        AI-generated. The panel is fictional personas, and the result is a simulation, not advice.
      </p>
      {active && (
        <ProgressBar value={progress.value} label={(live && CONNECTION[connection]) || progress.label} onSkip={replay.playing ? replay.skip : undefined} />
      )}
      {live && owner && !state.founderTurn && !state.choice && (
        <p className="text-center text-[13px] text-faint">You can leave this page. The run keeps going and will be in My runs.</p>
      )}

      {failure && (
        <div role="alert" className="rounded-2xl border border-danger/30 bg-danger-soft p-5">
          <p className="flex items-center gap-2 font-medium text-danger">
            <Alert size={18} /> This run didn&apos;t finish
          </p>
          <p className="mt-1.5 break-words text-[15px]">{failure}</p>
          {owner && status === "failed" && (
            <>
              <p className="mt-1.5 text-sm text-muted">{cost ? `Your ${cost} credits were refunded.` : "Your credits were refunded."}</p>
              <NextLink href={`/dashboard/new?room=${mode}`} className={btn("primary", "sm", "mt-4")}>
                <Refresh size={15} /> Try again
              </NextLink>
            </>
          )}
        </div>
      )}

      {mode === "sharks" && <SharksView {...shared} reply={owner && live ? { runId } : null} />}
      {mode === "janta" && <JantaView {...shared} />}
      {mode === "roast" && <RoastView {...shared} />}

      {status === "done" && !replay.playing && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => {
              setAtEnd(true);
              replay.start();
              top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className={btn("ghost", "sm")}
          >
            <Play size={15} /> Replay the session
          </button>
        </div>
      )}
    </div>
  );
}
