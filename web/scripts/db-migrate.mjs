/**
 * Applies db/migrations/*.sql in order, each once, all in ONE transaction.
 *
 *   npm run db:migrate                     uses DATABASE_URL (or web/.env.local)
 *   DATABASE_URL=postgresql://... npm run db:migrate
 *
 * One transaction, not one per file, because the lock that stops two deploys migrating at
 * once has to hold for the whole run: a pooled host (Neon's -pooler, PgBouncer in
 * transaction mode) can hand each statement outside a transaction to a different backend,
 * where a session-level pg_advisory_lock would be taken and then silently lost. Postgres
 * applies DDL transactionally, so if any file fails the database is left exactly as it was.
 */
import { connect } from "./db-connect.mjs";
import { applyMigrations } from "./db-schema.mjs";

const client = await connect();
try {
  await client.query("BEGIN");
  const applied = await applyMigrations(client);
  await client.query("COMMIT");
  for (const name of applied) console.log(`applied ${name}`);
  console.log(applied.length ? `${applied.length} migration(s) applied` : "database is up to date");
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
