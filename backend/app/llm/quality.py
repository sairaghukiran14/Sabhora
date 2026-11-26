"""Shared quality rules for text the models write.

Every pattern here was returned by sarvam-105b in schema mode during testing: it sometimes
fills a field with the instructions or a placeholder instead of real content, e.g.
"reason 1 reason 2 reason 3", "one line, under 15 words", "Comment here</arg_key>...".
The schema can't catch these (they're valid strings), so checks call these helpers and a
failure triggers a retry.
"""
import re
import unicodedata
from collections.abc import Iterable
from difflib import SequenceMatcher

_TEMPLATE = re.compile(
    r"<[^<>]{1,40}>"                                  # <reason 1>, <your words>
    r"|</?arg_(key|value)"                             # leaked tool-call markup
    r"|\b(reason|point|fix|step|risk|item) \d\b"       # reason 1, fix 2
    r"|\bunder \d+ words\b|\bone line\b|\bexactly \d\b"
    r"|\b(comment|text|answer) here\b|\.\.\.(comment|text)\.\.\."
    r"|\b1-2 sentences\b|\bone or two sentences\b|\bown words\b|\bown voice\b",
    re.IGNORECASE)


def real_words(text: str) -> int:
    """Words with at least two letters in any script, so '....' doesn't count but Hindi does.
    Letters (L*) AND combining marks (M*) count: Devanagari vowel signs like the 'े' in 'ये'
    are marks, and a plain regex \\w misses them, which wrongly rejected Hindi comments."""
    return sum(1 for tok in text.split()
               if sum(unicodedata.category(ch)[0] in "LM" for ch in tok) >= 2)


def is_real_text(text: str, min_words: int = 3) -> bool:
    """True if the text is actual content: enough real words and no template leftovers."""
    words = real_words(text)
    if text.rstrip().endswith("...") and words < 8:  # "People liked it because..."
        return False
    return words >= min_words and not _TEMPLATE.search(text)


# Words that carry no point of their own, so two turns sharing them means nothing. Hinglish
# fillers are in here too: the sharks speak it, and without them every turn looks alike.
_FILLER = frozenset("""
about after again all also and any are because been before being both but can cant come
could did does doesnt dont down each even every for from get give going had has have her
here him his how into isnt its just like make many may might more most much must need not
now off one only other our out over own said same see she should show some such take than
that the their them then there these they thing think this those through too under until
very was way well were what when where which while who why will with wont would you your
abhi accha achha agar apna apne arre aur bas beta bhai bhi bina dekho hai hain hoga hogi
hona hone honge hoon hota hoti jab jaise jaye kar karo karna karte kaun kya kyunki lekin
magar main matlab mein mera mere meri nahi nahin par phir raha rahe rahi sirf tak teen
theek toh tumhara tumhare tumhari tum uska unke wala wale wali woh yeh
""".split())


def content_words(text: str) -> set[str]:
    """The words that carry the point: no filler, nothing shorter than three characters."""
    words = re.findall(r"[\w₹.,]{3,}", text.lower())
    return {w.strip(".,") for w in words if w.strip(".,") and w.strip(".,") not in _FILLER}


def repeats_point(text: str, earlier: Iterable[str], threshold: float = 0.50) -> bool:
    """True if this turn is mostly another turn's words rearranged.

    The sharks in the first real debate never copied a sentence (the SequenceMatcher check
    caught nothing) but recycled each other's points almost word for word. Containment, not
    similarity, so a short restatement of a long objection still counts.

    Replaying that debate, the three turns that plainly re-served another shark's point
    scored 0.52, 0.60 and 0.68, and the most alike turn that still made its own point scored
    0.40, so the line sits at 0.50.
    """
    words = content_words(text)
    if len(words) < 8:  # too short to tell a repeat from a coincidence
        return False
    for other in earlier:
        theirs = content_words(other)
        if theirs and len(words & theirs) / len(words) >= threshold:
            return True
    return False


