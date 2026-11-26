# Shark quality fixes, 26 Nov 2026

> This report was written before the rename. The product is now Sabhora by Neevora Labs.


Fixes for the four faults in [the first real run](real-sharks-run-2026-11-26.md). Built and
checked on the offline fake AI only; no paid call was made.

## What changed

| Fault | Fix | Enforced by |
|---|---|---|
| Invented figures ("₹4,812" for 18 × ₹299) | A shark fills `maths` with its arithmetic before speaking; the code recomputes it, and refuses any rupee figure that is not established or worked out | `app/debates/numbers.py`, code |
| Ignored the founder's answers | An ESTABLISHED FACTS block lists the pitch, the ask and every founder answer, with a rule never to call them missing | prompt only |
| Sharks reworded each other | Content-word containment, on top of the old near-verbatim check | `app/llm/quality.py: repeats_point`, code |
| Everyone passed in round 1 | Round 1 is for questions: stance must be "maybe" | `app/debates/sharks.py: round_check`, code |

Figures are checked when written with a rupee sign or worth 1000 or more, so counts and
percentages pass untouched. A figure one shark works out correctly becomes sayable by the
others. The judge's verdict is held to the same list, so a bad number cannot reach it.

## Replaying the real run through the new checks

- **Invented figures: 12 of 17 turns rejected.** "₹4,812" is caught the first time Arjun says
  it, so it never reaches the other four sharks or the verdict. Also caught: "10,000 kirana
  stores" and "JioMart's 10 lakh kirana partners".
- **Repetition: 3 turns rejected** at the chosen threshold of 0.50. The three plainly recycled
  turns scored 0.52, 0.60 and 0.68; the most similar turn that still made its own point scored
  0.40, so there is room either side. The old check caught none of them (the worst pair is only
  0.64 alike word for word, under its 0.75 line).

## Not proven yet

- **Everything above is the fake AI plus a replay.** Whether the real model fills `maths`
  properly, and how often it gets rejected and retried, needs another paid run. Retries cost
  tokens, so the real cost per run may rise.
- **Offers and counters have still never run on the real model**: all five sharks went out last
  time. The round-1 rule should help, but that is the thing to watch.
- **The founder-answers fix is prompt-only.** Nothing in code can tell that "no repeat-order
  data" contradicts an answer that gave it.
- **Known trade-off:** a shark can no longer cite outside figures it may genuinely know, such as
  a competitor's scale, because the code cannot check them. It can still make the point in
  words. Arithmetic that is correct but built on a wrong premise also still passes.
