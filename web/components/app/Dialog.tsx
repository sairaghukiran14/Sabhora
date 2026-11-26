"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cx } from "../ui";

/**
 * A modal built on the native <dialog>, used instead of window.confirm/alert/prompt.
 *
 * showModal() puts it in the browser's top layer, so it is never clipped or trapped by an
 * ancestor's backdrop-blur or transform the way a position: fixed child would be — the
 * reason the drawers elsewhere have to portal to <body>. The browser also gives us the
 * focus trap, the inert background and Escape for free.
 */
export default function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  /** Buttons, and anything else the dialog shows. */
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const headingId = `${title.replace(/\W+/g, "-").toLowerCase()}-dialog`;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={headingId}
      // Escape and the backdrop both route through the same close path as the buttons.
      onClose={onClose}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cx(
        "m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-edge bg-surface p-5 text-ink shadow-card",
        "backdrop:bg-ink/50 open:animate-none sm:p-6",
        className,
      )}
    >
      {/* Stops a click inside the panel from reaching the backdrop handler above. */}
      <div onClick={(e) => e.stopPropagation()}>
        <h2 id={headingId} className="font-display text-lg">
          {title}
        </h2>
        {description && <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{description}</p>}
        {children}
      </div>
    </dialog>
  );
}