def copies_instructions(text: str, instructions: str) -> bool:
    """True if most of `text` is lifted verbatim from the instructions the model was given
    (seen: a headline of "Write a short, punchy headline that sums up the crowd's verdict.")."""
    t = " ".join(text.lower().split())
    if len(t) < 20:
        return False
    src = " ".join(instructions.lower().split())
    m = SequenceMatcher(None, t, src, autojunk=False).find_longest_match(0, len(t), 0, len(src))
    return m.size >= 0.6 * len(t)


def strings_in(value: object):
    """Every string inside a dumped model (nested dicts and lists included)."""
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for v in value.values():
            yield from strings_in(v)
    elif isinstance(value, list):
        for v in value:
            yield from strings_in(v)


def require_text(field: str, *texts: str, min_words: int = 3) -> None:
    for t in texts:
        if not is_real_text(t, min_words):
            raise ValueError(f"{field} must be real, specific content written for this case, "
                             "not a placeholder or a repeat of the instructions")


# ---------- "You never told us X" when the record says X ----------
# On the first real web run (26 Nov 2026) the founder answered "Kitchens are FSSAI
# registered" and gave food and delivery cost per meal, yet a shark kept calling the
# compliance process and the unit economics "a black box", the judge listed "no FSSAI
# process was described" as a top risk, and the shark repeated it in chat.

# Words that claim something is missing, in English and Hinglish.
_MISSING = re.compile(
    r"\bnot (?:been |yet )?(?:described|mentioned|shared|explained|given|provided|disclosed|told)\b"
    r"|\b(?:didn'?t|did not|haven'?t|have not|never) (?:say|share|mention|explain|describe|give|tell|show)"
    r"|\bno (?:clear |real |hard )?(?:data|details?|information|clarity|breakdown|numbers|proof)\b"
    r"|\b(?:was|were|has been|have been) (?:not )?(?:described|mentioned|shared)\b"
    r"|\bblack box\b|\bbina\b|\bwithout\b|\bmissing\b|\bunknown\b|\black(?:s|ing)?\b"
    r"|\bnahi[n]? (?:bataya|batayi|bataye|diya|di|dikha|dikhaya|samjhaya|pata)\b"
    r"|\bkoi (?:data|process|breakdown|proof) nahi",
    re.IGNORECASE)
# Topics a shark calls missing, and words that show the record covers them. Retention,
# churn and repeat purchase are left out on purpose: replaying the real runs, "no repeat
# data outside the IT parks" and "retention strategy is a black box" were fair points that
# a month-2 renewal figure does not answer.
_TOPICS = {
    "unit economics": ("margin", "cost", "per meal", "per order", "per unit", "cac", "payback"),
    "margin": ("margin",),
    "payback": ("payback", "paid back", "pays back"),
    "revenue": ("revenue", "mrr", "arr", "sales"),
}
_ACRONYM = re.compile(r"\b[A-Z]{3,6}\b")
_NOT_TOPICS = {"AND", "THE", "NOT", "YOU", "OUT", "BUT", "FOR"}
_WINDOW = 60  # characters either side of the "missing" words


def record_error(topic: str) -> str:
    return (f"the founder already covered {topic} in the pitch or their answers. Quote what "
            "they said and say whether it convinces you, instead of calling it missing")


def ignores_record(text: str, record: Iterable[str]) -> str | None:
    """The topic `text` calls missing although `record` (the pitch, the founder's answers)
    covers it, or None. A topic quoted with its number ("CAC of 900") is a reference, not a
    claim that it is missing, so it doesn't count."""
    rec = " ".join(record).lower()
    for m in _MISSING.finditer(text):
        lo, hi = max(0, m.start() - _WINDOW), m.end() + _WINDOW
        window = text[lo:hi]
        for a in _ACRONYM.finditer(window):
            term = a.group()
            after = window[a.end():a.end() + 15]
            if term in _NOT_TOPICS or re.search(r"\d", after):
                continue
            if re.search(rf"\b{term.lower()}\b", rec):
                return term
        low = window.lower()
        for topic, evidence in _TOPICS.items():
            at = low.find(topic)
            if at < 0 or re.search(r"\d", low[at + len(topic):at + len(topic) + 15]):
                continue
            if any(e in rec for e in evidence):
                return topic
    return None


