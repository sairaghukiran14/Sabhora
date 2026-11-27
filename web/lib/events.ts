/**
 * The backend's event stream (backend/app/debates/*), and how it turns into screen state.
 * One pure function drives live runs, replays and shared links, so they can't drift apart.
 * Safe to import from client components.
 */

export type Stance = "invest" | "maybe" | "pass";
export type Vote = "agree" | "neutral" | "disagree";
export type PanelMember = { id: string; name: string; title: string };

export type CrowdMember = {
  id: string;
  name: string;
  age: number;
  city: string;
  city_tier: number;
  occupation: string;
  attitude: string;
  household?: string;
  phone?: string;
};

export type Tally = {
  agree: number;
  neutral: number;
  disagree: number;
  total: number;
  would_pay: number;
  would_pay_pct: number;
};

export type Segments = Record<
  string,
  Record<string, { n: number; agree: number; neutral: number; disagree: number; would_pay: number }>
>;

export type Ask = { investment_lakh: number; equity_pct: number; valuation_lakh: number };

export type Offer = {
  id: string; // the lead shark's id
  sharks: string[];
  names: string[];
  investment_lakh: number;
  equity_pct: number;
  debt_lakh: number;
  debt_interest_pct: number;
  royalty_pct: number;
  royalty_until_lakh: number;
  valuation_lakh: number | null;
};

export type DealReason = "accepted" | "counter_accepted" | "walked" | "timeout" | "withdrawn" | "all_out" | "no_offers";

export type SharkVerdict = {
  score: number;
  decision: Stance;
  one_liner: string;
  votes: { shark: string; stance: Stance; reason: string }[];
  top_risks: string[];
  next_steps: string[];
};

export type JantaSummary = {
  headline: string;
  reasons_for: string[];
  reasons_against: string[];
  advice: string[];
};

export type Review = { roast: string; clarity: number; trust: number; design: number; cta: number; fix: string };
export type Scores = { clarity: number; trust: number; design: number; cta: number };
export type RoastVerdict = { overall: number; one_liner: string; top_fixes: string[] };

type Base = { id: number };

export type RunEvent = Base &
  (
    | { type: "start"; mode: string; rounds?: number; panel?: PanelMember[]; size?: number; crowd?: CrowdMember[]; url?: string; ask?: Ask | null }
    | { type: "round"; round: number; asked?: number }
    | { type: "typing"; speaker: string; name: string }
    | { type: "message"; round: number; speaker: string; name: string; text: string; stance: Stance; confidence: number; out?: boolean }
    | { type: "offers_open" }
    | { type: "offer"; speaker: string; name: string; text: string; action: "offer" | "join" | "out" | "improve" | "hold" | "withdraw"; offer: Offer | null }
    | { type: "founder_choice"; offers: Offer[]; can_counter: boolean; wait_s: number; expires_at?: number }
    | { type: "founder_deal"; action: "accept" | "counter" | "walk"; offer: Offer | null }
    | { type: "counter_reply"; speaker: string; name: string; text: string; action: "accept" | "revise" | "hold" | "out"; offer: Offer | null }
    | { type: "deal"; outcome: "deal" | "no_deal"; reason: DealReason; offer: Offer | null }
    | { type: "founder_turn"; wait_s: number; expires_at?: number }
    | { type: "clock"; wait_s: number; expires_at: number }
    | { type: "founder"; round: number; text: string }
    | { type: "founder_skipped"; round: number }
    | { type: "reaction"; round: number; persona_id: string; vote: Vote; comment: string; would_pay: boolean; changed: boolean }
    | ({ type: "tally"; round: number } & Tally)
    | { type: "fetching"; url: string }
    | { type: "page"; url: string; title: string; description: string; headings: string[] }
    | { type: "review"; roaster: string; name: string; title: string; review: Review }
    | { type: "notice"; text: string }
    | { type: "judging" }
    | { type: "verdict"; verdict?: SharkVerdict | RoastVerdict; summary?: JantaSummary; tally?: Tally; segments?: Segments; averages?: Scores }
    | { type: "error"; message: string }
    | { type: "done"; demo?: boolean; tokens?: number; crowd_model?: string; judge_model?: string }
  );

type Of<T extends RunEvent["type"]> = Extract<RunEvent, { type: T }>;

/** Strips internal details (token counts, model names, provider error text) before anything is shown or stored. */
export function sanitizeEvent(e: RunEvent): RunEvent {
  if (e.type === "done") {
    return { id: e.id, type: "done", demo: e.demo ?? e.crowd_model === "fake" };
  }
  if (e.type === "error" && e.message.startsWith("The AI provider failed")) {
    return { ...e, message: "The AI provider had a problem and couldn't finish this run." };
  }
  if (e.type === "start" && e.crowd) {
    return { ...e, crowd: e.crowd.map((p) => ({ ...p, model: undefined })) };
  }
  return e;
}

