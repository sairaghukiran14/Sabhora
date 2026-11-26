"""Does the Janta crowd respond sensibly? Five checks, with pass rules fixed in advance.

Usage (from backend/):
  .venv/bin/python scripts/crowd_sensitivity_test.py                 # FREE dry run, fake AI
  .venv/bin/python scripts/crowd_sensitivity_test.py --real --stage basics   # PAID
  .venv/bin/python scripts/crowd_sensitivity_test.py --report-only [--real]  # free

  1 repeat runs     the same pitch 3 times: how much do the counts move by themselves?
  2 price           the same app at 49 / 500 / 5000 rupees a month
  3 target fit      a school tutor: do homes with school-age children agree more?
  4 attitude labels the same runs with the persona's attitude label hidden
  5 peer influence  the same swing voters reconsider with and without the vote split
Stage "basics" is checks 1-2. Stage "rest" is checks 3-5 and reuses the basics results.
Stage "control" (after "rest"; not part of "all") asks check 5's people once more with no
digest at all, to find what causes the second round's shift towards the majority.

The fake AI only proves the script works; its votes are random and say NOTHING about the
product. Finished runs are saved as they complete, so a rerun only does what is missing.
Passing means the crowd responds more sensibly, not that it predicts who will buy.
"""
import argparse
import asyncio
import collections
import contextlib
import hashlib
import inspect
import json
import pathlib
import random
import sys

BACKEND = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app import prompts  # noqa: E402
from app.budget import BudgetExceeded, TokenBudget  # noqa: E402
from app.debates import janta  # noqa: E402
from app.llm.base import LLMError  # noqa: E402
from app.llm.factory import UserKeys, build_llms  # noqa: E402
from app.models import CrowdReaction, PersonReaction  # noqa: E402
from app.personas import CrowdPersona, generate_crowd  # noqa: E402
from app.settings import get_settings  # noqa: E402

SIZE = 50
REPEATS = 3
MIN_ANSWERED = 45  # a run with fewer answers is thrown away, not compared
PRICES = (49, 500, 5000)
BASE_PRICE = 500


def outfit(price: int) -> str:
    return ("Upload pictures of your clothes. AI recommends daily outfits based on weather, "
            f"occasion and preferences.\nTarget customer: Everyone\nPrice: Rs {price} per month")


TUTOR = ("PaathShala AI: a Rs 299/month WhatsApp tutor that explains CBSE maths homework "
         "in Hindi, Tamil and English with voice notes. Free for 5 questions a day. 1,200 "
         "parents in Lucknow and Coimbatore tried it in 6 weeks; 180 now pay.")

PITCHES = {**{f"outfit_{p}": outfit(p) for p in PRICES}, "tutor": TUTOR}

# Households with a school-age child of their own. Grandchildren are deliberately left out.
CHILD_HOMES = ("one child in primary school", "two school-going children",
               "one teenager preparing for board exams", "raising a 10-year-old")


def has_school_child(p: CrowdPersona) -> bool:
    return any(k in p.household for k in CHILD_HOMES)


# (pitch, labels shown?) for each stage
STAGES = {
    "basics": [(f"outfit_{p}", True) for p in PRICES],
    "rest": [("tutor", True), *[(f"outfit_{p}", False) for p in PRICES], ("tutor", False)],
}

# Pass-rule thresholds, fixed before any real run
MAX_REPEAT_GAP = 5  # people, check 1
MIN_PAYERS_TO_JUDGE = 3  # check 2: fewer than this at the cheapest price tells us nothing
# Checks 3 and 4 compare groups of people. Small groups differ by luck: with 10 per attitude,
# random votes open a 20-point gap in most runs. So a gap only counts if it beats 95% of the
# gaps from random groupings of the very same votes.
SHUFFLES, CHANCE_LEVEL = 2000, 0.95

# Measured, rough: one real run used ~600 tokens per reaction; the older script's note
# works out to about Rs 0.007 per reaction. Only for the warning before a paid run.
TOKENS_PER_REACTION, RUPEES_PER_REACTION = 600, 0.007
STAGE_REACTIONS = {"basics": 450, "rest": 870, "all": 1320, "control": 65}
DEFAULT_CAPS = {"basics": 450_000, "rest": 900_000, "all": 1_350_000, "control": 100_000}

