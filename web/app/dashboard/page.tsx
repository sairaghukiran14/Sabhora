import NextLink from "next/link";
import { getCurrentUser, getStats, listRuns } from "@/lib/dal";
import { ROOMS } from "@/lib/pricing";
import type { RoomMode } from "@/lib/types";
import { EmptyState, PageHeader, RunRow, StatCard } from "@/components/app/bits";
import { Arrow, Coins, History, Plus, Spark, Target } from "@/components/icons";
import { btn, RoomIcon } from "@/components/ui";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function DashboardHome({ searchParams }: Props) {
  const user = await getCurrentUser();
  const [stats, runs, params] = await Promise.all([getStats(), listRuns({ limit: 5 }), searchParams]);
  const first = user.name.split(" ")[0];
  const welcome = params.welcome === "1";

  return (
    <div className="space-y-8">
      {welcome && (
        <div className="fade-up relative overflow-hidden rounded-2xl bg-[#312e81] p-5 text-white sm:p-6">
          <div aria-hidden className="absolute -right-10 -top-16 h-48 w-48 rounded-full bg-[#f59e0b] opacity-30 blur-3xl" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="flex items-center gap-2 font-display text-xl">
                <Spark size={20} /> Welcome, {first}. Your 50 credits are ready.
              </p>
              <p className="mt-1 text-[15px] text-white/75">That&apos;s enough for a Sharks debate, a Janta poll and a Roast.</p>
            </div>
            <NextLink href="/dashboard/new" className={btn("white", "md", "shrink-0")}>
              Start your first run <Arrow size={16} />
            </NextLink>
          </div>
        </div>
      )}

      <PageHeader
        title={`Good to see you, ${first}`}
        sub="What do you want to put before the panel today?"
        actions={
          <NextLink href="/dashboard/new" className={btn("brand", "md", "w-full sm:w-auto sm:max-lg:hidden")}>
            <Plus size={18} /> New run
          </NextLink>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Credits" value={user.balance} hint="Top up any time" icon={<Coins size={16} />} href="/dashboard/billing" />
        <StatCard label="Plan" value={user.tier === "free" ? "Free" : user.tier === "pro" ? "Pro" : "Deep"} hint="See what's in Pro" icon={<Spark size={16} />} href="/dashboard/billing" />
        <StatCard label="Runs" value={stats.total} hint={`${stats.last30} in the last 30 days`} icon={<History size={16} />} href="/dashboard/runs" />
        <StatCard label="Average score" value={stats.avgScore ?? "–"} hint="Sharks and Roast" icon={<Target size={16} />} />
      </div>

      <section aria-labelledby="rooms-title">
        <h2 id="rooms-title" className="font-display text-lg">Start a new run</h2>
        <div className="mt-4 grid gap-3 sm:gap-4 md:grid-cols-3">
          {(Object.keys(ROOMS) as RoomMode[]).map((mode) => (
            <NextLink
              key={mode}
              href={`/dashboard/new?room=${mode}`}
              className={`${ROOMS[mode].cls} group flex gap-4 rounded-2xl border border-edge bg-surface p-4 shadow-soft transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-mode/40 hover:shadow-card sm:p-5 md:flex-col`}
            >
              <RoomIcon mode={mode} size={22} className="h-11 w-11" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-display text-lg">{ROOMS[mode].name}</p>
                  <span className="rounded-full bg-mode-soft px-2 py-0.5 text-[11px] font-medium text-mode-ink">{ROOMS[mode].cost}</span>
                </div>
                <p className="mt-1 text-sm leading-relaxed text-muted">{ROOMS[mode].short}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-mode-ink">
                  Start <Arrow size={15} className="transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
            </NextLink>
          ))}
        </div>
      </section>

      <section aria-labelledby="recent-title">
        <div className="flex items-center justify-between">
          <h2 id="recent-title" className="font-display text-lg">Recent runs</h2>
          {runs.length > 0 && (
            <NextLink href="/dashboard/runs" className="text-sm font-medium text-brand-ink hover:underline">
              View all
            </NextLink>
          )}
        </div>
        <div className="mt-4 overflow-hidden rounded-2xl border border-edge bg-surface shadow-soft">
          {runs.length === 0 ? (
            <EmptyState
              icon={<Spark size={26} />}
              title="Your first verdict is two minutes away"
              body="Describe your idea and pick a room. The panel will debate it live and give you a score with next steps."
              action={
                <NextLink href="/dashboard/new" className={btn("brand", "md")}>
                  Start a run <Arrow size={16} />
                </NextLink>
              }
            />
          ) : (
            <div className="divide-y divide-edge">
              {runs.map((r) => (
                <RunRow key={r.id} run={r} />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
