import type { ReactNode } from "react";
import ThemeToggle from "../ThemeToggle";
import { Check, Lock } from "../icons";
import { Logo } from "../ui";

export default function AuthShell({
  title,
  sub,
  children,
  footer,
}: {
  title: string;
  sub?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(420px,0.85fr)]">
      <div className="flex flex-col px-4 py-5 sm:px-8">
        <div className="flex items-center justify-between">
          <Logo />
          <ThemeToggle />
        </div>
        <main className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-10">
          <div className="fade-up">
            <h1 className="font-display text-[clamp(1.75rem,5vw,2.25rem)] leading-tight tracking-tight">{title}</h1>
            {sub && <p className="mt-2 text-[15px] text-muted">{sub}</p>}
          </div>
          <div className="fade-up mt-8" style={{ animationDelay: "80ms" }}>
            {children}
          </div>
          {footer && (
            <div className="fade-up mt-8 text-center text-sm text-muted" style={{ animationDelay: "140ms" }}>
              {footer}
            </div>
          )}
        </main>
        <p className="flex items-center justify-center gap-1.5 text-xs text-faint">
          <Lock size={13} /> Passwords are hashed. Sign-in uses http-only cookies.
        </p>
      </div>

      <aside className="relative hidden overflow-hidden bg-[#312e81] lg:block">
        <div aria-hidden className="absolute -left-20 top-10 h-80 w-80 rounded-full bg-[#6366f1] opacity-40 blur-3xl" />
        <div aria-hidden className="absolute -bottom-24 right-0 h-80 w-80 rounded-full bg-[#f59e0b] opacity-25 blur-3xl" />
        <div className="relative flex h-full flex-col justify-center px-12 py-16 xl:px-16">
          <p className="max-w-md font-display text-[2.1rem] leading-tight tracking-tight text-white">
            Find the holes in your idea before real customers do.
          </p>
          <div className="mt-10 max-w-md rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium text-white">Sharks · verdict</span>
              <span className="font-display text-3xl font-medium text-white">
                7.5<span className="text-base text-white/60">/10</span>
              </span>
            </div>
            <p className="mt-4 font-display text-lg text-white">Where to probe next</p>
            <p className="mt-1.5 text-sm leading-relaxed text-white/70">
              The panel asked for week-4 retention from paying stores. Check that with 20 real shop owners before you raise.
            </p>
          </div>
          <ul className="mt-10 space-y-3">
            {["Five AI investor personas question your pitch", "Up to 100 simulated Indian personas react to it", "Your landing page, critiqued section by section"].map((t) => (
              <li key={t} className="flex items-center gap-3 text-[15px] text-white/85">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/15">
                  <Check size={14} />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}

export function FormSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-5" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="space-y-2">
          <div className="h-4 w-24 animate-pulse rounded bg-edge" />
          <div className="h-12 animate-pulse rounded-xl bg-edge/70" />
        </div>
      ))}
      <div className="h-12 animate-pulse rounded-full bg-edge" />
    </div>
  );
}
