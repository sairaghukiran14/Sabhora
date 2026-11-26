import type { Metadata } from "next";
import NextLink from "next/link";
import { listRuns } from "@/lib/dal";
import { ROOMS } from "@/lib/pricing";
import type { RoomMode } from "@/lib/types";
import { EmptyState, PageHeader, RunRow } from "@/components/app/bits";
import { Arrow, History, Plus } from "@/components/icons";
import { btn, cx } from "@/components/ui";

export const metadata: Metadata = { title: "My runs · Sabhora" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function RunsPage({ searchParams }: Props) {
  const room = (await searchParams).room;
  const mode = typeof room === "string" && room in ROOMS ? (room as RoomMode) : undefined;
  const runs = await listRuns({ mode });
  const filters: { id?: RoomMode; label: string }[] = [{ label: "All" }, ...(Object.keys(ROOMS) as RoomMode[]).map((m) => ({ id: m, label: ROOMS[m].name }))];

  return (
    <div className="space-y-6">
      <PageHeader
        title="My runs"
        sub="Every verdict you've received. Open one to replay it or share it."
        actions={
          <NextLink href="/dashboard/new" className={btn("brand", "md", "w-full sm:w-auto sm:max-lg:hidden")}>
            <Plus size={18} /> New run
          </NextLink>
        }
      />

      <nav aria-label="Filter by room" className="flex gap-2 overflow-x-auto pb-1">
        {filters.map((f) => {
          const active = f.id === mode;
          return (
            <NextLink
              key={f.label}
              href={f.id ? `/dashboard/runs?room=${f.id}` : "/dashboard/runs"}
              aria-current={active ? "page" : undefined}
              className={cx(
                "shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                active ? "border-ink bg-ink text-bg" : "border-edge bg-surface text-muted hover:text-ink",
              )}
            >
              {f.label}
            </NextLink>
          );
        })}
      </nav>

      <div className="overflow-hidden rounded-2xl border border-edge bg-surface shadow-soft">
        {runs.length === 0 ? (
          <EmptyState
            icon={<History size={26} />}
            title={mode ? `No ${ROOMS[mode].name} runs yet` : "No runs yet"}
            body="Start a run and it will show up here, ready to replay or share."
            action={
              <NextLink href={mode ? `/dashboard/new?room=${mode}` : "/dashboard/new"} className={btn("brand", "md")}>
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
    </div>
  );
}
