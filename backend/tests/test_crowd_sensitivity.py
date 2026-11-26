"""The crowd test's pass rules, and that a dry run can never cost money."""
import importlib.util
import pathlib

import pytest

from app import prompts
from app.llm.sarvam_client import SarvamClient
from app.personas import CrowdPersona, generate_crowd

PATH = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "crowd_sensitivity_test.py"
spec = importlib.util.spec_from_file_location("crowd_sensitivity_test", PATH)
cst = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cst)

CROWD = generate_crowd(cst.SIZE)
IDS = [p.id for p in CROWD]


def run(agree=(), pay=0):
    """A fake saved run: these ids agree, everyone else doesn't; the first `pay` would pay."""
    agree = set(agree)
    return {pid: {"persona_id": pid, "vote": "agree" if pid in agree else "disagree",
                  "comment": "x", "would_pay": i < pay} for i, pid in enumerate(IDS)}


def data(**conditions):
    """conditions: name__labels=[run, run, run] (labels is 'labels' or 'nolabels')."""
    runs = {}
    for name, three in conditions.items():
        pitch, labels = name.split("__")
        for rep, r in enumerate(three, 1):
            runs[cst.run_key(pitch, labels == "labels", rep)] = r
    return {"mode": "real", "runs": runs, "peer": {}}


def pays(*counts):
    return [run(agree=IDS[:n], pay=n) for n in counts]


@pytest.mark.parametrize("counts,expected", [
    ((10, 12, 15), "PASS"), ((10, 12, 16), "FAIL"),
    ((3, 4, 5), "CAN'T TELL"),  # too small for a 5-person rule to ever fail
])
def test_repeat_rule(counts, expected):
    assert cst.check_repeats(data(outfit_500__labels=pays(*counts)))[0] == expected


@pytest.mark.parametrize("cheap,mid,dear,expected", [
    ((15, 16, 17), (8, 9, 10), (1, 2, 3), "PASS"),
    ((8, 9, 10), (8, 9, 10), (8, 9, 10), "FAIL"),  # price ignored
    ((10, 11, 12), (15, 16, 17), (1, 2, 3), "FAIL"),  # not falling
    ((12, 16, 20), (11, 12, 13), (9, 11, 13), "FAIL"),  # drop is within the noise
    ((2, 2, 2), (1, 1, 1), (0, 0, 0), "CAN'T TELL"),
])
def test_price_rule(cheap, mid, dear, expected):
    d = data(outfit_49__labels=pays(*cheap), outfit_500__labels=pays(*mid),
             outfit_5000__labels=pays(*dear))
    assert cst.check_price(d)[0] == expected


def test_parent_group_leaves_out_grandparents():
    group = [p for p in CROWD if cst.has_school_child(p)]
    assert group and not any("grandchildren" in p.household for p in group)


def test_fit_rule():
    parents = [p.id for p in CROWD if cst.has_school_child(p)]
    others = [i for i in IDS if i not in parents]
    assert cst.check_fit(data(tutor__labels=[run(parents[:8])] * 3))[0] == "PASS"
    assert cst.check_fit(data(tutor__labels=[run(others[:8])] * 3))[0] == "FAIL"
    assert cst.check_fit(data(tutor__labels=[run()] * 3))[0] == "CAN'T TELL"


def test_lucky_gaps_are_not_blamed_on_labels_or_fit():
    """Random votes make big-looking gaps between small groups; the rules must ignore them."""
    rng = cst.random.Random(7)
    false_labels = false_fit = 0
    trials = 20
    for _ in range(trials):
        three = [run(rng.sample(IDS, 15)) for _ in range(3)]
        chance = cst.chance_limit([p.attitude for p in CROWD],
                                  lambda mixed, rs=three: cst.label_gap(rs, mixed))
        false_labels += cst.label_gap(three) > chance
        false_fit += cst.check_fit(data(tutor__labels=three))[0] == "PASS"
    assert false_labels <= 4 and false_fit <= 3


def label_data(shown, hidden):
    price = {f"outfit_{p}__nolabels": pays(*c) for p, c in
             ((49, (15, 15, 15)), (500, (9, 9, 9)), (5000, (1, 1, 1)))}
    parents = [p.id for p in CROWD if cst.has_school_child(p)]
    price["outfit_500__nolabels"] = [hidden] * 3
    return data(outfit_500__labels=[shown] * 3, tutor__labels=[run(parents)] * 3,
                tutor__nolabels=[run(parents)] * 3, **price)


