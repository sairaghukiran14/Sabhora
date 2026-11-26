import "server-only";
import { db, json, transaction, type Query } from "./db";
import { newId, newToken } from "./crypto";
import { BackendError, createDebate, deleteDebate, getSnapshot, type Snapshot } from "./backend";
import { sanitizeEvent, type RunEvent, type RoastVerdict, type SharkVerdict, type Tally } from "./events";
import type { RoomMode } from "./types";

/**
 * A run's money life cycle: hold credits -> engine runs -> keep them (verdict) or refund
 * them (anything else). Every transition happens at most once.
 */

export const MAX_RUNNING = 2;
const GIVE_UP_MS = 30 * 60 * 1000; // matches the engine's session lifetime
const START_GRACE_MS = 2 * 60 * 1000;

type Row = { id: string; user_id: string; mode: string; status: string; cost: number; backend_id: string | null; created_at: number };

const ROW = "SELECT id, user_id, mode, status, cost, backend_id, created_at FROM runs WHERE id = $1";
const getRow = (runId: string) => db.one<Row>(ROW, [runId]);

async function ledger(tx: Query, userId: string, delta: number, kind: string, runId: string, note: string, key: string) {
  // The unique key is the safety net: the same hold or refund can never be written twice.
  await tx.run(
    "INSERT INTO credit_ledger (id, user_id, delta, kind, run_id, note, idempotency_key, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
    [newId(), userId, delta, kind, runId, note, key, Date.now()],
  );
}

// ---------------------------------------------------------------- start

export type StartRun = {
  userId: string;
  mode: RoomMode;
  title: string;
  input: Record<string, unknown>;
  cost: number;
  panelSize: number | null;
  label: string;
  engine: { pitch?: string; url?: string; tone?: string; panel_size?: number; ask_amount_lakh?: number; ask_equity_pct?: number };
};

export async function startRun(run: StartRun): Promise<{ id: string } | { error: string }> {
  const id = newId();

  // 1. Hold the credits. Checked and written together, so two tabs can't overspend.
  const refused = await transaction(async (tx) => {
    // Locking the user makes their other starts wait, so each one sees the last one's hold.
    await tx.one("SELECT id FROM users WHERE id = $1 FOR UPDATE", [run.userId]);
    const { b } = (await tx.one<{ b: number }>("SELECT COALESCE(SUM(delta), 0) AS b FROM credit_ledger WHERE user_id = $1", [run.userId]))!;
    if (b < run.cost) return `This run needs ${run.cost} credits and you have ${b}. Top up to continue.`;
    const { n } = (await tx.one<{ n: number }>("SELECT COUNT(*) AS n FROM runs WHERE user_id = $1 AND status = 'running'", [run.userId]))!;
    if (n >= MAX_RUNNING) return `You already have ${n} runs in progress. Wait for one to finish.`;
    await tx.run(
      `INSERT INTO runs (id, user_id, mode, title, input, panel_size, status, cost, share_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'running', $7, $8, $9)`,
      [id, run.userId, run.mode, run.title, json(run.input), run.panelSize, run.cost, newToken(12), Date.now()],
    );
    await ledger(tx, run.userId, -run.cost, "reserve", id, run.label, `reserve:${id}`);
    return null;
  });
  if (refused) return { error: refused };

  // 2. Ask the engine to start. If it won't, give the credits straight back.
  try {
    const { id: backendId } = await createDebate(run.userId, { mode: run.mode, ...run.engine });
    await db.run("UPDATE runs SET backend_id = $1 WHERE id = $2", [backendId, id]);
  } catch (err) {
    await transaction(async (tx) => {
      // Deleting first means a run that was already settled (and refunded) isn't refunded again.
      if (await tx.run("DELETE FROM runs WHERE id = $1 AND status = 'running'", [id])) {
        await ledger(tx, run.userId, run.cost, "refund", id, `${run.label} didn't start`, `refund:${id}`);
      }
    });
    if (err instanceof BackendError) return { error: `${err.userMessage} You haven't been charged.` };
    throw err;
  }

  watchRun(id);
  return { id };
}

// ---------------------------------------------------------------- finish

function headlineOf(mode: string, events: RunEvent[]): { score: number | null; metric: string | null } {
  const v = events.find((e) => e.type === "verdict");
  if (!v || v.type !== "verdict") return { score: null, metric: null };
  if (mode === "sharks") return { score: (v.verdict as SharkVerdict).score, metric: null };
  if (mode === "roast") return { score: (v.verdict as RoastVerdict).overall, metric: null };
  return { score: null, metric: `${(v.tally as Tally).would_pay_pct}% pay` };
}

/**
 * Settles a run that is over. A verdict keeps the credits; no verdict refunds them.
 * Safe to call any number of times: only the first call on a running run does anything.
 */
