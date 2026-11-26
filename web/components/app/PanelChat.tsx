"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { chatWithPersona, type ChatTurn } from "@/app/actions/runs";
import { useHydrated } from "../hooks";
import { Alert, Arrow, Message, X } from "../icons";
import { btn, cx, Initials } from "../ui";
import { inputBase } from "../forms";

export type ChatPerson = { id: string; name: string; subtitle: string; position: string | null };
export type PanelChatHandle = { openTo: (id: string) => void };

type Turn = ChatTurn & { moved?: { from: string; to: string } };

/**
 * Follow-up questions to anyone who took part. A small launcher sits in the page; picking a
 * person opens a chat window that slides in from the right. Conversations stay in this tab.
 */
const PanelChat = forwardRef<PanelChatHandle, { runId: string; people: ChatPerson[] }>(function PanelChat(
  { runId, people },
  ref,
) {
  const hydrated = useHydrated();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState("");
  const [threads, setThreads] = useState<Record<string, Turn[]>>({});
  const [positions, setPositions] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [waiting, setWaiting] = useState<string | null>(null);
  const [error, setError] = useState("");
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const openTo = (id: string) => {
    setSelected(id);
    setError("");
    setOpen(true);
  };
  useImperativeHandle(ref, () => ({ openTo }), []);

  const person = people.find((p) => p.id === selected) ?? people[0];

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    const focus = setTimeout(() => input.current?.focus(), 260);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
      clearTimeout(focus);
    };
  }, [open]);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [selected, open]);

  if (!person) return null;

  const thread = threads[person.id] ?? [];
  const draft = drafts[person.id] ?? "";
  const position = positions[person.id] ?? person.position;
  const compact = people.length > 8;
  const scrollDown = () => setTimeout(() => log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" }), 60);

  async function send(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || waiting || !person) return;
    const id = person.id;
    const history = thread.map(({ role, text }) => ({ role, text }));
    setError("");
    setWaiting(id);
    setThreads((t) => ({ ...t, [id]: [...(t[id] ?? []), { role: "founder", text }] }));
    setDrafts((d) => ({ ...d, [id]: "" }));
    scrollDown();

    const result = await chatWithPersona(runId, id, text, history).catch(() => ({ error: "Couldn't send that. Try again." }));
    setWaiting(null);
    if ("error" in result) {
      setError(result.error);
      setThreads((t) => ({ ...t, [id]: (t[id] ?? []).slice(0, -1) })); // let them resend
      setDrafts((d) => ({ ...d, [id]: text }));
      return;
    }
    const before = positions[id] ?? person.position;
    const moved = result.position && before && result.position !== before ? { from: before, to: result.position } : undefined;
    setThreads((t) => ({ ...t, [id]: [...(t[id] ?? []), { role: "persona", text: result.reply, moved }] }));
    if (result.position) setPositions((p) => ({ ...p, [id]: result.position! }));
    scrollDown();
  }

  const launcher = (
    <section className="rounded-2xl border border-edge bg-surface shadow-soft">
      <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <h2 className="flex items-center gap-2 font-display text-lg">
            <Message size={19} className="text-mode-ink" /> Follow up with anyone
          </h2>
          <p className="mt-0.5 text-[13px] text-muted">Answer an objection and see whether they change their mind.</p>
        </div>
        {compact && (
          <button type="button" onClick={() => openTo(people[0].id)} className={btn("brand", "md", "shrink-0")}>
            <Message size={16} /> Open chat
          </button>
        )}
      </div>
      {!compact && (
        <div className="-mt-1 flex gap-2 overflow-x-auto px-5 pb-5 sm:px-6">
          {people.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => openTo(p.id)}
              className="flex shrink-0 items-center gap-2.5 rounded-xl border border-edge bg-bg py-2 pl-2 pr-3.5 text-left transition-colors hover:border-edge-strong hover:bg-surface"
            >
              <Initials name={p.name} className="h-8 w-8 text-[12px]" />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{p.name}</span>
                <span className="block max-w-[11rem] truncate text-[12px] text-muted">{p.subtitle}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );

  const drawer = hydrated
    ? createPortal(
        <AnimatePresence>
          {open && (
            <div className="fixed inset-0 z-[60]">
              <motion.div
                className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setOpen(false)}
              />
              <motion.aside
                role="dialog"
                aria-modal="true"
                aria-label={`Chat with ${person.name}`}
                className="absolute inset-y-0 right-0 flex w-full flex-col bg-bg shadow-lift sm:max-w-md"
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "spring", stiffness: 360, damping: 38 }}
              >
                <header className="shrink-0 border-b border-edge bg-surface px-4 py-3.5 sm:px-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <Initials name={person.name} className="h-10 w-10 text-sm" />
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-[15px] font-medium">
                          <span className="truncate">{person.name}</span>
                          {position && (
                            <span className="shrink-0 rounded-full bg-bg px-2 py-0.5 text-[11px] font-medium capitalize text-muted">{position}</span>
                          )}
                        </p>
                        <p className="truncate text-[13px] text-muted">{person.subtitle}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      aria-label="Close chat"
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-edge text-muted transition-colors hover:border-edge-strong hover:text-ink"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  {people.length > 1 &&
                    (compact ? (
                      <select
                        aria-label="Talk to someone else"
                        value={person.id}
                        onChange={(e) => openTo(e.target.value)}
                        className={cx(inputBase, "mt-3 h-10 border-edge-strong text-sm")}
                      >
                        {people.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} · {p.subtitle}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="-mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1" role="group" aria-label="Talk to someone else">
                        {people.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            aria-pressed={p.id === person.id}
                            onClick={() => openTo(p.id)}
                            className={cx(
                              "shrink-0 rounded-full border px-3 py-1 text-[13px] font-medium transition-colors",
                              p.id === person.id ? "border-brand bg-brand-soft text-brand-ink" : "border-edge text-muted hover:text-ink",
                            )}
                          >
                            {p.name}
                          </button>
                        ))}
                      </div>
                    ))}
                </header>

                <div ref={log} className="flex-1 space-y-3 overflow-y-auto bg-bg px-4 py-4 sm:px-5" aria-live="polite">
                  {thread.length === 0 && waiting !== person.id && (
                    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-brand-ink">
                        <Message size={22} />
                      </span>
                      <p className="mt-3 text-[15px] font-medium">Ask {person.name} anything</p>
                      <p className="mt-1 text-[13px] text-muted">
                        They remember what they said about your idea. A good reason can move them.
                      </p>
                    </div>
                  )}
                  {thread.map((t, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cx("flex", t.role === "founder" && "justify-end")}
                    >
                      <div className="max-w-[85%]">
                        <p
                          className={cx(
                            "whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed",
                            t.role === "founder" ? "rounded-tr-sm bg-brand text-white" : "rounded-tl-sm border border-edge bg-surface",
                          )}
                        >
                          {t.text}
                        </p>
                        {t.moved && (
                          <p className="mt-1 text-[12px] font-medium text-accent-ink">
                            Changed their mind: {t.moved.from} → {t.moved.to}
                          </p>
                        )}
                      </div>
                    </motion.div>
                  ))}
                  {waiting === person.id && (
                    <div className="flex items-center gap-1 rounded-full border border-edge bg-surface px-3.5 py-2.5" aria-label={`${person.name} is typing`} style={{ width: "fit-content" }}>
                      {[0, 1, 2].map((i) => (
                        <motion.span
                          key={i}
                          className="h-1.5 w-1.5 rounded-full bg-muted"
                          animate={{ opacity: [0.25, 1, 0.25] }}
                          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
                        />
                      ))}
                    </div>
                  )}
                </div>

                <form onSubmit={send} className="shrink-0 border-t border-edge bg-surface px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:px-5">
                  {error && (
                    <p role="alert" className="mb-2 flex items-center gap-1.5 text-[13px] text-danger">
                      <Alert size={14} /> {error}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <input
                      ref={input}
                      aria-label={`Message to ${person.name}`}
                      value={draft}
                      maxLength={500}
                      onChange={(e) => setDrafts((d) => ({ ...d, [person.id]: e.target.value }))}
                      placeholder="What would change your mind?"
                      className={cx(inputBase, "h-11 min-w-0 flex-1 border-edge-strong")}
                    />
                    <button type="submit" disabled={!draft.trim() || !!waiting} className={btn("brand", "md", "shrink-0")} aria-label="Send">
                      <Arrow size={16} />
                    </button>
                  </div>
                </form>
              </motion.aside>
            </div>
          )}
        </AnimatePresence>,
        document.body,
      )
    : null;

  return (
    <>
      {launcher}
      {drawer}
    </>
  );
});

export default PanelChat;
