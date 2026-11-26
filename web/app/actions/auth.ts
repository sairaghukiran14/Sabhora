"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db, isUniqueViolation, transaction } from "@/lib/db";
import { getDummyHash, hashPassword, newId, newToken, sha256, verifyPassword } from "@/lib/crypto";
import { createSession, destroySession } from "@/lib/session";
import { clear, hit } from "@/lib/rate-limit";
import { isStrongEnough, isValidEmail, normalizeEmail, safeNext, validateName } from "@/lib/validation";
import { FREE_GRANT } from "@/lib/pricing";
import type { FormState } from "@/lib/form";

const MIN = 60 * 1000;

async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "local").trim();
}

function minutes(ms: number) {
  const m = Math.max(1, Math.ceil(ms / MIN));
  return `${m} minute${m === 1 ? "" : "s"}`;
}

export async function signup(_prev: FormState, fd: FormData): Promise<FormState> {
  const name = String(fd.get("name") ?? "").trim();
  const email = normalizeEmail(String(fd.get("email") ?? ""));
  const password = String(fd.get("password") ?? "");
  const values = { name, email, terms: fd.get("terms") === "on" ? "on" : "" };

  const fieldErrors: Record<string, string> = {};
  const nameErr = validateName(name);
  if (nameErr) fieldErrors.name = nameErr;
  if (!isValidEmail(email)) fieldErrors.email = "Enter a valid email address";
  if (!isStrongEnough(password)) fieldErrors.password = "Choose a password that meets all three rules";
  if (fd.get("terms") !== "on") fieldErrors.terms = "Accept the terms to continue";
  if (Object.keys(fieldErrors).length) return { fieldErrors, values };

  const ip = await clientIp();
  if (!hit(`signup:${ip}`, 10, 60 * MIN).ok) {
    return { error: "Too many sign-ups from this network. Try again in an hour.", values };
  }

  if (await db.one("SELECT 1 FROM users WHERE email = $1", [email])) {
    return { fieldErrors: { email: "That email is already registered. Log in instead." }, values };
  }

  const id = newId();
  const now = Date.now();
  const passwordHash = await hashPassword(password);
  try {
    await transaction(async (tx) => {
      await tx.run("INSERT INTO users (id, email, name, password_hash, created_at) VALUES ($1, $2, $3, $4, $5)", [
        id, email, name, passwordHash, now,
      ]);
      await tx.run(
        "INSERT INTO credit_ledger (id, user_id, delta, kind, note, idempotency_key, created_at) VALUES ($1, $2, $3, 'grant', 'Welcome credits', $4, $5)",
        [newId(), id, FREE_GRANT, `free_grant:${id}`, now],
      );
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    return { fieldErrors: { email: "That email is already registered. Log in instead." }, values };
  }

  await createSession(id, true);
  const next = safeNext(String(fd.get("next") ?? ""));
  redirect(next === "/dashboard" ? "/dashboard?welcome=1" : next);
}

export async function login(_prev: FormState, fd: FormData): Promise<FormState> {
  const email = normalizeEmail(String(fd.get("email") ?? ""));
  const password = String(fd.get("password") ?? "");
  const remember = fd.get("remember") === "on";
  const values = { email };

  if (!isValidEmail(email) || !password) return { error: "Enter your email and password", values };

  const ip = await clientIp();
  const key = `login:${ip}:${email}`;
  const perAccount = hit(key, 5, 15 * MIN);
  const perIp = hit(`login-ip:${ip}`, 30, 15 * MIN);
  if (!perAccount.ok || !perIp.ok) {
    return {
      error: `Too many attempts. Try again in ${minutes(Math.max(perAccount.retryAfterMs, perIp.retryAfterMs))}.`,
      values,
    };
  }

  const row = await db.one<{ id: string; password_hash: string }>("SELECT id, password_hash FROM users WHERE email = $1", [email]);
  // Always run a full hash check so response time doesn't reveal whether the email exists.
  const valid = await verifyPassword(password, row?.password_hash ?? (await getDummyHash()));
  if (!row || !valid) return { error: "Email or password is incorrect", values };

  clear(key);
  await createSession(row.id, remember);
  redirect(safeNext(String(fd.get("next") ?? "")));
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/login");
}

export async function requestPasswordReset(_prev: FormState, fd: FormData): Promise<FormState> {
  const email = normalizeEmail(String(fd.get("email") ?? ""));
  if (!isValidEmail(email)) return { fieldErrors: { email: "Enter a valid email address" }, values: { email } };

  const ip = await clientIp();
  if (!hit(`reset:${ip}`, 5, 15 * MIN).ok) return { error: "Too many requests. Try again in a few minutes." };

  const user = await db.one<{ id: string }>("SELECT id FROM users WHERE email = $1", [email]);
  if (user) {
    const token = newToken(32);
    await transaction(async (tx) => {
      await tx.one("SELECT id FROM users WHERE id = $1 FOR UPDATE", [user.id]); // one live link per user
      await tx.run("DELETE FROM password_resets WHERE user_id = $1", [user.id]);
      await tx.run("INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES ($1, $2, $3)", [
        sha256(token), user.id, Date.now() + 30 * MIN,
      ]);
    });
    const h = await headers();
    const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
    // No email provider is connected yet: in development the link is printed to the server log.
    if (process.env.NODE_ENV !== "production") {
      console.info(`\n[pitch-panchayat] Password reset link (valid 30 min):\n${origin}/reset-password?token=${token}\n`);
    }
  }
  // Same answer either way, so this form can't be used to discover accounts.
  return { ok: "If an account exists for that email, a reset link is on its way. It expires in 30 minutes." };
}

export async function resetPassword(_prev: FormState, fd: FormData): Promise<FormState> {
  const token = String(fd.get("token") ?? "");
  const password = String(fd.get("password") ?? "");
  if (!isStrongEnough(password)) return { fieldErrors: { password: "Choose a password that meets all three rules" } };

  const expired = { error: "This reset link has expired or was already used. Request a new one." };
  const tokenHash = sha256(token);
  const usable = "token_hash = $1 AND NOT used AND expires_at >= $2";
  // Check before the slow password hash, so junk tokens cost almost nothing.
  if (!(await db.one(`SELECT 1 FROM password_resets WHERE ${usable}`, [tokenHash, Date.now()]))) return expired;

  const passwordHash = await hashPassword(password);
  const row = await transaction(async (tx) => {
    // Claiming the link and using it are one step, so two tabs can't both use it.
    const claimed = await tx.one<{ user_id: string }>(
      `UPDATE password_resets SET used = TRUE WHERE ${usable} RETURNING user_id`,
      [tokenHash, Date.now()],
    );
    if (claimed) {
      await tx.run("UPDATE users SET password_hash = $1 WHERE id = $2", [passwordHash, claimed.user_id]);
      await tx.run("DELETE FROM sessions WHERE user_id = $1", [claimed.user_id]);
    }
    return claimed;
  });
  if (!row) return expired;
  await createSession(row.user_id, false);
  redirect("/dashboard");
}
