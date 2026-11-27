"use client";

import { useActionState, useEffect, useState } from "react";
import NextLink from "next/link";
import { useFormStatus } from "react-dom";
import { motion } from "framer-motion";
import { createRun } from "@/app/actions/runs";
import { ENTITLEMENTS, IDEA_MAX, JANTA_SIZES, ROOMS, VOICE_CREDITS, runCost } from "@/lib/pricing";
import type { RoomMode, Tier } from "@/lib/types";
import { money, valuationLakh } from "@/lib/money";
import { DRAFT_KEY } from "../marketing/IdeaCapture";
import { FormMessage, TextArea, TextInput } from "../forms";
import { Alert, Arrow, Check, Lock } from "../icons";
import { btn, cx, ROOM_ICON } from "../ui";
import VoiceInput from "./VoiceInput";

function StartButton({ mode, blocked }: { mode: RoomMode; blocked: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || blocked} className={btn("brand", "lg", "w-full")}>
      {pending ? (
        <>
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-r-transparent" aria-hidden />
          Convening the panel…
        </>
      ) : (
        <>
          Start {ROOMS[mode].name} run <Arrow size={18} />
        </>
      )}
    </button>
  );
}

export default function NewRunForm({
  initialRoom,
  balance,
  tier,
  engine,
  maxCrowd,
  voiceMode,
  prefill,
}: {
  initialRoom: RoomMode;
  balance: number;
  tier: Tier;
  engine: "live" | "demo" | "offline";
  maxCrowd: number;
  voiceMode: "live" | "demo" | "off";
  /** "Check with a bigger crowd" from a finished Janta run: same pitch, new crowd size. */
  prefill?: { idea: string; customer?: string; price?: string; size: number };
}) {
  const [state, action] = useActionState(createRun, undefined);
  const [mode, setMode] = useState<RoomMode>(initialRoom);
  const [idea, setIdea] = useState(state?.values?.idea ?? prefill?.idea ?? "");
  const [url, setUrl] = useState(state?.values?.url ?? "");
  // A size above the plan stays unselected and shows the plan note instead.
  const prefillOk = !!prefill && prefill.size <= ENTITLEMENTS[tier].jantaMax && prefill.size <= maxCrowd;
  const [size, setSize] = useState<number>(prefillOk ? prefill.size : 25);
  const [tone, setTone] = useState<"roast" | "serious">("roast");
  const [lockedSize, setLockedSize] = useState<number | null>(prefill && !prefillOk && prefill.size <= maxCrowd ? prefill.size : null);
  const [askAmount, setAskAmount] = useState(state?.values?.askAmount ?? "");
  const [askEquity, setAskEquity] = useState(state?.values?.askEquity ?? "");
  const askValue = valuationLakh(Number(askAmount), Number(askEquity));
  const fe = state?.fieldErrors ?? {};
  const [wantsVoice, setWantsVoice] = useState(state?.values?.voice === "1");
  const [recording, setRecording] = useState(false);
  const voice = mode === "sharks" && voiceMode !== "off" && wantsVoice;

  // Carry over the idea typed on the landing page.
  useEffect(() => {
    if (prefill) return;
    const timer = setTimeout(() => {
      try {
        const raw = sessionStorage.getItem(DRAFT_KEY);
        if (!raw) return;
        const draft = JSON.parse(raw) as { room: RoomMode; value: string };
        if (draft.room === "roast") setUrl(draft.value);
        else setIdea(draft.value);
        if (draft.room in ROOMS) setMode(draft.room);
        sessionStorage.removeItem(DRAFT_KEY);
      } catch {}
    }, 0);
    return () => clearTimeout(timer);
  }, [prefill]);

  const cost = runCost(mode, mode === "janta" ? size : undefined, voice);
  const short = balance < cost;
  const jantaMax = ENTITLEMENTS[tier].jantaMax;

  return (
    <form action={action} className="grid gap-6 lg:grid-cols-[1fr_320px] lg:items-start" noValidate>
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="panelSize" value={size} />
      <input type="hidden" name="tone" value={tone} />
      <input type="hidden" name="voice" value={voice ? "1" : ""} />

      <div className="space-y-6">
        {/* step 1: room */}
        <fieldset className="rounded-2xl border border-edge bg-surface p-5 shadow-soft sm:p-6">
          <legend className="sr-only">Choose a room</legend>
          <p className="text-[13px] font-medium text-muted">Step 1 · Choose a room</p>
          <div role="radiogroup" className="mt-4 grid gap-3 sm:grid-cols-3">
            {(Object.keys(ROOMS) as RoomMode[]).map((m) => {
              const Icon = ROOM_ICON[m];
              const active = m === mode;
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setMode(m)}
                  className={cx(
                    `room-${m} relative flex items-start gap-3 rounded-xl border p-3.5 text-left transition-[border-color,box-shadow,background-color] duration-200 sm:flex-col`,
                    active ? "border-mode bg-mode-soft/60 shadow-[0_0_0_3px_color-mix(in_srgb,var(--mode)_18%,transparent)]" : "border-edge hover:border-edge-strong",
                  )}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-mode-soft text-mode-ink">
                    <Icon size={18} />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium">{ROOMS[m].name}</span>
                    <span className="block text-[13px] text-muted">{ROOMS[m].tagline}</span>
                  </span>
                  {active && (
                    <motion.span
                      layoutId="room-check"
                      className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-mode text-white"
                    >
                      <Check size={12} strokeWidth={3} />
                    </motion.span>
                  )}
                </button>
              );
            })}
          </div>
        </fieldset>

        {/* step 2: input */}
        <div className="space-y-5 rounded-2xl border border-edge bg-surface p-5 shadow-soft sm:p-6">
          <p className="text-[13px] font-medium text-muted">Step 2 · {mode === "roast" ? "Your landing page" : "Your idea"}</p>
          {mode === "roast" ? (
            <TextInput
              label="Landing page address"
              name="url"
              inputMode="url"
              autoComplete="url"
              placeholder="yourstartup.in"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              error={fe.url}
              hint="Must be a public page. Six reviewers will score clarity, trust, design and call to action."
            />
          ) : (
            <>
              <TextArea
                label="Describe your idea"
                name="idea"
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                maxLength={IDEA_MAX}
                placeholder="An app that helps kirana stores reorder stock over WhatsApp, so they never run out of fast-moving items."
                error={fe.idea}
                hint={
                  <span className="flex justify-between gap-3">
                    <span>What it does and who it&apos;s for, in a sentence or two.</span>
                    <span className="tabular-nums">{idea.length}/{IDEA_MAX}</span>
                  </span>
                }
              />
              {voiceMode !== "off" && (
                <VoiceInput
                  label="Speak your pitch"
                  onActiveChange={setRecording}
                  onText={(said) => setIdea((t) => `${t.trim()} ${said}`.trim().slice(0, IDEA_MAX))}
                />
              )}
              <div className="grid gap-5 sm:grid-cols-2">
                <TextInput
                  label="Who is it for?"
                  name="customer"
                  placeholder="Kirana store owners"
                  defaultValue={state?.values?.customer ?? prefill?.customer}
                  hint="Optional"
                />
                <TextInput label="Price" name="price" placeholder="₹299 a month" defaultValue={state?.values?.price ?? prefill?.price} hint="Optional" />
              </div>
            </>
          )}

          {mode === "sharks" && (
            <div>
              <p className="text-[13px] font-medium">Your ask</p>
              <div className="mt-2 grid gap-5 sm:grid-cols-2">
                <TextInput
                  label="Amount (₹ lakh)"
                  name="askAmount"
                  inputMode="decimal"
                  placeholder="50"
                  value={askAmount}
                  onChange={(e) => setAskAmount(e.target.value)}
                  error={fe.askAmount}
                  hint="100 lakh is 1 crore"
                />
                <TextInput
                  label="For equity (%)"
                  name="askEquity"
                  inputMode="decimal"
                  placeholder="5"
                  value={askEquity}
                  onChange={(e) => setAskEquity(e.target.value)}
                  error={fe.askEquity}
                />
              </div>
              <p className="mt-2 text-[13px] text-muted" aria-live="polite">
                {askValue && Number.isFinite(askValue) ? (
                  <>
                    You&apos;re valuing your company at <span className="font-medium text-ink">{money(askValue)}</span>.
                  </>
                ) : (
                  "We'll show the valuation your ask implies."
                )}
              </p>
            </div>
          )}

          {mode === "sharks" && (
            <div>
              <p className="text-[13px] font-medium">How should the sharks talk?</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Tone">
                {(
                  [
                    { id: "roast", label: "Roast me", note: "Blunt, sharp and funny" },
                    { id: "serious", label: "Keep it serious", note: "A measured investor meeting" },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={tone === t.id}
                    onClick={() => setTone(t.id)}
                    className={cx(
                      "room-sharks rounded-xl border px-3.5 py-3 text-left transition-colors",
                      tone === t.id ? "border-mode bg-mode-soft/60" : "border-edge hover:border-edge-strong",
                    )}
                  >
                    <span className="block text-sm font-medium">{t.label}</span>
                    <span className="block text-[13px] text-muted">{t.note}</span>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[13px] text-muted">
                Answer between rounds. Any shark can say &quot;I&apos;m out&quot;. If offers come in, accept one, counter once, or walk away.
              </p>
            </div>
          )}

          {mode === "sharks" && voiceMode !== "off" && (
            // A switch, not a checkbox: React resets checkboxes after the form is sent, which
            // left the box looking off while voice (and its price) stayed on.
            <button
              type="button"
              role="switch"
              aria-checked={wantsVoice}
              onClick={() => setWantsVoice((x) => !x)}
              className={cx(
                "room-sharks flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition-colors",
                wantsVoice ? "border-mode bg-mode-soft/60" : "border-edge hover:border-edge-strong",
              )}
            >
              <span aria-hidden className={cx("mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors", wantsVoice ? "justify-end bg-mode" : "justify-start bg-edge-strong")}>
                <span className="h-4 w-4 rounded-full bg-white shadow" />
              </span>
              <span>
                <span className="block text-sm font-medium">Sharks speak aloud · +{VOICE_CREDITS} credits</span>
                <span className="block text-[13px] text-muted">
                  Each shark talks in its own voice. You can answer by voice, and the timer restarts while they are still talking.
                  {voiceMode === "demo" && " Demo AI: you'll hear a placeholder tone, not speech."}
                </span>
              </span>
            </button>
          )}

          {mode === "janta" && (
            <div>
              <p className="text-[13px] font-medium">Crowd size</p>
              <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
                {JANTA_SIZES.filter((n) => n <= maxCrowd).map((n) => {
                  const locked = n > jantaMax;
                  const active = size === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => (locked ? setLockedSize(n) : (setSize(n), setLockedSize(null)))}
                      aria-pressed={active}
                      className={cx(
                        "room-janta flex flex-col items-center rounded-xl border px-2 py-3 transition-colors",
                        active ? "border-mode bg-mode-soft/60" : "border-edge hover:border-edge-strong",
                        locked && "text-muted",
                      )}
                    >
                      <span className="flex items-center gap-1 font-display text-lg font-medium">
                        {n} {locked && <Lock size={13} />}
                      </span>
                      <span className="text-[12px] text-muted">{runCost("janta", n)} credits</span>
                    </button>
                  );
                })}
              </div>
              {size >= 500 && (
                <p className="mt-2.5 text-[13px] text-muted">A crowd this large can take several minutes to finish.</p>
              )}
              {lockedSize && (
                <p className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[13px] text-muted">
                  <Lock size={14} /> Crowds of {lockedSize} are part of {lockedSize > ENTITLEMENTS.pro.jantaMax ? "Deep" : "Pro"}.
                  <NextLink href="/dashboard/billing" className="font-medium text-brand-ink hover:underline">
                    See plans
                  </NextLink>
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* summary */}
      <aside className={`${ROOMS[mode].cls} space-y-4 rounded-2xl border border-edge bg-surface p-5 shadow-soft sm:p-6 lg:sticky lg:top-24`}>
        <p className="text-[13px] font-medium text-muted">Summary</p>
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-mode-soft text-mode-ink">
            {(() => {
              const I = ROOM_ICON[mode];
              return <I size={20} />;
            })()}
          </span>
          <div>
            <p className="font-medium">{ROOMS[mode].name}</p>
            <p className="text-[13px] text-muted">{mode === "janta" ? `${size} people` : ROOMS[mode].tagline}</p>
          </div>
        </div>
        <dl className="space-y-2 border-t border-edge pt-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">This run</dt>
            <dd className="font-medium tabular-nums">{cost} credits</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Your balance</dt>
            <dd className="tabular-nums">{balance} credits</dd>
          </div>
          <div className="flex justify-between border-t border-edge pt-2">
            <dt className="text-muted">After this run</dt>
            <dd className={cx("font-medium tabular-nums", short && "text-danger")}>{balance - cost} credits</dd>
          </div>
        </dl>
        {short && (
          <div className="flex items-start gap-2 rounded-xl bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
            <Alert size={16} className="mt-px shrink-0" />
            <span>
              Not enough credits.{" "}
              <NextLink href="/dashboard/billing" className="font-medium underline">
                Top up
              </NextLink>{" "}
              to run this.
            </span>
          </div>
        )}
        {engine === "offline" && (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
            <Alert size={16} className="mt-px shrink-0" /> The debate engine is offline. Try again in a minute.
          </p>
        )}
        {engine === "demo" && (
          <p className="rounded-xl border border-dashed border-accent bg-accent-soft px-3 py-2.5 text-[13px] text-accent-ink">
            <span className="font-medium">Demo AI is on.</span> Results will be placeholder text, not real analysis.
          </p>
        )}
        <FormMessage error={state?.error} />
        <StartButton mode={mode} blocked={short || recording || engine === "offline"} />
        <p className="text-center text-xs text-faint">Credits are held while it runs, and refunded if it doesn&apos;t finish.</p>
      </aside>
    </form>
  );
}
