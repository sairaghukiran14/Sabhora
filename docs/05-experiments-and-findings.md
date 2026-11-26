# 05 · Approaches Tried & What We Found

**Scope:** How we have tried to make the AI panels believable and useful, what each attempt showed, and what is still unproven. Status as of **26 November 2026**.

> **Read this first:** every result here is about **simulated people**. None of it shows that the product predicts what real people will buy. Most figures come from one run, or a few runs, of one or two pitches. Treat them as leads, not as established facts.

## Summary

| # | Approach | Status | Main finding |
|---|---|---|---|
| 1 | Choosing a model for the personas | Tested on real AI | `sarvam-105b-conversations` passed all 34 first-try tasks and was the cheapest tested |
| 2 | Making model replies reliable | Built | Schemas alone were not enough; replies needed quality checks and retries |
| 3 | Richer crowd personas | Tested on real AI | Attitude labels predicted votes less in one run per pitch |
| 4 | Five invented investors with offers | Built, one real run | The flow ran, but the reasoning had four serious faults |
| 5 | Fixes for those faults | Built, **not tried on real AI** | A replay of the real run catches invented figures and reworded points |
| 6 | A real 100-person crowd run | One real run | Strongly negative; 9 of 10 supporters were early adopters |
| 7 | A proposal for a "behaving" crowd | Discussed, **not built** | Good direction, but its choices would still be stated intent |
| 8 | Crowd sensitivity test | All five checks and a follow-up control run on real AI | Attitude labels dominate votes; second-round "changes" mix noise, the way of asking and peer comments |
| 9 | Public idea board with human feedback | Discussed, **not built** | Could add real responses, if the right people respond |

---

## 1. Choosing a model for the personas

**What we did:** gave several models the same tasks and prompts, scored on the first try by the app's own quality checks (`backend/scripts/model_bakeoff.py`).

| Model | Passed | Median call | Rs per crowd call |
|---|---|---|---|
| `sarvam-105b-conversations` | 34/34 | 1.3 s | 0.011 |
| `glm5.3-flash` | 34/34 | 0.7 s | 0.018 |
| `gemma4` | 34/34 | 0.6 s | 0.035 |
| `deepseekv4.1-flash-1017` | 34/34 | 2.0 s | 0.027 |
| `glm5.3` | 34/34 | 2.7 s | 0.149 |
| `sarvam-105b` (earlier test) | 23/31 | about 1 s | 0.011 |

**Decision:** Sarvam plays the personas; Claude writes verdicts. On the same crowd data, Claude's Janta summary passed every quality check first time (4/4), while Sarvam managed about 2 in 5.

**Limit:** small samples. A first signal only.

## 2. Making model replies reliable

| Problem seen on the live API | What we changed |
|---|---|
| Text fields came back empty, or copied the pitch or the instructions | Minimum lengths, plus quality checks that reject and retry |
| A request for 10 people returned 1, or gave everyone the same vote | One required field per person, comment before vote, 3 people per call |
| Batched second-round replies failed 8 times in 10 | Second round asks one person per call |
| The judge wrote a score before its reasons | Reasons first, score last |
| Hidden thinking used up the token limit and cut off replies | Higher minimum token limit per call |
| About 50–60 requests per minute allowed | One shared limiter; wait and retry |
| Hindi comments were rejected by the word count | Count Devanagari vowel signs correctly |

**Lesson:** a valid format does not mean a sensible answer.

## 3. Richer crowd personas

**Problem:** early personas had only name, age, job, city and attitude. The attitude label predicted **82–92%** of votes. Mixing models did not change that, and a "judge fit first" instruction helped only one pitch.

**What we did:** added household, daily work, current spending, phone habits and two pain points, moved attitude to the end as a "tendency", and limited ages by job.

