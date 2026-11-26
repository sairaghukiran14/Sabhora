# Full product test on real AI — 26 Nov 2026

The web app (`web/`, signed in as the QA account) drove the real engine: Sarvam `sarvam-105b-conversations` played the personas and Claude `claude-haiku-5-5` wrote the verdicts. A wrapper logged every model call's tokens and time, so the costs below are measured, not estimated.

**What ran:** Sharks (with a ₹40 lakh / 8% ask, 2 founder answers), Janta 25, Roast (`zerodha.com`), one chat with a shark, one chat with a crowd member, a Roast on an unreachable site (refund path), share toggle, every dashboard page, a mobile check, and a production build.

Test pitch: *DabbaDost*, a Pune tiffin subscription (₹3,200 for 22 lunches, 180 subscribers, 64% month-2 renewal, food ₹85 + delivery ₹18 per meal).

## 1. Cost

Prices: Sarvam ₹10 in / ₹25 out per 1M tokens; Claude Haiku 5.5 $0.10 / $0.50 per 1M at ₹85/$.

| Run | Model calls | Tokens | Sarvam | Claude | **AI cost** | Credits charged |
|---|---|---|---|---|---|---|
| Sharks, 3 rounds + deal table + verdict | 22 | 46,248 | ₹0.41 | ₹0.14 | **₹0.55** | 15 |
| Janta, 25 people, 1 round | 10 | 13,845 | ₹0.12 | ₹0.06 | **₹0.18** | 10 |
| Roast, 6 reviewers | 7 | 10,803 | ₹0.10 | ₹0.03 | **₹0.13** | 5 |
| Chat, per message | 1 | ~930 | ₹0.01 | — | **₹0.01** | free |
| **All of the above** | | ~72k | | | **≈ ₹0.88** | 30 |

- AI cost is **1–4% of the credit price**, even at the cheapest pack rate (₹0.77/credit).
- The Sharks verdict ran **twice** (the first reply failed a quality check), so Claude cost and verdict wait both doubled for that run.
- 4 of 19 shark-turn calls went to turns that were then dropped (see 3.4).
- **`docs/04-pricing-and-unit-economics.md` overstates Claude cost about 10×.** It assumes ≈$1 / $5 per 1M (Haiku 4.5 prices). Haiku 5.5 is $0.10 / $0.50, so a verdict costs ₹0.03–0.14, not ₹0.60–1.20.

## 2. Speed

### AI runs (as the user sees them)

| Step | Time |
|---|---|
| "Start run" button → run page (server action) | **5.0 s** |
| Sharks round 1 (5 turns, one after another) | ~8 s; each turn 0.6–1.8 s |
| Sharks verdict | ~9 s (2 Claude calls of ~4.7 s) |
| Sharks total, including my 2 answers | 96 s |
| Janta 25, click → verdict | < 10 s (AI time 7 s) |
| Roast, click → verdict | ~10 s (AI time 4 s) |
| Chat reply | 2–6 s |

### Pages

| Page | Dev server | Production build |
|---|---|---|
| Landing `/` | 60 ms | 13 ms TTFB · 29 KB HTML (gzip) · 193 KB JS · 5 font files |
| `/login`, `/signup` | 20–30 ms | 1–4 ms |
| Dashboard, runs, run page, billing, profile, settings | 0.55–1.1 s | shell in 7 ms, data finishes at **~620 ms** |
| Public share `/v/…` | 0.3–0.7 s | 0.27 s warm, 2.3 s cold |
| **Login (first of the day)** | **8.3 s** | — |
| Dashboard right after login (cold) | 3.3 s | — |

**Why:** the database is far away. Neon is in us-east-2 (Ohio). Measured from here: **3.1 s to open a connection, 245–870 ms per query.** Password hashing is only 41 ms. A login is a cold connection plus about 4 sequential queries; starting a run is a few more. Moving Neon to ap-south-1 (Mumbai) with the existing `npm run db:copy-to` is still the biggest speed win: it should take login and run start under 1 s and pages to ~100 ms.

No horizontal scroll at 375 px. The production build, lint, `tsc` and all 77 backend tests pass.

## 3. What is wrong (by priority)

### P1: results a user would act on are wrong

