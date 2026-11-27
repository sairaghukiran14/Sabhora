"use server";

import { redirect } from "next/navigation";
import { refresh, revalidatePath } from "next/cache";
import { db, transaction } from "@/lib/db";
import { getCurrentUser } from "@/lib/dal";
import { BackendError, getEngineConfig, holdClock, sendChat, sendFounderDeal, sendFounderReply, type DealMove } from "@/lib/backend";
import { ASK_LIMITS } from "@/lib/money";
import { flushEngineDeletions, queueEngineDeletion, startRun } from "@/lib/runs";
import { brief } from "@/lib/text";
import { ENTITLEMENTS, IDEA_MAX, JANTA_SIZES, ROOMS, runCost } from "@/lib/pricing";
import { validatePublicUrl } from "@/lib/validation";
import { hit } from "@/lib/rate-limit";
import type { FormState } from "@/lib/form";
import type { RoomMode } from "@/lib/types";

export async function createRun(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const mode = String(fd.get("mode") ?? "") as RoomMode;
  if (!Object.hasOwn(ROOMS, mode)) return { error: "Pick a room first" };

  const idea = String(fd.get("idea") ?? "").trim();
  const customer = String(fd.get("customer") ?? "").trim().slice(0, 80);
  const price = String(fd.get("price") ?? "").trim().slice(0, 40);
  const tone = fd.get("tone") === "serious" ? "serious" : "roast";
  const rawUrl = String(fd.get("url") ?? "");
  const voice = mode === "sharks" && fd.get("voice") === "1";
  const panelSize = mode === "janta" ? Number(fd.get("panelSize") ?? 25) : null;
  const askAmount = String(fd.get("askAmount") ?? "").trim().slice(0, 12);
  const askEquity = String(fd.get("askEquity") ?? "").trim().slice(0, 12);
  const values = { idea, customer, price, url: rawUrl, panelSize: String(panelSize ?? ""), askAmount, askEquity, voice: voice ? "1" : "" };

  // ---- validate input
  let url = "";
  if (mode === "roast") {
    const v = validatePublicUrl(rawUrl);
    if ("error" in v) return { fieldErrors: { url: v.error }, values };
    url = v.url;
  } else {
    if (idea.length < 20) return { fieldErrors: { idea: "Describe your idea in at least 20 characters" }, values };
    if (idea.length > IDEA_MAX) return { fieldErrors: { idea: `Keep it under ${IDEA_MAX} characters` }, values };
  }
  const ask = { ask_amount_lakh: Number(askAmount), ask_equity_pct: Number(askEquity) };
  if (mode === "sharks") {
    const errors: Record<string, string> = {};
    if (!(ask.ask_amount_lakh >= ASK_LIMITS.amountMin && ask.ask_amount_lakh <= ASK_LIMITS.amountMax)) {
      errors.askAmount = "Enter an amount in lakh, 1 or more";
    }
    if (!(ask.ask_equity_pct >= ASK_LIMITS.equityMin && ask.ask_equity_pct <= ASK_LIMITS.equityMax)) {
      errors.askEquity = "Enter a percentage from 0.1 to 100";
    }
    if (Object.keys(errors).length) return { fieldErrors: errors, values };
  }
  if (mode === "janta") {
    if (!JANTA_SIZES.includes(panelSize as (typeof JANTA_SIZES)[number])) return { error: "Pick a crowd size", values };
    if ((panelSize ?? 0) > ENTITLEMENTS[user.tier].jantaMax) {
      const plan = (panelSize ?? 0) > ENTITLEMENTS.pro.jantaMax ? "Deep" : "Pro";
      return { error: `Crowds of ${panelSize} are part of ${plan}. Your plan allows up to ${ENTITLEMENTS[user.tier].jantaMax} people.`, values };
    }
  }

  if (!hit(`runs:${user.id}`, 20, 60 * 60 * 1000).ok) {
    return { error: "You've started a lot of runs this hour. Take a breather and try again soon.", values };
  }

  if (voice && ((await getEngineConfig())?.voice ?? "off") === "off") {
    return { error: "Spoken investors aren't available right now. Switch them off to start.", values };
  }

  // The engine takes one pitch string, so the optional details go in as labelled lines.
  const pitch = [idea, customer && `Target customer: ${customer}`, price && `Price: ${price}`].filter(Boolean).join("\n");

  const started = await startRun({
    userId: user.id,
    mode,
    title: mode === "roast" ? new URL(url).hostname.replace(/^www\./, "") : brief(idea, 64),
    input: mode === "roast" ? { url } : { idea, customer, price, ...(mode === "sharks" ? { tone, voice, ...ask } : {}) },
    cost: runCost(mode, panelSize ?? undefined, voice),
    panelSize,
    label: `${ROOMS[mode].name} run${panelSize ? ` · ${panelSize} people` : ""}${voice ? " · with voice" : ""}`,
    engine:
      mode === "roast"
        ? { url }
        : { pitch, ...(mode === "sharks" ? { tone, voice, ...ask } : { panel_size: panelSize ?? 25 }) },
  });
  if ("error" in started) return { error: started.error, values };

  // The header balance lives in the shared layout, so refresh that too.
  revalidatePath("/dashboard", "layout");
  redirect(`/dashboard/runs/${started.id}`);
}

type OwnRun = { backend_id: string | null; status: string; mode: string };

function ownRun(userId: string, runId: string): Promise<OwnRun | undefined> {
  return db.one<OwnRun>("SELECT backend_id, status, mode FROM runs WHERE id = $1 AND user_id = $2", [runId, userId]);
}

