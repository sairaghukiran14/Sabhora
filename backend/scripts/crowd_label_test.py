"""How much does a Janta persona's attitude LABEL decide their vote?

Usage (from backend/):  .venv/bin/python scripts/crowd_label_test.py
Runs round 1 of a 50-person Janta on two pitches for each crowd setup, then reports:
  label fit  - share of people who vote the same way as the majority of their attitude group
               (100% = the label alone predicts every vote)
  floor      - share who vote with the overall majority (what you'd get ignoring labels)
  lift       - label fit minus floor: how much the label adds. High lift = label-driven.
Attitude SHOULD matter somewhat; the problem is when it decides everything.
Calls the real API (~100 calls, roughly Rs 2 in total). Judge is skipped (fake).
"""
import asyncio
import collections
import pathlib
import sys
import tempfile

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app.debates import janta  # noqa: E402
from app.llm.factory import UserKeys, build_llms  # noqa: E402
from app.personas import generate_crowd  # noqa: E402
from app.sessions import DebateSession  # noqa: E402
from app.settings import get_settings  # noqa: E402

PITCHES = {
    "KiranaOne": "KiranaOne: a WhatsApp-first ordering app for kirana shops in tier-2 cities. "
                 "Shopkeepers reorder stock from local distributors in one tap, in Hindi or their "
                 "regional language. We charge distributors 1.5% per order. 40 shops in Indore use "
                 "it weekly after 3 months; average order Rs 6,000.",
    "PaathShala": "PaathShala AI: a Rs 299/month WhatsApp tutor that explains CBSE maths homework "
                  "in Hindi, Tamil and English with voice notes. Free for 5 questions a day. 1,200 "
                  "parents in Lucknow and Coimbatore tried it in 6 weeks; 180 now pay.",
}
ARMS = {
    "conversations only": "sarvam-105b-conversations",
    "glm5.3-flash only": "glm5.3-flash",
    "mixed (both)": "sarvam-105b-conversations,glm5.3-flash",
}
if len(sys.argv) > 1:  # e.g. scripts/crowd_label_test.py sarvam-105b-conversations
    ARMS = {arg: arg for arg in sys.argv[1:]}

# Who the idea actually serves, per pitch: votes should lean on THIS, not on the label.
SCHOOL_KIDS = ("school", "Class 4", "board exams", "10-year-old")
FIT = {
    "KiranaOne": ("runs a kirana shop", lambda p: p.occupation == "Kirana shop owner"),
    "PaathShala": ("has school-age children at home",
                   lambda p: any(k in p.household for k in SCHOOL_KIDS)),
}


def fit(votes: dict[str, str], key) -> float:
    groups: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
    for pid, v in votes.items():
        groups[key(pid)][v] += 1
    return sum(c.most_common(1)[0][1] for c in groups.values()) / len(votes)


async def run_arm(models: str, pitch: str, s) -> tuple[dict, dict]:
    first = models.split(",")[0]
    s2 = s.model_copy(update={"janta_models": models, "sarvam_model": first,
                              "llm_provider": "sarvam", "judge_provider": "fake",
                              "janta_rounds": 1, "janta_pace_s": 0,
                              "data_dir": tempfile.mkdtemp()})
    session = DebateSession("janta", {"pitch": pitch, "panel_size": 50})
    await janta.run(session, build_llms(s2, UserKeys()), s2)
    votes = {e["persona_id"]: e["vote"] for e in session.events if e["type"] == "reaction"}
    pay = {e["persona_id"]: e["would_pay"] for e in session.events if e["type"] == "reaction"}
    model_of = {p["id"]: p["model"] for p in session.events[0]["crowd"]}
    return votes, {"pay": pay, "model_of": model_of}


async def main() -> None:
    s = get_settings()
    people = {p.id: p for p in generate_crowd(50)}
    rows = []
    for pitch_name, pitch in PITCHES.items():
        for arm, models in ARMS.items():
            print(f"running {pitch_name} / {arm} ...", flush=True)
            votes, extra = await run_arm(models, pitch, s)
            n = len(votes)
            overall = collections.Counter(votes.values())
            floor = overall.most_common(1)[0][1] / n
            label = fit(votes, lambda pid: people[pid].attitude)
            by_att = collections.defaultdict(collections.Counter)
            for pid, v in votes.items():
                by_att[people[pid].attitude][v] += 1
            by_model = collections.defaultdict(collections.Counter)
            for pid, v in votes.items():
                by_model[extra["model_of"][pid]][v] += 1
            rows.append((pitch_name, arm, n, label, floor, dict(overall),
                         sum(extra["pay"].values()) / n, by_att, by_model))
            what, fits = FIT[pitch_name]
            yes = [v for pid, v in votes.items() if fits(people[pid])]
            no = [v for pid, v in votes.items() if not fits(people[pid])]
            rate = lambda vs: f"{sum(v == 'agree' for v in vs)}/{len(vs)} agree" if vs else "nobody"
            print(f"   fit check ({what}): {rate(yes)}  vs  everyone else: {rate(no)}", flush=True)

    print(f"\n{'pitch':11} {'crowd':20} {'n':>3} {'label fit':>9} {'floor':>6} {'lift':>6}  votes / would pay")
    for pitch_name, arm, n, label, floor, overall, pay, _, _ in rows:
        print(f"{pitch_name:11} {arm:20} {n:>3} {label:>8.0%} {floor:>6.0%} {label - floor:>+6.0%}  "
              f"{overall} / {pay:.0%} pay")
    print("\nAgree / neutral / disagree by attitude:")
    for pitch_name, arm, *_, by_att, by_model in rows:
        cells = "  ".join(f"{a[:6]} {c['agree']}/{c['neutral']}/{c['disagree']}"
                          for a, c in sorted(by_att.items()))
        print(f"  {pitch_name:11} {arm:20} {cells}")
        if len(by_model) > 1:
            print(f"  {'':11} {'  by model':20} " + "  ".join(
                f"{m}: {c['agree']}/{c['neutral']}/{c['disagree']}" for m, c in by_model.items()))


if __name__ == "__main__":
    asyncio.run(main())
