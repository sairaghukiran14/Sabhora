"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { deleteRun, setShared } from "@/app/actions/runs";
import { Check, Copy, Globe, Lock, Trash } from "../icons";
import { btn, cx } from "../ui";
import { inputBase } from "../forms";
import Dialog from "./Dialog";

function ToggleButton({ isPublic }: { isPublic: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={btn("secondary", "sm")}>
      {isPublic ? <Lock size={15} /> : <Globe size={15} />}
      {pending ? "Saving…" : isPublic ? "Make private" : "Share verdict"}
    </button>
  );
}

function DeleteButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={btn("danger", "md")}>
      {pending ? "Deleting…" : "Delete run"}
    </button>
  );
}

export default function ShareControls({
  runId,
  shareId,
  isPublic,
  canShare,
}: {
  runId: string;
  shareId: string;
  isPublic: boolean;
  canShare: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [linkToCopy, setLinkToCopy] = useState<string | null>(null);
  const linkRef = useRef<HTMLInputElement>(null);

  async function copy() {
    const url = `${window.location.origin}/v/${shareId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused; show the link so it can be copied by hand.
      setLinkToCopy(url);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canShare && (
        <form action={setShared}>
          <input type="hidden" name="id" value={runId} />
          <input type="hidden" name="public" value={isPublic ? "0" : "1"} />
          <ToggleButton isPublic={isPublic} />
        </form>
      )}
      {isPublic && (
        <button type="button" onClick={copy} className={btn("brand", "sm")}>
          {copied ? <Check size={15} /> : <Copy size={15} />}
          {copied ? "Link copied" : "Copy link"}
        </button>
      )}

      {/* The dialog lives inside the form, so its button submits it. */}
      <form action={deleteRun}>
        <input type="hidden" name="id" value={runId} />
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className={btn("ghost", "sm", "text-danger hover:bg-danger-soft hover:text-danger")}
          aria-label="Delete run"
        >
          <Trash size={15} /> <span className="sm:hidden">Delete</span>
        </button>
        <Dialog
          open={confirming}
          onClose={() => setConfirming(false)}
          title="Delete this run?"
          description="This can't be undone. Your credits aren't affected, and a shared link stops working."
        >
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setConfirming(false)} className={btn("ghost", "md")}>
              Keep it
            </button>
            <DeleteButton />
          </div>
        </Dialog>
      </form>

      <Dialog
        open={linkToCopy !== null}
        onClose={() => setLinkToCopy(null)}
        title="Copy this link"
        description="Your browser wouldn't let the page copy it for you."
      >
        <input
          ref={linkRef}
          readOnly
          value={linkToCopy ?? ""}
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          className={cx(inputBase, "mt-4 h-11 border-edge-strong")}
          aria-label="Share link"
        />
        <div className="mt-4 flex justify-end">
          <button type="button" onClick={() => setLinkToCopy(null)} className={btn("brand", "md")}>
            Done
          </button>
        </div>
      </Dialog>
    </div>
  );
}
