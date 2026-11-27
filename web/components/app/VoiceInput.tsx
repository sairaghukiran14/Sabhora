"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Mic, Stop } from "../icons";
import { btn, cx } from "../ui";

/**
 * Speak instead of type. The words are put into a normal text box for the founder to check
 * before anything is sent.
 *
 * The speech service takes at most 30 seconds a clip, so a long recording is cut into
 * parts: from CUT_AFTER_MS we cut at the first pause, and at MAX_PART_MS regardless.
 * The next part starts recording before the last one is uploaded, and parts are
 * transcribed in order.
 */
const CUT_AFTER_MS = 20_000;
const MAX_PART_MS = 28_000;
const QUIET = 0.015; // loudness (RMS, 0-1) below which we treat the moment as a pause
const TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

type Phase = "idle" | "starting" | "recording" | "transcribing";

async function transcribe(clip: Blob): Promise<string> {
  const res = await fetch("/api/voice/transcribe", { method: "POST", headers: { "content-type": clip.type }, body: clip });
  const body = (await res.json().catch(() => null)) as { text?: string; error?: string } | null;
  if (!res.ok) throw new Error(body?.error ?? "Couldn't turn that into text.");
  return body?.text ?? "";
}

export default function VoiceInput({
  onText,
  onActiveChange,
  maxSeconds = 90,
  label = "Speak instead",
}: {
  /** Called once per part, in speaking order. */
  onText: (text: string) => void;
  /** True while recording or transcribing, so the form can wait. */
  onActiveChange?: (active: boolean) => void;
  maxSeconds?: number;
  label?: string;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const stopRef = useRef<() => void>(() => {});
  const alive = useRef(true);
  const latest = useRef({ onText, onActiveChange });
  useEffect(() => {
    latest.current = { onText, onActiveChange };
  });

  useEffect(() => {
    latest.current.onActiveChange?.(phase !== "idle");
  }, [phase]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      stopRef.current(); // leaving the page must switch the microphone off
      latest.current.onActiveChange?.(false);
    };
  }, []);

  const start = useCallback(async () => {
    setError("");
    const mimeType = typeof MediaRecorder === "undefined" ? undefined : TYPES.find((t) => MediaRecorder.isTypeSupported(t));
    if (!mimeType || !navigator.mediaDevices?.getUserMedia) {
      setError("This browser can't record audio. Type instead.");
      return;
    }
    setPhase("starting");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (err) {
      setPhase("idle");
      setError(
        (err as DOMException)?.name === "NotAllowedError"
          ? "Microphone access is blocked. Allow it in your browser, or type instead."
          : "No microphone was found. Type instead.",
      );
      return;
    }
    if (!alive.current) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    context.createMediaStreamSource(stream).connect(analyser);
    const samples = new Float32Array(analyser.fftSize);

    let queue: Promise<void> = Promise.resolve();
    let failed = "";
    let stopped = false;
    let recorder: MediaRecorder;
    let partStarted = 0;
    const began = Date.now();

    const record = () => {
      const chunks: Blob[] = [];
      const r = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 32_000 });
      let heard = false;
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      r.onstop = () => {
        const clip = new Blob(chunks, { type: mimeType.split(";")[0] });
        // A part with no sound in it is not worth sending (or paying for).
        if (!alive.current || !heard || clip.size < 1000) return;
        const request = transcribe(clip);
        request.catch(() => {}); // handled in order below
        queue = queue.then(async () => {
          try {
            const text = (await request).trim();
            if (text && alive.current) latest.current.onText(text);
          } catch (err) {
            failed = err instanceof Error ? err.message : "Couldn't turn that into text.";
          }
        });
      };
      r.start(1000);
      partStarted = Date.now();
      recorder = r;
      return () => {
        heard = true;
      };
    };
    let markHeard = record();

    const finish = () => {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      const last = recorder;
      const done = new Promise<void>((resolve) => last.addEventListener("stop", () => resolve(), { once: true }));
      if (last.state !== "inactive") last.stop();
      stream.getTracks().forEach((t) => t.stop());
      void context.close();
      if (!alive.current) return;
      setPhase("transcribing");
      // The stop handler above runs before this listener, so the queue now holds every part.
      void done.then(() => queue).then(() => {
        if (!alive.current) return;
        setPhase("idle");
        if (failed) setError(`${failed} Check the text for gaps.`);
      });
    };
    stopRef.current = finish;

    const timer = setInterval(() => {
      analyser.getFloatTimeDomainData(samples);
      const loudness = Math.sqrt(samples.reduce((sum, x) => sum + x * x, 0) / samples.length);
      if (loudness >= QUIET) markHeard();
      const total = Date.now() - began;
      setSeconds(Math.floor(total / 1000));
      if (total >= maxSeconds * 1000) return finish();
      const part = Date.now() - partStarted;
      if (part >= MAX_PART_MS || (part >= CUT_AFTER_MS && loudness < QUIET)) {
        const previous = recorder;
        markHeard = record(); // start the next part first, so no words fall in between
        previous.stop();
      }
    }, 150);

    setSeconds(0);
    setPhase("recording");
  }, [maxSeconds]);

  const recording = phase === "recording";
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={recording ? () => stopRef.current() : start}
          disabled={phase === "starting" || phase === "transcribing"}
          aria-pressed={recording}
          className={btn(recording ? "danger" : "secondary", "sm")}
        >
          {recording ? <Stop size={14} /> : <Mic size={15} />}
          {recording ? "Stop recording" : phase === "transcribing" ? "Writing it down…" : label}
        </button>
        <span role="status" className={cx("text-[13px] tabular-nums", recording ? "font-medium text-danger" : "text-muted")}>
          {recording ? `Listening · ${seconds}s of ${maxSeconds}s` : `Up to ${maxSeconds} seconds. Hindi is written down in English. Check it before sending.`}
        </span>
      </div>
      {error && (
        <p role="alert" className="mt-2 flex items-center gap-1.5 text-[13px] text-danger">
          <Alert size={14} className="shrink-0" /> {error}
        </p>
      )}
    </div>
  );
}
