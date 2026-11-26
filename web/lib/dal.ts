import "server-only";
import { redirect } from "next/navigation";
import { db } from "./db";
import { readAccount, type AccountRow } from "./session";
import { reconcileRuns } from "./runs";
import { sanitizeEvent, type RunEvent } from "./events";
import type { Prefs, RoomMode, RunInput, RunStatus, RunSummary, Tier } from "./types";

/**
 * Data Access Layer: every page reads through here. Each getter resolves the
 * signed-in user itself, so no caller can ask for another user's data.
 */

export type User = {
  id: string;
  email: string;
  name: string;
  tier: Tier;
  role: string;
  company: string;
  city: string;
  bio: string;
  prefs: Prefs;
  createdAt: number;
  /** Credit balance, read in the same query as the account. */
  balance: number;
};

const DEFAULT_PREFS: Prefs = { emailOnFinish: true, productUpdates: false };

function toUser(r: AccountRow): User {
  const prefs = { ...DEFAULT_PREFS, ...r.prefs };
  return {
    id: r.id, email: r.email, name: r.name, tier: r.tier as Tier, role: r.role,
    company: r.company, city: r.city, bio: r.bio, prefs, createdAt: r.created_at,
    balance: r.balance,
  };
}

/** The signed-in account row, or back to the login page. Costs one query per request. */
async function requireAccount(): Promise<AccountRow> {
  const row = await readAccount();
  if (!row) redirect("/login");
  return row;
}

export async function getCurrentUser(): Promise<User> {
  return toUser(await requireAccount());
}

/** Settles anything left running, but only when the account row says there is something. */
async function catchUp(account: AccountRow): Promise<void> {
  await reconcileRuns(account.id, account.running_count, account.has_deletions);
}

type RunRow = {
  id: string; mode: string; title: string; input: RunInput; panel_size: number | null; score: number | null;
  result: RunEvent[]; cost: number; share_id: string; is_public: boolean; created_at: number;
  status: string; metric: string | null; error: string | null; demo: boolean;
};

export type RunDetail = RunSummary & {
  input: RunInput;
  events: RunEvent[];
  shareId: string;
  isPublic: boolean;
  error: string | null;
};

/** Everything a list needs: `result` can be large, so lists don't fetch it. */
const SUMMARY_COLUMNS = "id, mode, title, status, score, metric, cost, panel_size, demo, created_at";
type SummaryRow = Omit<RunRow, "input" | "result" | "share_id" | "is_public" | "error">;

function toSummary(r: SummaryRow): RunSummary {
  return {
    id: r.id, mode: r.mode as RoomMode, title: r.title, status: r.status as RunStatus, score: r.score,
    metric: r.metric, cost: r.cost, panelSize: r.panel_size, demo: r.demo, createdAt: r.created_at,
  };
}

function toDetail(r: RunRow): RunDetail {
  return {
    ...toSummary(r), input: r.input, events: r.result.map(sanitizeEvent),
    shareId: r.share_id, isPublic: r.is_public, error: r.error,
  };
}

export async function listRuns(opts: { mode?: RoomMode; limit?: number } = {}): Promise<RunSummary[]> {
  const user = await requireAccount();
  await catchUp(user);
  const limit = opts.limit ?? 100;
  const rows = await db.many<SummaryRow>(
    `SELECT ${SUMMARY_COLUMNS} FROM runs WHERE user_id = $1 AND ($2::text IS NULL OR mode = $2) ORDER BY created_at DESC LIMIT $3`,
    [user.id, opts.mode ?? null, limit],
  );
  return rows.map(toSummary);
}

export async function getRun(runId: string): Promise<RunDetail | null> {
  const user = await requireAccount();
  await catchUp(user);
  const row = await db.one<RunRow>("SELECT * FROM runs WHERE id = $1 AND user_id = $2", [runId, user.id]);
  return row ? toDetail(row) : null;
}

/** Public, unauthenticated: only finished runs the owner chose to share. */
export async function getPublicRun(shareId: string): Promise<(RunDetail & { ownerName: string }) | null> {
  const row = await db.one<RunRow & { owner_name: string }>(
    "SELECT runs.*, users.name AS owner_name FROM runs JOIN users ON users.id = runs.user_id WHERE share_id = $1 AND is_public AND status = 'done'",
    [shareId],
  );
  return row ? { ...toDetail(row), ownerName: row.owner_name.split(" ")[0] } : null;
}

export async function getStats() {
  const user = await requireAccount();
  const r = (await db.one<{ total: number; avg: number | null; recent: number }>(
    "SELECT COUNT(*) AS total, AVG(score) AS avg, COUNT(*) FILTER (WHERE created_at > $1) AS recent FROM runs WHERE user_id = $2 AND status = 'done'",
    [Date.now() - 30 * 24 * 60 * 60 * 1000, user.id],
  ))!;
  return { total: r.total, avgScore: r.avg == null ? null : Math.round(r.avg * 10) / 10, last30: r.recent };
}

export type LedgerEntry = { id: string; delta: number; kind: string; note: string; createdAt: number };

export async function listLedger(limit = 50): Promise<LedgerEntry[]> {
  const user = await requireAccount();
  await catchUp(user);
  const rows = await db.many<{ id: string; delta: number; kind: string; note: string; created_at: number }>(
    "SELECT id, delta, kind, note, created_at FROM credit_ledger WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2",
    [user.id, limit],
  );
  return rows.map((r) => ({ id: r.id, delta: r.delta, kind: r.kind, note: r.note, createdAt: r.created_at }));
}

export type ApiKeyInfo = { id: string; provider: string; last4: string; createdAt: number };

export async function listApiKeys(): Promise<ApiKeyInfo[]> {
  const user = await requireAccount();
  const rows = await db.many<{ id: string; provider: string; last4: string; created_at: number }>(
    "SELECT id, provider, last4, created_at FROM byok_keys WHERE user_id = $1 ORDER BY created_at DESC",
    [user.id],
  );
  return rows.map((r) => ({ id: r.id, provider: r.provider, last4: r.last4, createdAt: r.created_at }));
}

export async function countSessions(): Promise<number> {
  const user = await requireAccount();
  const r = await db.one<{ n: number }>("SELECT COUNT(*) AS n FROM sessions WHERE user_id = $1 AND expires_at > $2", [user.id, Date.now()]);
  return r!.n;
}