| One 50-person run per pitch | Thin personas | Richer personas |
|---|---|---|
| KiranaOne: share of votes the label predicts | 82% | 64% |
| PaathShala: share of votes the label predicts | 84% | 56% |
| Kirana owners vs others agreeing | not measured | 2/2 vs 7/48 |
| Homes counted as having school-age children vs others agreeing | not measured | 9/20 vs 6/30 |

**Two cautions we found later:**
- The old parent group of 20 matched school keywords, so it included grandparents. The new test uses 14 homes with their own school-age child.
- The old script's "lift" score can miss label dominance. When most people in every group vote the same way, it reads zero. On the run in section 6 it would be **0**, although one group supplied 9 of 10 supporters.

The profiles are hand-written, not survey data.

## 4. Five invented investors with offers

**Request and choice:** the aim was more relatable investors, with real TV judges suggested. We advised against copying real people because of invented quotes on shareable pages and personality-rights risk. Five original characters were chosen, with an ask, "I'm out", offers, team-ups, bidding and one founder counter.

**One real run** (made-up pitch, scripted founder answers; [full transcript](../reports/real-sharks-run-2026-11-26.md)): no errors, about 35,000 tokens, roughly ₹0.40 in AI cost.

| Fault | Example |
|---|---|
| Wrong arithmetic, then repeated | 18 × ₹299 is ₹5,382; the panel and verdict used ₹4,812 |
| Founder's answers ignored | Sharks said repeat-order data was missing after it had been given |
| Copying | Sharks reworded each other's points |
| Early collapse | Four of five opened at "pass", and all ended out |

A payback of about 4 months was also described as one that would never happen. Because every shark went out, **offers and counters have not been tried on real AI**.

## 5. Fixes for those faults

| Fault | Fix | Enforced by |
|---|---|---|
| Invented figures | Sharks show arithmetic; code recalculates it and refuses unsupported rupee figures | Code |
| Ignored answers | An "established facts" list in the prompt | **Prompt only** |
| Reworded points | A word-overlap check, with the line at 0.50 | Code |
| Early collapse | Everyone must be "maybe" in round 1 | Code |

**Replay of the real run:** 12 of 17 turns would be rejected for unsupported figures, and 3 for reworded points. The 0.50 line was chosen using this same run, so it still needs testing on new ones.

**Trade-off:** a shark cannot cite an outside figure that the code cannot check. Correct arithmetic built on a wrong assumption still passes.

Details: [fix report](../reports/shark-quality-fixes-2026-11-26.md). **Not yet tried on real AI.**

## 6. A real 100-person crowd run

**Pitch:** an app that suggests daily outfits from photos of your clothes. Target customer "Everyone", price "500" with no billing period. Run `a8edb6093115`: 85,866 tokens, about 70 seconds.

| | Agree | Neutral | Disagree | Would pay |
|---|---|---|---|---|
| Round 1 (100 people) | 12 | 15 | 73 | 9 |
| Final | 10 | 5 | 85 | 7 |

- **Labels:** 9 of 20 early adopters agreed, against 1 of the other 80.
- **Second round (44 re-asked):** all 4 re-asked supporters stopped agreeing, and 11 of 15 neutrals turned negative. This could be persuasion or following the crowd.
- **Comments:** 28 final comments used "jhanjhat" (hassle). 14 used subscription or monthly wording although no period was given; we did not read each one to confirm what it referred to.

One run of a loosely defined pitch cannot show whether rejection was the right answer.

## 7. A proposal for a "behaving" crowd

The proposal: separate discussion from private decisions, give personas budgets and competing motives, ask for actions rather than opinions, discount stated intent, and validate against real data.

**Main point:** an AI persona choosing "Pay today" has not done anything. It is still **stated intent**.

