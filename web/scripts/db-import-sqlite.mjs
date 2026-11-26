/**
 * One-time copy of the old local data into Postgres:
 *   web/.data/app.db            -> public.*
 *   backend/data/debates/*.json -> engine.debates
 *
 * The old files are only read, never changed. Everything happens in one transaction, and it
 * is rolled back unless every row count and every user's credit balance matches.
 *
 *   npm run db:migrate && npm run db:import-sqlite
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { connect, WEB_DIR } from "./db-connect.mjs";

const SQLITE = path.join(WEB_DIR, ".data", "app.db");
const DEBATES = path.join(WEB_DIR, "..", "backend", "data", "debates");

// Parents before children, so foreign keys hold.
const TABLES = ["users", "sessions", "password_resets", "runs", "credit_ledger", "byok_keys", "engine_deletions"];
const BOOLEAN = new Set(["password_resets.used", "runs.is_public", "runs.demo"]);
const JSONB = new Set(["users.prefs", "runs.input", "runs.result"]);

// Postgres can't store the NUL character.
const noNul = (_k, v) => (typeof v === "string" ? v.replaceAll("\u0000", "") : v);

function convert(table, column, value) {
  const key = `${table}.${column}`;
  if (BOOLEAN.has(key)) return Boolean(value);
  if (JSONB.has(key)) return JSON.stringify(JSON.parse(value), noNul);
  return typeof value === "string" ? value.replaceAll("\u0000", "") : value;
}

if (!existsSync(SQLITE)) {
  console.error(`Nothing to import: ${SQLITE} doesn't exist.`);
  process.exit(1);
}
const old = new DatabaseSync(SQLITE, { readOnly: true });
const client = await connect();
try {
  await client.query("BEGIN");
  const { rows } = await client.query("SELECT (SELECT count(*) FROM users) + (SELECT count(*) FROM engine.debates) AS n");
  if (Number(rows[0].n) > 0) {
    throw new Error("The Postgres database already has data. Import only into a freshly migrated, empty one.");
  }

  old.exec("BEGIN"); // one consistent view of the old data
  const report = [];
  for (const table of TABLES) {
    const source = old.prepare(`SELECT * FROM ${table}`).all();
    for (const row of source) {
      const columns = Object.keys(row);
      await client.query(
        `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(", ")})`,
        columns.map((c) => convert(table, c, row[c])),
      );
    }
    const copied = Number((await client.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n);
    if (copied !== source.length) throw new Error(`${table}: ${source.length} rows before, ${copied} after`);
    report.push([table, copied]);
  }

  const balances = "SELECT user_id, SUM(delta) AS b FROM credit_ledger GROUP BY user_id";
  const after = new Map((await client.query(balances)).rows.map((r) => [r.user_id, Number(r.b)]));
  const before = old.prepare(balances).all();
  for (const { user_id, b } of before) {
    if (after.get(user_id) !== Number(b)) throw new Error("A credit balance doesn't match after copying");
  }

  let debates = 0;
  const skipped = [];
  for (const name of existsSync(DEBATES) ? readdirSync(DEBATES).filter((f) => f.endsWith(".json")) : []) {
    const file = path.join(DEBATES, name);
    let snapshot;
    try {
      snapshot = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      skipped.push(`${name} (not valid JSON)`);
      continue;
    }
    if (!/^[a-f0-9]{12}$/.test(snapshot?.id ?? "") || !snapshot.mode) {
      skipped.push(`${name} (not a debate)`);
      continue;
    }
    await client.query("INSERT INTO engine.debates (id, mode, snapshot) VALUES ($1, $2, $3)", [
      snapshot.id, snapshot.mode, JSON.stringify(snapshot, noNul),
    ]);
    debates++;
  }

  await client.query("COMMIT");
  for (const [table, n] of report) console.log(`${table.padEnd(18)} ${n} rows`);
  console.log(`${"engine.debates".padEnd(18)} ${debates} rows`);
  console.log(`credit balances    ${before.length} checked, all match`);
  if (skipped.length) console.log(`skipped: ${skipped.join(", ")}`);
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.error(`Import cancelled, nothing was copied: ${err.message}`);
  process.exitCode = 1;
} finally {
  old.close();
  await client.end();
}
