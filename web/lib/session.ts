import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { connection } from "next/server";
import { db } from "./db";
import { newId, newToken, sha256 } from "./crypto";
import type { Prefs } from "./types";

export const SESSION_COOKIE = "pp_session";
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Sessions are opaque random tokens. Only a SHA-256 of the token is stored,
 * so a leaked database can't be replayed as live sessions.
 */
export async function createSession(userId: string, remember: boolean): Promise<void> {
  const token = newToken(32);
  const now = Date.now();
  const ttl = remember ? 30 * DAY_MS : DAY_MS;
  const userAgent = ((await headers()).get("user-agent") ?? "").slice(0, 200);

  await db.run("DELETE FROM sessions WHERE expires_at < $1", [now]);
  // Signing in over an existing session retires it, so it can't linger unused.
  const previous = await currentTokenHash();
  if (previous) await db.run("DELETE FROM sessions WHERE token_hash = $1", [previous]);
  await db.run(
    "INSERT INTO sessions (id, user_id, token_hash, user_agent, expires_at, created_at) VALUES ($1, $2, $3, $4, $5, $6)",
    [newId(), userId, sha256(token), userAgent, now + ttl, now],
  );

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    // without "remember me" it's a browser-session cookie (server expiry still 24h)
    ...(remember ? { maxAge: ttl / 1000 } : {}),
  });
}

async function currentTokenHash(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? sha256(token) : null;
}

export type AccountRow = {
  id: string; email: string; name: string; tier: string; role: string; company: string;
  city: string; bio: string; prefs: Partial<Prefs>; created_at: number;
  /** Credit balance, so a page never needs a second query for it. */
  balance: number;
  /** Whether lib/runs has catching up to do; usually both are zero/false. */
  running_count: number;
  has_deletions: boolean;
};

/**
 * One query answers everything a page asks on arrival: who they are, their balance, and
 * whether any run needs settling.
 *
 * `cache` makes that one query per request however many times it is called — a page, its
 * layout and the components inside it all ask independently, and on a database a few
 * hundred milliseconds away each repeat was costing a visible chunk of the page's load.
 *
 * It takes the token hash rather than reading the cookie itself. Reading `cookies()` inside
 * a cached function throws "Received an underlying cookies object that does not match
 * either `cookies` or `mutableCookies`", because one cached result would then be shared
 * between passes that each have their own cookie object. The cookie read is cheap; the
 * query is what had to stop repeating.
 */
const loadAccount = cache(async (tokenHash: string): Promise<AccountRow | null> => {
  const row = await db.one<AccountRow>(
    `SELECT u.*,
            (SELECT COALESCE(SUM(delta), 0) FROM credit_ledger WHERE user_id = u.id) AS balance,
            (SELECT COUNT(*) FROM runs WHERE user_id = u.id AND status = 'running') AS running_count,
            EXISTS (SELECT 1 FROM engine_deletions) AS has_deletions
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > $2`,
    [tokenHash, Date.now()],
  );
  return row ?? null;
});

/** The signed-in account, or null. */
export async function readAccount(): Promise<AccountRow | null> {
  const hash = await currentTokenHash();
  if (!hash) return null;
  // Expiry is compared with the clock, so this must run at request time.
  await connection();
  return loadAccount(hash);
}

export async function readSessionUserId(): Promise<string | null> {
  return (await readAccount())?.id ?? null;
}

export async function destroySession(): Promise<void> {
  const hash = await currentTokenHash();
  if (hash) await db.run("DELETE FROM sessions WHERE token_hash = $1", [hash]);
  (await cookies()).delete(SESSION_COOKIE);
}

/** Sign out every other device, keeping the current one. */
export async function destroyOtherSessions(userId: string): Promise<number> {
  const hash = await currentTokenHash();
  return db.run("DELETE FROM sessions WHERE user_id = $1 AND token_hash != $2", [userId, hash ?? ""]);
}
