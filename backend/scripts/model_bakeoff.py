"""Compare models on Sabhora's real tasks, scored by the app's own quality checks.

Usage (from backend/):
    .venv/bin/python scripts/model_bakeoff.py                       # default lineup
    .venv/bin/python scripts/model_bakeoff.py gemma4 glm5.3-flash   # chosen models

Every model gets the same four tasks, each call on its FIRST attempt (no retries), so the
pass rate shows how often a model gets it right without the app's safety net:
  sharks  - 9 round-2 shark turns, reacting to a founder's answer
  crowd   - 10 round-1 crowd calls, 3 people each (votes should vary within a batch)
  swing   - 12 round-2 swing voters, after hearing a digest of round 1
  judge   - 3 Janta summaries over a real 50-person run (needs data/debates/ba8ca081ce0c.json)
Costs use the per-1M-token prices on Sarvam's model page (Nov 2026). Calls the real API:
a full default run costs roughly Rs 10-15 in total.
"""
import asyncio
import collections
import json
import pathlib
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app import prompts  # noqa: E402
from app.budget import TokenBudget  # noqa: E402
from app.debates.janta import check_reaction, digest, segment_breakdown, summary_check, tally  # noqa: E402
from app.debates.sharks import turn_check  # noqa: E402
from app.llm.base import LLMError, complete_typed  # noqa: E402
from app.llm.sarvam_client import SarvamClient  # noqa: E402
from app.models import CrowdReaction, JantaSummary, PersonReaction, SharkTurn, crowd_batch_model  # noqa: E402
from app.personas import generate_crowd, load_sharks  # noqa: E402
from app.settings import get_settings  # noqa: E402

# Rs per 1M tokens (input, output), from Sarvam's model catalogue
PRICES = {
    "sarvam-105b": (10, 25), "sarvam-105b-conversations": (10, 25),
    "glm5.3": (126, 390), "glm5.3-flash": (13.5, 45),
    "gemma4": (35, 90), "deepseekv4.1-flash-1017": (14, 55),
}
DEFAULT = ["sarvam-105b-conversations", "glm5.3-flash", "gemma4", "deepseekv4.1-flash-1017", "glm5.3"]

PITCH = ("KiranaOne: a WhatsApp-first ordering app for kirana shops in tier-2 cities. Shopkeepers "
         "reorder stock from local distributors in one tap, in Hindi or their regional language. "
         "We charge distributors 1.5% per order. 40 shops in Indore use it weekly after 3 months; "
         "average order Rs 6,000.")
TRANSCRIPT = [
    ("Meera Kapoor", "Beta, forty shops after three months is not a business yet, show me repeat purchase."),
    ("Arjun Reddy", "What stops a distributor copying your one-tap flow in a weekend with WhatsApp Business?"),
    ("Ananya Iyer", "Meera nailed it, but will this work in Patna where distributors still take orders by phone?"),
    ("Founder", "32 of 40 shops reordered every week last month, and two distributors now push it to their shops."),
]
ROUND1 = {f"j{900 + i}": CrowdReaction(persona_id=f"j{900 + i}", vote=v, comment=c, would_pay=p)
          for i, (v, c, p) in enumerate([
              ("agree", "Bhai, WhatsApp pe reorder karna bilkul asaan hai kyunki hamare yahan sab phone pe hi baat karte hain.", True),
              ("agree", "Hindi mein order kar paana mere papa ke liye sabse badi baat hai, woh toh app nahi chala paate.", False),
              ("disagree", "Aapka ye 1.5% charge bilkul faaltu hai, dukaan waale itna fee nahi denge aur distributor bhi paise kaat lega.", False),
              ("disagree", "Mujhe is WhatsApp waale idea se koi bharosa nahi hai, phone pe hi theek hai mere supplier ke saath.", False)])}
SAVED_RUN = pathlib.Path(__file__).resolve().parents[1] / "data" / "debates" / "ba8ca081ce0c.json"


async def attempt(coro):
    t0 = time.time()
    try:
        value = await coro  # await BEFORE reading the clock (an earlier version timed nothing)
        return True, time.time() - t0, value
    except LLMError as err:
        return False, time.time() - t0, str(err).split(": ", 1)[-1][:70]


