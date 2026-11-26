import "server-only";
import type { RunDetail } from "./dal";
import { ROOMS } from "./pricing";

/** What a link preview (WhatsApp, LinkedIn, X...) says about a shared run. Built only from
 * what the share page itself shows, so a preview never reveals more than the page. */
export type SharePreview = { room: string; title: string; figure: string; figureNote: string; line: string };

type Verdictish = { verdict?: { one_liner?: string }; summary?: { headline?: string } };

export function sharePreview(run: RunDetail): SharePreview {
  const verdict = [...run.events].reverse().find((e) => e.type === "verdict") as Verdictish | undefined;
  const deal = run.events.find((e) => e.type === "deal") as { outcome?: string } | undefined;
  const line = verdict?.verdict?.one_liner ?? verdict?.summary?.headline ?? ROOMS[run.mode].short;
  if (run.mode === "janta") {
    const pay = run.metric?.match(/\d+%/)?.[0];
    return {
      room: `${ROOMS.janta.name}${run.panelSize ? ` · ${run.panelSize} people` : ""}`,
      title: run.title, figure: pay ?? "", figureNote: pay ? "would pay" : "", line,
    };
  }
  const figure = run.score == null ? "" : `${Math.round(run.score * 10) / 10}/10`;
  const note = run.mode === "sharks" ? (deal?.outcome === "deal" ? "panel score · deal made" : "panel score") : "page score";
  return { room: ROOMS[run.mode].name, title: run.title, figure, figureNote: figure ? note : "", line };
}

/** The public base URL, for absolute links in previews. Set SITE_URL in production. */
export function siteUrl(): string {
  return (process.env.SITE_URL || "http://localhost:3100").replace(/\/$/, "");
}