# ---------- the same objection from the whole panel ----------
# Third real run (27 Nov 2026): four of five sharks said "zero switching cost against Swiggy
# and Zomato". repeats_point compares whole turns, so one shared argument inside otherwise
# different turns got through. A general phrase-overlap rule flagged 12 of 22 real turns
# (mostly harmless shared words), so this is a short list of objection catchphrases seen on
# real runs: once two sharks have made one, a third may not.

OBJECTIONS = {
    "switching cost": r"switching cost|zero lock-?in",
    "moat": r"\bmoat\b|defensib",
    "wrapper": r"\bwrapper\b",
    "easy to copy": r"copy kar|can copy|copy (?:it|this|you|your)",
    "single point of failure": r"single[- ]point[- ]of[- ]failure",
    "black box": r"black box",
    "one-city limit": r"travel kar|beyond (?:one|the first|your first) city|ek hi city|single[- ]city",
}
MAX_SHARKS_PER_OBJECTION = 2


def taken_objections(transcript: Iterable[tuple[str, str]]) -> dict[str, set[str]]:
    """Objection -> the sharks who already made it (the founder raising it doesn't count)."""
    used: dict[str, set[str]] = {}
    for who, text in transcript:
        if who == "Founder":
            continue
        for name, rx in OBJECTIONS.items():
            if re.search(rx, text, re.IGNORECASE):
                used.setdefault(name, set()).add(who)
    return used


def crowded_objection(text: str, speaker: str, transcript: list[tuple[str, str]]) -> str | None:
    """An error message if `speaker` makes an objection that two other sharks already made."""
    founder = " ".join(t for w, t in transcript if w == "Founder")
    for name, sharks in taken_objections(transcript).items():
        others = sharks - {speaker}
        rx = OBJECTIONS[name]
        if len(others) >= MAX_SHARKS_PER_OBJECTION and re.search(rx, text, re.IGNORECASE) \
                and not re.search(rx, founder, re.IGNORECASE):
            return (f"'{name}' has already been argued by {' and '.join(sorted(others))}. Leave "
                    "it to them and judge this pitch through what you personally care about")
    return None


# ---------- places nobody mentioned ----------
# Real runs: Ananya named "Indore aur Patna" (from her old persona example) and later "Meerut ya
# Kochi" in a Pune-only pitch, even after a prompt rule against it. A shark may name a city
# only if the pitch or the founder did.
INDIAN_CITIES = (
    "Mumbai Delhi Bengaluru Bangalore Chennai Hyderabad Kolkata Pune Ahmedabad Surat Jaipur "
    "Lucknow Kanpur Nagpur Indore Bhopal Patna Vadodara Ludhiana Agra Nashik Meerut Rajkot "
    "Varanasi Srinagar Aurangabad Amritsar Ranchi Coimbatore Madurai Kochi Cochin Vijayawada "
    "Visakhapatnam Guwahati Bhubaneswar Chandigarh Mysuru Mysore Gwalior Jodhpur Raipur Kota "
    "Bareilly Dehradun Noida Gurgaon Gurugram Thane Siliguri Guntur Rohtak Udaipur Jabalpur "
    "Allahabad Prayagraj Thiruvananthapuram Mangaluru Mangalore Hubli Belgaum Goa Shimla"
).split()


def unmentioned_city(text: str, record: Iterable[str]) -> str | None:
    rec = " ".join(record).lower()
    for city in INDIAN_CITIES:
        if re.search(rf"\b{city}\b", text) and city.lower() not in rec:
            return city
    return None