export type FeedItem =
  | ({ kind: "message" } & Of<"message">)
  | { kind: "founder"; id: number; round: number; text: string }
  | { kind: "notice"; id: number; text: string };

export type TableItem =
  | Of<"offer">
  | Of<"counter_reply">
  | Of<"founder_deal">
  | { type: "notice"; id: number; text: string };

export type Reaction = Of<"reaction">;

export type RunState = {
  // shared
  judging: boolean;
  done: boolean;
  demo: boolean;
  error: string | null;
  notices: string[];
  verdictEvent: Of<"verdict"> | null;
  // sharks
  panel: PanelMember[];
  totalRounds: number;
  round: number;
  rounds: { round: number; items: FeedItem[] }[];
  typing: { speaker: string; name: string } | null;
  founderTurn: { id: number; waitS: number; expiresAt: number | null } | null;
  ask: Ask | null;
  table: TableItem[] | null; // null until the sharks start making offers
  choice: Of<"founder_choice"> | null; // offers waiting for the founder
  deal: Of<"deal"> | null;
  // janta
  size: number;
  asked: number;
  askedThisRound: number;
  crowd: Map<string, CrowdMember>;
  feed: Reaction[];
  latest: Map<string, Reaction>;
  tally: Tally | null;
  // roast
  page: Of<"page"> | null;
  reviews: Of<"review">[];
};

export function deriveRun(events: RunEvent[]): RunState {
  const s: RunState = {
    judging: false, done: false, demo: false, error: null, notices: [], verdictEvent: null,
    panel: [], totalRounds: 0, round: 0, rounds: [], typing: null, founderTurn: null,
    ask: null, table: null, choice: null, deal: null,
    size: 0, asked: 0, askedThisRound: 0, crowd: new Map(), feed: [], latest: new Map(), tally: null,
    page: null, reviews: [],
  };
  const currentRound = () => {
    if (s.rounds.length === 0) s.rounds.push({ round: 1, items: [] });
    return s.rounds[s.rounds.length - 1];
  };

  for (const e of events) {
    switch (e.type) {
      case "start":
        s.panel = e.panel ?? [];
        s.totalRounds = e.rounds ?? 0;
        s.ask = e.ask ?? null;
        s.size = e.size ?? 0;
        for (const p of e.crowd ?? []) s.crowd.set(p.id, p);
        break;
      case "round":
        s.round = e.round;
        s.asked = e.asked ?? 0;
        s.askedThisRound = 0;
        s.rounds.push({ round: e.round, items: [] });
        break;
      case "typing":
        s.typing = { speaker: e.speaker, name: e.name };
        break;
      case "message":
        s.typing = null;
        currentRound().items.push({ kind: "message", ...e });
        break;
      case "founder_turn":
        s.typing = null;
        s.founderTurn = { id: e.id, waitS: e.wait_s, expiresAt: e.expires_at ?? null };
        break;
      case "clock": // a voice run's wait was restarted
        if (s.founderTurn) s.founderTurn = { ...s.founderTurn, expiresAt: e.expires_at };
        if (s.choice) s.choice = { ...s.choice, expires_at: e.expires_at };
        break;
      case "founder":
        s.founderTurn = null;
        currentRound().items.push({ kind: "founder", id: e.id, round: e.round, text: e.text });
        break;
      case "founder_skipped":
        s.founderTurn = null;
        break;
      case "offers_open":
        s.table = [];
        s.founderTurn = null;
        break;
      case "offer":
      case "counter_reply":
        s.typing = null;
        s.table?.push(e);
        break;
      case "founder_choice":
        s.typing = null;
        s.choice = e;
        break;
      case "founder_deal":
        s.choice = null;
        s.table?.push(e);
        break;
      case "deal":
        s.typing = null;
        s.choice = null;
        s.deal = e;
        break;
      case "reaction":
        s.feed.push(e);
        s.latest.set(e.persona_id, e);
        s.askedThisRound++;
        break;
      case "tally":
        s.tally = e;
        break;
      case "page":
        s.page = e;
        break;
      case "review":
        s.reviews.push(e);
        break;
      case "notice":
        s.typing = null;
        s.notices.push(e.text);
        if (s.table) s.table.push(e);
        else if (s.rounds.length) currentRound().items.push({ kind: "notice", id: e.id, text: e.text });
        break;
      case "judging":
        s.choice = null;
        s.judging = true;
        s.typing = null;
        s.founderTurn = null;
        break;
      case "verdict":
        s.verdictEvent = e;
        s.judging = false;
        break;
      case "error":
        s.choice = null;
        s.error = e.message;
        s.typing = null;
        s.founderTurn = null;
        s.judging = false;
        break;
      case "done":
        s.choice = null;
        s.done = true;
        s.demo = !!e.demo;
        s.typing = null;
        s.founderTurn = null;
        break;
    }
  }
  return s;
}
