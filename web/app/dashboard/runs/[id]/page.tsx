import type { Metadata } from "next";
import NextLink from "next/link";
import { notFound } from "next/navigation";
import { getRun } from "@/lib/dal";
import { getEngineConfig } from "@/lib/backend";
import { ROOMS } from "@/lib/pricing";
import type { RoomMode } from "@/lib/types";
import RunView from "@/components/app/RunView";
import ShareControls from "@/components/app/ShareControls";
import { Arrow, ArrowLeft, Globe } from "@/components/icons";
import { formatDate, RoomBadge, RoomIcon } from "@/components/ui";

export const metadata: Metadata = { title: "Run · Sabhora" };

type Props = { params: Promise<{ id: string }> };

export default async function RunPage({ params }: Props) {
  const { id } = await params;
  const run = await getRun(id);
  if (!run) notFound();
  const input = run.input;
  // A finished run knows what produced it; a live one has to ask the engine.
  const engine = run.status === "running" ? await getEngineConfig() : null;
  const demo = run.demo || engine?.crowd_provider === "fake";
  const others = (Object.keys(ROOMS) as RoomMode[]).filter((m) => m !== run.mode);

  return (
    <div className={`${ROOMS[run.mode].cls} space-y-6`}>
      <NextLink href="/dashboard/runs" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft size={16} /> All runs
      </NextLink>

      <header className="fade-up flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <RoomBadge mode={run.mode}>
            {ROOMS[run.mode].name}
            {run.panelSize ? ` · ${run.panelSize} people` : ""}
          </RoomBadge>
          <h1 className="mt-3 text-balance font-display text-[clamp(1.5rem,3.6vw,2rem)] leading-tight tracking-tight">{run.title}</h1>
          <p className="mt-1.5 text-sm text-muted">
            {formatDate(run.createdAt, true)} ·{" "}
            {run.status === "running" ? `${run.cost} credits held` : run.status === "failed" ? "Refunded" : `${run.cost} credits`}
            {run.isPublic && (
              <span className="ml-2 inline-flex items-center gap-1 text-success-ink">
                <Globe size={13} /> Shared
              </span>
            )}
          </p>
        </div>
        {run.status !== "running" && (
          <ShareControls runId={run.id} shareId={run.shareId} isPublic={run.isPublic} canShare={run.status === "done"} />
        )}
      </header>

      <div className="rounded-2xl border border-dashed border-edge-strong bg-surface/60 p-4 sm:p-5">
        <p className="text-[12px] font-medium uppercase tracking-[0.1em] text-faint">{run.mode === "roast" ? "Page reviewed" : "Your pitch"}</p>
        {run.mode === "roast" ? (
          <a href={input.url} target="_blank" rel="noopener noreferrer nofollow" className="mt-1.5 inline-flex items-center gap-1.5 break-all text-[15px] text-brand-ink hover:underline">
            <Globe size={15} className="shrink-0" /> {input.url}
          </a>
        ) : (
          <>
            <p className="mt-1.5 text-[15px] leading-relaxed">{input.idea}</p>
            {(input.customer || input.price) && (
              <p className="mt-2 text-[13px] text-muted">
                {input.customer && <>For {input.customer}</>}
                {input.customer && input.price && " · "}
                {input.price && <>Priced at {input.price}</>}
              </p>
            )}
          </>
        )}
      </div>

      <RunView
        key={run.id}
        runId={run.id}
        mode={run.mode}
        status={run.status}
        events={run.events}
        error={run.error}
        cost={run.cost}
        demo={demo}
        owner
      />

      <section className="rounded-2xl border border-edge bg-surface p-5 shadow-soft sm:p-6">
        <p className="font-display text-lg">Get the full picture</p>
        <p className="mt-1 text-[15px] text-muted">Each room tests a different way your idea could fail. Run it past the others too.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {others.map((m) => (
            <NextLink
              key={m}
              href={`/dashboard/new?room=${m}`}
              className={`${ROOMS[m].cls} group flex items-center gap-3 rounded-xl border border-edge p-3.5 transition-colors hover:border-mode/40 hover:bg-mode-soft/40`}
            >
              <RoomIcon mode={m} size={18} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{ROOMS[m].name}</span>
                <span className="block truncate text-[13px] text-muted">{ROOMS[m].short}</span>
              </span>
              <Arrow size={16} className="shrink-0 text-mode-ink transition-transform group-hover:translate-x-0.5" />
            </NextLink>
          ))}
        </div>
      </section>
    </div>
  );
}