# ---------- hiding the attitude label ----------

_LABEL_RULE_START = "- Their general tendency"
_LABEL_RULE_END = "It does not decide the vote.\n"
_LABEL_FACT = " General tendency:"


@contextlib.contextmanager
def hidden_labels():
    """Take the attitude label out of both prompts. Fails loudly if the prompt wording has
    changed, because a test that silently stopped hiding the label would mislead.
    (The label also shaped which phone each persona got; that stays.)"""
    one_line, system = CrowdPersona.one_line, prompts.crowd_system

    def short_line(self: CrowdPersona) -> str:
        head, found, _ = one_line(self).partition(_LABEL_FACT)
        if not found:
            raise RuntimeError("Can't find the attitude label in the persona line")
        return head

    def short_system(single: bool = True) -> str:
        text = system(single)
        start, end = text.find(_LABEL_RULE_START), text.find(_LABEL_RULE_END)
        if start == -1 or end == -1:
            raise RuntimeError("Can't find the attitude rule in the crowd instructions")
        return text[:start] + text[end + len(_LABEL_RULE_END):]

    CrowdPersona.one_line, prompts.crowd_system = short_line, short_system
    try:
        yield
    finally:
        CrowdPersona.one_line, prompts.crowd_system = one_line, system


# ---------- asking the crowd (same calls the app makes) ----------

async def ask(llms, s, pitch: str, groups: list[list[CrowdPersona]], heard: str | None,
              quotes: dict[str, str], budget: TokenBudget) -> dict[str, CrowdReaction]:
    pool = llms.crowd_pool()
    sem = asyncio.Semaphore(s.janta_parallel)
    got: dict[str, CrowdReaction] = {}

    async def one(group):
        async with sem:
            client = pool[int(group[0].id[1:]) % len(pool)]
            try:
                for r in await janta.ask_batch(client, pitch, group, heard, budget, quotes):
                    got[r.persona_id] = r
            except (LLMError, BudgetExceeded) as err:
                print(f"     a call failed: {str(err)[:150]}", flush=True)

    await asyncio.gather(*[one(g) for g in groups])
    return got


def batches(llms, s, crowd) -> list[list[CrowdPersona]]:
    pool_size = len(llms.crowd_pool())
    step = max(1, s.janta_batch_size)
    by_model: dict[int, list[CrowdPersona]] = {}
    for p in crowd:  # a batch must share one model, as in the app
        by_model.setdefault(int(p.id[1:]) % pool_size, []).append(p)
    return [g[i:i + step] for g in by_model.values() for i in range(0, len(g), step)]


def without_split(heard: str) -> str:
    """The round-1 digest minus its 'Votes so far' line: same quoted comments, no count."""
    first, _, rest = heard.partition("\n")
    if not first.startswith("Votes so far:"):
        raise RuntimeError("The round-1 digest changed shape; update without_split")
    return rest


# ---------- saved results ----------

def fingerprint(s, mode: str) -> str:
    """Everything that changes what a vote means. Results made under different settings must
    never be compared, so a saved file only accepts runs with the same fingerprint."""
    parts = [mode, str(SIZE), str(s.janta_batch_size),
             json.dumps(PITCHES, sort_keys=True),
             json.dumps([p.one_line() for p in generate_crowd(SIZE)]),
             inspect.getsource(prompts.crowd_system), inspect.getsource(prompts.crowd_user),
             inspect.getsource(janta.digest), inspect.getsource(janta.swing_voters),
             inspect.getsource(janta.ask_batch), inspect.getsource(janta.check_reaction),
             json.dumps(PersonReaction.model_json_schema(), sort_keys=True)]
    if mode == "real":
        from app.llm.sarvam_client import SarvamClient
        parts += [s.sarvam_model, s.janta_models, str(s.sarvam_reasoning_effort),
                  inspect.getsource(SarvamClient.complete)]
    return hashlib.sha256("\x00".join(parts).encode()).hexdigest()[:16]


def load_results(path: pathlib.Path, mode: str, mark: str) -> dict:
    if not path.exists():
        return {"mode": mode, "fingerprint": mark, "runs": {}, "peer": {}}
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("mode") != mode or data.get("fingerprint") != mark:
        raise SystemExit(f"{path} was made with a different AI, prompt, crowd or pitch. "
                         "Move it aside or pass --out with a new file.")
    return data


