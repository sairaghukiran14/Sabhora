/** Applying db/migrations/*.sql, shared by db-migrate and db-copy-to. */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "db", "migrations");

/**
 * Applies every migration the database has not seen, in one transaction, and returns their
 * names. The caller supplies a connected client and owns BEGIN/COMMIT, so a copy can bring
 * the schema up and load the data as one all-or-nothing step.
 *
 * The lock is transaction-scoped on purpose: a lock held between statements does not
 * survive a pooled connection, where each statement can land on a different backend.
 */
export async function applyMigrations(client) {
  await client.query("SELECT pg_advisory_xact_lock(hashtext('pitch_panchayat_migrations'))");
  await client.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
  );
  const done = new Set((await client.query("SELECT name FROM schema_migrations")).rows.map((r) => r.name));
  const applied = [];
  for (const name of readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(name)) continue;
    try {
      await client.query(readFileSync(path.join(DIR, name), "utf8"));
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
    } catch (err) {
      throw new Error(`${name} failed, nothing was applied: ${err.message}`);
    }
    applied.push(name);
  }
  return applied;
}
