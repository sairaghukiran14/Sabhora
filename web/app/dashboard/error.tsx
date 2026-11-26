"use client";

import { Alert, Refresh } from "@/components/icons";
import { btn } from "@/components/ui";

export default function DashboardError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-20 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-danger-soft text-danger">
        <Alert size={26} />
      </span>
      <h1 className="mt-5 font-display text-2xl">Something went wrong</h1>
      <p className="mt-2 text-[15px] text-muted">
        That page didn&apos;t load. Your credits and runs are safe. Try again, and if it keeps happening, refresh the page.
      </p>
      <button type="button" onClick={reset} className={btn("brand", "md", "mt-6")}>
        <Refresh size={17} /> Try again
      </button>
    </div>
  );
}
