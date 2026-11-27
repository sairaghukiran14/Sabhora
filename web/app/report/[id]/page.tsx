import type { Metadata } from "next";
import NextLink from "next/link";
import { notFound } from "next/navigation";
import { getRun } from "@/lib/dal";
import { deriveRun } from "@/lib/events";
import { ROOMS } from "@/lib/pricing";
import { ArrowLeft } from "@/components/icons";
import { formatDate } from "@/components/ui";
import PrintButton from "@/components/report/PrintButton";
import SharksReport from "@/components/report/SharksReport";
import JantaReport from "@/components/report/JantaReport";
import RoastReport from "@/components/report/RoastReport";

export const metadata: Metadata = { title: "Report · Sabhora", robots: { index: false } };

const TITLE = { sharks: "Investor panel report", janta: "Janta crowd report", roast: "Landing page roast report" } as const;
const REPORT = { sharks: SharksReport, janta: JantaReport, roast: RoastReport } as const;

const CAVEAT = {
  sharks: "The investors are fictional AI characters. The score and decision are AI judgement and don't predict whether a business will raise money. Figures in the discussion may be wrong: check them before using them.",
  janta: "The people are fictional AI personas, not survey respondents. Votes and 'would pay' figures are simulated reactions, not a demand forecast, and identical runs can vote differently. Use the objections as questions to test with real customers.",
  roast: "The reviewers are fictional AI personas that read the page's text. Scores are AI judgement. Check each suggested fix against the live page.",
} as const;

/** One finished run as a document. Owner only: getRun reads just the signed-in user's runs. */
export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = await getRun(id);
  if (!run || run.status !== "done") notFound();
  const state = deriveRun(run.events);
  if (!state.verdictEvent) notFound();
  const Body = REPORT[run.mode];
  const slug = run.title.replace(/[^\p{L}\p{M}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 40);
  const input = run.input;

  return (
    <div className="min-h-dvh bg-neutral-200 py-6 print:bg-white print:py-0">
      {/* paper margins, and keep bar and table colours when printing */}
      <style>{`@page { size: A4; margin: 14mm; } @media print { html, body { background: #fff !important; } * { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }`}</style>
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 print:hidden">
        <NextLink href={`/dashboard/runs/${run.id}`} className="inline-flex items-center gap-1.5 text-sm text-neutral-700 hover:text-black">
          <ArrowLeft size={16} /> Back to the run
        </NextLink>
        <PrintButton fileName={`Sabhora-${run.mode}-report-${slug}`} />
      </div>
      <p className="mx-auto mt-2 max-w-3xl px-4 text-[13px] text-neutral-700 print:hidden">In the window that opens, choose &quot;Save as PDF&quot;.</p>

      <article className="mx-auto mt-4 max-w-3xl break-words bg-white p-5 text-neutral-900 shadow sm:p-10 print:mt-0 print:max-w-none print:p-0 print:shadow-none">
        <header>
          <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-neutral-600">Sabhora by Neevora Labs · {TITLE[run.mode]}</p>
          <h1 className="mt-2 text-2xl font-semibold leading-tight">{run.title}</h1>
          <p className="mt-1 text-[13px] text-neutral-600">
            {formatDate(run.createdAt, true)} · {ROOMS[run.mode].name}
            {run.panelSize ? ` · ${run.panelSize} people` : ""}
          </p>
        </header>

        {run.demo && <p className="mt-4 rounded-lg border-2 border-dashed border-neutral-500 p-3 text-sm font-semibold">Demo AI: this report holds placeholder text, not real analysis.</p>}
        <p className="mt-4 rounded-lg border border-neutral-300 bg-neutral-100 p-3 text-[13px] leading-relaxed">AI-generated simulation, not advice. {CAVEAT[run.mode]}</p>

        {run.mode !== "roast" && (
          <div className="mt-5">
            <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-neutral-600">Your pitch</p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{input.idea}</p>
            {(input.customer || input.price) && (
              <p className="mt-1 text-[13px] text-neutral-600">{[input.customer && `For ${input.customer}`, input.price && `Priced at ${input.price}`].filter(Boolean).join(" · ")}</p>
            )}
          </div>
        )}

        <Body state={state} />
      </article>
    </div>
  );
}
