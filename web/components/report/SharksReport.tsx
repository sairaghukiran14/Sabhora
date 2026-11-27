import type { Offer, RunState, SharkVerdict, Stance } from "@/lib/events";
import { money } from "@/lib/money";
import { Figures, Points, Section, Table } from "./parts";

const STANCE: Record<Stance, string> = { invest: "Invest", maybe: "Maybe", pass: "Pass" };
const DECISION: Record<Stance, string> = { invest: "Would invest", maybe: "On the fence", pass: "Would pass" };

function terms(o: Offer): string {
  return [
    o.investment_lakh > 0 && `${money(o.investment_lakh)} for ${o.equity_pct}%`,
    o.debt_lakh > 0 && `${money(o.debt_lakh)} debt at ${o.debt_interest_pct}% a year`,
    o.royalty_pct > 0 && `${o.royalty_pct}% royalty until ${money(o.royalty_until_lakh)} is repaid`,
    o.valuation_lakh ? `values the company at ${money(o.valuation_lakh)}` : false,
  ]
    .filter(Boolean)
    .join(", ");
}

export default function SharksReport({ state }: { state: RunState }) {
  const v = state.verdictEvent!.verdict as SharkVerdict;
  const rounds = state.rounds.filter((r) => r.items.length > 0);
  const investing = v.votes.filter((x) => x.stance === "invest").length;
  const deal = state.deal;

  // Where each shark stood after each round, counted from what they said.
  const standing = state.panel.map((p) => [
    p.name,
    ...rounds.map((r) => {
      const said = r.items.flatMap((i) => (i.kind === "message" && i.speaker === p.id ? [i] : [])).at(-1);
      return said ? (said.out ? "Went out" : STANCE[said.stance]) : "-";
    }),
  ]);

  return (
    <>
      <p className="mt-5 text-[15px] leading-relaxed">{v.one_liner}</p>
      <Figures
        items={[
          { label: "Score (AI judgement)", value: `${v.score}/10` },
          { label: "Panel", value: DECISION[v.decision] },
          { label: "Deal", value: deal ? (deal.outcome === "deal" ? "Deal made" : "No deal") : "No deal table" },
          { label: "Investors in", value: `${investing} of ${v.votes.length}` },
        ]}
      />
      {state.ask && (
        <p className="mt-3 text-sm">
          Your ask: {money(state.ask.investment_lakh)} for {state.ask.equity_pct}%, valuing the company at {money(state.ask.valuation_lakh)}.
        </p>
      )}
      {deal?.outcome === "deal" && deal.offer && (
        <p className="mt-1 text-sm">
          Practice deal with {deal.offer.names.join(" and ")}: {terms(deal.offer)}. No money or equity changes hands.
        </p>
      )}

      <Section title="Biggest risks">
        <Points items={v.top_risks} />
      </Section>
      <Section title="Next steps">
        <Points items={v.next_steps} />
      </Section>
      <Section title="Each investor's position">
        <Table head={["Investor", "Final", "Reason"]} rows={v.votes.map((x) => [x.shark, STANCE[x.stance], x.reason])} />
      </Section>
      {rounds.length > 0 && (
        <Section title="How positions moved">
          <Table head={["Investor", ...rounds.map((r) => `Round ${r.round}`)]} rows={standing} />
        </Section>
      )}
    </>
  );
}
