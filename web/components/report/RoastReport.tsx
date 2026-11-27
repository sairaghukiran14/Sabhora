import type { RoastVerdict, RunState } from "@/lib/events";
import { Figures, Points, Section, Table } from "./parts";

export default function RoastReport({ state }: { state: RunState }) {
  const v = state.verdictEvent!.verdict as RoastVerdict;
  const a = state.verdictEvent!.averages;

  return (
    <>
      <p className="mt-5 text-[15px] leading-relaxed">{v.one_liner}</p>
      <Figures
        items={[
          { label: "Overall (AI judgement)", value: `${v.overall}/10` },
          ...(a
            ? [
                { label: "Clarity (average)", value: a.clarity.toFixed(1) },
                { label: "Trust (average)", value: a.trust.toFixed(1) },
                { label: "Call to action (average)", value: a.cta.toFixed(1) },
                { label: "Design (from text only)", value: a.design.toFixed(1) },
              ]
            : []),
        ]}
      />
      <p className="mt-3 text-sm text-neutral-600">The reviewers read the page&apos;s text. They did not see it, so the design score is not a visual review.</p>

      <Section title="Fix these first">
        <Points items={v.top_fixes} />
      </Section>
      {state.page && (
        <Section title="What the reviewers read">
          <p className="break-all text-sm">{state.page.url}</p>
          <p className="mt-1 text-sm font-semibold">{state.page.title}</p>
          {state.page.description && <p className="mt-1 text-sm">{state.page.description}</p>}
          {state.page.headings.length > 0 && <p className="mt-1 text-[13px] text-neutral-600">Headings: {state.page.headings.join(" · ")}</p>}
        </Section>
      )}
      <Section title={`Scores from ${state.reviews.length} ${state.reviews.length === 1 ? "reviewer" : "reviewers"}`}>
        <Table
          head={["Reviewer", "Clarity", "Trust", "Design", "Call to action"]}
          rows={state.reviews.map((r) => [r.name, r.review.clarity, r.review.trust, r.review.design, r.review.cta])}
        />
      </Section>
    </>
  );
}