async def run_model(model: str, s) -> dict:
    client = SarvamClient(s.sarvam_api_key, model, s.sarvam_base_url, 120, None, 45)
    sem = asyncio.Semaphore(8)  # like the app's crowd concurrency
    crowd = list(generate_crowd(50))
    heard, quotes = digest(ROUND1)
    budget = TokenBudget(10**9)
    results: dict = {}

    async def limited(coro):
        async with sem:
            return await attempt(coro)

    async def measure(name, coros, extract=None):
        before = (client.usage_in, client.usage_out)
        res = await asyncio.gather(*[limited(c) for c in coros])
        tin, tout = client.usage_in - before[0], client.usage_out - before[1]
        pin, pout = PRICES.get(model, (0, 0))
        ok = [r for r in res if r[0]]
        results[name] = {
            "pass": len(ok), "n": len(res),
            "avg_s": round(sum(r[1] for r in res) / len(res), 1),
            "rs_per_call": round((tin * pin + tout * pout) / 1e6 / len(res), 4),
            "tokens_per_call": (tin + tout) // len(res),
            "rejects": collections.Counter(r[2] for r in res if not r[0]).most_common(2),
            "sample": extract(ok[0][2]) if ok and extract else None,
            "extra": None,
        }
        return ok

    # sharks: 9 round-2 turns
    sharks = load_sharks()
    await measure("sharks", [complete_typed(
        client, prompts.shark_system(sharks[i % 3], "roast"),
        prompts.shark_user(PITCH, TRANSCRIPT, 2, 3, sharks[i % 3].name), SharkTurn,
        budget=budget, max_tokens=800, check=turn_check(PITCH, TRANSCRIPT), attempts=1)
        for i in range(9)], lambda t: t.message)

    # crowd: 10 batches of 3, round 1
    def batch_call(b3):
        model_cls = crowd_batch_model([p.id for p in b3])

        def check(v):
            for p in b3:
                check_reaction(getattr(v, p.id))

        async def go():
            out = await complete_typed(client, prompts.crowd_system(single=False),
                                       prompts.crowd_user(PITCH, b3, None), model_cls,
                                       budget=budget, max_tokens=1200, check=check, attempts=1)
            return [getattr(out, p.id) for p in b3]
        return go()

    ok = await measure("crowd", [batch_call(crowd[i:i + 3]) for i in range(0, 30, 3)],
                       lambda rs: rs[0].comment)
    votes = collections.Counter(r.vote for _, _, rs in ok for r in rs)
    same = sum(1 for _, _, rs in ok if len({r.vote for r in rs}) == 1)
    results["crowd"]["extra"] = f"votes {dict(votes)}, all-same batches {same}/{len(ok)}"

    # swing: 12 round-2 single voters
    ok = await measure("swing", [complete_typed(
        client, prompts.crowd_system(single=True), prompts.crowd_user(PITCH, [p], heard),
        PersonReaction, budget=budget, max_tokens=600,
        check=lambda x, pid=p.id: check_reaction(x, [c for w, c in quotes.items() if w != pid]),
        attempts=1) for p in crowd[30:42]], lambda r: f"{r.vote}: {r.comment}")
    results["swing"]["extra"] = f"votes {dict(collections.Counter(r.vote for _, _, r in ok))}"

    # judge: 3 Janta summaries on a real saved run
    if SAVED_RUN.exists():
        snap = json.loads(SAVED_RUN.read_text())
        people = {p.id: p for p in generate_crowd(50)}
        real = {e["persona_id"]: CrowdReaction(persona_id=e["persona_id"], vote=e["vote"],
                                               comment=e["comment"], would_pay=e["would_pay"])
                for e in snap["events"] if e["type"] == "reaction"}
        sample = [f"{people[pid].occupation}, {people[pid].city} ({r.vote}): {r.comment}"
                  for pid, r in list(real.items())[:40]]
        user = prompts.janta_summary_user(snap["request"]["pitch"], tally(real),
                                          segment_breakdown(real, people), sample)
        await measure("judge", [complete_typed(
            client, prompts.janta_summary_system(), user, JantaSummary, budget=budget,
            max_tokens=6000, check=summary_check, attempts=1) for _ in range(3)],
            lambda o: o.headline)
    return results


def report(all_results: dict) -> None:
    for task in ("sharks", "crowd", "swing", "judge"):
        print(f"\n### {task}")
        print(f"{'model':27} {'pass':>6} {'avg s':>6} {'tok/call':>9} {'Rs/call':>8}  notes")
        for model, res in all_results.items():
            r = res.get(task)
            if not r:
                continue
            notes = r["extra"] or ""
            if r["rejects"]:
                notes += ("; " if notes else "") + "rejects: " + ", ".join(f"{n}x {why}" for why, n in r["rejects"])
            print(f"{model:27} {r['pass']:>3}/{r['n']:<2} {r['avg_s']:>6} {r['tokens_per_call']:>9} "
                  f"{r['rs_per_call']:>8}  {notes}")
            if r["sample"]:
                print(f"{'':27}   e.g. {r['sample'][:140]}")


async def main() -> None:
    s = get_settings()
    models = sys.argv[1:] or DEFAULT
    all_results = {}
    for i, model in enumerate(models):
        if i:
            await asyncio.sleep(60)  # let the per-minute rate-limit window clear between models
        print(f"running {model} ...", flush=True)
        all_results[model] = await run_model(model, s)
    report(all_results)
    out = pathlib.Path(__file__).with_name("bakeoff_results.json")
    out.write_text(json.dumps(all_results, indent=2, ensure_ascii=False, default=str))
    print(f"\nsaved {out}")


if __name__ == "__main__":
    asyncio.run(main())
