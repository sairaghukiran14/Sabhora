import type { Metadata } from "next";
import NextLink from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getPublicRun } from "@/lib/dal";
import { ROOMS } from "@/lib/pricing";
import RunView from "@/components/app/RunView";
import { Arrow } from "@/components/icons";
import { btn, Container, formatDate, Logo, RoomBadge } from "@/components/ui";

export const metadata: Metadata = { title: "Shared verdict · Sabhora", robots: { index: false } };

export default async function SharedVerdict({ params }: { params: Promise<{ shareId: string }> }) {
  await connection();
  const { shareId } = await params;
  const run = await getPublicRun(shareId);
  if (!run) notFound();

  return (
    <div className={`${ROOMS[run.mode].cls} min-h-dvh`}>
      <header className="border-b border-edge bg-bg/85 backdrop-blur-lg">
        <Container className="flex h-16 items-center justify-between gap-3">
          <Logo />
          <NextLink href="/signup" className={btn("brand", "sm")}>
            Test your idea free
          </NextLink>
        </Container>
      </header>
      <Container className="max-w-4xl space-y-6 py-8 sm:py-12">
        <div className="fade-up">
          <RoomBadge mode={run.mode}>
            {ROOMS[run.mode].name}
            {run.panelSize ? ` · ${run.panelSize} people` : ""}
          </RoomBadge>
          <h1 className="mt-3 text-balance font-display text-[clamp(1.6rem,4vw,2.25rem)] leading-tight tracking-tight">{run.title}</h1>
          <p className="mt-1.5 text-sm text-muted">
            Shared by {run.ownerName} · {formatDate(run.createdAt)}
          </p>
        </div>
        <RunView runId={run.id} mode={run.mode} status={run.status} events={run.events} demo={run.demo} />
        <div className="rounded-[22px] bg-[#312e81] p-6 text-center text-white sm:p-10">
          <p className="font-display text-2xl sm:text-3xl">Want a verdict on your idea?</p>
          <p className="mx-auto mt-2 max-w-md text-white/75">Sharks, Janta and Roast. Your first runs are free, no card needed.</p>
          <NextLink href="/signup" className={btn("white", "lg", "mt-6")}>
            Get 50 free credits <Arrow size={18} />
          </NextLink>
        </div>
      </Container>
    </div>
  );
}
