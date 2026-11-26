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
