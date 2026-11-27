"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { CrowdMember, Reaction, Vote } from "@/lib/events";
import { cx } from "../ui";

// The crowd as a grid of cells, one per person (as in the original index.html): grey while
// waiting, then green/amber/red as each votes, with an inset circle for "would pay".
const VOTE_DOT: Record<Vote, string> = { agree: "bg-success", neutral: "bg-accent", disagree: "bg-danger" };
const VOTE_PILL: Record<Vote, { label: string; cls: string }> = {
  agree: { label: "Agree", cls: "bg-success-soft text-success-ink" },
  neutral: { label: "Unsure", cls: "bg-accent-soft text-accent-ink" },
  disagree: { label: "Disagree", cls: "bg-danger-soft text-danger" },
};

const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// Memoised: with up to 1,000 people, one new reaction must not redraw every cell.
const Dot = memo(function Dot({ person, reaction }: { person?: CrowdMember; reaction?: Reaction }) {
  const ref = useRef<HTMLDivElement>(null);
  const rid = reaction?.id;
  // A brief pop each time this person reacts (first reply, and again if they change).
  // Driven straight through the DOM so it doesn't re-render all the dots.
  useEffect(() => {
    if (rid == null) return;
    const el = ref.current;
    if (!el || typeof el.animate !== "function" || reducedMotion()) return;
    el.style.zIndex = "10";
    const anim = el.animate([{ transform: "scale(1.25)" }, { transform: "scale(1)" }], {
      duration: 380,
      easing: "cubic-bezier(0.34, 1.56, 0.64, 1)",
    });
    const clear = () => {
      // The speaker keeps its raised z-index (set by TalkingCrowd).
      if (!("speaking" in el.dataset)) el.style.zIndex = "";
    };
    anim.addEventListener("finish", clear);
    anim.addEventListener("cancel", clear);
    return () => anim.cancel();
  }, [rid]);
  const label = person
    ? reaction
      ? `${person.name}, ${person.occupation}, ${person.city} — ${VOTE_PILL[reaction.vote].label.toLowerCase()}${reaction.would_pay ? ", would pay" : ""}`
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
});

/**
 * Picks a column count so every row is full (or as close as the crowd size allows) and the
 * squares fill the whole width: bigger squares for small crowds, smaller ones for 500-1,000.
 */
export function pickColumns(n: number, width: number): { cols: number; gap: number } {
  const target = n <= 100 ? 26 : n <= 500 ? 18 : 14;
  const gap = n <= 100 ? 4 : 3;
  const lo = Math.max(1, Math.ceil((width + gap) / (target * 1.45 + gap)));
  const hi = Math.min(n, Math.max(lo, Math.floor((width + gap) / (Math.max(9, target * 0.65) + gap))));
  let best = { cols: Math.min(n, lo), gap, score: Infinity };
  for (let cols = lo; cols <= hi; cols++) {
    const empty = Math.ceil(n / cols) * cols - n;
    const size = (width - (cols - 1) * gap) / cols;
    const score = empty * 100 + Math.abs(size - target);
    if (score < best.score) best = { cols, gap, score };
  }
  return { cols: best.cols, gap: best.gap };
}

/**
 * Grid columns that follow the grid's own width. Before it is measured (server render, first
 * paint), the same picker runs for a typical phone and a typical desktop card, switched by a
 * breakpoint, so the grid rarely changes shape when it is measured.
 */
function useCrowdColumns(n: number, ref: React.RefObject<HTMLDivElement | null>): { style: React.CSSProperties; className: string } {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return useMemo(() => {
    if (width && n) {
      const { cols, gap } = pickColumns(n, width);
      return { style: { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap }, className: "grid" };
    }
    const phone = pickColumns(Math.max(1, n), 300);
    const wide = pickColumns(Math.max(1, n), 700);
    return {
      style: { "--cols": phone.cols, "--cols-sm": wide.cols, gap: phone.gap } as React.CSSProperties,
      className: "grid grid-cols-[repeat(var(--cols),minmax(0,1fr))] sm:grid-cols-[repeat(var(--cols-sm),minmax(0,1fr))]",
    };
  }, [n, width]);
}

export function CrowdGrid({ crowd, latest }: { crowd: CrowdMember[]; latest: Map<string, Reaction> }) {
  const ref = useRef<HTMLDivElement>(null);
  const columns = useCrowdColumns(crowd.length, ref);
  return (
    <div ref={ref} className={columns.className} style={columns.style} role="img" aria-label={`Crowd of ${crowd.length}; ${latest.size} have reacted`}>
      {crowd.map((p) => (
        <Dot key={p.id} person={p} reaction={latest.get(p.id)} />
      ))}
    </div>
  );
}

