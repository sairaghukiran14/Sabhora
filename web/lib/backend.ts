import "server-only";
import type { RunEvent } from "./events";
import type { RoomMode } from "./types";

/**
 * The only code that talks to the FastAPI engine. The browser never does: this adds the
 * shared secret and says which user is asking, so the engine can rate-limit per person.
 */

const BASE = (process.env.BACKEND_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");

const OFFLINE = "The debate engine isn't reachable right now. Try again in a minute.";

export class BackendError extends Error {
  constructor(
    /** HTTP status, or 0 when the engine couldn't be reached. */
    readonly status: number,
    /** Safe to show to a user. */
    readonly userMessage: string,
    detail?: string,
  ) {
    super(detail ?? userMessage);
  }
}

function headers(userId?: string): Record<string, string> {
  return {
    "content-type": "application/json",
    "x-internal-token": process.env.BACKEND_API_TOKEN ?? "",
    ...(userId ? { "x-client-id": userId } : {}),
  };
}

function userMessageFor(status: number, detail: string): string {
  if (status === 429) return "You've reached the hourly limit. Try again later.";
  if (status === 503) {
    return detail.includes("full")
      ? "The panel is full right now. Try again in a minute."
      : "Today's capacity is used up. Try again tomorrow.";
  }
  if (status === 409) return detail || "That isn't possible right now.";
  if (status === 422) return "The engine couldn't accept that input. Check it and try again.";
  return "The debate engine had a problem. Try again in a minute.";
}

async function call<T>(path: string, init: RequestInit & { userId?: string; timeoutMs?: number } = {}): Promise<T> {
  const { userId, timeoutMs = 15_000, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...rest,
      headers: headers(userId),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new BackendError(0, OFFLINE, String(err));
  }
  if (res.status === 204) return undefined as T;
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { detail?: unknown } | null;
    const detail = typeof body?.detail === "string" ? body.detail : JSON.stringify(body?.detail ?? "");
    if (res.status === 401) console.error("[backend] rejected our token. BACKEND_API_TOKEN must match INTERNAL_API_TOKEN.");
    else if (res.status >= 400 && res.status !== 404) console.error(`[backend] ${path} -> ${res.status}: ${detail.slice(0, 300)}`);
    throw new BackendError(res.status, userMessageFor(res.status, detail), detail);
  }
  return (await res.json()) as T;
}

export type EngineConfig = {
  crowd_provider: string;
  judge_provider: string;
  shark_rounds: number;
  janta_max_size: number;
};

/** null when the engine is offline. */
export async function getEngineConfig(): Promise<EngineConfig | null> {
  try {
    return await call<EngineConfig>("/api/config", { timeoutMs: 4000 });
  } catch {
    return null;
  }
}

export function createDebate(
  userId: string,
  body: { mode: RoomMode; pitch?: string; url?: string; tone?: string; panel_size?: number; ask_amount_lakh?: number; ask_equity_pct?: number },
) {
  return call<{ id: string }>("/api/debates", { method: "POST", body: JSON.stringify(body), userId });
}

export function deleteDebate(debateId: string) {
  return call<void>(`/api/debates/${encodeURIComponent(debateId)}`, { method: "DELETE", timeoutMs: 5000 });
}

export type Snapshot = { id: string; events: RunEvent[]; finished: boolean };

export function getSnapshot(debateId: string) {
  return call<Snapshot>(`/api/debates/${encodeURIComponent(debateId)}`, { timeoutMs: 8000 });
}

export function sendFounderReply(userId: string, debateId: string, body: { text?: string; skip?: boolean }) {
  return call<{ ok: boolean }>(`/api/debates/${encodeURIComponent(debateId)}/reply`, {
    method: "POST",
    body: JSON.stringify(body),
    userId,
  });
}

export type DealMove = {
  action: "accept" | "counter" | "walk";
  offer_id?: string;
  investment_lakh?: number;
  equity_pct?: number;
  royalty_pct?: number;
};

export function sendFounderDeal(userId: string, debateId: string, body: DealMove) {
  return call<{ ok: boolean }>(`/api/debates/${encodeURIComponent(debateId)}/deal`, {
    method: "POST",
    body: JSON.stringify(body),
    userId,
  });
}

export function sendChat(
  userId: string,
  debateId: string,
  body: { persona_id: string; message: string; history: { role: "founder" | "persona"; text: string }[] },
) {
  return call<{ reply: string; name: string; position: string | null; position_before: string | null }>(
    `/api/debates/${encodeURIComponent(debateId)}/chat`,
    { method: "POST", body: JSON.stringify(body), userId, timeoutMs: 90_000 },
  );
}

/** The raw SSE response. No timeout: a debate can run for minutes; `signal` ends it. */
export async function openStream(userId: string, debateId: string, after: number, signal: AbortSignal) {
  try {
    return await fetch(`${BASE}/api/debates/${encodeURIComponent(debateId)}/stream?after=${after}`, {
      headers: headers(userId),
      cache: "no-store",
      signal,
    });
  } catch (err) {
    throw new BackendError(0, OFFLINE, String(err));
  }
}
