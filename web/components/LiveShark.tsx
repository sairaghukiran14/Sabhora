"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useHydrated } from "./hooks";
import { Check } from "./icons";

type Who = "meera" | "arjun" | "ananya";

const SHARKS: Record<Who, { name: string; role: string; initials: string; color: string }> = {
  meera: { name: "Meera", role: "Consumer brands", initials: "ME", color: "#4f46e5" },
  arjun: { name: "Arjun", role: "SaaS and deep tech", initials: "AR", color: "#d97706" },
  ananya: { name: "Ananya", role: "Bharat angel", initials: "AN", color: "#e11d48" },
};

const SCRIPT: { who: Who; text: string }[] = [
  { who: "meera", text: "₹499 a month for AI tutoring? Tier-2 parents will balk at that." },
  { who: "arjun", text: "Balk at the price, or the value? Show me retention past week two." },
  { who: "ananya", text: "The wedge is real — board-exam panic. But BYJU's muscle is the moat problem." },
  { who: "meera", text: "So niche hard: one board, one class. Own that, then expand." },
  { who: "arjun", text: "CAC under ₹300 and 40% alive at D30 — then I'm in for a seed." },
];

type Phase = "debate" | "verdict";

export default function LiveShark() {
  const hydrated = useHydrated();
  const reduce = useReducedMotion() && hydrated;
  const [revealed, setCount] = useState(0); // messages revealed
  const [typingState, setTyping] = useState<Who | null>(null);
  const [phaseState, setPhase] = useState<Phase>("debate");
  // With reduced motion, show the finished debate and never animate.
  const count = reduce ? SCRIPT.length : revealed;
  const typing = reduce ? null : typingState;
  const phase: Phase = reduce ? "verdict" : phaseState;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (reduce) return;
    const later = (fn: () => void, ms: number) => {
      const t = setTimeout(fn, ms);
      timers.current.push(t);
    };

    function step(i: number) {
      if (i >= SCRIPT.length) {
        later(() => setPhase("verdict"), 700);
        later(() => {
          setPhase("debate");
          setCount(0);
          step(0);
        }, 4200);
        return;
      }
      setTyping(SCRIPT[i].who);
      later(() => {
        setTyping(null);
        setCount(i + 1);
        later(() => step(i + 1), 1400);
      }, 950);
    }

    later(() => step(0), 500);
    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, [reduce]);

  const shown = SCRIPT.slice(Math.max(0, count - 4), count);

  return (
    <div className="room-sharks w-full rounded-[20px] border border-edge bg-surface shadow-lift">
      {/* window bar */}
      <div className="flex items-center justify-between border-b border-edge px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-mode" />
            <span className="text-sm font-medium">Sharks</span>
          </span>
          <span className="rounded-full bg-mode-soft px-2 py-0.5 text-[11px] font-medium text-mode-ink">
            round 2 of 3
          </span>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-mode opacity-70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-mode" />
          </span>
          live
        </span>
      </div>

      {/* pitch chip */}
      <div className="px-4 pt-4">
        <div className="rounded-xl border border-dashed border-edge-strong bg-bg px-3 py-2.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-faint">
            Your pitch
          </p>
          <p className="text-[13px] text-ink/90">
            An AI tutor for CBSE class 10 — ₹499/month, exam-focused.
          </p>
        </div>
      </div>

      {/* message stream: fixed height so the page never shifts; older turns clip off the top */}
      <div className="flex h-[340px] flex-col justify-end gap-3 overflow-hidden px-4 py-4 [mask-image:linear-gradient(to_bottom,transparent,#000_44px)]">
        {shown.map((m, idx) => {
          const s = SHARKS[m.who];
          const globalIdx = Math.max(0, count - 4) + idx;
          return (
            <motion.div
              key={globalIdx}
              initial={{ opacity: 0, y: 14, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.32, ease: [0.34, 1.56, 0.64, 1] }}
              className="flex shrink-0 gap-3"
            >
              <span
                className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                style={{ backgroundColor: s.color }}
              >
                {s.initials}
              </span>
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-[13px] font-medium">{s.name}</span>
                  <span className="truncate text-[11px] text-faint">{s.role}</span>
                </div>
                <p className="mt-1 rounded-2xl rounded-tl-sm border border-edge bg-bg px-3 py-2 text-[13px] leading-relaxed text-ink/90">
                  {m.text}
                </p>
              </div>
            </motion.div>
          );
        })}

        <AnimatePresence>
          {typing && (
            <motion.div
              key="typing"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex shrink-0 items-center gap-3"
            >
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                style={{ backgroundColor: SHARKS[typing].color }}
              >
                {SHARKS[typing].initials}
              </span>
              <span className="flex items-center gap-1 rounded-full border border-edge bg-bg px-3 py-2">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="h-1.5 w-1.5 rounded-full bg-muted"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
                  />
                ))}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* verdict: space is always reserved so revealing it doesn't move the page */}
      <div className="flex min-h-[68px] items-center border-t border-edge px-4 py-3">
        {phase === "verdict" ? (
          <motion.div
            key="verdict"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
            className="flex w-full items-center justify-between gap-3"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success-soft text-success-ink">
                <Check size={16} />
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-medium">Panel · narrow to one board</p>
                <p className="text-[11px] text-muted">Narrow to one board, prove D30 retention.</p>
              </div>
            </div>
            <span className="shrink-0 rounded-lg bg-mode-soft px-2.5 py-1 font-display text-lg font-medium text-mode-ink">
              7.5
            </span>
          </motion.div>
        ) : (
          <p className="text-[12px] text-faint">The panel is deliberating. Verdict follows.</p>
        )}
      </div>
    </div>
  );
}