1. **Janta invents "Why people agreed" when nobody agreed.** This run had 0 agrees, but the verdict still listed 3 reasons (quotes from Unsure and Disagree people). Cause: `JantaSummary.reasons_for` requires exactly 3 items (`backend/app/models.py:237`). Fix: allow 0–3, and hide the section when the count is 0.
2. **Janta ignores who the product is for.** The crowd is drawn from all of India. Only 2 of 25 people lived in Pune, and almost every objection was "this doesn't reach my city". For any local business the result says nothing about the idea. Nothing in `debates/janta.py` uses the customer or city fields. Fix: weight or filter the crowd by the stated customer and city, or at least warn when most of the crowd is outside the market.
3. **Sharks ignore facts the founder gave, and the verdict repeats the error.** I answered "Kitchens are FSSAI registered" and gave the full unit economics. Farah still said no FSSAI process was described and called the unit economics "a black box". The verdict put that in its Biggest risks, and Farah repeated it in chat. The verdict also listed the founder's own evidence ("Swiggy tried and shut office tiffins") as a risk.
4. **Offers and the counter-offer have still never run on real AI.** All 5 sharks went out again, the second real run in a row. That path (`deals.py`) is only tested on the fake AI.

### P2: quality the user will notice

5. **4 of 15 shark turns (27%) were dropped** after failing the quality checks twice (3 for rupee figures not in the pitch: 2167, 7560, 5.4 lakh; 1 for a repeated point). The page just says "Ananya Iyer passed on this turn", which reads as a choice the shark made.
6. **Persona example phrase copied word for word.** Farah says "process samjhao, step by step" in every turn and in chat, sometimes mid-sentence where it makes no sense. Source: the example in `backend/personas/sharks/06_farah.yaml:10`.
7. **Sharks copy each other.** 4 of 5 said "Swiggy/Zomato can copy you in a day". The reworded-repeat check caught only 1 of these.
8. **Wrong facts get through when they contain no new digits.** "180 subscribers par 40 lakh ka valuation" (the valuation is ₹5 crore). "36% churn means half the customers gone in 8 months". Ananya twice cited "Indore aur Patna", which aren't in the pitch.
9. **Roast scores Design without seeing the page.** The scraper reads text only, yet reviewers describe "the hero section" and "wall of text" and give Design scores. They also treated the legal footer as if it sat at the top of the page. Fix: drop or relabel the Design score, or send a screenshot.
10. **45 seconds to answer the sharks is too short.** I had to type fast to beat the timer. A founder who writes a considered reply with numbers will time out. Consider 120 s, or pausing while the founder is typing.

### P3: web app polish

11. After a refund, the header still shows the old balance (45 instead of 50) until you reload.
12. Signed-in users who open `/login` see the form instead of being sent to the dashboard.
13. Share pages have no Open Graph title or image, so links pasted into WhatsApp or LinkedIn show a bare preview. Private and missing share links return HTTP 200 instead of 404 (the content is correctly hidden).
14. Labels disagree: the grid says "Unsure" where the chat drawer says "Neutral", and sharks show "Pass" in one place and "I'm out" in another.
15. `pg` prints an SSL-mode deprecation warning on every new connection: set `sslmode=verify-full` in `DATABASE_URL`.

### Docs

16. The README says 55 backend tests; there are 77. `docs/04` uses the wrong Claude price (item 1 of section 1).

## 4. Still missing (already known)

