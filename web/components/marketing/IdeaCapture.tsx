"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Alert, Arrow, Flame, Janta, Sharks } from "../icons";
import { btn, cx } from "../ui";
import { validatePublicUrl } from "@/lib/validation";
import type { RoomMode } from "@/lib/types";

const ROOM_TABS: { id: RoomMode; label: string; Icon: typeof Sharks }[] = [
  { id: "sharks", label: "Sharks", Icon: Sharks },
  { id: "janta", label: "Janta", Icon: Janta },
  { id: "roast", label: "Roast", Icon: Flame },
];

const PLACEHOLDER: Record<RoomMode, string> = {
  sharks: "An app that helps kirana stores reorder stock over WhatsApp, ₹299 a month",
  janta: "A ₹99/month meal-planning app for working parents in tier-2 cities",
  roast: "yourstartup.in",
};

export const DRAFT_KEY = "pp-draft";

export default function IdeaCapture({ tone = "light" }: { tone?: "light" | "dark" }) {
  const router = useRouter();
  const [room, setRoom] = useState<RoomMode>("sharks");
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function submit(e: FormEvent) {
    e.preventDefault();
    const v = value.trim();
    if (room === "roast") {
      const r = validatePublicUrl(v);
      if (!v || "error" in r) return setError("error" in r && v ? r.error : "Paste your landing page address");
    } else if (v.length < 20) {
      return setError("Describe your idea in a sentence (at least 20 characters)");
    }
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ room, value: v }));
    } catch {}
    setBusy(true);
    router.push(`/signup?next=${encodeURIComponent(`/dashboard/new?room=${room}`)}`);
  }

  const dark = tone === "dark";

  return (
    <form onSubmit={submit} noValidate className="w-full text-left">
      <div
        className={cx(
          "rounded-[22px] border p-2 transition-shadow duration-300 focus-within:shadow-[0_0_0_4px_rgb(79_70_229/0.14)]",
          dark ? "border-white/20 bg-white/10 backdrop-blur" : "border-edge-strong bg-surface shadow-lift",
        )}
      >
        <div role="tablist" aria-label="Choose a room" className="flex gap-1 p-1">
          {ROOM_TABS.map(({ id, label, Icon }) => {
            const active = room === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setRoom(id);
                  setError("");
                }}
                className={cx(
                  `room-${id} relative flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-[13px] font-medium transition-colors sm:flex-none sm:px-3.5`,
                  active
                    ? dark ? "text-white" : "text-mode-ink"
                    : dark ? "text-white/70 hover:text-white" : "text-muted hover:text-ink",
                )}
              >
                {active && (
                  <motion.span
                    layoutId={`room-pill-${tone}`}
                    className={cx("absolute inset-0 rounded-xl", dark ? "bg-white/15" : "bg-mode-soft")}
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                )}
                <Icon size={16} className="relative" />
                <span className="relative">{label}</span>
              </button>
            );
          })}
        </div>

        <label htmlFor={`idea-${tone}`} className="sr-only">
          {room === "roast" ? "Your landing page address" : "Describe your startup idea"}
        </label>
        {room === "roast" ? (
          <input
            id={`idea-${tone}`}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError("");
            }}
            inputMode="url"
            autoComplete="url"
            placeholder={PLACEHOLDER.roast}
            className={cx(
              "block h-14 w-full bg-transparent px-3 text-base focus:outline-none sm:text-[17px]",
              dark ? "text-white placeholder:text-white/50" : "text-ink placeholder:text-faint",
            )}
          />
        ) : (
          <textarea
            id={`idea-${tone}`}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError("");
            }}
            maxLength={600}
            placeholder={PLACEHOLDER[room]}
            className={cx(
              "block h-[96px] w-full resize-none bg-transparent px-3 py-2 text-base leading-relaxed focus:outline-none sm:h-[72px] sm:text-[17px]",
              dark ? "text-white placeholder:text-white/50" : "text-ink placeholder:text-faint",
            )}
          />
        )}

        <div className="flex flex-col gap-2 p-1 sm:flex-row sm:items-center sm:justify-between">
          <p className={cx("px-2 text-xs", dark ? "text-white/70" : "text-faint")}>
            {room === "sharks" && "5 investors, live offers · 15 credits"}
            {room === "janta" && "25 simulated personas react · 10 credits"}
            {room === "roast" && "6 reviewers score your page · 5 credits"}
          </p>
          <button
            type="submit"
            disabled={busy}
            className={btn(dark ? "white" : "brand", "lg", "w-full sm:w-auto")}
          >
            {busy ? "Opening…" : "Get my verdict free"}
            <Arrow size={18} />
          </button>
        </div>
      </div>
      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            role="alert"
            className={cx("mt-2.5 flex items-center gap-1.5 px-2 text-sm", dark ? "text-white" : "text-danger")}
          >
            <Alert size={15} /> {error}
          </motion.p>
        )}
      </AnimatePresence>
    </form>
  );
}
