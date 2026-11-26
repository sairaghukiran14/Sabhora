import type { RoomMode, Tier } from "./types";

/** Shared by the UI and the server guard so the two can never disagree. */

export const FREE_GRANT = 50;

export const ROOMS: Record<
  RoomMode,
  { name: string; tagline: string; short: string; cls: string; cost: string }
> = {
  sharks: {
    name: "Sharks",
    tagline: "5 investors · live offers",
    short: "Five investor personas grill your pitch, make offers or walk out, and land a scored verdict.",
    cls: "room-sharks",
    cost: "15 credits",
  },
  janta: {
    name: "Janta",
    tagline: "25–100 Indian personas",
    short: "A crowd reacts, votes, and tells you who would actually pay.",
    cls: "room-janta",
    cost: "from 10 credits",
  },
  roast: {
    name: "Roast",
    tagline: "6 reviewers · your URL",
    short: "Six reviewers score your landing page and name the exact fixes.",
    cls: "room-roast",
    cost: "5 credits",
  },
};

export const JANTA_SIZES = [25, 50, 100] as const;
export type JantaSize = (typeof JANTA_SIZES)[number];

export function runCost(mode: RoomMode, panelSize?: number): number {
  if (mode === "sharks") return 15;
  if (mode === "roast") return 5;
  if (panelSize === 100) return 30;
  if (panelSize === 50) return 20;
  return 10;
}

export const ENTITLEMENTS: Record<Tier, { jantaMax: number; byok: boolean }> = {
  free: { jantaMax: 25, byok: false },
  pro: { jantaMax: 150, byok: true },
  deep: { jantaMax: 500, byok: true },
};

export const PLANS = [
  {
    id: "free" as const,
    name: "Free",
    price: "₹0",
    period: "forever",
    blurb: "Try every room on us.",
    features: ["50 credits on sign-up", "Sharks and Roast", "Janta with 25 people", "Shareable verdict links"],
    cta: "Start free",
  },
  {
    id: "pro" as const,
    name: "Pro",
    price: "₹499",
    period: "per month",
    blurb: "For founders testing ideas every week.",
    features: ["600 credits every month", "Janta with up to 100 people", "Bring your own API key", "Priority runs"],
    cta: "Go Pro",
    featured: true,
  },
  {
    id: "deep" as const,
    name: "Deep",
    price: "₹1,999",
    period: "per month",
    blurb: "For studios and accelerators.",
    features: ["3,000 credits every month", "Deep segment breakdowns", "Early access to new rooms"],
    cta: "Go Deep",
  },
];

export const CREDIT_PACKS = [
  { id: "p220", inr: "₹199", credits: 220, note: "" },
  { id: "p600", inr: "₹499", credits: 600, note: "Best value · +20% bonus" },
  { id: "p1300", inr: "₹999", credits: 1300, note: "+30% bonus" },
];
