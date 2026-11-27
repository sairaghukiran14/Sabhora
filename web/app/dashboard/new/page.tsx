import type { Metadata } from "next";
import { getCurrentUser, getRun } from "@/lib/dal";
import { getEngineConfig } from "@/lib/backend";
import { JANTA_SIZES, ROOMS } from "@/lib/pricing";
import type { RoomMode } from "@/lib/types";
import { PageHeader } from "@/components/app/bits";
import NewRunForm from "@/components/app/NewRunForm";

export const metadata: Metadata = { title: "New run · Sabhora" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function NewRunPage({ searchParams }: Props) {
  const user = await getCurrentUser();
  const [{ room, from, size }, config] = await Promise.all([searchParams, getEngineConfig()]);
  const engine = !config ? "offline" : config.crowd_provider === "fake" ? "demo" : "live";
  // ?from=<run>&size=50: run the same Janta pitch again with a bigger crowd. getRun only
  // returns the signed-in user's own runs.
  const source = typeof from === "string" ? await getRun(from) : null;
  const wanted = Number(size);
  const prefill =
    source?.mode === "janta" && source.input.idea && JANTA_SIZES.includes(wanted as (typeof JANTA_SIZES)[number])
      ? { idea: source.input.idea, customer: source.input.customer, price: source.input.price, size: wanted }
      : undefined;
  const initialRoom: RoomMode = prefill ? "janta" : typeof room === "string" && room in ROOMS ? (room as RoomMode) : "sharks";
  return (
    <div className="space-y-6">
      <PageHeader title="Start a new run" sub="Pick a room, describe your idea, and watch the panel deliberate live." />
      <NewRunForm
        initialRoom={initialRoom}
        balance={user.balance}
        tier={user.tier}
        engine={engine}
        maxCrowd={config?.janta_max_size ?? 100}
        voiceMode={config?.voice ?? "off"}
        prefill={prefill}
      />
    </div>
  );
}