export function CrowdLegend() {
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

// ---------------------------------------------------------------- the talking grid

/** How long one speaker's bubble stays up before the next newest comment takes over. */
const TURN_MS = 2600;
/** Cells within this many squares of the speaker nod, nearest first. */
const RIPPLE = 4;

/** How many of the newest comments to look through for someone whose square is on screen. */
const LOOKBACK = 60;

/**
 * Picks who speaks next, at most one per turn: the newest reaction with a comment whose square
 * is on screen (a 1,000-person grid is taller than a phone), else simply the newest.
 */
function useSpeaker(feed: Reaction[], on: boolean, onScreen: (personaId: string) => boolean) {
  const onScreenRef = useRef(onScreen);
  useEffect(() => {
    onScreenRef.current = onScreen;
  }, [onScreen]);
  const [speaker, setSpeaker] = useState<Reaction | null>(null);
  const feedRef = useRef(feed);
  const shown = useRef(-1);
  const lastAt = useRef(0);

  useEffect(() => {
    feedRef.current = feed;
  }, [feed]);

  useEffect(() => {
    if (!on) return;
    const pick = () => {
      if (Date.now() - lastAt.current < TURN_MS) return;
      const f = feedRef.current;
      let newest = -1;
      let chosen = -1;
      const stop = Math.max(shown.current, f.length - 1 - LOOKBACK);
      for (let i = f.length - 1; i > stop; i--) {
        if (!f[i].comment?.trim()) continue;
        if (newest < 0) newest = i;
        if (onScreenRef.current(f[i].persona_id)) {
          chosen = i;
          break;
        }
      }
      if (newest < 0) return;
      // Older unseen comments are skipped either way, so the bubble keeps up with the run.
      shown.current = f.length - 1;
      lastAt.current = Date.now();
      setSpeaker(f[chosen >= 0 ? chosen : newest]);
    };
    pick();
    const t = setInterval(pick, 300);
    return () => clearInterval(t);
  }, [on]);

  return on ? speaker : null;
}

/** Squares around the speaker shrink and spring back, nearest first, like a room turning to listen. */
function ripple(grid: HTMLElement, at: number) {
  const cells = grid.children;
  const first = cells[0] as HTMLElement | undefined;
  if (!first) return;
  let cols = 0;
  while (cols < cells.length && (cells[cols] as HTMLElement).offsetTop === first.offsetTop) cols++;
  if (!cols) return;
  const row = Math.floor(at / cols);
  const col = at % cols;
  for (let dr = -RIPPLE; dr <= RIPPLE; dr++) {
    for (let dc = -RIPPLE; dc <= RIPPLE; dc++) {
      const d = Math.hypot(dr, dc);
      if (d === 0 || d > RIPPLE + 0.5) continue;
      const c = col + dc;
      if (c < 0 || c >= cols) continue;
      const el = cells[(row + dr) * cols + c] as HTMLElement | undefined;
      el?.animate?.([{ scale: "1" }, { scale: "0.78" }, { scale: "1" }], {
        duration: 520,
        delay: d * 70,
        easing: "ease-out",
      });
    }
  }
}

/**
 * The live crowd: the grid, plus whoever just spoke gets a ring, a speech bubble rising
 * from their square, and a ripple through the people around them.
 */
export function TalkingCrowd({ crowd, latest, feed, on }: { crowd: CrowdMember[]; latest: Map<string, Reaction>; feed: Reaction[]; on: boolean }) {
  const stage = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const index = useMemo(() => new Map(crowd.map((p, i) => [p.id, i])), [crowd]);
  const onScreen = useCallback(
    (personaId: string) => {
      const cell = grid.current?.children[index.get(personaId) ?? -1];
      if (!cell) return false;
      const r = cell.getBoundingClientRect();
      // Leave room for the sticky header and progress bar at the top.
      return r.top > 150 && r.bottom < window.innerHeight - 8;
    },
    [index],
  );
  const speaker = useSpeaker(feed, on, onScreen);
  const columns = useCrowdColumns(crowd.length, grid);
  const who = speaker ? crowd[index.get(speaker.persona_id) ?? -1] : undefined;
  const at = speaker ? (index.get(speaker.persona_id) ?? -1) : -1;

  // Ring the speaker, place the bubble over their square, ripple the neighbours.
  useLayoutEffect(() => {
    const g = grid.current;
    const s = stage.current;
    const b = bubble.current;
    if (!g || !s) return;
    if (at < 0) {
      s.style.paddingBottom = "";
      return;
    }
    const cell = g.children[at] as HTMLElement | undefined;
    if (!cell) return;
    cell.dataset.speaking = "";
    // Set inline: a ring in the brand colour, above the neighbours.
    Object.assign(cell.style, { outline: "2px solid var(--brand)", outlineOffset: "2px", zIndex: "20" });

    const place = () => {
      if (!b) return;
      const c = cell.getBoundingClientRect();
      const box = s.getBoundingClientRect();
      const x = c.left - box.left + c.width / 2;
      const w = b.offsetWidth;
      const h = b.offsetHeight;
      const left = Math.max(8, Math.min(box.width - w - 8, x - w / 2));
      // No space is reserved for the bubble: it floats over the crowd, above the speaker when
      // the card has room there, else below, and never outside the card.
      const card = (s.closest("section") ?? s).getBoundingClientRect();
      const GAP = 8;
      const EDGE = 4;
      const pad = parseFloat(s.style.paddingBottom) || 0;
      const roomAbove = c.top - card.top - EDGE;
      const roomBelow = card.bottom - pad - c.bottom - EDGE;
      const need = h + GAP;
      // A short grid (25-50 people) may have room on neither side. Then the card grows under the
      // grid by just the bubble's height, and keeps that room (used by every later bubble) until
      // the run ends, so the card changes size at most once and the bubble never covers anyone.
      const below = pad > 0 ? roomBelow + pad >= need || roomAbove < need : roomAbove < need;
      const grow = below && roomBelow < need ? Math.max(pad, Math.ceil(need - roomBelow)) : pad;
      // Ignore 1-2px rounding differences so the card doesn't twitch between turns.
      if (grow > pad + 2) s.style.paddingBottom = `${grow}px`;
      const top = below ? c.bottom - box.top + GAP : c.top - box.top - GAP - h;
      b.style.left = `${left}px`;
      b.style.top = `${top}px`;
      b.dataset.below = below ? "1" : "0";
      b.style.setProperty("--tail", `${Math.max(16, Math.min(w - 16, x - left))}px`);
    };
    place();
    if (!reducedMotion()) ripple(g, at);
    const ro = new ResizeObserver(place);
    ro.observe(s);
    return () => {
      ro.disconnect();
      delete cell.dataset.speaking;
      Object.assign(cell.style, { outline: "", outlineOffset: "", zIndex: "" });
    };
  }, [at, speaker?.id]);

  const pill = speaker ? VOTE_PILL[speaker.vote] : null;

  return (
    <div ref={stage} className="relative">
      <div
        ref={grid}
        className={columns.className}
        style={columns.style}
        role="img"
        aria-label={`Crowd of ${crowd.length}; ${latest.size} have reacted`}
      >
        {crowd.map((p) => (
          <Dot key={p.id} person={p} reaction={latest.get(p.id)} />
        ))}
      </div>

      {/* One bubble, moved from speaker to speaker. Hidden from screen readers; the line below says it. */}
      <div
        ref={bubble}
        aria-hidden
        className={cx(
          "group pointer-events-none absolute left-0 top-0 z-30 w-[min(290px,calc(100%-16px))] sm:w-[min(360px,calc(100%-16px))]",
          !speaker && "invisible",
        )}
      >
        {speaker && who && pill && (
          <motion.div
            key={speaker.id}
            initial={reduce ? false : { opacity: 0, scale: 0.94, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.32, ease: [0.34, 1.56, 0.64, 1] }}
            style={{ transformOrigin: "var(--tail) 100%" }}
            className="relative rounded-2xl border border-edge bg-surface px-3.5 py-2.5 shadow-lift"
          >
            <p className="flex items-center gap-2 text-[12px] text-muted">
              <span className="min-w-0 flex-1 truncate">
                <span className="font-semibold text-ink">{who.name}</span>
                {speaker.changed ? <span className="font-medium text-brand"> · changed their mind</span> : <> · {who.occupation}, {who.city}</>}
              </span>
              <span className={cx("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", pill.cls)}>{pill.label}</span>
            </p>
            {/* Always three lines tall, so every bubble is the same size and the layout never jumps. */}
            <p className="mt-1 line-clamp-3 h-[calc(3*1.375em)] break-words text-[13.5px] leading-snug">“{speaker.comment}”</p>
            <span
              className="absolute -bottom-[6px] h-2.5 w-2.5 -translate-x-1/2 rotate-45 border-b border-r border-edge bg-surface group-data-[below=1]:-top-[6px] group-data-[below=1]:bottom-auto group-data-[below=1]:rotate-[225deg]"
              style={{ left: "var(--tail)" }}
            />
          </motion.div>
        )}
      </div>

      <p className="sr-only" aria-live="polite">
        {speaker && who ? `${who.name}, ${pill?.label}: ${speaker.comment}` : ""}
      </p>
    </div>
  );
}
