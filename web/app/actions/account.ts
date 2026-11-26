"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { db, json, transaction } from "@/lib/db";
import { getCurrentUser } from "@/lib/dal";
import { encryptSecret, hashPassword, newId, verifyPassword } from "@/lib/crypto";
import { destroyOtherSessions, SESSION_COOKIE } from "@/lib/session";
import { isStrongEnough, validateName } from "@/lib/validation";
import { ENTITLEMENTS } from "@/lib/pricing";
import { hit } from "@/lib/rate-limit";
import { flushEngineDeletions, queueEngineDeletion } from "@/lib/runs";
import type { FormState } from "@/lib/form";

const ROLES = ["Founder", "Co-founder", "Product manager", "Student", "Investor", "Other", ""];

export async function updateProfile(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const name = String(fd.get("name") ?? "").trim();
  const role = String(fd.get("role") ?? "");
  const company = String(fd.get("company") ?? "").trim().slice(0, 80);
  const city = String(fd.get("city") ?? "").trim().slice(0, 60);
  const bio = String(fd.get("bio") ?? "").trim().slice(0, 280);

  const nameErr = validateName(name);
  if (nameErr) return { fieldErrors: { name: nameErr } };
  if (!ROLES.includes(role)) return { fieldErrors: { role: "Pick a role from the list" } };

  await db.run("UPDATE users SET name = $1, role = $2, company = $3, city = $4, bio = $5 WHERE id = $6", [
    name, role, company, city, bio, user.id,
  ]);
  refresh();
  return { ok: "Profile saved" };
}

export async function changePassword(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const current = String(fd.get("current") ?? "");
  const next = String(fd.get("password") ?? "");

  if (!hit(`pw:${user.id}`, 5, 15 * 60 * 1000).ok) return { error: "Too many attempts. Try again in 15 minutes." };

  const row = (await db.one<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = $1", [user.id]))!;
  if (!(await verifyPassword(current, row.password_hash))) {
    return { fieldErrors: { current: "That's not your current password" } };
  }
  if (!isStrongEnough(next)) return { fieldErrors: { password: "Choose a password that meets all three rules" } };
  if (current === next) return { fieldErrors: { password: "Pick a password you haven't used here" } };

  await db.run("UPDATE users SET password_hash = $1 WHERE id = $2", [await hashPassword(next), user.id]);
  const n = await destroyOtherSessions(user.id);
  refresh();
  return { ok: n > 0 ? `Password updated. Signed out ${n} other device${n === 1 ? "" : "s"}.` : "Password updated" };
}

export async function signOutOtherDevices(): Promise<FormState> {
  const user = await getCurrentUser();
  const n = await destroyOtherSessions(user.id);
  refresh();
  return { ok: n > 0 ? `Signed out ${n} other device${n === 1 ? "" : "s"}` : "No other devices were signed in" };
}

export async function updatePrefs(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const prefs = {
    emailOnFinish: fd.get("emailOnFinish") === "on",
    productUpdates: fd.get("productUpdates") === "on",
  };
  await db.run("UPDATE users SET prefs = $1 WHERE id = $2", [json(prefs), user.id]);
  refresh();
  return { ok: "Notification preferences saved" };
}

export async function saveApiKey(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!ENTITLEMENTS[user.tier].byok) {
    return { error: "Bring your own key is part of Pro and Deep. Upgrade to add a key." };
  }
  const provider = String(fd.get("provider") ?? "");
  const key = String(fd.get("key") ?? "").trim();
  if (!["anthropic", "sarvam"].includes(provider)) return { fieldErrors: { provider: "Pick a provider" } };
  if (key.length < 20 || key.length > 300 || /\s/.test(key)) return { fieldErrors: { key: "That doesn't look like an API key" } };
  if (provider === "anthropic" && !key.startsWith("sk-ant-")) {
    return { fieldErrors: { key: "Anthropic keys start with sk-ant-" } };
  }
  await db.run(
    `INSERT INTO byok_keys (id, user_id, provider, ciphertext, last4, created_at) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, provider) DO UPDATE SET ciphertext = excluded.ciphertext, last4 = excluded.last4, created_at = excluded.created_at`,
    [newId(), user.id, provider, encryptSecret(key), key.slice(-4), Date.now()],
  );
  refresh();
  return { ok: "Key saved. It's encrypted and never shown again." };
}

export async function deleteApiKey(fd: FormData): Promise<void> {
  const user = await getCurrentUser();
  await db.run("DELETE FROM byok_keys WHERE id = $1 AND user_id = $2", [String(fd.get("id") ?? ""), user.id]);
  refresh();
}

export async function deleteAccount(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const password = String(fd.get("password") ?? "");
  if (String(fd.get("confirm") ?? "").trim().toLowerCase() !== user.email) {
    return { fieldErrors: { confirm: "Type your email exactly to confirm" } };
  }
  const row = (await db.one<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = $1", [user.id]))!;
  if (!(await verifyPassword(password, row.password_hash))) {
    return { fieldErrors: { password: "That's not your password" } };
  }
  await transaction(async (tx) => {
    await tx.one("SELECT id FROM users WHERE id = $1 FOR UPDATE", [user.id]); // no new run can start meanwhile
    const runs = await tx.many<{ backend_id: string | null }>("SELECT backend_id FROM runs WHERE user_id = $1", [user.id]);
    await queueEngineDeletion(tx, runs.map((r) => r.backend_id));
    await tx.run("DELETE FROM users WHERE id = $1", [user.id]);
  });
  await flushEngineDeletions();
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/?account=deleted");
}
