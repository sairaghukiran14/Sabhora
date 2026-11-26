import "server-only";
import { Pool, types, type PoolClient } from "pg";

/**
 * Postgres access. The schema lives in ../db/migrations (apply with `npm run db:migrate`).
 * Queries use $1, $2 placeholders; never build SQL from user input.
 */

// COUNT, SUM and BIGINT columns arrive as strings by default. Ours are millisecond times
// and credit totals, all far below 2^53, so plain numbers are safe.
types.setTypeParser(types.builtins.INT8, Number);

declare global {
  var __ppPool: Pool | undefined;
  var __ppPoolUrl: string | undefined;
}

/**
 * Created on first use, so building the app doesn't need a database.
 *
 * The pool is cached on `globalThis` because module state is thrown away on every hot
 * reload. That cache outlives a change to `.env.local`, so the connection string is cached
 * with it: editing DATABASE_URL in development would otherwise keep using the old database
 * until the server was restarted, which is easy to mistake for the edit not working.
 */
function pool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL isn't set. Add it to web/.env.local (see web/.env.example).");
  if (globalThis.__ppPool && globalThis.__ppPoolUrl === connectionString) return globalThis.__ppPool;
  if (globalThis.__ppPool) {
    const previous = globalThis.__ppPool;
    // Lets running queries finish, then closes; a failure here must not break this request.
    void previous.end().catch(() => {});
  }
  // A hosted database that scales to zero takes a few seconds to wake, so the connect
  // timeout is generous; idle connections are dropped before the host drops them itself.
  // Idle connections are kept for minutes, not seconds: opening a new one to a database on
  // another continent costs about two seconds, so dropping them between page loads was
  // paying that again and again. `error` below discards any the host closes meanwhile.
  const created = new Pool({ connectionString, max: 10, connectionTimeoutMillis: 15_000, idleTimeoutMillis: 300_000 });
  // Without a listener, a dropped idle connection would crash the server.
  created.on("error", (err) => console.error("[db] idle connection error:", err.message));
  globalThis.__ppPoolUrl = connectionString;
  return (globalThis.__ppPool = created);
}

export type Query = {
  /** All rows. */
  many<T>(sql: string, params?: unknown[]): Promise<T[]>;
  /** The first row, if any. */
  one<T>(sql: string, params?: unknown[]): Promise<T | undefined>;
  /** For writes: how many rows changed. */
  run(sql: string, params?: unknown[]): Promise<number>;
};

function queries(source: () => Pool | PoolClient): Query {
  const exec = (sql: string, params: unknown[] = []) => source().query(sql, params);
  return {
    many: async <T>(sql: string, params?: unknown[]) => (await exec(sql, params)).rows as T[],
    one: async <T>(sql: string, params?: unknown[]) => (await exec(sql, params)).rows[0] as T | undefined,
    run: async (sql: string, params?: unknown[]) => (await exec(sql, params)).rowCount ?? 0,
  };
}

export const db: Query = queries(pool);

/**
 * Runs `fn` in one transaction. Use `tx` (not `db`) inside it.
 *
 * Postgres runs transactions side by side, so "check, then write" needs a row lock:
 * start with `SELECT ... FOR UPDATE` on the row that guards the decision.
 */
export async function transaction<T>(fn: (tx: Query) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  let broken = false;
  try {
    await client.query("BEGIN");
    const out = await fn(queries(() => client));
    await client.query("COMMIT");
    return out;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => (broken = true));
    throw err;
  } finally {
    client.release(broken); // never return a connection stuck mid-transaction
  }
}

/**
 * A value for a JSONB column. (pg would turn a bare JS array into a Postgres array.)
 * Postgres can't store the NUL character, which model or user text could contain.
 */
export function json(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (typeof v === "string" ? v.replaceAll("\u0000", "") : v));
}

export function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "23505";
}
