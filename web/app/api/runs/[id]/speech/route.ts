import { db } from "@/lib/db";
import { readSessionUserId } from "@/lib/session";
import { BackendError, getSpeech } from "@/lib/backend";
import { hit } from "@/lib/rate-limit";
import type { RunInput } from "@/lib/types";

/**
 * The audio of one thing a shark said. Only the owner of a run that paid for voice gets it:
 * shared links have none, so strangers can't spend on speech. The browser keeps each line,
 * so replaying doesn't fetch it again.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await readSessionUserId();
  if (!userId) return new Response("Sign in required", { status: 401 });
  const { id } = await params;
  const event = new URL(request.url).searchParams.get("event") ?? "";
  if (!/^\d{1,6}$/.test(event)) return new Response("Bad request", { status: 400 });

  const run = await db.one<{ backend_id: string | null; input: RunInput; status: string }>(
    "SELECT backend_id, input, status FROM runs WHERE id = $1 AND user_id = $2",
    [id, userId],
  );
  if (!run?.backend_id || !run.input.voice || run.status === "failed") return new Response("Not found", { status: 404 });
  if (!hit(`speech:${userId}`, 300, 60 * 60 * 1000).ok) return new Response("Too many requests", { status: 429 });

  try {
    const upstream = await getSpeech(userId, run.backend_id, Number(event));
    return new Response(upstream.body, {
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "audio/mpeg",
        "cache-control": "private, max-age=86400",
      },
    });
  } catch (err) {
    if (!(err instanceof BackendError)) throw err;
    return new Response("Voice unavailable", { status: err.status === 429 || err.status === 404 ? err.status : 502 });
  }
}
