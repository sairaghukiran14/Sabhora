/** Shared by the database scripts: a connected client for DATABASE_URL. */
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

export const WEB_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function connect() {
  if (!process.env.DATABASE_URL) {
    try {
      process.loadEnvFile(path.join(WEB_DIR, ".env.local"));
    } catch {}
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL isn't set. Add it to web/.env.local (see web/.env.example).");
    process.exit(1);
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  return client;
}
