import { Suspense } from "react";
import NextLink from "next/link";
import SiteNav from "@/components/marketing/SiteNav";
import IdeaCapture from "@/components/marketing/IdeaCapture";
import StickyCta from "@/components/marketing/StickyCta";
import Faq from "@/components/marketing/Faq";
import Footer from "@/components/marketing/Footer";
import AccountNotice from "@/components/marketing/AccountNotice";
import { JantaMock, PersonaMarquee, RoastMock, SharksMock } from "@/components/marketing/Mocks";
import LiveShark from "@/components/LiveShark";
import Reveal from "@/components/Reveal";
import {
  Arrow, Check, Coins, Key, Languages, Link, Lock, Message, Minus, Sharks, Target, Users, X,
} from "@/components/icons";
import { btn, Container, cx, RoomBadge, SectionHeader } from "@/components/ui";
import { PLANS } from "@/lib/pricing";
import type { RoomMode } from "@/lib/types";

const stats = [
  { v: "3", l: "investor rounds per pitch" },
  { v: "100", l: "personas in a single crowd" },
  { v: "6", l: "reviewers on your landing page" },
  { v: "~2 min", l: "from idea to verdict" },
];

const pains = [
  { Icon: Users, t: "Friends are too polite", d: "The people who love you will never tell you the idea is weak. That's how founders lose a year." },
  { Icon: Target, t: "Surveys hide who will pay", d: "“Sounds interesting” isn't a purchase. You need to know which customers actually reach for their wallet." },
  { Icon: Sharks, t: "Investors rarely say why", d: "A polite pass teaches you nothing. You need the hard questions before the meeting, not after it." },
];

const features: {
  mode: RoomMode;
  title: string;
  body: string;
  points: string[];
  Mock: (p: { compact?: boolean }) => React.ReactNode;
}[] = [
  {
    mode: "sharks",
    title: "Pitch to five investors who don't hold back",
    body: "A brand builder, a deep-tech VC, a Bharat angel, a bootstrapper and a factory operator, all invented characters. Name your ask, answer them over three rounds, then take an offer, counter it or walk away.",
    points: ["Sharks can say I'm out, team up or outbid each other", "A score out of 10, with the reasoning first", "Top risks plus a 30-day action plan"],
    Mock: SharksMock,
  },
  {
    mode: "janta",
    title: "See how 100 simulated Indian personas would react",
    body: "Janta is a crowd of hand-written personas across city tiers, ages and jobs. They react and say whether they'd pay, in English, Hinglish and Hindi. These are simulated opinions, not surveys: use them to surface objections, then test with real customers.",
    points: ["Crowds of 25, 50 or 100", "Reactions by city tier and age", "Quotes to take to real customer conversations"],
    Mock: JantaMock,
  },
  {
    mode: "roast",
    title: "Get your landing page roasted before launch",
    body: "Paste a URL. Six reviewers (among them a tech YouTuber, a brand strategist, an indie hacker and a retired teacher, Sunita Aunty) score clarity, trust, design and call to action, then name the exact fixes.",
    points: ["Scores across four conversion basics", "Blunt, specific comments from six angles", "A ranked fix list you can ship today"],
    Mock: RoastMock,
  },
];

const extras = [
  { Icon: Link, t: "Shareable verdicts", d: "Send a read-only link to your co-founder or mentor in one tap." },
  { Icon: Message, t: "Answer back", d: "Reply to the Sharks between rounds, then follow up with anyone after the verdict." },
  { Icon: Languages, t: "Speaks like India", d: "Personas answer in English, Hinglish and Hindi, the way your users talk." },
  { Icon: Coins, t: "Pay only for results", d: "Credits are charged for finished runs. A failed run never costs you." },
  { Icon: Key, t: "Bring your own key", d: "On Pro, plug in your own model key and skip model costs entirely." },
  { Icon: Lock, t: "Private by default", d: "Your ideas stay yours. Nothing is shared unless you share it." },
];

