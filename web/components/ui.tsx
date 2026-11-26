import NextLink from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { Flame, Janta, Sharks, Spark } from "./icons";
import type { RoomMode } from "@/lib/types";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------- buttons

type Variant = "primary" | "brand" | "secondary" | "ghost" | "danger" | "white";
type Size = "sm" | "md" | "lg";

export function btn(variant: Variant = "secondary", size: Size = "md", extra?: string) {
  return cx(
    "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-[transform,background-color,border-color,color,box-shadow] duration-200 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-60",
    size === "sm" && "h-9 px-3.5 text-[13px]",
    size === "md" && "h-11 px-5 text-sm",
    size === "lg" && "h-12 px-6 text-[15px] sm:h-[52px] sm:px-7",
    variant === "primary" && "bg-ink text-bg hover:bg-ink/85",
    variant === "brand" && "bg-brand text-white shadow-[0_6px_20px_-6px_rgb(79_70_229/0.6)] hover:bg-brand-ink",
    variant === "secondary" && "border border-edge-strong bg-surface text-ink hover:border-ink/30 hover:bg-bg",
    variant === "ghost" && "text-muted hover:bg-ink/5 hover:text-ink",
    variant === "danger" && "bg-danger text-white hover:bg-danger/90",
    variant === "white" && "bg-white text-[#3730a3] hover:bg-white/90",
    extra,
  );
}

export function LinkButton({
  variant,
  size,
  className,
  ...props
}: ComponentProps<typeof NextLink> & { variant?: Variant; size?: Size }) {
  return <NextLink className={btn(variant, size, className)} {...props} />;
}

// ---------------------------------------------------------------- brand

export function Logo({ href = "/", compact = false }: { href?: string; compact?: boolean }) {
  return (
    <NextLink href={href} className="flex shrink-0 items-center gap-2.5" aria-label="Sabhora home">
      <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-brand text-white shadow-[0_4px_12px_-4px_rgb(79_70_229/0.7)]">
        <Spark size={18} />
      </span>
      {!compact && (
        <span className="font-display text-[17px] font-medium tracking-tight text-ink">Sabhora</span>
      )}
    </NextLink>
  );
}

// ---------------------------------------------------------------- rooms

export const ROOM_ICON: Record<RoomMode, typeof Sharks> = { sharks: Sharks, janta: Janta, roast: Flame };

export function RoomIcon({ mode, size = 20, className }: { mode: RoomMode; size?: number; className?: string }) {
  const I = ROOM_ICON[mode];
  return (
    <span className={cx(`room-${mode} flex shrink-0 items-center justify-center rounded-xl bg-mode-soft text-mode-ink`, className ?? "h-10 w-10")}>
      <I size={size} />
    </span>
  );
}

export function RoomBadge({ mode, children }: { mode: RoomMode; children: ReactNode }) {
  return (
    <span className={`room-${mode} inline-flex items-center gap-1.5 rounded-full bg-mode-soft px-2.5 py-1 text-xs font-medium text-mode-ink`}>
      <span className="h-1.5 w-1.5 rounded-full bg-mode" />
      {children}
    </span>
  );
}

// ---------------------------------------------------------------- surfaces

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cx("rounded-2xl border border-edge bg-surface shadow-soft", className)}>{children}</div>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  sub,
  center,
}: {
  eyebrow?: string;
  title: ReactNode;
  sub?: ReactNode;
  center?: boolean;
}) {
  return (
    <div className={cx("max-w-2xl", center && "mx-auto text-center")}>
      {eyebrow && (
        <p className="text-[13px] font-medium uppercase tracking-[0.14em] text-accent-ink">{eyebrow}</p>
      )}
      <h2 className="mt-3 text-balance font-display text-[clamp(1.75rem,4.2vw,2.75rem)] leading-[1.1] tracking-tight">
        {title}
      </h2>
      {sub && <p className="mt-4 text-pretty text-[16px] leading-relaxed text-muted sm:text-[17px]">{sub}</p>}
    </div>
  );
}

export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8", className)}>{children}</div>;
}

export function ScoreBadge({ score, mode, size = "md" }: { score: number | null; mode: RoomMode; size?: "md" | "lg" }) {
  if (score == null) return null;
  return (
    <span
      className={cx(
        `room-${mode} inline-flex items-baseline gap-0.5 rounded-xl bg-mode-soft font-display font-medium text-mode-ink tabular-nums`,
        size === "md" ? "px-2.5 py-1 text-base" : "px-3.5 py-1.5 text-3xl",
      )}
    >
      {Number.isInteger(score) ? score : score.toFixed(1)}
      <span className={cx("text-faint", size === "md" ? "text-[11px]" : "text-base")}>/10</span>
    </span>
  );
}

export function Initials({ name, className }: { name: string; className?: string }) {
  const parts = name.trim().split(/\s+/);
  const ini = ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
  return (
    <span
      className={cx(
        "flex shrink-0 items-center justify-center rounded-full bg-brand-soft font-medium text-brand-ink",
        className ?? "h-9 w-9 text-sm",
      )}
    >
      {ini || "?"}
    </span>
  );
}

export function formatDate(ms: number, withTime = false) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(new Date(ms));
}
