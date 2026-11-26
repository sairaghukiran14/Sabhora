import { Check, Flame, Globe, Janta, Sharks } from "../icons";
import { cx } from "../ui";

function WindowBar({ mode, title, right }: { mode: "sharks" | "janta" | "roast"; title: string; right: string }) {
  const Icon = mode === "sharks" ? Sharks : mode === "janta" ? Janta : Flame;
  return (
    <div className={`room-${mode} flex items-center justify-between gap-3 border-b border-edge px-4 py-3`}>
      <span className="flex min-w-0 items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-mode-soft text-mode-ink">
          <Icon size={15} />
        </span>
        <span className="truncate text-sm font-medium">{title}</span>
      </span>
      <span className="shrink-0 rounded-full bg-mode-soft px-2 py-0.5 text-[11px] font-medium text-mode-ink">{right}</span>
    </div>
  );
}

export function SharksMock() {
  const turns = [
    { n: "Meera", r: "Consumer brands", c: "#4f46e5", t: "Who is desperate for this? Useful isn't the same as urgent." },
    { n: "Arjun", r: "SaaS and deep tech", c: "#d97706", t: "At ₹299 a month, how many stores before this covers one salary?" },
    { n: "Ananya", r: "Bharat angel", c: "#e11d48", t: "Distribution is the wall. Where do your first 100 stores come from?" },
  ];
  return (
    <div className="room-sharks overflow-hidden rounded-[20px] border border-edge bg-surface shadow-lift">
      <WindowBar mode="sharks" title="Sharks · Kirana reorder app" right="Round 1 of 3" />
      <div className="space-y-3.5 p-4">
        {turns.map((m) => (
          <div key={m.n} className="flex gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white" style={{ backgroundColor: m.c }}>
              {m.n.slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-medium">
                {m.n} <span className="font-normal text-faint">· {m.r}</span>
              </p>
              <p className="mt-1 rounded-2xl rounded-tl-sm border border-edge bg-bg px-3 py-2 text-[13px] leading-relaxed">{m.t}</p>
            </div>
          </div>
        ))}
        <div className="flex justify-end">
          <p className="max-w-[85%] rounded-2xl rounded-tr-sm bg-brand px-3 py-2 text-[13px] leading-relaxed text-white">
            We already have 40 stores on a WhatsApp pilot in Indore.
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-edge bg-bg/60 px-4 py-3.5">
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success-soft text-success-ink">
            <Check size={16} />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-medium">Panel · 3 risks to probe</span>
            <span className="block truncate text-[11px] text-muted">30-day plan to check them</span>
          </span>
        </span>
        <span className="shrink-0 rounded-xl bg-mode-soft px-2.5 py-1 font-display text-xl font-medium text-mode-ink">7.5</span>
      </div>
    </div>
  );
}

export function JantaMock({ compact = false }: { compact?: boolean }) {
  const tiers = [
    { l: "Tier 1", v: 52 },
    { l: "Tier 2", v: 36 },
    { l: "Tier 3", v: 21 },
  ];
  return (
    <div className="room-janta overflow-hidden rounded-[20px] border border-edge bg-surface shadow-lift">
      <WindowBar mode="janta" title="Janta · 100 people" right="Poll complete" />
      <div className="space-y-4 p-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="font-display text-4xl font-medium leading-none text-mode-ink">38%</p>
            <p className="mt-1 text-xs text-muted">would pay ₹99/month</p>
          </div>
          <div className="w-1/2 min-w-0">
            <div className="flex h-2.5 overflow-hidden rounded-full">
              <span className="bg-success" style={{ width: "46%" }} />
              <span className="bg-accent" style={{ width: "27%" }} />
              <span className="bg-edge-strong" style={{ width: "27%" }} />
            </div>
            <div className="mt-1.5 flex justify-between text-[10px] text-muted">
              <span>Yes 46%</span>
              <span>Maybe 27%</span>
              <span>No 27%</span>
            </div>
          </div>
        </div>
        <div className="space-y-2">
          {tiers.map((t) => (
            <div key={t.l} className="flex items-center gap-3 text-xs">
              <span className="w-12 shrink-0 text-muted">{t.l}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-mode-soft">
                <span className="block h-full rounded-full bg-mode" style={{ width: `${t.v}%` }} />
              </span>
              <span className="w-8 shrink-0 text-right font-medium tabular-nums">{t.v}%</span>
            </div>
          ))}
        </div>
        {!compact && (
          <div className="space-y-2">
            <p className="rounded-xl bg-bg px-3 py-2 text-[13px] leading-relaxed">
              “Idea accha hai, par ₹99 thoda zyada lagta hai.”
              <span className="mt-0.5 block text-[11px] text-faint">Kavya, 31 · Teacher · Indore</span>
            </p>
            <p className="rounded-xl bg-bg px-3 py-2 text-[13px] leading-relaxed">
              “बढ़िया है, इसके लिए पैसे देना ठीक लगता है।”
              <span className="mt-0.5 block text-[11px] text-faint">Ravi, 38 · Bank clerk · Lucknow</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export function RoastMock({ compact = false }: { compact?: boolean }) {
  const rows = [
    { l: "Clarity", v: 6 },
    { l: "Trust", v: 4 },
    { l: "Design", v: 7 },
    { l: "Call to action", v: 5 },
  ];
  return (
    <div className="room-roast overflow-hidden rounded-[20px] border border-edge bg-surface shadow-lift">
      <WindowBar mode="roast" title="Roast · 6 reviewers" right="5.5 / 10" />
      <div className="space-y-4 p-4">
        <p className="flex items-center gap-2 truncate rounded-lg bg-bg px-3 py-2 text-xs text-muted">
          <Globe size={14} className="shrink-0" /> yourstartup.in
        </p>
        <div className="space-y-2.5">
          {rows.map((r) => (
            <div key={r.l} className="flex items-center gap-3 text-xs">
              <span className="w-24 shrink-0 text-muted">{r.l}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-mode-soft">
                <span
                  className={cx("block h-full rounded-full", r.v < 5 ? "bg-danger" : "bg-mode")}
                  style={{ width: `${r.v * 10}%` }}
                />
              </span>
              <span className="w-5 shrink-0 text-right font-medium tabular-nums">{r.v}</span>
            </div>
          ))}
        </div>
        {!compact && (
          <div className="rounded-xl border border-dashed border-edge-strong p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-faint">Top fix</p>
            <p className="mt-1 text-[13px] leading-relaxed">
              Add proof above the fold: one customer quote and a usage number. Right now it&apos;s all promise.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

const PERSONAS = [
  ["Priya, 29", "Software engineer", "Pune", 1],
  ["Imran, 41", "Kirana store owner", "Bareilly", 3],
  ["Kavya, 31", "Teacher", "Indore", 2],
  ["Joseph, 55", "Retired officer", "Kochi", 2],
  ["Neha, 22", "College student", "Delhi", 1],
  ["Venkat, 36", "Chartered accountant", "Guntur", 3],
  ["Farah, 27", "Graphic designer", "Hyderabad", 1],
  ["Suresh, 48", "Auto-rickshaw driver", "Nagpur", 2],
  ["Harpreet, 33", "Nurse", "Rohtak", 3],
  ["Ishaan, 25", "Startup founder", "Bengaluru", 1],
  ["Lakshmi, 44", "Homemaker", "Coimbatore", 2],
  ["Abhishek, 30", "Sales executive", "Siliguri", 3],
] as const;

export function PersonaMarquee() {
  const tierColor = ["", "bg-brand", "bg-accent", "bg-[#f43f5e]"];
  const row = [...PERSONAS, ...PERSONAS];
  return (
    <div className="group relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,#000_8%,#000_92%,transparent)]">
      <div className="flex w-max animate-[marquee_48s_linear_infinite] gap-3 group-hover:[animation-play-state:paused]">
        {row.map(([name, job, city, tier], i) => (
          <span
            key={i}
            className="flex shrink-0 items-center gap-2.5 rounded-full border border-edge bg-surface py-1.5 pl-1.5 pr-4 text-[13px] shadow-soft"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-bg text-[11px] font-semibold text-muted">
              {name[0]}
            </span>
            <span className="font-medium">{name}</span>
            <span className="text-muted">{job}</span>
            <span className="flex items-center gap-1 text-faint">
              <span className={cx("h-1.5 w-1.5 rounded-full", tierColor[tier])} />
              {city}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