def save(path: pathlib.Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(path)  # never leave a half-written file behind


def run_key(pitch: str, labels: bool, rep: int) -> str:
    return f"{pitch}|{'labels' if labels else 'nolabels'}|{rep}"


async def collect(stage: str, s, data: dict, path: pathlib.Path, budget: TokenBudget) -> None:
    llms = build_llms(s, UserKeys())
    crowd = generate_crowd(SIZE)
    if stage == "control":
        await collect_control(llms, s, data, path, crowd, budget)
        return
    stages = ["basics", "rest"] if stage == "all" else [stage]
    for rep in range(1, REPEATS + 1):  # whole repeats first, so a stop leaves even coverage
        for name in stages:
            for pitch, labels in STAGES[name]:
                key = run_key(pitch, labels, rep)
                if key in data["runs"]:
                    continue
                if budget.exhausted:
                    print("Token cap reached. Rerun to continue.")
                    return
                print(f"running {key} ...", flush=True)
                with contextlib.nullcontext() if labels else hidden_labels():
                    got = await ask(llms, s, PITCHES[pitch], batches(llms, s, crowd),
                                    None, {}, budget)
                if len(got) < MIN_ANSWERED:
                    print(f"     only {len(got)} of {SIZE} answered; not saved")
                    continue
                data["runs"][key] = {pid: r.model_dump() for pid, r in sorted(got.items())}
                save(path, data)
    if "rest" in stages:
        await collect_peer(llms, s, data, path, crowd, budget)


async def collect_peer(llms, s, data, path, crowd, budget) -> None:
    for rep in range(1, REPEATS + 1):
        first = data["runs"].get(run_key(f"outfit_{BASE_PRICE}", True, rep))
        if str(rep) in data["peer"]:
            continue
        if not first:
            print(f"check 5, repeat {rep}: needs the basics results first; skipped")
            continue
        if budget.exhausted:
            print("Token cap reached. Rerun to continue.")
            return
        votes = {pid: CrowdReaction(**r) for pid, r in first.items()}
        heard, quotes = janta.digest(votes)
        bare = without_split(heard)
        asked = janta.swing_voters(crowd, votes)
        if not bare or not asked:
            print(f"check 5, repeat {rep}: nothing to compare; skipped")
            continue
        print(f"running peer influence, repeat {rep} ({len(asked)} people, twice) ...", flush=True)
        arms = {}
        for arm, context in (("with_split", heard), ("without_split", bare)):
            got = await ask(llms, s, PITCHES[f"outfit_{BASE_PRICE}"], [[p] for p in asked],
                            context, quotes, budget)
            arms[arm] = {pid: r.vote for pid, r in sorted(got.items())}
        if min(len(a) for a in arms.values()) < 0.9 * len(asked):
            print("     too many people didn't answer; not saved")
            continue
        majority = collections.Counter(r.vote for r in votes.values()).most_common(1)[0][0]
        data["peer"][str(rep)] = {"majority": majority, **arms}
        save(path, data)


async def collect_control(llms, s, data, path, crowd, budget) -> None:
    """Check 5's people again, one per call, hearing nothing about anyone else."""
    by_id = {p.id: p for p in crowd}
    for rep in range(1, REPEATS + 1):
        saved = data["peer"].get(str(rep))
        first = data["runs"].get(run_key(f"outfit_{BASE_PRICE}", True, rep))
        if not saved or not first:
            print(f"control, repeat {rep}: needs the 'rest' results first; skipped")
            continue
        if "no_digest" in saved:
            continue
        if budget.exhausted:
            print("Token cap reached. Rerun to continue.")
            return
        ids = sorted(saved["with_split"].keys() & saved["without_split"].keys())
        _, quotes = janta.digest({pid: CrowdReaction(**r) for pid, r in first.items()})
        print(f"running no-digest control, repeat {rep} ({len(ids)} people) ...", flush=True)
        got = await ask(llms, s, PITCHES[f"outfit_{BASE_PRICE}"], [[by_id[i]] for i in ids],
                        None, quotes, budget)  # quotes only feed the same copy check
        if len(got) < 0.9 * len(ids):
            print("     too many people didn't answer; not saved")
            continue
        saved["no_digest"] = {pid: r.vote for pid, r in sorted(got.items())}
        save(path, data)


# ---------- the pass rules (pure: no AI calls) ----------

def get_runs(data: dict, pitch: str, labels: bool = True) -> list[dict] | None:
    found = [data["runs"].get(run_key(pitch, labels, rep)) for rep in range(1, REPEATS + 1)]
    return found if all(found) else None


def count(run: dict, field: str) -> int:
    if field == "agree":
        return sum(r["vote"] == "agree" for r in run.values())
    return sum(r["would_pay"] for r in run.values())


def share(run: dict, ids) -> float:
    """Percent of these people (who answered) that agreed."""
    answered = [run[i] for i in ids if i in run]
    return 100 * sum(r["vote"] == "agree" for r in answered) / len(answered) if answered else 0.0


def mean(values) -> float:
    return sum(values) / len(values)


def spread(values) -> float:
    return max(values) - min(values)


def chance_limit(items: list, gap) -> float:
    """The gap that random grouping stays under 95% of the time. `items` is what gets
    shuffled between people (a group name each); `gap` measures one assignment.
    Seeded, so the same saved results always give the same answer."""
    rng, mixed, seen = random.Random(0), list(items), []
    for _ in range(SHUFFLES):
        rng.shuffle(mixed)
        seen.append(gap(mixed))
    return sorted(seen)[int(CHANCE_LEVEL * SHUFFLES) - 1]


def check_repeats(data) -> tuple[str, str]:
    runs = get_runs(data, f"outfit_{BASE_PRICE}")
    if not runs:
        return "NOT RUN", ""
    agree, pay = [count(r, "agree") for r in runs], [count(r, "would_pay") for r in runs]
    flipped = [pid for pid in runs[0]
               if len({r[pid]["vote"] for r in runs if pid in r}) > 1]
    detail = (f"agree {agree}, would pay {pay}; {len(flipped)} of {SIZE} people changed vote "
              "between identical runs")
    if spread(agree) > MAX_REPEAT_GAP or spread(pay) > MAX_REPEAT_GAP:
        return "FAIL", detail
    if max(agree + pay) <= MAX_REPEAT_GAP:
        return "CAN'T TELL", detail + f". No count is above {MAX_REPEAT_GAP}, so the rule can't fail"
    return "PASS", detail


def check_price(data, labels: bool = True) -> tuple[str, str]:
    runs = {p: get_runs(data, f"outfit_{p}", labels) for p in PRICES}
    if not all(runs.values()):
        return "NOT RUN", ""
    pay = {p: [count(r, "would_pay") for r in rs] for p, rs in runs.items()}
    means = [mean(pay[p]) for p in PRICES]
    noise = max(spread(v) for v in pay.values())
    detail = (", ".join(f"Rs {p}: {pay[p]}" for p in PRICES)
              + f" would pay; normal variation {noise}")
    if means[0] < MIN_PAYERS_TO_JUDGE:
        return "CAN'T TELL", detail + ". Too few would pay even at the lowest price"
    falls = all(a >= b for a, b in zip(means, means[1:], strict=False))
    return ("PASS" if falls and means[0] - means[-1] > noise else "FAIL"), detail


def check_fit(data, labels: bool = True) -> tuple[str, str]:
    runs = get_runs(data, "tutor", labels)
    if not runs:
        return "NOT RUN", ""
    crowd = generate_crowd(SIZE)
    inside = [p.id for p in crowd if has_school_child(p)]
    outside = [p.id for p in crowd if not has_school_child(p)]
    gaps = [share(r, inside) - share(r, outside) for r in runs]
    noise = spread([share(r, [p.id for p in crowd]) for r in runs])

    def mean_gap(is_inside: list[bool]) -> float:
        yes = [p.id for p, flag in zip(crowd, is_inside, strict=True) if flag]
        no = [p.id for p, flag in zip(crowd, is_inside, strict=True) if not flag]
        return mean([share(r, yes) - share(r, no) for r in runs])

    chance = chance_limit([has_school_child(p) for p in crowd], mean_gap)
    pairs = ", ".join(f"{share(r, inside):.0f}% vs {share(r, outside):.0f}%" for r in runs)
    detail = (f"school-age child at home ({len(inside)}) vs others ({len(outside)}): {pairs}; "
              f"normal variation {noise:.0f} points, chance alone reaches {chance:.0f}")
    totals = [count(r, "agree") for r in runs]
    if max(totals) == 0 or all(t == len(r) for t, r in zip(totals, runs, strict=True)):
        return "CAN'T TELL", detail + ". Everyone voted the same way"
    real = all(g > noise for g in gaps) and mean(gaps) > chance
    return ("PASS" if real else "FAIL"), detail


def label_gap(runs: list[dict], attitudes: list[str] | None = None) -> float:
    """Percentage points between the attitude group that agrees most and the one least,
    averaged over the runs. `attitudes` overrides who has which label (for chance_limit)."""
    crowd = generate_crowd(SIZE)
    groups: dict[str, list[str]] = collections.defaultdict(list)
    for p, label in zip(crowd, attitudes or [p.attitude for p in crowd], strict=True):
        groups[label].append(p.id)
    return mean([spread([share(r, ids) for ids in groups.values()]) for r in runs])


def check_labels(data) -> tuple[str, str]:
    pitches = (f"outfit_{BASE_PRICE}", "tutor")
    have = {(p, shown): get_runs(data, p, shown) for p in pitches for shown in (True, False)}
    others = [check_price(data, False), check_fit(data, False)]
    if not all(have.values()) or any(v == "NOT RUN" for v, _ in others):
        return "NOT RUN", ""
    notes, dominant, helped = [], [], []
    for pitch in pitches:
        with_runs = have[pitch, True]
        shown, hidden = label_gap(with_runs), label_gap(have[pitch, False])
        noise = spread([label_gap([r]) for r in with_runs])
        chance = chance_limit([p.attitude for p in generate_crowd(SIZE)],
                              lambda mixed, rs=with_runs: label_gap(rs, mixed))
        notes.append(f"{pitch}: gap between attitude groups {shown:.0f} points with labels, "
                     f"{hidden:.0f} without (normal variation {noise:.0f}, chance alone "
                     f"reaches {chance:.0f})")
        if shown > chance:
            dominant.append(pitch)
            helped.append(shown - hidden > noise)
    detail = "; ".join(notes)
    if not dominant:
        return "NO CHANGE NEEDED", detail + ". Labels don't dominate"
    lost = [name for name, with_, without in
            (("price", check_price(data)[0], others[0][0]),
             ("target fit", check_fit(data)[0], others[1][0]))
            if with_ == "PASS" and without != "PASS"]
    if all(helped) and not lost:
        return "REMOVE LABELS", detail + ". Labels dominate and hiding them helps"
    why = (f"; without them the {' and '.join(lost)} check no longer passes" if lost
           else "; hiding them doesn't clearly help")
    return "NEEDS ANOTHER FIX", detail + f". Labels dominate{why}"


def check_peer(data) -> tuple[str, str]:
    rounds = [data["peer"].get(str(rep)) for rep in range(1, REPEATS + 1)]
    if not all(rounds):
        return "NOT RUN", ""
    shifts = []
    for r in rounds:
        both = r["with_split"].keys() & r["without_split"].keys()
        shifts.append(sum(r["with_split"][i] == r["majority"] for i in both)
                      - sum(r["without_split"][i] == r["majority"] for i in both))
    detail = f"extra people siding with the majority when shown the split, per repeat: {shifts}"
    return ("FAIL" if all(x > 0 for x in shifts) else "PASS"), detail


def check_cause(data) -> tuple[str, str]:
    """What moves second-round voters to "disagree"? Compares "disagree" shares for the very
    same people, asked four ways. The reading rule was fixed before the control was run:
      batched  asked again three to a call, as in round 1 (free: the other repeats)
      alone    asked one to a call, hearing nothing            (the control)
      heard    asked one to a call after reading comments      (check 5, without the split)
    If heard is within 5 answers of batched, simply asking these people again explains it.
    Otherwise the comments explain the fraction (heard - alone) / (heard - batched):
    two thirds or more = the comments; a third or less = asking one at a time; else both."""
    rounds = [data["peer"].get(str(rep)) for rep in range(1, REPEATS + 1)]
    runs = get_runs(data, f"outfit_{BASE_PRICE}")
    if not runs or not all(r and "no_digest" in r for r in rounds):
        return "NOT RUN", ""
    n = chosen = batched = alone = heard = 0
    per_repeat = []
    for k, r in enumerate(rounds):
        ids = r["with_split"].keys() & r["without_split"].keys() & r["no_digest"].keys()
        others = [run_ for j, run_ in enumerate(runs) if j != k]
        again = sum(mean([run_[i]["vote"] == "disagree" for run_ in others if i in run_])
                    for i in ids)
        a = sum(r["no_digest"][i] == "disagree" for i in ids)
        h = sum(r["without_split"][i] == "disagree" for i in ids)
        n, batched, alone, heard = n + len(ids), batched + again, alone + a, heard + h
        chosen += sum(runs[k][i]["vote"] == "disagree" for i in ids)
        per_repeat.append(f"{again:.1f} / {a} / {h} of {len(ids)}")
    detail = (f"'disagree' answers of {n}: first round, when picked, {chosen}; asked again in "
              f"threes {batched:.1f}; alone, nothing heard {alone}; after comments {heard}. "
              f"Per repeat (threes / alone / comments): {'; '.join(per_repeat)}")
    if heard - batched <= MAX_REPEAT_GAP:
        return "ASKING AGAIN", detail
    part = (heard - alone) / (heard - batched)
    verdict = ("THE COMMENTS" if part >= 2 / 3 else
               "ASKING ONE AT A TIME" if part <= 1 / 3 else "BOTH")
    return verdict, detail + f". Comments explain about {max(0, min(1, part)):.0%} of the gap"


def report(data: dict) -> str:
    lines = []
    if data["mode"] == "fake":
        lines.append("FAKE AI: votes are random. These results only show that the script works.\n")
    checks = [("1 Repeat runs", check_repeats), ("2 Price", check_price),
              ("3 Target fit", check_fit), ("4 Attitude labels", check_labels),
              ("5 Peer influence", check_peer), ("6 Second-round shift", check_cause)]
    for name, check in checks:
        verdict, detail = check(data)
        lines.append(f"{name:20} {verdict}" + (f"\n    {detail}" if detail else ""))
    return "\n".join(lines)


# ---------- command line ----------

def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--stage", choices=["basics", "rest", "all", "control"], default="all")
    ap.add_argument("--real", action="store_true", help="use the real AI. COSTS MONEY")
    ap.add_argument("--yes", action="store_true", help="skip the paid-run confirmation")
    ap.add_argument("--max-tokens", type=int, help="stop starting new calls after this many")
    ap.add_argument("--out", type=pathlib.Path, help="results file")
    ap.add_argument("--report-only", action="store_true", help="re-read saved results; no calls")
    args = ap.parse_args(argv)

    mode = "real" if args.real else "fake"
    # Every provider is set here, so .env can never turn a dry run into a paid one.
    s = get_settings().model_copy(update={
        "llm_provider": "sarvam" if args.real else "fake", "judge_provider": "fake",
        "fake_delay_s": 0.0, **({} if args.real else {"janta_models": ""})})
    path = args.out or BACKEND / "data" / "crowd_tests" / f"{mode}.json"
    data = load_results(path, mode, fingerprint(s, mode))
    if args.report_only:
        print(report(data))
        return
    cap = args.max_tokens or DEFAULT_CAPS[args.stage]
    if args.real:
        n = STAGE_REACTIONS[args.stage]
        print(f"PAID RUN, stage '{args.stage}': up to about {n} reactions, very roughly "
              f"{n * TOKENS_PER_REACTION:,} tokens and Rs {n * RUPEES_PER_REACTION:.1f} "
              f"(less if results are already saved). Token cap: {cap:,}; calls already in "
              "flight can go slightly over. The app's daily limit does NOT apply here.")
        if not args.yes:
            if not sys.stdin.isatty() or input("Type yes to spend this: ").strip() != "yes":
                raise SystemExit("Not confirmed. Nothing was run.")
    budget = TokenBudget(cap)
    asyncio.run(collect(args.stage, s, data, path, budget))
    print(f"\ntokens used this time: {budget.used:,}{' (estimated)' if not args.real else ''}")
    print(f"results saved to {path}\n")
    print(report(data))


if __name__ == "__main__":
    main()
