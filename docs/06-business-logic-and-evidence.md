# 06 · Sabhora: Business Logic and Evidence

**Scope:** what the product does with a founder's idea, what code enforces, why each rule exists, and what proof we have. Written 27 November 2026 from the code, `docs/05` and `reports/`.

## The six statements to remember

1. **Sabhora is a simulation.** AI plays invented investors, crowd members and reviewers. Nothing yet shows that its output predicts what real people will do.
2. **AI writes the opinions. Code controls the process:** turn order, money, limits, vote counts, deal terms and which replies are rejected.
3. **A quality check rejects known kinds of bad reply.** It does not prove that an accepted reply is true or sensible.
4. **Scores are AI judgement.** The Sharks score and the Roast overall score are chosen by the judge model. Code only keeps them between 0 and 10. (The Sharks panel's invest / pass label is counted by code from the votes.) We have not tested whether the same pitch gets the same score twice.
5. **The evidence is thin but real.** Most Sharks fixes came from real failures on one test pitch (DabbaDost, a Pune tiffin service).
6. **"Everything works perfectly" is not a claim we can make.** Section 9 lists what is open.

## How to read the evidence labels

| Label | Meaning | Strength |
|---|---|---|
| **REAL** | Seen working in a paid run on real AI | Strongest we have. Usually one or a few runs |
| **REPLAY** | New check run again over saved real replies | Shows it catches the old mistake, not new ones |
| **TEST** | Automated test on the fake AI or plain code | Shows the code does what we wrote |
| **CODE** | Found by reading the code | No test or run cited |

A check that "never fired" in a real run has not been shown to catch anything live. It may only mean the model did not make that mistake.

**Rechecked on 27 Nov 2026, after two fixes (section 9):** 165 of 165 backend tests pass (fake AI, in a copy without `.env`), including all later fixes in section 9; there were 110 before any fix. Web type-check and lint pass. I found no web test files. **Not rechecked:** real-AI results, costs and timings are quoted from the reports. No paid run was made.

---

## 1. The journey of one run

| Step | What happens | Why |
|---|---|---|
| 1 | The web app validates the input (idea 20–600 characters, or a public URL) and the plan limit | Stop bad input before money moves |
| 2 | It locks the user's row, checks the balance and the 2-running-runs cap, and holds the credits | Two tabs cannot spend the same credits |
| 3 | It asks the engine to start. If that fails, the run is removed and the credits returned | No charge for a run that never began |
| 4 | The engine runs the room and streams events one by one | The founder watches live; a reconnect resumes where it left off |
| 5 | Each AI reply is checked before it is shown | Section 3 |
| 6 | A judge model writes the verdict | A separate model, with its own token reserve |
| 7 | The web app settles: **a verdict keeps the credits, no verdict refunds them** | One simple, explainable money rule |
| 8 | The result is saved. It is private unless the owner shares it | Ideas are sensitive |

Only the web server talks to the engine, using a shared secret. The engine refuses to start in production without one.
Files: `web/app/actions/runs.ts`, `web/lib/runs.ts`, `backend/app/api.py`, `backend/app/debates/runner.py`.

## 2. Money

### Credits

| Room | Credits | Measured AI cost per run (from reports) |
|---|---|---|
| Sharks | 15 | ₹0.55–0.96 |
| Janta 25 / 50 / 100 | 10 / 20 / 30 | ₹0.18–0.19 for 25; rupee cost of 50 and 100 not recorded here |
| Roast | 5 | ₹0.13 |
| Chat message | Free | about ₹0.01 |

New accounts get 50 credits. Payments are not connected, so nothing can be bought yet. `docs/04` overstates Claude cost about 10 times (see the 26 Nov report).

### Why the credit books stay correct

| Rule | How | Evidence |
|---|---|---|
| Balance is never a stored number | It is the sum of an add-only ledger | CODE |
| No double charge or double refund | Each hold and refund has a unique key in the database | CODE |
| No overspending from two tabs | The user row is locked during check-and-hold | CODE |
| A run settles once | The run row is locked; only a `running` run can settle | CODE |
| Closed tab still settles | The server polls every 3 s and catches up on later page visits | CODE |
| Engine restarted or lost | Refund (on "not found", or after 30 minutes) | CODE |

**Observed on the real web run:** credits held, kept on a verdict, refunded on a failure, with matching ledger rows. **Checked once after the fixes:** the web app's real settlement code, run against the local test database with a fake engine. A failed judge gave `reserve -15, refund 15` (balance back to 50); a working judge kept the 15. Settling again added nothing.

**There is still no automated test of the money logic in the project.** That check was a one-off script. It is the most important gap in testing.

### Spending limits

| Limit | Value | Note |
|---|---|---|
| Tokens per Sharks or Roast debate | 60,000 | Plus separate reserves: verdict 30,000, deal table 25,000 |
| Janta budget | people × rounds × 1,500 | |
| Chat | 12,000 per message | |
| Server per day | 600,000 | Added when a debate **ends**, so runs in progress can pass it. Resets on restart |
| Engine rate | 30 runs and 120 chats per user per hour | In memory |
| Web rate | 20 runs and 60 chats per user per hour | In memory |

A token limit is checked before each call, so the last call (or several parallel calls) can go slightly over.

## 3. How an AI reply is controlled

Sharks, Janta, Roast and chat replies and the verdicts all pass through one function, `complete_typed` (`backend/app/llm/base.py`):

1. Check the token budget.
2. Ask for JSON in a fixed shape.
3. Check the shape and required fields. Some scores are forced into range.
4. Reject any field copied from our own instructions.
5. Run that room's quality rules.
6. If rejected, send the reason back and retry (2 or 3 attempts in total).
7. If it still fails, drop that turn or use a fallback. **The Sharks verdict has no fallback:** the run fails and is refunded.

**Why:** on the live API, a valid shape still came back empty, copied or made up. **Lesson recorded in `docs/05`:** a valid format does not mean a sensible answer.

**Design choices:** the model writes arithmetic before speaking, a comment before voting, and reasons before the score. The model fills fields in order, so the working comes before the conclusion.

**Models:** Sarvam plays the personas, Claude writes verdicts. In the bake-off, `sarvam-105b-conversations` passed 34 of 34 tasks first time. On Janta summaries Claude passed 4 of 4; Sarvam about 2 in 5. Small samples.

---

## 4. Sharks

### Flow

Five invented investors, 3 rounds. Round 1 follows a fixed order; later rounds rotate and let the most doubtful speak first. The founder can answer between rounds (45 s). If there is an ask, sharks still in go to the deal table: offer, join or leave; competing offers may improve, hold or withdraw; the founder accepts, counters once or walks (90 s). Then the judge writes the verdict.

### What code decides, not AI

- Speaking order and who is out
- The company value (investment × 100 ÷ equity %)
- Offer limits: total money 50–150% of the ask, equity ≤ 75%, royalty ≤ 15%, interest ≤ 24%
- An accepted counter uses the **founder's** numbers, never a model's retelling
- In the final verdict, a shark with a standing offer is recorded as "invest"; one who left is "pass"
- The panel's label: "invest" or "pass" only with more than half the panel (3 of 5), otherwise "maybe". The score stays the judge's. A single shark can make a deal while the label is "pass"

### Each rule: what went wrong, what we do, what proves it

| What went wrong on real AI | Rule now | Evidence |
|---|---|---|
| "₹4,812" for 18 × ₹299 (really ₹5,382), repeated into the verdict | Shark shows its maths; code recalculates. Unsupported rupee figures are rejected | REPLAY (12 of 17 old turns rejected), TEST |
| "4812000 * 1" would have made any invented figure "checked" (found by probing, not seen from a real model) | The numbers inside the maths must be established too (section 9.1) | TEST. REAL: ran on 4 shark replies with sums and passed them all; not yet seen rejecting on real AI (report section 20) |
| Correct mental maths was rejected, dropping turns | A figure one arithmetic step from known figures is accepted | REAL (next run: 14 of 14 turns spoke). On this record about 0.1% of random precise figures and 6.7% of round thousands would also pass |
| "25 meals" called 25 months or weeks | That unit mix-up is rejected | REPLAY, TEST. REAL: not seen again |
| A nonsense formula gave a 60-month payback; sharks walked out | Code works out payback (CAC ÷ monthly margin) when both are known. Stated paybacks must be within 35% or half a month | REPLAY, TEST, REAL: sharks used about 1.1 months. **A later real run showed it firing wrongly and blocking the only offer. Fixed, see 9.4** |
| "FSSAI not described" after the founder described it | Rejects "missing" claims about covered topics; facts are listed in the prompt | REPLAY (6 flags, all real errors), REAL. Topic list is limited |
| Sharks reworded each other | Word-overlap limit of 50%, plus a list of overused objections (max 2 sharks each) | REPLAY, TEST. The limit was tuned on the same run. **Partial:** a new shared phrase appeared |
| Everyone left early | Round 1 is questions only; at most 2 leave per round | TEST, REAL (limit held) |
| No offers in 3 real runs | Prompt changed: price the risk in; leave only if no valuation works | Experiment: 0 of 10 offers before, 6 of 10 after. REAL: offers made |
| Called the valuation too high, then offered the same | An opening offer must then value the company lower | TEST. REAL: a lower offer was made |
| Stance field did not match the words | Rejected for common phrasings | TEST. REAL: no stance talk in the next run |
| Named cities nobody mentioned | Rejected, from a fixed city list | TEST |
| Counter reply rejected for quoting the counter; verdict could not quote the deal | Both now share the list of known figures | REAL |
| Verdict gave one shark another's terms | Each shark's reason may quote only its own offer figures | TEST, REAL |
| "Final offer" after a counter was worse than the first | A revision must sit between the first offer and the counter on every term | TEST only. **Not seen on real AI** |

### Real-run record (web and engine reports)

- Early runs: no offers at all.
- After the prompt fix, offers, bidding, counter and acceptance all ran. A second later run also closed a deal.
- The payback fix and the counter-reply and attribution fixes were confirmed in the latest real run (`KLxJt-yry45qMfL4`, 63,600 tokens, ₹0.73). The one later rule (revision range) was not.

**Why invented sharks:** real TV judges would mean invented quotes about real people on shareable pages, and personality-rights risk.

---

## 5. Janta (the crowd)

### Flow

1. Code generates personas from hand-written building blocks, with a fixed seed. The same inputs give the same crowd. **They are not survey data.**
2. If the pitch names cities or a target customer, about 70% of the crowd is placed there. The rest is a comparison group.
3. People are asked 3 per call. Each gives a comment, then a vote (agree, neutral, disagree) and "would pay".
4. An optional second round re-asks all neutrals and about a third of the others, after showing them round 1.
5. **Code counts the votes and segments.** The judge only writes the summary.
6. The summary must have one "for" reason per agreeing person (up to 3), and the same for "against". So it cannot invent supporters.

### What testing showed

| Finding | Action | Evidence |
|---|---|---|
| A Pune business was judged by a mostly non-Pune crowd | Crowd targeting | REAL: 17 of 25 matched; feedback became relevant |
| The "early adopter" label drove votes (59 of 90 agrees, against 9 of 90 hidden) | Labels hidden by default | REAL. On two new pitches the payer-concentration rule passed on both; "market beats comparison" passed on one, failed on one |
| Fewer paid at ₹5,000 than at lower prices | None | REAL, weak. **₹49 vs ₹500 could not be told apart.** With labels hidden, the price check failed on a tie |
| Votes are unsteady | None | REAL: 19 to 30 of 50 people changed vote between identical runs |
| Round 2 pushed people to "disagree" | `JANTA_ROUNDS=1` in local `.env` | REAL: partly re-asking, partly one-per-call, partly reading comments |

**Statements you can make:** totals were fairly steady in three repeats of one pitch. The comments are useful as a list of possible objections.

**Statements you cannot make:** that "35% would pay" means 35% of real people will pay, or that any one persona's vote means something.

**Caution:** the code default is still **2 rounds**. Only your local `.env` sets 1. A new server without that line brings round 2 back, and it decides the final result.

## 6. Roast

1. The engine fetches the page. It allows only public http(s) addresses, rechecks each redirect, and caps size and time.
2. It reads **text only**: title, description, headings, buttons and up to 3,500 characters.
3. Six reviewers score clarity, trust, design and call-to-action, and give one fix.
4. Code averages the scores. The judge picks the top 3 fixes and an overall score.

**Checks:** shape, real text, not copied from instructions.
**Not checked:** whether a reviewer invented something about the page, or whether the overall score matches the averages.
**Important:** the **Design score is given without seeing the page.** The 26 Nov report raised this, and the code still reads text only.

## 7. Chat after the verdict

A founder can question any persona. The persona is rebuilt with its profile and what it said. The prompt says to change view only for a real reason. Code rejects very short or placeholder replies, "I am an AI" style lines and near-repeats. The engine stores no chats.

**Chat has no figure check and no "ignored the founder" check.** A persona can state a wrong number there.

## 8. Accounts, privacy and safety

| Area | What the code does |
|---|---|
| Passwords | Stored as scrypt hashes; at least 10 characters with a letter and a number |
| Sessions | Random token; only its hash is stored; HTTP-only cookie |
| Login | Rate limited; same message and similar work for unknown emails |
| Password reset | One-use, 30-minute link. **No email is sent yet** |
| Ownership | Run reads and changes are filtered by the signed-in user |
| Sharing | Off by default; only finished runs the owner shares |
| Deleting | The engine copy is queued for erasure and retried |
| Output to browser | Token counts, model names and provider error text are removed |
| Saved API keys | Encrypted, but **not yet used** for runs |
| Terms and privacy pages | Written; marked draft; **need a lawyer** |

Evidence is mostly CODE. TEST covers the engine secret, per-user rate limit, debate deletion, storage and blocking of private addresses.

One theoretical gap in the page fetcher: it checks the address, then the fetch looks it up again. A hostile domain could change its answer in between (DNS rebinding). I did not test this.

---

## 9. What is open

### Fixed on 27 Nov 2026 (fake AI only, restart the engine to load it)

**9.1 Invented figures could pass as arithmetic.** `4812000 * 1` is correct arithmetic, so the invented figure was accepted. Now each number inside a sum must be one of these:

- a figure from the pitch, the ask, a founder answer, an offer or an earlier checked sum (including the code's payback figure);
- an earlier line of the same turn's maths;
- such a figure written as a fraction or in thousands, lakh or crore, or the exact sum or difference of two;
- a free constant: 1 to 12, 4.33, 24, 30, 52, 100, 365, 1,000, 1 lakh or 1 crore.

At least one number must come from the record. Rule: `numbers.check_operands`.

| What the new rule means | Detail |
|---|---|
| Still possible | A real figure scaled by free constants: `3200 * 1000` or `180 * 3200 * 100` is **accepted**. The sum is honest, but what it means may not be |
| Still possible | Combining unrelated real figures, such as `22 * 365 * 3200` |
| New restriction | A shark cannot assume its own figure, such as a 70% margin |
| New restriction | A middle step needs its own maths line: `25 / 22` needs `900 / 36` first |
| **Seen so far** | The maths field is now required. In one real run all 16 shark replies included it, 4 with sums, all accepted; 12 left it empty. No turn was rejected by this rule. One run only (report section 20) |

**9.3 A generic verdict was charged for.** When the Sharks judge failed, code showed three fixed risks and fixed next steps that came from no pitch, and kept the credits. That fallback is removed. Now there is **no score and no verdict**: the run page says the judge couldn't write one, what the sharks said (including any deal talk) stays saved, and the credits are refunded. Such a run cannot be shared or chatted with. The AI cost of that run is ours.

Evidence: TEST (engine sends no verdict, with and without a deal table) plus the one-off credit check in section 2. The failed-run page was read in code, not viewed in a browser.

Janta and Roast still have fallbacks, built from the crowd's quotes and the reviewers' fixes, and **those runs are still charged.**

### Still open: false statements that pass (confirmed by running the real functions)

**9.2**
- "91% of tiffin services shut within a year" (invented): **accepted**. Percentages are not checked.
- "115 of 180 subscribers dropped" (115 is the number retained): **accepted**. A real verdict made this mistake.

### Found on real AI on 27 Nov 2026

**9.4 The payback check can reject a correct turn.** A message saying "1.1 months ka CAC payback" that also mentioned the founder's "12 months" in Pune was read as claiming a 12-month payback. Three versions of the only offer were rejected, and the run ended with no offers.

**Fixed (TEST and REPLAY; a later real run had no payback rejections but did not specifically exercise it):** all three offers now pass the opening-offer checks. On 917 saved texts only 4 readings changed, and the one real wrong payback among them is still caught. It is a word pattern, so limits remain: a figure-less "payback" joined by "and" or "aur" to another duration is still wrongly rejected, and a wrong figure placed after a correct one or after "but" can now slip through (report section 18).

**9.5 (not fixed) Spoken sums and some rupee amounts are not checked.** "180 * 3200 / 100 gives 576000" passed (it is 5,760). So did "185 rupees cost per meal" (it is ₹103), because an amount under 1,000 is checked only with ₹ or Rs in front.

**9.6 (partly fixed) A false valuation claim passed.** A shark said ₹50 lakh for 10% values the company at ₹4 crore. It is ₹5 crore, the same as the ask. The offer card is right (code works it out); the spoken words are wrong. **Fix (TEST and REPLAY, not rerun on real AI):** at the deal table, a figure written as a valuation must match the ask or terms put on the table. Replay of 10 saved deal messages flagged only this one. Other wording ("worth ₹4 crore"), a true figure given to the wrong terms, and question-round or chat claims still pass (report section 21).

**9.7 (fixed in tests and replay) The judge could be wrongly rejected.** When an offer's valuation equals the founder's ask, a reason quoting the ask is treated as quoting another shark's offer. It cost one retry; three in a row would mean no verdict and a refund. **Fix:** the founder's own figures may now appear in any shark's reason; the saved rejected verdict is now accepted. Trade-off: when another shark's figure equals one of the founder's, mixing them up is no longer caught by that figure.

**9.8 (fixed in tests and replay) The verdict decision did not have to follow the votes.** One real run returned "invest" with 1 shark investing and 4 passing. **Fix:** code now counts it by strict majority and the judge is no longer asked (report section 22). The score and summary remain the judge's.

### From code and reports

| # | Open item | Why it matters |
|---|---|---|
| 4 | Partial runs are charged in full: Janta can finish with only some people answering, Roast with one reviewer (both show less than promised; Janta shows a notice for missing people) | Fairness and trust |
| 5 | The Roast fallback text says "six reviewers" even if fewer answered | Wrong statement to the user |
| 6 | **Fixed 27 Nov 2026:** the Janta card (`web/lib/pricing.ts:21`, also a share-preview fallback) no longer says it tells you who would actually pay. The old prototype page was reworded too | It contradicted our own findings |
| 7 | No automated web tests in the project for credits, sign-in or ownership | A later change could break money silently |
| 8 | Break-even, lifetime value and similar figures are not computed in code | A wrong formula can still pass |
| 9 | Sharks turns can still be dropped; the founder sees "passed on this turn" | Looks like the shark's choice |
| 10 | Founder answer time is 45 s | The 26 Nov test found it too short |
| 11 | Limits, live debates and run watching are held in memory | Fine for one server only; a restart loses live debates (refunded) |
| 12 | Payments, reset emails, Google sign-in, phone OTP and own-key runs are missing | Not ready to sell |
| 13 | `docs/05` still says the investor fixes were not tried on real AI; later reports supersede it | Do not quote the old line |

## 10. What you can honestly say

| You can say | Do not say |
|---|---|
| "AI-simulated panels that surface objections and questions to test with real people" | "Know if your idea will work" |
| "Deal terms, valuations and vote counts are handled by code" | "Every number is verified" |
| "Replies go through quality checks, and bad ones are retried" | "The AI cannot make things up" |
| "A run with no verdict is refunded" | "You only pay for a complete, high-quality result" |
| "Tested on a small number of real AI runs" | "Proven accurate" |

## 11. Suggested order of work

1. **Test the later fixes on more real runs and other pitches** (costs real AI money).
2. **Save each turn's maths with the run**, so later rule changes can be replayed.
3. **Add money tests:** hold, settle, refund, double settle, two tabs.
4. **Set the Janta default to 1 round** and fix the "actually pay" line.
5. **Test on 5–10 different pitches** with pass rules fixed in advance, including the same pitch repeated to see how much the score moves. This costs real AI money.
6. **Compare with real behaviour** (sign-ups, pre-orders) before any claim about predicting demand.

## Where to look

| Topic | File (under `pitch-panchayat/`) |
|---|---|
| Sharks flow and turn rules | `backend/app/debates/sharks.py` |
| Deal table | `backend/app/debates/deals.py` |
| Figure and payback checks | `backend/app/debates/numbers.py`, `metrics.py` |
| Text quality checks | `backend/app/llm/quality.py` |
| Retry loop | `backend/app/llm/base.py` |
| Crowd | `backend/app/debates/janta.py`, `app/personas.py`, `app/targeting.py` |
| Roast and page fetch | `backend/app/debates/roast.py`, `app/scraper.py` |
| Prompts | `backend/app/prompts.py` |
| Credits and settlement | `web/lib/runs.ts`, `db/migrations/001_init.sql` |
| Real-run evidence | `reports/full-product-real-ai-test-2026-11-26.md` (sections 1–16) |
| Crowd experiments | `docs/05-experiments-and-findings.md` |
