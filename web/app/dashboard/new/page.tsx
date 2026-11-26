import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/dal";
import { getEngineConfig } from "@/lib/backend";
import { ROOMS } from "@/lib/pricing";
import type { RoomMode } from "@/lib/types";
import { PageHeader } from "@/components/app/bits";
import NewRunForm from "@/components/app/NewRunForm";

export const metadata: Metadata = { title: "New run · Sabhora" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function NewRunPage({ searchParams }: Props) {
  const user = await getCurrentUser();
  const [{ room }, config] = await Promise.all([searchParams, getEngineConfig()]);
  const engine = !config ? "offline" : config.crowd_provider === "fake" ? "demo" : "live";
  const initialRoom: RoomMode = typeof room === "string" && room in ROOMS ? (room as RoomMode) : "sharks";
  return (
    <div className="space-y-6">
      <PageHeader title="Start a new run" sub="Pick a room, describe your idea, and watch the panel deliberate live." />
      <NewRunForm
        initialRoom={initialRoom}
        balance={user.balance}
        tier={user.tier}
        engine={engine}
        maxCrowd={config?.janta_max_size ?? 100}
      />
    </div>
  );
}