/** The founder's answer between Sharks rounds. `text: null` skips. */
export async function replyToSharks(runId: string, text: string | null): Promise<{ ok: true } | { error: string }> {
  const user = await getCurrentUser();
  const run = await ownRun(user.id, String(runId));
  if (!run?.backend_id || run.mode !== "sharks" || run.status !== "running") {
    return { error: "This debate isn't waiting for an answer." };
  }
  const clean = typeof text === "string" ? text.trim().slice(0, 800) : "";
  if (text !== null && !clean) return { error: "Write an answer, or skip." };
  try {
    await sendFounderReply(user.id, run.backend_id, text === null ? { skip: true } : { text: clean });
    return { ok: true };
  } catch (err) {
    if (!(err instanceof BackendError)) throw err;
    return { error: err.status === 409 ? "Too late: the sharks have moved on." : err.userMessage };
  }
}

/**
 * Voice runs only: the founder is still hearing the sharks, or recording, so the engine
 * restarts their clock (up to its own limit). A miss is harmless, so nothing is reported.
 */
export async function holdSharks(runId: string): Promise<void> {
  const user = await getCurrentUser();
  const run = await ownRun(user.id, String(runId));
  if (!run?.backend_id || run.mode !== "sharks" || run.status !== "running") return;
  if (!hit(`hold:${user.id}`, 600, 60 * 60 * 1000).ok) return;
  try {
    await holdClock(user.id, run.backend_id);
  } catch (err) {
    if (!(err instanceof BackendError)) throw err;
  }
}

/** The founder's move at the Sharks deal table: accept, counter once, or walk away. */
export async function decideDeal(runId: string, move: DealMove): Promise<{ ok: true } | { error: string }> {
  const user = await getCurrentUser();
  const run = await ownRun(user.id, String(runId));
  if (!run?.backend_id || run.mode !== "sharks" || run.status !== "running") {
    return { error: "There are no offers waiting for you." };
  }
  const action = move?.action;
  if (action !== "accept" && action !== "counter" && action !== "walk") return { error: "Pick accept, counter or walk away." };
  // The engine validates the numbers and checks the offer is still on the table.
  const clean: DealMove = { action };
  if (action !== "walk") clean.offer_id = String(move.offer_id ?? "").slice(0, 20);
  if (action === "counter") {
    clean.investment_lakh = Number(move.investment_lakh);
    clean.equity_pct = Number(move.equity_pct);
    clean.royalty_pct = Number(move.royalty_pct ?? 0);
  }
  try {
    await sendFounderDeal(user.id, run.backend_id, clean);
    return { ok: true };
  } catch (err) {
    if (!(err instanceof BackendError)) throw err;
    if (err.status === 422) return { error: "Check your numbers: amount from 1 lakh, equity 0.1 to 100%, royalty up to 15%." };
    return { error: err.userMessage };
  }
}

export type ChatTurn = { role: "founder" | "persona"; text: string };

export type ChatResult =
  | { reply: string; position: string | null; positionBefore: string | null }
  | { error: string };

/** A follow-up question to one persona, after the verdict. */
export async function chatWithPersona(runId: string, personaId: string, message: string, history: ChatTurn[]): Promise<ChatResult> {
  const user = await getCurrentUser();
  const run = await ownRun(user.id, String(runId));
  if (!run?.backend_id || run.status !== "done") return { error: "You can chat once the verdict is in." };

  const text = String(message ?? "").trim();
  if (!text) return { error: "Write a message first." };
  if (text.length > 500) return { error: "Keep it under 500 characters." };
  if (!hit(`chat:${user.id}`, 60, 60 * 60 * 1000).ok) return { error: "That's a lot of messages. Try again later." };

  const past = (Array.isArray(history) ? history : [])
    .filter((t) => (t?.role === "founder" || t?.role === "persona") && typeof t.text === "string" && t.text.length > 0)
    .slice(-20)
    .map((t) => ({ role: t.role, text: t.text.slice(0, 1000) }));

  try {
    const out = await sendChat(user.id, run.backend_id, {
      persona_id: String(personaId).slice(0, 20),
      message: text,
      history: past,
    });
    return { reply: out.reply, position: out.position, positionBefore: out.position_before };
  } catch (err) {
    if (!(err instanceof BackendError)) throw err;
    if (err.status === 404) return { error: "The engine no longer has this debate, so the panel can't chat about it." };
    if (err.status === 502) return { error: "They couldn't answer just now. Try again." };
    return { error: err.userMessage };
  }
}

export async function setShared(fd: FormData): Promise<void> {
  const user = await getCurrentUser();
  const runId = String(fd.get("id") ?? "");
  const makePublic = fd.get("public") === "1";
  await db.run("UPDATE runs SET is_public = $1 WHERE id = $2 AND user_id = $3 AND status = 'done'", [makePublic, runId, user.id]);
  refresh();
}

export async function deleteRun(fd: FormData): Promise<void> {
  const user = await getCurrentUser();
  // A run still in progress holds credits, so it can't be deleted until it settles.
  const runId = String(fd.get("id") ?? "");
  const deleted = await transaction(async (tx) => {
    const run = await tx.one<{ backend_id: string | null }>(
      "DELETE FROM runs WHERE id = $1 AND user_id = $2 AND status != 'running' RETURNING backend_id",
      [runId, user.id],
    );
    if (run) await queueEngineDeletion(tx, [run.backend_id]);
    return !!run;
  });
  if (deleted) await flushEngineDeletions();
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard/runs");
}
