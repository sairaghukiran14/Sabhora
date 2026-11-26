"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, X } from "../icons";

export default function AccountNotice() {
  const params = useSearchParams();
  const [hidden, setHidden] = useState(false);
  if (hidden || params.get("account") !== "deleted") return null;
  return (
    <div role="status" className="border-b border-edge bg-success-soft">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5 text-sm text-success-ink sm:px-6 lg:px-8">
        <span className="flex items-center gap-2">
          <Check size={16} /> Your account and all its data were deleted.
        </span>
        <button type="button" onClick={() => setHidden(true)} aria-label="Dismiss" className="rounded-full p-1 hover:bg-ink/5">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
