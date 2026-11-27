import type { RunState } from "@/lib/events";
import { Figures, Points, Section, Table } from "./parts";

const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);

export default function JantaReport({ state }: { state: RunState }) {
  const summary = state.verdictEvent!.summary!;
  const tally = state.verdictEvent!.tally!;
  const segments = state.verdictEvent!.segments ?? {};

  const missing = Math.max(0, state.size - tally.total);

  return (
    <>
      <p className="mt-5 text-[15px] leading-relaxed">{summary.headline}</p>
      <Figures
        items={[
          { label: "Agree", value: `${tally.agree} of ${tally.total}` },
          { label: "Unsure", value: String(tally.neutral) },
          { label: "Disagree", value: String(tally.disagree) },
          { label: "Said they would pay (simulated)", value: `${tally.would_pay_pct}%` },
        ]}
      />
      {missing > 0 && (
        <p className="mt-3 text-sm">
          {missing} of the {state.size} people didn&apos;t answer, so they aren&apos;t counted.
        </p>
      )}
      {state.notices.map((n, i) => (
        <p key={i} className="mt-2 text-sm text-neutral-600">
          {n}
        </p>
      ))}

      <Section title="Why people disagreed">
        <Points items={summary.reasons_against ?? []} empty="Nobody voted disagree." />
      </Section>
      <Section title="Why people agreed">
        <Points items={summary.reasons_for ?? []} empty="Nobody voted agree." />
      </Section>
      <Section title="What the crowd suggests">
        <Points items={summary.advice ?? []} />
      </Section>
      {Object.entries(segments).map(([title, groups]) => (
        <Section key={title} title={`By ${title.toLowerCase()}`}>
          <Table
            head={["Group", "People", "Agree", "Unsure", "Disagree", "Would pay"]}
            rows={Object.entries(groups).map(([label, g]) => [label, g.n, g.agree, g.neutral, g.disagree, `${g.would_pay} (${pct(g.would_pay, g.n)}%)`])}
          />
        </Section>
      ))}
    </>
  );
}
