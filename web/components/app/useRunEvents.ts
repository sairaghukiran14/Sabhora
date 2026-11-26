"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RunEvent } from "@/lib/events";

export type Connection = "connecting" | "live" | "reconnecting" | "lost";

const MAX_RETRIES = 8;

/** While a run is in progress, follows its event stream. Otherwise returns the saved events. */
export function useLiveEvents(runId: string, saved: RunEvent[], running: boolean) {
  const router = useRouter();
  const [streamed, setStreamed] = useState<RunEvent[]>([]);
  const [connection, setConnection] = useState<Connection>("connecting");

  useEffect(() => {
    if (!running) return;
    let source: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    let lastId = -1;
    let closed = false;

    const connect = () => {
      source = new EventSource(`/api/runs/${runId}/stream?after=${lastId}`);
      source.onopen = () => setConnection("live");
      source.onmessage = (msg) => {
        const event = JSON.parse(msg.data) as RunEvent;
        attempts = 0;
        if (event.id <= lastId) return;
        lastId = event.id;
        setStreamed((all) => (all.some((e) => e.id === event.id) ? all : [...all, event]));
        if (event.type === "done") {
          closed = true;
          source?.close();
          router.refresh(); // picks up the settled status, balance and share controls
        }
      };
      source.onerror = () => {
        if (closed) return;
        source?.close();
        if (++attempts > MAX_RETRIES) {
          setConnection("lost");
          router.refresh(); // the server may have settled the run in the meantime
          return;
        }
        setConnection("reconnecting");
        retry = setTimeout(connect, Math.min(1000 * attempts, 5000));
      };
    };
    connect();

    return () => {
      closed = true;
      clearTimeout(retry);
      source?.close();
    };
  }, [runId, running, router]);

  // Once the server has the settled run, its saved copy is the source of truth.
  const events = running || saved.length === 0 ? streamed : saved;
  return { events, connection };
}

const DELAY: Partial<Record<RunEvent["type"], number>> = {
  typing: 250,
  message: 1300,
  founder: 900,
  review: 1100,
  round: 300,
  judging: 500,
  verdict: 900,
};

/** Reveals saved events one at a time, for "Replay the session". */
export function useReplay(events: RunEvent[]) {
  const [shown, setShown] = useState<number | null>(null);
  const playing = shown !== null && shown < events.length;
  const reactions = useRef(1);

  useEffect(() => {
    if (!playing || shown === null) return;
    const next = events[shown];
    const delay = next.type === "reaction" ? Math.max(30, Math.min(140, 7000 / reactions.current)) : (DELAY[next.type] ?? 0);
    const timer = setTimeout(() => setShown(shown + 1), delay);
    return () => clearTimeout(timer);
  }, [playing, shown, events]);

  const start = useCallback(() => {
    reactions.current = Math.max(1, events.filter((e) => e.type === "reaction").length);
    setShown(0);
  }, [events]);
  const skip = useCallback(() => setShown(null), []);

  return {
    visible: playing ? events.slice(0, shown) : events,
    playing,
    progress: playing ? shown / events.length : 1,
    start,
    skip,
  };
}