const steps = [
  { t: "Describe your idea", d: "One or two sentences is enough. Add who it's for and your price if you know them." },
  { t: "Pick a room", d: "Sharks for investor scrutiny, Janta for customer demand, Roast for your landing page." },
  { t: "Get your verdict", d: "Watch the room debate live, then get a score, the risks, and what to do next." },
];

type Cell = boolean | "partial" | string;
const compare: { label: string; cells: [Cell, Cell, Cell, Cell] }[] = [
  { label: "Time to an answer", cells: ["About 2 minutes", "Days", "1–2 weeks", "3–4 weeks"] },
  { label: "Honest, critical feedback", cells: [true, false, "partial", true] },
  { label: "Shows who would actually pay", cells: [true, false, "partial", "partial"] },
  { label: "Investor-level questions", cells: [true, false, false, false] },
  { label: "Landing page review", cells: [true, false, false, false] },
  { label: "Cost", cells: ["From ₹5 a run", "Free, but biased", "₹₹", "₹₹₹₹"] },
];
const compareCols = ["Sabhora", "Asking friends", "Online surveys", "Focus groups"];

const faqs = [
  { q: "Are the personas real people?", a: "No. They're AI personas on hand-written profiles across Indian city tiers, ages and jobs. They are not based on survey data. Treat their replies as starting points for conversations with real customers, not as market research." },
  { q: "Can I trust an AI verdict?", a: "No. Treat it as a way to surface questions, risks and objections you may not have considered. It does not predict whether people will buy. Our own tests show that one persona's vote is unsteady and that overall support leans on persona traits, so don't read the counts as market signal. Validate the important objections with real customers." },
  { q: "How much does a run cost?", a: "Everything is priced in credits, and 1 credit is roughly ₹1. A Roast is 5 credits, a Sharks debate is 15, and a Janta crowd is 10 to 30 depending on size. You get 50 free credits when you sign up." },
  { q: "Do I need a credit card to start?", a: "No. Sign up with your email, get 50 credits, and run your first verdict right away. You only pay when you want more credits or a bigger plan." },
  { q: "Is my idea kept private?", a: "Runs are visible only to you. To write the debate, your pitch or page is sent to the AI providers we use. If you share a verdict, it gets a read-only link you can switch off at any time, and deleting a run erases it." },
  { q: "What languages do the personas speak?", a: "English, Hinglish and Hindi. Janta personas reply the way people across India actually talk, so the quotes feel real." },
  { q: "Can I cancel a plan?", a: "Any time, from Billing. You keep your plan until the end of the period and your unused credits stay in your account." },
];

function CellValue({ v, strong }: { v: Cell; strong?: boolean }) {
  if (v === true)
    return (
      <span className={cx("inline-flex h-6 w-6 items-center justify-center rounded-full", strong ? "bg-brand text-white" : "bg-success-soft text-success-ink")}>
        <Check size={14} strokeWidth={2.5} />
      </span>
    );
  if (v === false)
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-ink/5 text-faint">
        <X size={13} />
      </span>
    );
  if (v === "partial")
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent-soft text-accent-ink">
        <Minus size={13} />
      </span>
    );
  return <span className={cx("text-sm", strong ? "font-medium text-brand-ink" : "text-muted")}>{v}</span>;
}

