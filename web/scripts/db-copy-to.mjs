/**
 * Copies this database into an empty one, then proves the copy matches.
 *
 *   npm run db:copy-to -- 'postgresql://user:pw@host/db?sslmode=require'
 *
 * Source is DATABASE_URL (web/.env.local). The target gets the schema from
 * db/migrations and then the rows, all in one transaction: if anything fails the target is
 * left exactly as it was found. Nothing is written to the source, and no env file is
 * changed — point the apps at the target yourself once the check below passes.
 *
 * It copies through the driver rather than pg_dump on purpose: pg_dump refuses to read a
 * server newer than itself, and a Homebrew client lags behind Neon's Postgres. The schema
 * comes from the migrations, which is what the apps expect anyway.
 */
import pg from "pg";
import { connect } from "./db-connect.mjs";
import { applyMigrations } from "./db-schema.mjs";

// Hand timestamps over as the strings Postgres sent. Parsed into a JavaScript Date they
// would come back a thousand times coarser — a dry run turned 06:05:12.132754 into
// .132000 — and writing the string back preserves the microseconds exactly.
pg.types.setTypeParser(1114, (v) => v); // timestamp
pg.types.setTypeParser(1184, (v) => v); // timestamptz

// Parents before children, so foreign keys hold.
const TABLES = [
  ["public", "users"],
  ["public", "sessions"],
  ["public", "password_resets"],
  ["public", "runs"],
  ["public", "credit_ledger"],
  ["public", "byok_keys"],
  ["public", "engine_deletions"],
  ["engine", "debates"],
];

const target = process.argv[2];
if (!target) {
  console.error("Usage: npm run db:copy-to -- '<target connection string>'");
  process.exit(1);
}
const host = (() => {
  try {
    return new URL(target).hostname;
  } catch {
    console.error("That doesn't look like a connection string.");
    process.exit(1);
  }
})();
if (host.includes("-pooler")) {
  console.error(
    `Refusing to use ${host}: that is the pooled host.\n` +
      "Its session state leaks between clients, which empties search_path and breaks every\n" +
      "unqualified query. Use the same host without '-pooler'.",
  );
  process.exit(1);
}

const columnsOf = async (client, schema, table) =>
  (
    await client.query(
      `SELECT column_name, data_type FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`,
      [schema, table],
    )
  ).rows;

/** Order-independent, and pinned to C so two different collations still agree. */
const CHECKSUM = (col) => `md5(coalesce(string_agg(md5(${col}::text), '' ORDER BY md5(${col}::text) COLLATE "C"), ''))`;

const source = await connect();
const client = new pg.Client({ connectionString: target, connectionTimeoutMillis: 20_000 });
await client.connect();
let copied = false;

try {
  console.log(`source : ${new URL(process.env.DATABASE_URL).hostname}`);
  console.log(`target : ${host}\n`);

  // Both ends render timestamps the same way, so the comparison below compares the data
  // rather than the two servers' timezone settings.
  await Promise.all([source.query("SET TimeZone = 'UTC'"), client.query("SET TimeZone = 'UTC'")]);

  // The default search_path, which Neon's role does not have until it is set. Outside the
  // transaction because it must hold for later connections too, not just this copy.
  const ident = (await client.query("SELECT quote_ident(current_user) AS role, quote_ident(current_database()) AS db")).rows[0];
  await client.query(`ALTER ROLE ${ident.role} IN DATABASE ${ident.db} SET search_path = "$user", public`);
  console.log(`search_path default set on ${ident.role}`);

  await client.query("BEGIN");
  const applied = await applyMigrations(client);
  console.log(applied.length ? `schema: applied ${applied.join(", ")}` : "schema: already present");

  for (const [schema, table] of TABLES) {
    const name = `${schema}.${table}`;
    const { rows: existing } = await client.query(`SELECT count(*)::int AS n FROM ${name}`);
    if (existing[0].n > 0) throw new Error(`${name} already has ${existing[0].n} rows; copy only into an empty database`);

    const columns = await columnsOf(source, schema, table);
    const names = columns.map((c) => `"${c.column_name}"`).join(", ");
    const { rows } = await source.query(`SELECT ${names} FROM ${name}`);
    if (rows.length) {
      // One statement per table: a row at a time would pay the round trip hundreds of times.
      const values = [];
      const chunks = rows.map((row, r) => {
        const placeholders = columns.map((c, i) => {
          // jsonb must be sent as text, or an array value becomes a Postgres array.
          const v = row[c.column_name];
          values.push(c.data_type === "jsonb" && v !== null ? JSON.stringify(v) : v);
          return `$${r * columns.length + i + 1}`;
        });
        return `(${placeholders.join(", ")})`;
      });
      await client.query(`INSERT INTO ${name} (${names}) VALUES ${chunks.join(", ")}`, values);
    }
    console.log(`copied ${String(rows.length).padStart(4)} rows  ${name}`);
  }
  await client.query("COMMIT");
  copied = true;

  console.log("\nverifying:");
  let problems = 0;
  for (const [schema, table] of TABLES) {
    const name = `${schema}.${table}`;
    const columns = await columnsOf(source, schema, table);
    const expr = `count(*)::text || ':' || ${columns.map((c) => CHECKSUM(`"${c.column_name}"`)).join(" || ")}`;
    const [a, b] = await Promise.all([
      source.query(`SELECT ${expr} AS fingerprint FROM ${name}`),
      client.query(`SELECT ${expr} AS fingerprint FROM ${name}`),
    ]);
    const same = a.rows[0].fingerprint === b.rows[0].fingerprint;
    if (!same) problems++;
    console.log(`  ${same ? "identical" : "DIFFERS  "}  ${name} (${a.rows[0].fingerprint.split(":")[0]} rows)`);
  }

  const balances = "SELECT user_id || '=' || sum(delta) AS b FROM credit_ledger GROUP BY user_id";
  const [sa, sb] = await Promise.all([source.query(balances), client.query(balances)]);
  const asText = (r) => r.rows.map((x) => x.b).sort().join(",");
  const balancesMatch = asText(sa) === asText(sb);
  if (!balancesMatch) problems++;
  console.log(`  ${balancesMatch ? "identical" : "DIFFERS  "}  credit balances (${sa.rows.length} accounts)`);

  console.log(
    problems === 0
      ? "\nEvery table and balance matches. Point DATABASE_URL at the target when you're ready."
      : `\n${problems} difference(s). Do NOT switch over; investigate first.`,
  );
  process.exitCode = problems === 0 ? 0 : 1;
} catch (err) {
  if (!copied) await client.query("ROLLBACK").catch(() => {});
  console.error(`\nCopy ${copied ? "finished but verification failed" : "cancelled, target unchanged"}: ${err.message}`);
  process.exitCode = 1;
} finally {
  await source.end();
  await client.end();
}