| Idea | Our view |
|---|---|
| Private decision separate from discussion | Adopt; its later "after seeing others" round brings peer pressure back, so compare both |
| Action choices (ignore, bookmark, waitlist, pay) | Adopt, including "ignore" |
| Results as a spread, with reasons people changed | Adopt, with counts and a "directional" label |
| Budgets and forced trade-offs | Test first; we would be inventing the numbers |
| Motives, weights and extra traits | Skip for now; no basis for the weights |
| 0–100 confidence | Use a few named levels instead |
| Repeated runs and higher temperature | Repeats help measure variation, not bias |
| Devil's advocate | Keep out of the vote count |
| Discount on stated intent | Wait until there is real data to set it |

**Gap the proposal missed:** our crowd is not a market sample. It gives each attitude an equal share and is not built around the founder's target customer.

**Outside research** (from search summaries; we did not read the full papers):
- [A 2025 study](https://www.alphaxiv.org/abs/2510.08338) matched human survey intent well when models answered in words that were then scored; asking for ratings directly did much worse. It did not test purchases.
- [Intentions predict sales imperfectly](https://nowpublishers.com/article/Details/MKT-036), and related work reports a weaker link for new products.
- Further reading on [simulated survey respondents](https://arxiv.org/pdf/2507.02919) and on [temperature and variety in creative tasks](https://arxiv.org/pdf/2607.26899). We found nothing specific to India.

**Agreed direction:** test today's crowd first, then change one thing at a time. Lead with an **objection finder** ("what may stop people, and what to ask real ones"), test version comparison later, and do not sell a forecast.

## 8. Crowd sensitivity test

**Tool:** `backend/scripts/crowd_sensitivity_test.py` (the control is `--stage control`). Pass rules were fixed before the real runs. The same 50 people, three times per condition, first round only except for check 5.

| Check | Question |
|---|---|
| 1 Repeat runs | Do totals stay steady? (differ by 5 people at most) |
| 2 Price | Do fewer people pay as the price rises, by more than normal variation? |
| 3 Target fit | Do homes with school-age children like a school tutor more? |
| 4 Attitude labels | What changes when labels are hidden? |
| 5 Peer influence | Does showing the vote split push people to the majority? |

**Improvements made while building it:**
- A planned 20-point cutoff for label dominance was dropped. In a simulation of single runs with random votes, gaps that large appeared 72–96% of the time. Label and fit gaps must now beat 95% of gaps from random groupings.
- The repeat check reports "can't tell" when counts are too small for the rule to fail.

### Results: checks 1 and 2 (154,971 tokens)

All nine runs received 50 of 50 answers. Rupee cost was not measured.

**1 · Repeat runs: PASS.** At ₹500, agree was 8, 8, 6 and would-pay 4, 4, 3. However, **19 of 50 people changed vote** between identical runs, and a 5-person allowance is generous when counts are 3–8.

**2 · Price: PASS, weakly.**

| Price per month | Would pay, per run | Total of 150 answers | Agree, of 150 |
|---|---|---|---|
| ₹49 | 4, 5, 7 | 16 | 27 |
| ₹500 | 4, 4, 3 | 11 | 22 |
| ₹5,000 | 0, 1, 1 | 2 | 16 |

The ₹49 to ₹5,000 drop exceeded normal variation. **The ₹49 to ₹500 gap did not.**

**What the passes hide:**
- Early adopters are 10 of 50 people but gave **59 of 65** agree answers and **27 of 29** would-pay answers.
- At ₹500, the gap between attitude groups was 63 points; random groupings stayed within 37 points 95% of the time. This does **not** prove the label is the cause: early adopters were also more likely to be given better phones.
- Some answers did not fit their persona: a software engineer earning ₹1–2 lakh a month called ₹49 a month too expensive, and an auto-driver persona appeared to read it as ₹49 a day.

### Results: checks 3–5 (362,561 tokens)

All 15 first-round runs received 50 of 50 answers. Rupee cost was not measured. Checks 1–5 used 517,532 tokens in total; the follow-up control below brought it to 556,025.

| Check | Verdict by the rules set in advance |
|---|---|
| 3 Target fit (labels shown, as in the app) | **FAIL** |
| 4 Attitude labels | **NEEDS ANOTHER FIX** |
| 5 Peer influence (the vote count only) | **PASS** |

**"Hidden" means** the label was removed from each persona, and so was the instruction about it. The same personas kept the same other facts, including their phones.

#### 4 · Hiding labels removed their dominance

| Gap in agree rate between attitude groups | Labels shown | Labels hidden | Random grouping stays under |
|---|---|---|---|
| Outfit app at ₹500 | 63 points | 13 points | 37 |
| School tutor | 90 points | 30 points | 50 |

Across the three outfit prices, early adopters agreed in **59 of 90** answers with labels and **9 of 90** without. Because their phones and other facts stayed the same, this shows that **showing the label caused much of the concentration** in these tests. The earlier concern that phones might explain it does not account for this change.

Hiding labels mostly removed early adopters' support, so total support fell too:

| Outfit price | Agree of 150: shown → hidden | Would pay of 150: shown → hidden |
|---|---|---|
| ₹49 | 27 → 13 | 16 → 12 |
| ₹500 | 22 → 7 | 11 → 5 |
| ₹5,000 | 16 → 3 | 2 → 0 |

**Why the verdict is "needs another fix":** without labels, would-pay still fell with price (12, 5, 0), but the average ₹49 to ₹5,000 drop was **4 people and normal variation was also 4** (₹49 runs: 2, 6, 4). The rule required the drop to be larger, so the price check failed. We have not changed the rule after seeing the result.

#### 3 · Target fit passed only with labels hidden

14 of the 50 homes have their own school-age child (42 answers over three runs); 36 do not (108 answers).

| Tutor | Parents agree | Others agree | Average gap | Random grouping stays under | Parents would pay | Others would pay |
|---|---|---|---|---|---|---|
| Labels shown (**FAIL**) | 16/42 (38%) | 21/108 (19%) | 19 points | 22 | 16/42 | 14/108 |
| Labels hidden (passes the same rule) | 19/42 (45%) | 13/108 (12%) | 33 points | 17 | 18/42 | 9/108 |

With labels shown, parents led in every run, but not by more than random grouping could produce. With labels hidden, **the crowd responded much more to whether the product fits the home**. The labels-hidden result is part of check 4's design, but check 4's one-line verdict does not mention this gain.

#### 5 · The vote count was not the main problem; the second round was

Showing the vote count added 3, 0 and −1 people to the majority in three repeats, so check 5 passed. But **both versions** moved strongly towards "disagree". The same 65 answers, from people re-asked across three repeats:

| | Agree | Neutral | Disagree |
|---|---|---|---|
| Their first-round votes | 9 | 24 | 32 |
| Second round **without** the vote count | 4 | 3 | 58 |
| Second round **with** the vote count | 1 | 4 | 60 |

This matters because the app's final result includes the second round.

#### Follow-up control: what causes the shift (38,493 tokens)

We asked the same people again, **one per call, with no comments and no vote count**. We also used the saved identical runs, free, to see how they vote when simply asked again **three per call**, as in round 1. The rule for reading the result was written into the script before the control ran.

| The same 65 answers | Agree | Neutral | Disagree |
|---|---|---|---|
| First round, when they were picked | 9 | 24 | 32 |
| Asked again, three per call\* | 11 | 12 | 42 |
| Asked again, one per call, nothing heard | 1 | 16 | 48 |
| One per call, after reading comments | 4 | 3 | 58 |
| One per call, comments and vote count | 1 | 4 | 60 |

\*Average of the two other identical first-round runs.

The rise in "disagree" from 32 to 58 breaks into three steps:

| Step | Extra "disagree" | What it suggests |
|---|---|---|
| 32 → 42: simply asking again | 10 | The group was **picked** for being unsure (all neutrals, plus a third of the rest). Votes are unsteady, so many drift back towards the usual mix without hearing anything |
| 42 → 48: asking one per call | 6 | The way of asking changes the answer. "Agree" fell from 11 to 1 |
| 48 → 58: reading comments | 10 | Comments nearly removed "neutral" (16 → 3) |

**Pre-set verdict: BOTH.** Beyond simply asking again, comments account for about 62% of the remaining gap and one-per-call asking for the rest. The rule called two thirds or more "the comments", so 62% is close to that line. Both effects pointed the same way in all three repeats, but the counts are small, so the exact split is uncertain.

**What this means for the app:**
- Part of what looks like people **changing their minds** is ordinary variation. The app marks any changed vote as a change, and that should not be presented as persuasion.
- The second round differs from the first in how it asks, as well as in what people hear, so the two rounds cannot be compared directly.
- The control does not show which round is closer to how real people would answer.

#### Individual votes remain unreliable

| People whose vote changed between three identical runs (of 50) | Labels shown | Labels hidden |
|---|---|---|
| Outfit app at ₹500 | 19 | 27 |
| School tutor | 28 | 30 |

Totals can be fairly steady while individual votes are not. **Do not present one persona's vote as meaningful.**

---

## 9. Public idea board with human feedback

**Idea:** founders may choose to publish an idea; signed-in people say whether they would pay; the founder sees AI and human views.

**Why it could help:** it adds real responses, and actions such as joining a waitlist.

**Agreed safeguards:** private by default; a separately edited public version with a clear warning that others can see and build it; ask "Is this meant for you?"; hide the AI score and other votes until someone responds; show counts; keep AI and community results separate; judge the same text on both sides; reporting and takedown from the start; no popularity leaderboard at first.

**Open question:** where will the first 50 useful voters come from?

**Not built.** It would also need hosting, account verification, terms and privacy pages, and moderation; recheck what exists before launch.

---

## What we can and cannot say today

| We can say | We cannot say yet |
|---|---|
| Quality checks catch several kinds of bad reply we have seen | That every reply is correct or sensible |
| In one outfit pitch, fewer would pay at ₹5,000 than at lower prices | That the crowd can choose between nearby prices |
| Totals were fairly steady in three identical runs | That any one persona's vote is reliable |
| Showing attitude labels caused much of the early-adopter concentration | That hiding labels fixes everything: its price check failed on a tie |
| With labels hidden, a school tutor drew more support from parents | That target fit works for other products |
| The second-round shift comes from asking again, asking one per call and reading comments | The exact share of each, or which round is closer to real people |
| The investor fixes catch figures and repetition in a replay | That they work on new real runs |
| | That any percentage predicts real demand |

## What comes next

1. **Stop letting the second round decide the final result** (recommended, not yet done): use round 1 for the counts, and either drop round 2 or show it separately as "how reactions moved", without calling it persuasion. Confirm round 1 behaves well after any prompt change.
2. **Hiding attitude labels is the leading change**, but confirm price and target fit on pitches not used so far before calling it fixed. Set the rules before running. Adding more repeats of the same price test is not a fair way to rescue it: the "normal variation" measure is a range, which cannot shrink with more runs.
3. Require target customer, price and billing period; group repeated objections.
4. Try the report with 5–10 founders: did it show something new or change what they did?
5. Consider the idea board once suitable voters can be reached.
6. Run one real Sharks debate to test the fixes, offers and counters (needs approval to spend).
7. Compare with real behaviour, such as signups or pre-orders, before considering any forecast.

## Reproducing the tests

```bash
cd backend
.venv/bin/python scripts/crowd_sensitivity_test.py                        # free dry run, random votes
.venv/bin/python scripts/crowd_sensitivity_test.py --real --report-only   # free: re-read saved results
.venv/bin/python scripts/crowd_sensitivity_test.py --real --stage basics  # PAID
```

A `--real` run without `--report-only` spends credits for any result not already saved. Saved real results: `backend/data/crowd_tests/real.json`. The app's daily token limit does not apply to this script.

**Sources for sections 1–3:** the project `README.md`; those tests were not rerun for this document.
