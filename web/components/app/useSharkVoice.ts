"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RunEvent } from "@/lib/events";

export type SpokenLine = { id: number; speaker: string; name: string };

/** What the sharks said, in order. Only these can be voiced. */
export function spokenLines(events: RunEvent[]): SpokenLine[] {
  return events.flatMap((e) =>
    e.type === "message" || e.type === "offer" || e.type === "counter_reply"
      ? [{ id: e.id, speaker: e.speaker, name: e.name }]
      : [],
  );
}

/**
 * Plays the sharks' lines one after another.
 *
 * `after` is the newest line to treat as already heard: -1 reads a new run from the start.
 * With autoplay off, nothing plays until the founder asks for a line.
 */
export function useSharkVoice({ runId, lines, autoplay, after }: { runId: string; lines: SpokenLine[]; autoplay: boolean; after: number }) {
  const [on, setOn] = useState(autoplay);
  const [heard, setHeard] = useState(after);
  const [single, setSingle] = useState<number | null>(null); // a line the founder asked for
  const [paused, setPaused] = useState(false); // while the founder records
  const [blocked, setBlocked] = useState(false); // the browser wants a tap first
  const [problem, setProblem] = useState("");
  const audio = useRef<HTMLAudioElement | null>(null);

  const next = single ?? (on ? (lines.find((l) => l.id > heard)?.id ?? null) : null);
  const current = paused || blocked ? null : next;

  useEffect(() => {
    if (current === null) return;
    const player = new Audio(`/api/runs/${runId}/speech?event=${current}`);
    audio.current = player;
    let live = true;
    const finish = (message: string) => {
      if (!live) return;
      setProblem(message);
      setSingle(null);
      setHeard((h) => Math.max(h, current));
    };
    player.onended = () => finish("");
    player.onerror = () => finish("One line couldn't be played. The text is still here.");
    player.play().catch((err: DOMException) => {
      if (!live) return;
      if (err.name === "NotAllowedError") setBlocked(true);
      else if (err.name !== "AbortError") finish("One line couldn't be played. The text is still here.");
    });
    return () => {
      live = false;
      player.pause();
    };
  }, [current, runId]);

  const unblock = useCallback(() => setBlocked(false), []);
  const play = useCallback((id: number) => {
    setBlocked(false);
    setSingle(id);
  }, []);
  const skip = useCallback(() => {
    if (next === null) return;
    setSingle(null);
    setHeard((h) => Math.max(h, next));
  }, [next]);
  const toggle = useCallback(() => {
    setBlocked(false);
    setSingle(null);
    // Turning voice back on carries on from now, not from the lines missed while muted.
    if (!on) setHeard(lines.at(-1)?.id ?? -1);
    setOn(!on);
  }, [on, lines]);

  return {
    on,
    toggle,
    play,
    skip,
    unblock,
    blocked,
    problem,
    setPaused,
    recording: paused,
    speaking: current === null ? null : (lines.find((l) => l.id === current) ?? null),
    /** Lines still to be played, including the one playing now. */
    pending: on ? lines.filter((l) => l.id > heard).length : 0,
  };
}

export type SharkVoice = ReturnType<typeof useSharkVoice>;
