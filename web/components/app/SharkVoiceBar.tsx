"use client";

import { useEffect } from "react";
import { holdSharks } from "@/app/actions/runs";
import { Volume, VolumeOff } from "../icons";
import { btn } from "../ui";
import type { SharkVoice } from "./useSharkVoice";

const HOLD_EVERY_MS = 10_000;

/**
 * Controls for the sharks' voices. Also keeps the founder's clock honest: while lines are
 * still playing during a wait, it asks the engine to restart the countdown, and once more
 * when they finish. Recording counts as still busy.
 */
export default function SharkVoiceBar({
  runId,
  voice,
  live,
  waitingFor,
}: {
  runId: string;
  voice: SharkVoice;
  live: boolean;
  /** Id of the event the founder is being waited on for, or null. */
  waitingFor: number | null;
}) {
  // A founder who is recording is busy. A blocked or muted player must not hold the clock open.
  const busy = voice.recording || (voice.on && !voice.blocked && voice.pending > 0);

  useEffect(() => {
    if (waitingFor === null || !busy) return;
    const hold = () => void holdSharks(runId).catch(() => {});
    hold();
    const timer = setInterval(hold, HOLD_EVERY_MS);
    return () => {
      clearInterval(timer);
      hold(); // the full time to answer starts once they stop talking
    };
  }, [runId, waitingFor, busy]);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-edge bg-surface px-4 py-3">
      <p role="status" className="min-w-0 flex-1 text-sm">
        {voice.speaking ? (
          <>
            <span className="font-medium">{voice.speaking.name}</span> is speaking
            {voice.pending > 1 ? ` · ${voice.pending - 1} more waiting` : ""}
          </>
        ) : voice.blocked ? (
          "Your browser needs a tap before it can play sound."
        ) : live && voice.on ? (
          "Voice is on. You'll hear each shark as they speak."
        ) : (
          "Press Listen under any line to hear it."
        )}
        {voice.problem && <span className="mt-0.5 block text-[13px] text-danger">{voice.problem}</span>}
      </p>
      {voice.blocked && (
        <button type="button" onClick={voice.unblock} className={btn("brand", "sm")}>
          <Volume size={15} /> Tap to hear
        </button>
      )}
      {voice.speaking && (
        <button type="button" onClick={voice.skip} className={btn("ghost", "sm")}>
          Skip line
        </button>
      )}
      {live && (
        <button type="button" onClick={voice.toggle} aria-pressed={voice.on} className={btn("secondary", "sm")}>
          {voice.on ? <Volume size={15} /> : <VolumeOff size={15} />}
          {voice.on ? "Voice on" : "Voice off"}
        </button>
      )}
    </div>
  );
}