def test_label_rule():
    early = [p.id for p in CROWD if p.attitude == "Early adopter"]
    assert cst.check_labels(label_data(run(early), run()))[0] == "REMOVE LABELS"
    assert cst.check_labels(label_data(run(early), run(early)))[0] == "NEEDS ANOTHER FIX"
    even = run([p.id for i, p in enumerate(CROWD) if p.attitude == "Skeptic"][:1])
    assert cst.check_labels(label_data(even, even))[0] == "NO CHANGE NEEDED"


def test_peer_rule():
    def round_(extra):
        base = {i: "agree" for i in IDS[:10]}
        return {"majority": "disagree", "without_split": base,
                "with_split": {**base, **{i: "disagree" for i in IDS[:extra]}}}
    d = {"runs": {}, "peer": {"1": round_(2), "2": round_(1), "3": round_(3)}}
    assert cst.check_peer(d)[0] == "FAIL"
    d["peer"]["2"] = round_(0)
    assert cst.check_peer(d)[0] == "PASS"


@pytest.mark.parametrize("alone,heard,expected", [
    (45, 60, "THE COMMENTS"),
    (60, 60, "ASKING ONE AT A TIME"),
    (52, 60, "BOTH"),
    (40, 42, "ASKING AGAIN"),
])
def test_cause_rule(alone, heard, expected):
    """60 re-asked answers (20 per repeat); 14 of each 20 disagree when asked in threes."""
    def votes(total, rep):
        mine = total // 3 + (1 if rep < total % 3 else 0)
        return {pid: "disagree" if i < mine else "neutral" for i, pid in enumerate(IDS[:20])}
    d = data(outfit_500__labels=[run(IDS[14:20])] * 3)
    d["peer"] = {str(r + 1): {"majority": "disagree", "with_split": votes(heard, r),
                              "without_split": votes(heard, r), "no_digest": votes(alone, r)}
                 for r in range(3)}
    assert cst.check_cause(d)[0] == expected


def test_control_stage_is_free_on_fake_and_resumes(tmp_path, capsys, no_paid_calls):
    out = tmp_path / "c.json"
    cst.main(["--out", str(out)])
    capsys.readouterr()
    cst.main(["--stage", "control", "--out", str(out)])
    first = capsys.readouterr().out
    assert first.count("running no-digest control") == 3
    assert all("no_digest" in r for r in cst.json.loads(out.read_text())["peer"].values())
    cst.main(["--stage", "control", "--out", str(out)])
    assert "running " not in capsys.readouterr().out


def test_hiding_labels_removes_them_and_restores():
    person = CROWD[0]
    before = person.one_line(), prompts.crowd_system(True)
    with cst.hidden_labels():
        line, system = person.one_line(), prompts.crowd_system(True)
        assert person.attitude.lower() not in line.lower() and "General tendency" not in line
        assert "general tendency" not in system.lower() and "would_pay" in system
        assert line.startswith(f"[{person.id}] {person.name}")
    assert (person.one_line(), prompts.crowd_system(True)) == before
    assert isinstance(person, CrowdPersona)


def test_digest_without_split_keeps_the_comments():
    votes = {k: cst.CrowdReaction(**v) for k, v in run(IDS[:5]).items()}
    heard, _ = cst.janta.digest(votes)
    bare = cst.without_split(heard)
    assert "Votes so far" not in bare and bare == heard.split("\n", 1)[1]


@pytest.fixture
def no_paid_calls(monkeypatch):
    def refuse(*_a, **_k):
        raise AssertionError("a paid client was created")
    monkeypatch.setattr(SarvamClient, "__init__", refuse)
    monkeypatch.setattr("app.llm.anthropic_client.AnthropicClient.__init__", refuse)


def test_dry_run_is_free_complete_and_resumes(tmp_path, capsys, no_paid_calls, monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "sarvam")  # as in .env: must not matter
    out = tmp_path / "fake.json"
    cst.main(["--out", str(out)])
    first = capsys.readouterr().out
    assert first.count("NOT RUN") == 1 and "FAKE AI" in first  # only the separate control
    saved = cst.json.loads(out.read_text())
    assert len(saved["runs"]) == 24 and len(saved["peer"]) == 3
    cst.main(["--out", str(out)])
    again = capsys.readouterr().out
    assert "running " not in again and "tokens used this time: 0" in again


def test_real_needs_confirmation_and_never_mixes_with_fake(tmp_path, no_paid_calls):
    out = tmp_path / "r.json"
    with pytest.raises(SystemExit, match="Nothing was run"):
        cst.main(["--real", "--stage", "basics", "--out", str(out)])
    cst.main(["--stage", "basics", "--out", str(out)])
    with pytest.raises(SystemExit, match="different AI"):
        cst.main(["--real", "--yes", "--out", str(out)])
