import { db } from "@/lib/db";
import { readSessionUserId } from "@/lib/session";
import { openStream } from "@/lib/backend";
import { syncRun } from "@/lib/runs";
import { sanitizeEvent, type RunEvent } from "@/lib/events";

/**
 * Server-sent events for one run. Checks ownership, relays the engine's stream with internal
 * details removed, and settles the run before telling the browser it's done.
 */

const SSE_HEADERS = {
  "content-type": "text/event-stream; charset=utf-8",
  // no-transform stops compression from buffering the stream
  "cache-control": "no-cache, no-transform",
  "x-accel-buffering": "no",
};

const frame = (e: RunEvent) => `id: ${e.id}\ndata: ${JSON.stringify(e)}\n\n`;

type Row = { status: string; result: RunEvent[]; backend_id: string | null };

function replay(row: Row, after: number): Response {
  const events = row.result.filter((e) => e.id > after).map(sanitizeEvent);
  // A finished run always ends with "done", even if the engine never sent one.
  if (!events.some((e) => e.type === "done")) events.push({ id: Number.MAX_SAFE_INTEGER, type: "done" });
  return new Response(events.map(frame).join(""), { headers: SSE_HEADERS });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await readSessionUserId();
  if (!userId) return new Response("Sign in required", { status: 401 });
  const { id } = await params;

  const load = () => db.one<Row>("SELECT status, result, backend_id FROM runs WHERE id = $1 AND user_id = $2", [id, userId]);
  const row = await load();
  if (!row) return new Response("Not found", { status: 404 });

  const lastId = request.headers.get("last-event-id") ?? new URL(request.url).searchParams.get("after");
  const after = lastId && /^\d+$/.test(lastId) ? Number(lastId) : -1;
  if (row.status !== "running" || !row.backend_id) {
    return row.status === "running" ? new Response("Starting", { status: 503 }) : replay(row, after);
  }

  let upstream: Response;
  try {
    upstream = await openStream(userId, row.backend_id, after, request.signal);
  } catch {
    return new Response("Engine unreachable", { status: 503 });
  }
  if (!upstream.ok || !upstream.body) {
    await syncRun(id); // the engine may have finished or forgotten this run
    const now = await load();
    return now && now.status !== "running" ? replay(now, after) : new Response("Engine unavailable", { status: 503 });
  }

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  const relay = new TransformStream<Uint8Array, Uint8Array>({
    async transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const f of frames) {
        const data = f.split("\n").find((l) => l.startsWith("data: "));
        if (!data) {
          controller.enqueue(encoder.encode(": ping\n\n")); // heartbeat
          continue;
        }
        const event = sanitizeEvent(JSON.parse(data.slice(6)) as RunEvent);
        // Settle first, so a page refresh triggered by "done" sees the final state.
        if (event.type === "done") await syncRun(id);
        controller.enqueue(encoder.encode(frame(event)));
      }
    },
  });

  return new Response(upstream.body.pipeThrough(relay), { headers: SSE_HEADERS });
}
