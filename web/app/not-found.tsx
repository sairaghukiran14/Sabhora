import NextLink from "next/link";
import { Arrow, Target } from "@/components/icons";
import { btn, Logo } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col px-4 py-5 sm:px-8">
      <Logo />
      <main className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-soft text-brand-ink">
          <Target size={30} />
        </span>
        <p className="mt-6 font-display text-6xl font-medium tracking-tight">404</p>
        <h1 className="mt-2 font-display text-2xl">This page isn&apos;t in the room</h1>
        <p className="mt-2 text-[15px] text-muted">The link may be wrong, or the verdict was made private by its owner.</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <NextLink href="/" className={btn("brand", "md")}>
            Go home <Arrow size={16} />
          </NextLink>
          <NextLink href="/dashboard" className={btn("secondary", "md")}>
            Open dashboard
          </NextLink>
        </div>
      </main>
    </div>
  );
}