async function settle(runId: string, rawEvents: RunEvent[], fallbackError: string): Promise<void> {
  const events = rawEvents.map(sanitizeEvent);
  await transaction(async (tx) => {
    // The lock makes a second settle wait, then see the run is no longer running.
    const row = await tx.one<Row>(`${ROW} FOR UPDATE`, [runId]);
    if (!row || row.status !== "running") return;
    const done = events.find((e) => e.type === "done");
    const demo = done?.type === "done" && !!done.demo;

    if (events.some((e) => e.type === "verdict")) {
      const { score, metric } = headlineOf(row.mode, events);
      await tx.run("UPDATE runs SET status = 'done', result = $1, score = $2, metric = $3, demo = $4, error = NULL WHERE id = $5", [
        json(events), score, metric, demo, runId,
      ]);
      return;
    }
    const failure = events.find((e) => e.type === "error");
    const message = failure?.type === "error" ? failure.message : fallbackError;
    await tx.run("UPDATE runs SET status = 'failed', result = $1, demo = $2, error = $3 WHERE id = $4", [
      json(events), demo, message, runId,
    ]);
    await ledger(tx, row.user_id, row.cost, "refund", runId, "Run didn't finish · refunded", `refund:${runId}`);
  });
}

/** Brings one run up to date with the engine. */
export async function syncRun(runId: string): Promise<void> {
  const row = await getRow(runId);
  if (!row || row.status !== "running") return;
  const age = Date.now() - row.created_at;

  if (!row.backend_id) {
    if (age > START_GRACE_MS) await settle(runId, [], "This run never started.");
    return;
  }
  let snapshot: Snapshot;
  try {
    snapshot = await getSnapshot(row.backend_id);
  } catch (err) {
    if (err instanceof BackendError && err.status === 404) {
      await settle(runId, [], "The debate engine restarted before this run finished.");
    } else if (age > GIVE_UP_MS) {
      await settle(runId, [], "We lost contact with the debate engine.");
    }
    return; // otherwise try again later
  }
  if (snapshot.finished) await settle(runId, snapshot.events, "The run ended without a verdict.");
  else if (age > GIVE_UP_MS) await settle(runId, snapshot.events, "This run took too long.");
}

// ---------------------------------------------------------------- watching

declare global {
  var __ppWatching: Set<string> | undefined;
}
const watching = (globalThis.__ppWatching ??= new Set<string>());

/**
 * Follows a running run from the server, so it settles even if the user closes the tab.
 * With more than one web server, move this to a job queue.
 */
export function watchRun(runId: string): void {
  if (watching.has(runId)) return;
  watching.add(runId);
  const started = Date.now();
  const tick = async () => {
    let stillRunning = true; // if the database is briefly unreachable, keep watching
    try {
      await syncRun(runId);
      stillRunning = (await getRow(runId))?.status === "running";
    } catch (err) {
      console.error(`[runs] couldn't sync ${runId}:`, err);
    }
    if (stillRunning && Date.now() - started < GIVE_UP_MS + 60_000) {
      setTimeout(tick, 3000).unref?.();
    } else {
      watching.delete(runId);
    }
  };
  setTimeout(tick, 2000).unref?.();
}

// ---------------------------------------------------------------- erasing

/** Notes engine copies to erase. Pass the transaction that deletes the run or account. */
export async function queueEngineDeletion(tx: Query, backendIds: (string | null)[]): Promise<void> {
  for (const id of backendIds) {
    if (id) await tx.run("INSERT INTO engine_deletions (backend_id) VALUES ($1) ON CONFLICT DO NOTHING", [id]);
  }
}

/** Erases queued engine copies. Anything that fails stays queued for next time. */
export async function flushEngineDeletions(): Promise<void> {
  const rows = await db.many<{ backend_id: string }>("SELECT backend_id FROM engine_deletions LIMIT 50");
  for (const { backend_id } of rows) {
    try {
      await deleteDebate(backend_id);
      await db.run("DELETE FROM engine_deletions WHERE backend_id = $1", [backend_id]);
    } catch (err) {
      console.error(`[runs] engine copy ${backend_id} not erased yet:`, err instanceof Error ? err.message : err);
      return;
    }
  }
}

/**
  * Catches up on runs left running, for example after the web server restarted.
  *
  * The caller passes what the account query already told it, so the common case — nothing
  * running, nothing to erase — costs no queries at all.
  */
export async function reconcileRuns(userId: string, runningCount: number, hasDeletions: boolean): Promise<void> {
  if (hasDeletions) flushEngineDeletions().catch((err) => console.error("[runs] couldn't flush deletions:", err));
  if (runningCount === 0) return;
  const rows = await db.many<{ id: string }>("SELECT id FROM runs WHERE user_id = $1 AND status = 'running'", [userId]);
  await Promise.all(
    rows.map(async ({ id }) => {
      await syncRun(id);
      if ((await getRow(id))?.status === "running") watchRun(id);
    }),
  );
}
