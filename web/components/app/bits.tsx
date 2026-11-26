import NextLink from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "../icons";
import { cx, formatDate, RoomIcon, ScoreBadge } from "../ui";
import { ROOMS } from "@/lib/pricing";
import type { RunSummary } from "@/lib/types";

export function PageHeader({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="fade-up flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-balance font-display text-[clamp(1.6rem,4vw,2.1rem)] leading-tight tracking-tight">{title}</h1>
        {sub && <p className="mt-1.5 text-[15px] text-muted">{sub}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  href,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon: ReactNode;
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between">
        <span className="text-[13px] text-muted">{label}</span>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-bg text-muted">{icon}</span>
      </div>
      <p className="mt-3 font-display text-[1.75rem] font-medium leading-none tracking-tight tabular-nums">{value}</p>
      {hint && <p className="mt-2 truncate text-[13px] text-muted">{hint}</p>}
    </>
  );
  const cls = "block rounded-2xl border border-edge bg-surface p-4 shadow-soft sm:p-5";
  return href ? (
    <NextLink href={href} className={cx(cls, "transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-card")}>
      {body}
    </NextLink>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function Outcome({ run }: { run: RunSummary }) {
  if (run.status === "running") {
    return (
      <span className={`room-${run.mode} flex shrink-0 items-center gap-1.5 rounded-full bg-mode-soft px-2.5 py-1 text-xs font-medium text-mode-ink`}>
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-mode" /> Live
      </span>
    );
  }
  if (run.status === "failed") {
    return <span className="shrink-0 rounded-full bg-danger-soft px-2.5 py-1 text-xs font-medium text-danger">Failed</span>;
  }
  if (run.metric) {
    return (
      <span className={`room-${run.mode} shrink-0 rounded-xl bg-mode-soft px-2.5 py-1 font-display text-sm font-medium tabular-nums text-mode-ink`}>
        {run.metric}
      </span>
    );
  }
  return <ScoreBadge score={run.score} mode={run.mode} />;
}

export function RunRow({ run }: { run: RunSummary }) {
  return (
    <NextLink
      href={`/dashboard/runs/${run.id}`}
      className="group flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-ink/[0.025] sm:gap-4 sm:px-5"
    >
      <RoomIcon mode={run.mode} size={18} className="h-10 w-10" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-medium">{run.title}</p>
        <p className="mt-0.5 truncate text-[13px] text-muted">
          {ROOMS[run.mode].name}
          {run.panelSize ? ` · ${run.panelSize} people` : ""} · {formatDate(run.createdAt)} ·{" "}
          {run.status === "failed" ? "refunded" : `${run.cost} credits`}
          {run.demo ? " · demo AI" : ""}
        </p>
      </div>
      <Outcome run={run} />
      <ChevronRight size={18} className="hidden shrink-0 text-faint transition-transform group-hover:translate-x-0.5 sm:block" />
    </NextLink>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-soft text-brand-ink">{icon}</span>
      <p className="mt-4 font-display text-lg">{title}</p>
      <p className="mt-1.5 max-w-sm text-[15px] text-muted">{body}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function Section({ id, title, sub, children, aside }: { id?: string; title: string; sub?: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 rounded-2xl border border-edge bg-surface shadow-soft">
      <div className="flex flex-col gap-1 border-b border-edge px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <h2 className="font-display text-lg">{title}</h2>
          {sub && <p className="mt-0.5 text-[13px] text-muted">{sub}</p>}
        </div>
        {aside}
      </div>
      <div className="px-5 py-5 sm:px-6">{children}</div>
    </section>
  );
}