export default function Home() {
  return (
    <>
      <SiteNav />
      <Suspense>
        <AccountNotice />
      </Suspense>
      <main id="top" className="flex-1 overflow-x-clip">
        {/* ================= Hero ================= */}
        <section className="relative">
          <div aria-hidden className="hero-glow pointer-events-none absolute inset-0 -z-10" />
          <div aria-hidden className="paper-grid pointer-events-none absolute inset-0 -z-10" />
          <Container className="pb-12 pt-10 text-center sm:pb-16 sm:pt-16 lg:pt-20">
            <div className="fade-up">
              <a
                href="#features"
                className="inline-flex max-w-full items-center gap-2 rounded-full border border-edge bg-surface/80 py-1 pl-1 pr-3 text-[13px] text-muted shadow-soft backdrop-blur transition-colors hover:border-edge-strong"
              >
                <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent-ink">New</span>
                <span className="truncate">Answer the sharks between rounds</span>
                <Arrow size={14} className="shrink-0" />
              </a>
            </div>
            <div className="fade-up" style={{ animationDelay: "90ms" }}>
              <h1 className="mx-auto mt-6 max-w-4xl text-balance font-display text-[clamp(2.4rem,7.2vw,4.9rem)] leading-[1.02] tracking-[-0.035em]">
                Hear the doubts before you build,{" "}
                <span className="bg-gradient-to-r from-brand-ink to-[#7c3aed] bg-clip-text text-transparent">not after.</span>
              </h1>
            </div>
            <div className="fade-up" style={{ animationDelay: "140ms" }}>
              <p className="mx-auto mt-5 max-w-2xl text-pretty text-[17px] leading-relaxed text-muted sm:text-xl">
                Pitch to AI investors, hear from up to 100 simulated Indian personas, and get your landing page critiqued. A fast way to surface objections to test with real people.
              </p>
            </div>
            <div className="fade-up mx-auto mt-8 max-w-2xl" style={{ animationDelay: "190ms" }}>
              <IdeaCapture />
            </div>
            <div className="fade-up" style={{ animationDelay: "240ms" }}>
              <ul className="mx-auto mt-6 flex max-w-2xl flex-wrap justify-center gap-x-5 gap-y-2 text-[13px] text-muted">
                {["50 free credits", "No card needed", "Private by default"].map((t) => (
                  <li key={t} className="flex items-center gap-1.5">
                    <Check size={15} className="text-success" /> {t}
                  </li>
                ))}
              </ul>
            </div>
          </Container>

          {/* product showcase: all three rooms at a glance */}
          <Container className="pb-16 sm:pb-24">
            <div className="fade-up" style={{ animationDelay: "140ms" }}>
              <div className="grid items-start gap-4 sm:gap-5 lg:grid-cols-[1.15fr_1fr]">
                <LiveShark />
                <div className="grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-1">
                  <JantaMock compact />
                  <RoastMock compact />
                </div>
              </div>
            </div>
          </Container>
          <div id="hero-end" aria-hidden />
        </section>

        {/* ================= Persona marquee + stats ================= */}
        <section className="border-y border-edge bg-surface py-10 sm:py-14">
          <Container>
            <p className="text-center text-[13px] font-medium text-muted">
              Your Janta crowd: real segments from metros to tier-3 towns
            </p>
          </Container>
          <div className="mt-6">
            <PersonaMarquee />
          </div>
          <Container>
            <dl className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-edge bg-edge md:grid-cols-4">
              {stats.map((s) => (
                <div key={s.l} className="bg-surface px-4 py-6 text-center sm:px-6">
                  <dt className="sr-only">{s.l}</dt>
                  <dd className="font-display text-[clamp(1.75rem,4vw,2.5rem)] font-medium leading-none tracking-tight">{s.v}</dd>
                  <dd className="mt-2 text-[13px] leading-snug text-muted">{s.l}</dd>
                </div>
              ))}
            </dl>
          </Container>
        </section>

        {/* ================= Problem ================= */}
        <section className="py-16 sm:py-24">
          <Container>
            <Reveal>
              <SectionHeader
                center
                eyebrow="The problem"
                title="Most ideas don't fail on code. They fail because nobody wanted them."
                sub="Founders spend months building, then learn the truth at launch. The feedback that could have saved them was hard to get honestly, quickly, or cheaply."
              />
            </Reveal>
            <div className="mt-12 grid gap-4 md:grid-cols-3 md:gap-5">
              {pains.map((p, i) => (
                <Reveal key={p.t} delay={i * 0.07}>
                  <div className="h-full rounded-2xl border border-edge bg-surface p-6 shadow-soft">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-danger-soft text-danger">
                      <p.Icon size={21} />
                    </span>
                    <h3 className="mt-4 font-display text-lg">{p.t}</h3>
                    <p className="mt-2 text-[15px] leading-relaxed text-muted">{p.d}</p>
                  </div>
                </Reveal>
              ))}
            </div>
            <Reveal>
              <p className="mx-auto mt-10 max-w-xl text-balance text-center font-display text-xl leading-snug sm:text-2xl">
                Sabhora gives you all three perspectives{" "}
                <span className="text-brand-ink">before you write a line of code.</span>
              </p>
            </Reveal>
          </Container>
        </section>

        {/* ================= Features ================= */}
        <section id="features" className="scroll-mt-20 border-t border-edge bg-surface py-16 sm:py-24">
          <Container>
            <Reveal>
              <SectionHeader
                eyebrow="Three rooms"
                title="Every angle of your idea, tested in one place"
                sub="Run one room or all three. Each one surfaces a different kind of objection to check with real people."
              />
            </Reveal>

            <div className="mt-14 space-y-20 sm:space-y-28">
              {features.map((f, i) => (
                <div key={f.mode} className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
                  <Reveal className={cx(i % 2 === 1 && "lg:order-2")}>
                    <RoomBadge mode={f.mode}>
                      {f.mode === "sharks" ? "Sharks" : f.mode === "janta" ? "Janta" : "Roast"}
                    </RoomBadge>
                    <h3 className="mt-4 text-balance font-display text-[clamp(1.6rem,3.4vw,2.25rem)] leading-tight tracking-tight">
                      {f.title}
                    </h3>
                    <p className="mt-4 text-[16px] leading-relaxed text-muted sm:text-[17px]">{f.body}</p>
                    <ul className="mt-6 space-y-3">
                      {f.points.map((p) => (
                        <li key={p} className={`room-${f.mode} flex items-start gap-3 text-[15px]`}>
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-mode-soft text-mode-ink">
                            <Check size={12} strokeWidth={2.5} />
                          </span>
                          {p}
                        </li>
                      ))}
                    </ul>
                    <NextLink
                      href={`/signup?next=${encodeURIComponent(`/dashboard/new?room=${f.mode}`)}`}
                      className={btn("primary", "md", "group mt-8")}
                    >
                      Try {f.mode === "sharks" ? "Sharks" : f.mode === "janta" ? "Janta" : "Roast"} free
                      <Arrow size={16} className="transition-transform group-hover:translate-x-0.5" />
                    </NextLink>
                  </Reveal>
                  <Reveal delay={0.1} className={cx("mx-auto w-full max-w-lg", i % 2 === 1 && "lg:order-1")}>
                    <f.Mock />
                  </Reveal>
                </div>
              ))}
            </div>
          </Container>
        </section>

        {/* ================= Extras bento ================= */}
        <section className="py-16 sm:py-24">
          <Container>
            <Reveal>
              <SectionHeader eyebrow="Built for founders" title="Everything around the verdict, handled" center />
            </Reveal>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {extras.map((e, i) => (
                <Reveal key={e.t} delay={(i % 3) * 0.06}>
                  <div className="group h-full rounded-2xl border border-edge bg-surface p-6 shadow-soft transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-card">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-soft text-brand-ink transition-transform duration-300 group-hover:scale-110">
                      <e.Icon size={20} />
                    </span>
                    <h3 className="mt-4 font-display text-lg">{e.t}</h3>
                    <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{e.d}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </Container>
        </section>

        {/* ================= How it works ================= */}
        <section id="how" className="scroll-mt-20 border-y border-edge bg-surface py-16 sm:py-24">
          <Container>
            <Reveal>
              <SectionHeader center eyebrow="How it works" title="From idea to verdict in three steps" />
            </Reveal>
            <ol className="relative mt-12 grid gap-8 md:grid-cols-3 md:gap-6">
              <span aria-hidden className="absolute left-[16%] right-[16%] top-6 hidden h-px bg-gradient-to-r from-transparent via-edge-strong to-transparent md:block" />
              {steps.map((s, i) => (
                <Reveal key={s.t} delay={i * 0.08}>
                  <li className="relative flex gap-4 md:flex-col md:items-center md:text-center">
                    <span className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-edge bg-bg font-display text-lg font-medium text-brand-ink shadow-soft">
                      {i + 1}
                    </span>
                    <div>
                      <h3 className="font-display text-lg md:mt-4">{s.t}</h3>
                      <p className="mt-1.5 text-[15px] leading-relaxed text-muted md:mx-auto md:max-w-xs">{s.d}</p>
                    </div>
                  </li>
                </Reveal>
              ))}
            </ol>
            <Reveal>
              <div className="mt-12 flex justify-center">
                <NextLink href="/signup" className={btn("brand", "lg", "w-full sm:w-auto")}>
                  Start with 50 free credits <Arrow size={18} />
                </NextLink>
              </div>
            </Reveal>
          </Container>
        </section>

        {/* ================= Comparison ================= */}
        <section className="py-16 sm:py-24">
          <Container>
            <Reveal>
              <SectionHeader center eyebrow="Why Sabhora" title="Faster than a focus group. More honest than your friends." />
            </Reveal>

            {/* desktop / tablet table */}
            <Reveal>
              <div className="mt-12 hidden overflow-hidden rounded-2xl border border-edge bg-surface shadow-soft md:block">
                <table className="w-full table-fixed text-left">
                  <thead>
                    <tr className="border-b border-edge">
                      <th className="w-[28%] px-5 py-4 text-[13px] font-medium text-muted" scope="col">
                        <span className="sr-only">Criteria</span>
                      </th>
                      {compareCols.map((c, i) => (
                        <th
                          key={c}
                          scope="col"
                          className={cx("px-4 py-4 text-center text-sm font-medium", i === 0 ? "bg-brand-soft text-brand-ink" : "text-muted")}
                        >
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {compare.map((row) => (
                      <tr key={row.label} className="border-b border-edge last:border-0">
                        <th scope="row" className="px-5 py-4 text-sm font-medium">
                          {row.label}
                        </th>
                        {row.cells.map((c, i) => (
                          <td key={i} className={cx("px-4 py-4 text-center", i === 0 && "bg-brand-soft/60")}>
                            <CellValue v={c} strong={i === 0} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Reveal>

            {/* mobile: one card per criterion */}
            <div className="mt-10 space-y-3 md:hidden">
              {compare.map((row) => (
                <div key={row.label} className="rounded-2xl border border-edge bg-surface p-4">
                  <p className="text-sm font-medium">{row.label}</p>
                  <dl className="mt-3 grid grid-cols-2 gap-2">
                    {row.cells.map((c, i) => (
                      <div
                        key={i}
                        className={cx("flex flex-col gap-1.5 rounded-xl px-3 py-2.5", i === 0 ? "bg-brand-soft" : "bg-bg")}
                      >
                        <dt className={cx("text-[11px]", i === 0 ? "font-medium text-brand-ink" : "text-muted")}>{compareCols[i]}</dt>
                        <dd>
                          <CellValue v={c} strong={i === 0} />
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
          </Container>
        </section>

        {/* ================= Pricing ================= */}
        <section id="pricing" className="scroll-mt-20 border-y border-edge bg-surface py-16 sm:py-24">
          <Container>
            <Reveal>
              <SectionHeader
                center
                eyebrow="Pricing"
                title="Start free. Pay only for verdicts you get."
                sub="Every run is priced in credits (1 credit ≈ ₹1). A failed run is never charged. Pay in rupees with UPI or cards."
              />
            </Reveal>
            <div className="mt-12 grid gap-5 lg:grid-cols-3">
              {PLANS.map((p, i) => (
                <Reveal key={p.id} delay={i * 0.07}>
                  <div
                    className={cx(
                      "relative flex h-full flex-col rounded-[22px] border bg-bg p-6 sm:p-7",
                      p.featured ? "border-brand shadow-card ring-4 ring-brand/10" : "border-edge",
                    )}
                  >
                    {p.featured && (
                      <span className="absolute -top-3 left-6 rounded-full bg-brand px-3 py-1 text-xs font-medium text-white">
                        Most popular
                      </span>
                    )}
                    <h3 className="font-display text-xl">{p.name}</h3>
                    <p className="mt-1 text-sm text-muted">{p.blurb}</p>
                    <p className="mt-5 flex items-baseline gap-1.5">
                      <span className="font-display text-[2.6rem] font-medium leading-none tracking-tight">{p.price}</span>
                      <span className="text-sm text-faint">{p.period}</span>
                    </p>
                    <ul className="mt-6 flex-1 space-y-3">
                      {p.features.map((f) => (
                        <li key={f} className="flex items-start gap-2.5 text-[15px]">
                          <Check size={17} className="mt-0.5 shrink-0 text-success" /> {f}
                        </li>
                      ))}
                    </ul>
                    <NextLink
                      href={p.id === "free" ? "/signup" : `/signup?next=${encodeURIComponent("/dashboard/billing")}`}
                      className={btn(p.featured ? "brand" : "secondary", "lg", "mt-8 w-full")}
                    >
                      {p.cta}
                    </NextLink>
                  </div>
                </Reveal>
              ))}
            </div>
            <Reveal>
              <div className="mx-auto mt-8 flex max-w-3xl flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-edge-strong px-5 py-4 text-sm text-muted sm:flex-row sm:gap-6">
                <span className="font-medium text-ink">Cost per run</span>
                <span className="flex flex-wrap justify-center gap-x-5 gap-y-1">
                  <span>Roast · 5</span>
                  <span>Sharks · 15</span>
                  <span>Janta · 10 to 30</span>
                </span>
              </div>
            </Reveal>
          </Container>
        </section>

        {/* ================= FAQ ================= */}
        <section id="faq" className="scroll-mt-20 py-16 sm:py-24">
          <Container className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
            <Reveal>
              <SectionHeader eyebrow="FAQ" title="Questions founders ask us" sub="Can't find your answer? The fastest way to understand it is to run your first verdict free." />
              <NextLink href="/signup" className={btn("secondary", "md", "mt-6")}>
                Try it free <Arrow size={16} />
              </NextLink>
            </Reveal>
            <Reveal delay={0.05}>
              <Faq items={faqs} />
            </Reveal>
          </Container>
        </section>

        {/* ================= Final CTA ================= */}
        <section id="final-cta" className="pb-16 sm:pb-24">
          <Container>
            <Reveal>
              <div className="relative overflow-hidden rounded-[28px] bg-[#312e81] px-5 py-12 text-center sm:px-12 sm:py-16">
                <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-[#6366f1] opacity-40 blur-3xl" />
                <div aria-hidden className="pointer-events-none absolute -bottom-28 -right-20 h-72 w-72 rounded-full bg-[#f59e0b] opacity-30 blur-3xl" />
                <div className="relative mx-auto max-w-2xl">
                  <h2 className="text-balance font-display text-[clamp(1.9rem,4.5vw,3rem)] leading-tight tracking-tight text-white">
                    Find out what the room really thinks
                  </h2>
                  <p className="mx-auto mt-4 max-w-lg text-[16px] text-white/75 sm:text-lg">
                    Your first verdict is on us. 50 credits, no card, and an answer in about two minutes.
                  </p>
                  <div className="mt-8">
                    <IdeaCapture tone="dark" />
                  </div>
                </div>
              </div>
            </Reveal>
          </Container>
        </section>
      </main>
      <Footer />
      <StickyCta />
    </>
  );
}
