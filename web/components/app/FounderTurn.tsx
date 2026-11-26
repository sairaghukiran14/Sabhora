"use client";

import { useEffect, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { replyToSharks } from "@/app/actions/runs";
import { Alert, Check, Clock } from "../icons";
import { btn, cx } from "../ui";
import { inputBase } from "../forms";

/** The founder's chance to answer between rounds. The engine moves on when time runs out. */
export default function FounderTurn({ runId, waitS, expiresAt }: { runId: string; waitS: number; expiresAt: number | null }) {
  const [left, setLeft] = useState(Math.round(waitS));
  const [text, setText] = useState("");
  const [state, setState] = useState<"open" | "sending" | "sent">("open");
  const [error, setError] = useState("");

  useEffect(() => {
    const deadline = expiresAt ? expiresAt * 1000 : Date.now() + waitS * 1000;
    const tick = () => setLeft(Math.round(Math.min(waitS, Math.max(0, (deadline - Date.now()) / 1000))));
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 500);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [waitS, expiresAt]);

  async function submit(answer: string | null) {
    setState("sending");
    setError("");
    const result = await replyToSharks(runId, answer).catch(() => ({ error: "Couldn't send that. Try again." }));
    if ("error" in result) {
      setError(result.error);
      setState("open");
    } else setState("sent");
  }

  if (state === "sent") {
    return (
      <p role="status" className="flex items-center gap-2 rounded-2xl bg-success-soft px-4 py-3 text-sm text-success-ink">
        <Check size={16} /> Sent. The next round is starting.
      </p>
    );
  }

  return (
    <motion.form
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      onSubmit={(e: FormEvent) => (e.preventDefault(), text.trim() && submit(text))}
      className="rounded-2xl border-2 border-mode bg-surface p-4 shadow-card sm:p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="founder-answer" className="font-display text-lg">
          Your turn: answer the sharks
        </label>
        <span className={cx("flex items-center gap-1.5 text-sm font-medium tabular-nums", left <= 10 ? "text-danger" : "text-muted")}>
          <Clock size={15} /> {left}s
        </span>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-mode-soft">
        <div className="h-full bg-mode transition-[width] duration-500 ease-linear" style={{ width: `${(left / Math.max(1, waitS)) * 100}%` }} />
      </div>
      <textarea
        id="founder-answer"
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={500}
        rows={3}
        placeholder="Answer their toughest question with a fact or a number."
        className={cx(inputBase, "mt-3 resize-y border-edge-strong py-3 leading-relaxed")}
      />
      {error && (
        <p role="alert" className="mt-2 flex items-center gap-1.5 text-[13px] text-danger">
          <Alert size={14} /> {error}
        </p>
      )}
      <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" disabled={state === "sending"} onClick={() => submit(null)} className={btn("ghost", "md")}>
          Skip this round
        </button>
        <button type="submit" disabled={!text.trim() || state === "sending"} className={btn("brand", "md")}>
          {state === "sending" ? "Sending…" : "Send answer"}
        </button>
      </div>
    </motion.form>
  );
}