Razorpay (Buy buttons only say checkout isn't connected), email delivery for password resets, Google sign-in, phone OTP, BYOK keys reaching the engine, and terms and privacy pages.

## 5. What worked

Login and session; Free-plan locks on Janta 50/100; credits held at start, kept on a verdict and refunded on failure, with matching ledger rows; a clear failure message for an unreachable site; live streaming; founder answers between rounds; the ₹5 crore valuation shown correctly from 40 lakh for 8%; chat with a shark and with a crowd member (both stayed in character and remembered the debate); share toggle; mobile layout.

## 6. Changes made during the test

- QA account (`qa-founder@example.test`): +60 test credits (one ledger row, `kind = grant`, id `qa-grant-20261126`). It created 4 runs (3 finished, 1 refunded) and made the Roast run's share link public. Balance is now 50.
- The engine was restarted twice: once with the logging wrapper, then back to the plain command, same `.env`, port 8000. No code or config files were changed.

## 7. P1 fixes (27 Nov 2026)

Tested on the fake AI only (86 backend tests pass, 9 of them new in `backend/tests/test_p1_fixes.py`, built from this run's real replies). **No real-AI run has checked these yet.**

1. **Janta reasons follow the votes.** `reasons_for` and `reasons_against` now hold 0–3 items, and the judge's reply is rejected unless each list has one reason per voter on that side, up to 3 (`janta.summary_check`). The run page hides an empty list.
2. **Janta asks the founder's market.** `app/targeting.py` reads the cities named in the pitch (with aliases such as Bangalore and Gurgaon) and the jobs named in the "Target customer:" line (via `targets` words in `dimensions.yaml`). 70% of the crowd is drawn from them and the rest is a comparison group. The founder sees a note saying how the crowd was picked; the verdict gets a "Market" segment; and the judge is told to lead with the market's reaction. Crowds for pitches with no market are exactly as before. DabbaDost at 25 people: 17 working professionals in Pune, up from 2 people in Pune.
3. **"You never told us" is rejected when the record says otherwise.** `quality.ignores_record` catches English and Hinglish "missing" claims (not described, black box, bina, nahi bataya and so on) about an acronym or topic (unit economics, margin, retention, churn, payback, revenue) that the pitch or the founder's answers already cover. It runs on shark turns, deal-table messages and the verdict. The verdict prompt now gets the facts block and a rule against repeating a shark's misreading or treating the founder's own evidence as a risk. All 3 real misses are caught; 3 fair objections pass.
4. **Fewer walk-out cascades.**
   - At most 2 sharks may say "I'm out" per round, so with an ask at least one shark reaches the deal table.
   - A prompt rule says other sharks leaving is no reason to leave, and that a doubt can be priced into the terms.
   - Shark turns get 3 attempts instead of 2, which should also cut dropped turns.
   - This guarantees the deal table runs; it does not guarantee that anyone makes an offer.
5. **Root cause of several issues: quoted example lines in persona files.** Ananya's style literally said she asks about "Indore and Patna", Arjun's said "what stops a bigger player copying you", Farah's said "process samjhao, step by step", and Meera's said "brand is built in the second order". The model repeated them word for word. The 5 shark styles and Roast reviewer Dev's now describe the habit instead, and a test keeps quoted lines out of shark styles.

## 8. Real-AI check of the fixes (27 Nov 2026)

Same DabbaDost pitch and ask, through the web app, with the "Who is it for?" field filled in (*Working professionals in Pune IT parks*).

| Run | Calls | Tokens | AI cost |
|---|---|---|---|
| Janta 25 | 10 | 14,226 | ₹0.19 |
| Sharks | 36 | 72,530 | ₹0.82 (up from ₹0.55: the third attempt per turn, and 3 deal-table calls) |

**Janta: both fixes work.**
- 17 of 25 people were working professionals in Pune, and the founder saw a note saying so.
- The verdict is about price, the 1 pm delivery and kitchen hygiene, not "doesn't reach my city".
- 6 people agreed, and "Why people agreed" quotes 3 of them.
- Would pay: 35% in the market vs 0% in the comparison group.
- Still open: all 5 early adopters would pay and nearly nobody else would, so the attitude label still drives the vote (as in `docs/05`). The crowd also included a 64-year-old software engineer: that job has no age limit.

**Sharks: partly fixed.**
- Worked:
  - Farah acknowledged "FSSAI registration hai" and asked about audits and a backup plan instead.
  - Vikram used the pitch's food and delivery costs.
  - The verdict didn't repeat any misreading, and it treated the founder's 88% renewal claim as something to verify.
  - The exit limit held: 2 sharks left in round 3 and 3 reached the deal table. That is the first time the deal table has run with sharks in it on real AI. All 3 still went out, so **no offer has been made on real AI yet**.
- New or remaining problems:
  1. **6 of 15 turns were dropped, worse than 4 of 15.**
     - 5 drops: the rupee check rejected figures that were *correct* (576,000 = 180 × 3,200; 6,480 = 180 × 36; 4,140 = 115 × 36; 3,960 = 110 × 36). The sharks did the arithmetic in their heads instead of in `maths`.
     - 1 drop: the exit limit. Meera tried to leave 3 times after 2 sharks had already gone, so her turn was dropped. She then went out at the deal table.
  2. **Unit mix-ups get through.** CAC ₹900 ÷ ₹36 margin = 25 *meals*. Meera called it "25 months", and Vikram called it "25 weeks" and said the founder's maths was wrong. Farah worked it out correctly (≈1.14 months). The verdict repeated Vikram's wrong claim as his reason without correcting it.
  3. Small items: Ananya still named Mumbai and Hyderabad, and Meera claimed "celebrity-only marketing", which nobody had mentioned. Two sharks also wrote "stance maybe hai, confidence 5/10" into their spoken message.

## 9. Fix for dropped turns and meals-vs-months (27 Nov 2026)

Fake AI and replay only; **not yet run on real AI**. 93 backend tests pass.

1. **Correct mental arithmetic now passes** (`numbers.check_message`).
   - A figure that is one + − × ÷ step (or "a% of b") away from two figures on the record is accepted.
   - The match must be as exact as the figure is written: "₹6,480" must equal 6,480, while "about ₹6,500" may stand for it (never more than 1% off).
   - A shark's own results also count when rounded (115.2 said as "115").
   - All 4 correct figures the real run dropped now pass (₹5,76,000, ₹6,480, ₹4,140, ₹3,960). The invented ₹4,812 for 18 × ₹299 is still rejected.
   - On the DabbaDost record, 0.1% of random precise figures and 6.7% of random round thousands would slip through.
2. **Meals called months are rejected** (`numbers.unit_mixup`). When the record gives a per-meal (or per-order...) figure, a rupee total divided by it is a count of meals. Calling it months, weeks or days is rejected, in shark turns, at the deal table and in the verdict. The verdict is also told to say when a shark's units were wrong instead of repeating them. Both real mix-ups ("25 months", "25 weeks") are caught; Farah's correct "25 / 22 = 1.14 months" passes.
3. **The "never described" check is narrower.** Replaying every message from both real Sharks runs (40 texts) showed 3 false flags. Retention, churn and repeat were removed as topics, and per-meal figures no longer count as totals. The replay now flags 6 texts, all real errors: FSSAI ×3, unit economics ×1 and the 2 unit mix-ups.

## 10. Real-AI check of section 9 (27 Nov 2026)

One Sharks run on real AI: same DabbaDost pitch, ask and first answer as section 8. 24 calls, 61,733 tokens, **₹0.73**.

| | Run 2 (section 8) | **Run 3 (after section 9)** |
|---|---|---|
| Shark turns that spoke | 9 of 15 (6 dropped) | **14 of 14, none dropped** |
| Turn calls (retries) | 32 | 20 (6 retries, all recovered) |
| Payback described as | "25 months", "25 weeks", maths "galat" | **"25 meals, roughly 1.1 months"** (3 sharks and the verdict) |
| "FSSAI not described" | 0 | 0; Ananya and Vikram mention the registration |
| Reached the deal table | 3 sharks | 2 sharks |
| Offers made | 0 | **0** |
| Cost | ₹0.82 | ₹0.73 |

**Still wrong in this run:**
- **No offer yet, after 3 real runs.** Arjun, Vikram and Meera went out; Ananya and Farah went out at the deal table.
- **Stance and words disagree.** Ananya's round-3 stance was **Invest** while her words argued against the business, and she went out at the deal table. Nothing checks that the stance matches the message.
- **A meaningless formula passes because its arithmetic is right.** Ananya's round-1 payback "3208 / (22 × 103) = 1.4 months" checks out as arithmetic but makes no sense, and Arjun repeated "1.4 months".
- **Same objection from most of the panel.** 4 of 5 sharks said "zero switching cost against Swiggy/Zomato"; the repeat check didn't stop it.
- **A shark's misreading reached the verdict.** It gave Vikram's reason as "the ₹36 margin cannot carry the ₹18 delivery cost", but ₹36 is already after delivery.
- **Labels in the spoken text.** Lines such as "Mera confidence 6 hai, stance maybe" still appear in what the sharks say.

## 11. Why no shark makes an offer (27 Nov 2026)

**Evidence from the real runs.** All 6 deal-table moves across the 3 real web runs were "out". That includes Ananya, whose stance was *invest*, and two sharks who were at *maybe*.

**Experiment.** I replayed only the deal-table opening move on real AI (Sarvam), giving all 5 sharks the real debate from run 3 (`WpfSUEwpUbj-zcSs`). Each variant ran twice; C and E ran once. 30 calls, about ₹1 (estimated; these calls bypassed the cost logger). The script is in the session scratchpad (`deal_probe.py`).

| Variant | Change | Offers |
|---|---|---|
| A | Current prompt | **0 / 10** |
| B | Replace "Going out is a good answer if your doubts were not resolved" with: real investors price risk in (more equity, part debt, a royalty); go out only if you would not invest at *any* valuation | **6 / 10** |
| C | B plus a "fair valuation" field to fill before deciding | 4 / 5, but the field was misread (the investment amount was written as the valuation) and 1 reply broke the terms rules |
| E | Current prompt, cheaper ask (₹40 lakh for 20%, a ₹2 crore valuation) | 1 / 5 |

**Cause.** The deal prompt itself. `deal_system` tells every shark that going out is a good answer while doubts remain, and after 3 rounds of questions every shark has some. A cheaper ask barely helped (E), so the price is not the main blocker.

**What B still gets wrong.**
- 4 of the 6 offers kept the founder's ₹5 crore valuation and simply raised the money to ₹60 lakh (12%), often right after calling ₹5 crore "pagalpan" or "risky". A real shark would ask for more equity.
- Proposed check: if an offer message complains about the valuation, the offer must value the company below the ask, or the reply is rejected.

**Proposed fix.**
1. Swap in B's wording in `prompts.deal_system`.
2. Add the valuation-consistency check to the `SharkOffer` check in `deals.py`.
3. Skip C's extra field.

Then verify with one real Sharks run, which would also exercise bidding, the founder's choice and the counter on real AI for the first time.

**Applied (27 Nov 2026), fake AI only, 95 tests pass:**
- `prompts.deal_system` uses variant B's wording.
- It also tells a shark who finds the valuation too high to ask for more equity, not put in more money.
- `deals.check_valuation_stance` rejects an opening offer whose message calls the valuation too high (English or Hinglish) but values the company at or above the ask. It catches Vikram's real "pagalpan" + ₹5 crore offer, and passes Farah's genuinely lower ₹4 crore offer.
- **Not yet verified in a full real run.**

## 12. First real deal (27 Nov 2026)

One Sharks run on real AI after the section 11 fix (`VTqazEncdWH2piFO`): same pitch, ask and answers. 28 calls, 81,576 tokens, **₹0.96**. A replay of the judge call afterwards cost a few paise more. The QA account got another 15 test credits first (ledger id `qa-grant-20261127`).

**Offers now happen.**
- Vikram: ₹24 lakh for 15% plus a 10% royalty until ₹48 lakh is repaid (₹1.6 crore valuation). He called ₹5 crore "pagalpan" and priced it down.
- Farah: ₹36 lakh for 20% (₹1.8 crore valuation).
- Meera went out.
- Bidding ran (Vikram held his offer), I countered Farah at ₹36 lakh for 12%, then accepted her original offer.
- **This is the first time the offer, bidding, counter and accept steps have all run on real AI.**
- All shark turns but one spoke.

**Two bugs this found, both fixed (97 tests pass):**
1. **A shark could not answer a counter.** Farah revised and mentioned the counter's "3 crore" valuation, and her reply was rejected as an unknown figure: only her revised terms counted as on the record, not the founder's counter. The UI then said "Farah Merchant couldn't answer the counter." Fix: `answer_counter` now always puts the counter's figures on the record, and the counter is added to the record when the founder makes it.
2. **The verdict could not mention the deal.** The deal table worked on a *copy* of the record, so the judge's "Rs 36 lakh" for the accepted offer was rejected 3 times. The run showed the generic fallback verdict ("the judge was unavailable"). Fix: the deal table now shares the record with the verdict. A replay of the judge call on this run's real transcript produced a full verdict quoting the deal (4/10, "maybe").

**Still wrong:**
- In the replayed verdict, Vikram's reason gives him Farah's accepted terms; his own offer was ₹24 lakh plus a royalty.
- One turn was dropped for repeating another shark's point.
- Neither fix has been through a full real run yet.

## 13. Legal pages, honest landing copy, link previews and AI quality (27 Nov 2026)

Real AI spend this round: about ₹1.5 (Janta label test, 56k tokens ≈ ₹0.75; one Sharks run, 66k tokens, ₹0.75). The run happened on the Singapore database; 105 backend tests pass, and web lint and types are clean.

### Web
- **Terms of use and Privacy policy** (`/terms`, `/privacy`), linked from the sign-up checkbox (which now also confirms age 18+) and from a new Legal column in the footer.
  - Written for the DPDP Act 2023 and Rules 2025, plus the IT Rules 2021 as amended in 2026.
  - Every privacy statement matches the code: the tables, the cookie, deletion erasing the engine copies, and chats not being stored.
  - Company name, address, grievance officer and contact email live in `web/lib/legal.ts` with `ready: false`. Until they are filled in, both pages say they are a draft.
  - **A lawyer must review them before launch**, and the complaint timelines need checking against the Gazette text (sources disagreed).
- **AI label on every run** (live and shared): "AI-generated. The panel is fictional personas, and the result is a simulation, not advice."
- **Landing copy matches the product.** Removed or marked as coming soon:
  - Bring your own key, priority runs and deep segment breakdowns
  - UPI or card payments, and cancelling from Billing
  - "Shows who would actually pay" (now "partial") and "real segments"
  - A persona marquee whose jobs and cities can't occur in the crowd (it is now built from the real crowd data)

  Also: the hero examples are labelled as illustrations, "Private by default" now says the idea goes to the AI models, and a "Matched to your market" feature was added.
- **Share-link previews:**
  - Each public share link has its own title, description and a generated 1200×630 card showing the room, idea, score or "% would pay", and the verdict line.
  - Private or unknown links fall back to the plain brand card.
  - The landing page has a default card.
  - Set `SITE_URL` in production.

### AI quality
1. **Janta attitude labels are hidden by default** (`JANTA_SHOW_ATTITUDE=false`). Real test with the rules fixed in advance, 25 people per run, round 1:

   | Pitch | Labels | Early adopters' share of would-pay | Would pay: market vs comparison |
   |---|---|---|---|
   | DabbaDost | shown | 4 of 4 | 4/17 vs 0/8 |
   | DabbaDost | hidden | 1 of 3 | 2/17 vs 1/8 |
   | GSTSathi (new pitch) | shown | 4 of 5 | 5/17 vs 0/8 |
   | GSTSathi (new pitch) | hidden | 2 of 5 | 5/17 vs 0/8 |

   - Rule 1 (early adopters at most 40% of payers with labels hidden) **passed on both pitches**.
   - Rule 2 (market beats comparison) **passed on GSTSathi but failed on DabbaDost** (12% vs 12.5%).
   - Total would-pay barely changed (3 vs 4, 5 vs 5).
   - The small samples mean this is a first signal, not proof.
   - The "Attitude" breakdown is no longer shown when labels are hidden.
2. **Bug fixed:** chat rebuilt targeted crowd members without the target, so they got another person's home, work and pain points.
3. **Stance must match words** (`sharks.stance_error`):
   - Saying stance or confidence out loud ("confidence 6", "stance maybe", "Maybe, 5/10") is rejected.
   - So is contradicting the stance field with "I'm out" / "main invest kar rahi hoon".
   - The deal table reminds each shark of its last stance and asks it to say what changed.
4. **Panel-wide echo:**
   - A third shark may not repeat an objection catchphrase two others already made (`quality.crowded_objection`; the list was calibrated on real turns, because a general phrase rule flagged 12 of 22).
   - The prompt lists the points already taken.
   - **Partial:** the next run moved to a new shared phrase ("Swiggy is one tap away"), which isn't on the list.
5. **Verdict gives each shark only its own terms:**
   - The deal result now names whose offer it was.
   - The verdict check rejects a shark's reason that quotes another shark's offer figures.
6. **Cities nobody mentioned are rejected** (Meerut and Kochi in a Pune-only pitch).

### Real Sharks run after these changes (`mFsxty8LjME90Pcb`, ₹0.75)
- 14 of 14 turns spoke, there was no stance talk, and the verdict was a full one with no misattribution (there was no deal to attribute).
- **No deal:** the 3 sharks at the table all went out.
- **New problem, not fixed: nonsense formulas with correct arithmetic.**
  - Vikram misread "only in Pune for the next 12 months" as "180 subscribers in 12 months" and divided the ₹900 CAC by 15 new subscribers a month, making a "60-month (5 saal) payback".
  - Farah repeated it, the verdict quoted it, and the sharks walked out over it. The true payback is about 1.1 months, which three sharks had worked out the round before.
  - The figure check verifies arithmetic, not whether the formula makes sense.
  - **Proposed next fix:** compute the standard metrics in code once the record has them (payback = CAC ÷ monthly margin per customer, and so on) and put them in ESTABLISHED FACTS. Then any "payback" figure must match the computed one.

## 14. Payback worked out in code (27 Nov 2026)

Fake AI and replay only; **not yet run on real AI**. 108 backend tests pass.

**The problem (section 13):** the figure check verifies arithmetic, not meaning. "₹900 CAC ÷ 15 new subscribers a month = 60 months" passed, spread to two more sharks and the verdict, and the panel walked out over a payback that was really about 1.1 months.

**The fix** (`backend/app/debates/metrics.py`):
- **Worked out in code:** once the pitch or the founder's answers give a CAC and a monthly margin per customer, code works out payback = CAC ÷ monthly margin.
  - The margin is either margin per meal/order × how many a customer buys a month, or price × gross margin %.
  - The latest figures win, so a founder's answer can correct the pitch.
- **Shown as a fact:** sharks and the judge see it under ESTABLISHED FACTS, for example: "₹900 CAC ÷ (₹36 margin per meal × 22 meals a month) = about 1.1 months, before churn".
- **Checked everywhere:** any payback stated as a duration ("payback period 60 months", "5 saal ka payback", "a 60-month payback") must be within 35% (or half a month) of it.
  - This applies in shark turns, deal-table messages and every verdict field.
  - The rejection tells the model the right figure and says to mention churn in words rather than invent a new number.
- **When it doesn't apply:** if the record doesn't give both a CAC and a margin, nothing is computed and nothing is checked.

**Checks:**
- All 4 real wrong paybacks from runs 2 and 4 are rejected ("60 months", "5 saal", "60-month payback", "25 months").
- Replaying all 14 turns of real run 3 and every saved local debate flagged nothing: the correct "1.1 months" and the close "1.4 months" pass.

**Not covered:**
- Other derived figures (break-even, LTV, burn) can still be built from wrong formulas.
- The same approach extends to them when a real run shows the need.

## 15. Real-AI check of the payback fix (27 Nov 2026)

One Sharks run through the app (`KLxJt-yry45qMfL4`): same DabbaDost pitch, ask and answers. 24 calls, 63,600 tokens, **₹0.73**.

**Payback: fixed on real AI.**
- After the founder's first answer, every shark that mentioned payback used the computed figure ("₹900 CAC ÷ (₹36 × 22 meals) = 1.1 months").
- Those who thought churn changes it said so in words ("actual payback double ho jayega") without inventing a number.
- The check never had to reject anything: showing the figure as a fact was enough.
- The verdict cites the 1.1-month payback and asks the founder to recompute it including churn.

**Deal flow:**
- Farah offered ₹40 lakh for 16% (₹2.5 crore), after calling ₹5 crore "bahut zyada": the valuation rule working.
- I countered at ₹40 lakh for 10% and she answered. **The counter-reply fix works on real AI** (run 5 had failed here).
- I accepted. The verdict gave Farah exactly her own terms (₹40 lakh for 20%) and Vikram none: **the attribution fix works**.

**Still wrong:**
1. **A "final offer" can be worse than the shark's first offer.** Farah's revision after my counter was ₹40 lakh for **20%**, worse for the founder than her original 16%. A revision should sit between the counter and the original (here 10–16%), and nothing enforces that.
2. **The verdict inverted a figure.** "64% month-2 renewal means roughly 115 of 180 subscribers dropped": 115 renewed and 65 dropped.
3. **Two of 14 turns were dropped:** an invented "500 million" and a repeated point.

## 16. Revised offers must meet the founder part of the way (27 Nov 2026)

Fake AI only; **not yet seen on real AI**. 110 backend tests pass.

**Rule:** after the founder's counter, a shark's "revise" must sit between its original offer and the counter on every term: money, equity, debt, interest, royalty and royalty cap (`deals.check_between`).
- Identical to the original: rejected, use "hold".
- Identical to the counter: rejected, use "accept".
- Anything outside the range: rejected, naming the term and its allowed range. This also stops a shark adding a new royalty or debt in a "revision".

The counter prompt now spells the range out, for example "equity between 16% and 10%, never worse for the founder than your own first offer".

Farah's real revision (₹40 lakh for 20% after offering 16% and being countered at 10%) is now rejected, and a halfway 13% passes.

**Still open from section 15:**
- The verdict inverted "115 renewed" as "115 dropped".
- Occasional dropped turns for invented figures.
