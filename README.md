# Sabhora by Neevora Labs — working prototype

Formerly **Pitch Panchayat**. Folder, database and other internal names still use the old name. Neighbouring documents written before the rename may too. The names are working choices: trademarks and company-name records have not been checked.

Three ways to surface objections to a startup idea, streamed live, so you know what to test with real people:

- **Sharks**: 5 invented investor characters (Meera, Arjun, Ananya, Vikram, Farah) debate your pitch over 3 rounds, in their own voices with some Hinglish. You answer between rounds, and from round 2 a shark can say "I'm out". If you give an ask (amount and equity), the sharks still in make offers (equity, debt, royalty), team up or outbid each other, and you accept one, counter once or walk away. Valuations and offer limits are enforced in code (`backend/app/debates/deals.py`); offers have their own token cap (`DEAL_RESERVE_TOKENS`). Ends in a scored verdict with risks and 30-day next steps. The characters must stay original: don't model them on real TV judges. The scored verdict is a simulation; it does not predict whether the business will raise money.
- **Janta**: a crowd of 25, 50 or 100 Indian personas reacts in 2 rounds (round 2 hears round 1), votes, and says whether they would **pay**. If the pitch names a city (or the "Who is it for?" line names a kind of customer), 70% of the crowd is drawn from that market and the rest is a comparison group from across India; the verdict shows the two separately (`app/targeting.py`). The verdict breaks it down by city tier, age and attitude. Treat the counts as simulated reactions, not demand numbers: see `docs/05-experiments-and-findings.md`.
- **Roast**: 6 influencer personas review a landing-page URL, score clarity / trust / design / CTA, and name the fixes.

Every finished run gets a share link (`/d/<id>`) that replays it.

**After the verdict:**
- **Chat with anyone:** a crowd member, a shark or a roaster. They remember their profile and what they said in the debate, keep the same language, and the reply shows whether their position moved. They change their mind only for a reason that fits their life, never because the founder is persistent (tested: three rounds of "please reconsider" moved nobody). The browser keeps the conversation; the server stores no chats (`app/chat.py`, `POST /api/debates/{id}/chat`).
- **People grid (Janta):** a card per person with round 1, round 2 (changed mind or kept their view), would-pay and a Chat button, plus filters (agree, neutral, disagree, changed mind, would pay).
- **How this verdict was reached:**
  - Janta: round-by-round counts, who moved where, and the strongest and weakest segments.
  - Sharks: each shark's stance per round, and which of your answers moved whom.
  - Roast: weakest area, toughest and most generous reviewers.

  Everything is counted in code from the debate itself.

## Database (Postgres)

Both halves keep their data in one Postgres database (tested on 17). First-time setup, with Postgres running:

```bash
createdb pitch_panchayat
```

```bash
cd web && npm install && npm run db:migrate
```

Put the same `DATABASE_URL` in `web/.env.local` and `backend/.env` (see the `.env.example` files).

- **Schema:** `db/migrations/*.sql`. `public.*` belongs to the web app; `engine.debates` holds the engine's saved debates. To change it, add the next numbered file and run `npm run db:migrate`; never edit an applied one.
- **Without `DATABASE_URL`** the engine saves debates as JSON files in `backend/data/` (tests and offline demos). The web app always needs the database.
- **Move to another database** (new region, new provider): `npm run db:copy-to -- '<target url>'`. It applies the migrations to an empty target, copies every row in one transaction, then compares counts and a per-column checksum of both sides plus every credit balance, and says plainly whether they match. It refuses a pooled host and a target that already has rows, never writes to the source, and never edits an env file — switch `DATABASE_URL` yourself once it reports a match. It copies through the driver rather than `pg_dump`, which refuses to read a server newer than itself (a Homebrew client lags behind Neon's Postgres).
- **Old local data:** `npm run db:import-sqlite` copies `web/.data/app.db` and `backend/data/debates/` into an empty database, only if all row counts and credit balances match. It never changes the old files.
- **Backup:** `pg_dump -Fc pitch_panchayat -f pitch_panchayat.dump`. The dump contains accounts and pitches, so keep it private and out of git.
- **Postgres tests** use `pitch_panchayat_test` (override with `TEST_DATABASE_URL`) and are skipped if it isn't there: `createdb pitch_panchayat_test`, then `DATABASE_URL=postgresql://127.0.0.1:5432/pitch_panchayat_test npm run db:migrate`.
- **Hosted Postgres (production):** change `DATABASE_URL` (usually with `?sslmode=require`), use a dedicated role with a strong password rather than a superuser, and run `npm run db:migrate` before deploying.

### Neon

Both halves point at Neon (`neondb`, Postgres 18). Since 27 Nov 2026 that is a Neon project in **AWS Singapore (ap-southeast-1)**, the closest Neon region to India (Neon has no Mumbai). It was started empty; the earlier Ohio (us-east-2) project still holds the old test accounts and runs. Measured from India: a query takes ~61 ms (Ohio 245-870 ms), opening a connection ~0.45 s (Ohio ~3 s), login 0.35 s (Ohio 8.3 s), dashboard pages 0.13-0.23 s (Ohio 0.55-1.1 s). Host the app servers in Singapore or Mumbai too, or the distance comes back. Four things to know, each learned the hard way:

- **Use the UNPOOLED host** — the one *without* `-pooler`. Both halves keep their own connection pool, so they gain nothing from Neon's pooler, and the pooler actively breaks two things. It runs PgBouncer in transaction mode and does not reset session state between clients, so one `SET` leaks to everyone afterwards: restoring a `pg_dump` through it left `search_path` empty on every pooled connection, which made every unqualified query fail. It also rejects `options=-c search_path=...` outright, so that leak cannot be worked around from the client.
- **`search_path`** is set as a role default: `ALTER ROLE neondb_owner IN DATABASE neondb SET search_path = "$user", public`. Queries in `web/lib/` are unqualified and rely on it; `engine.debates` is always written out in full.
- **Migrations run in one transaction** with `pg_advisory_xact_lock`, because a lock held between statements does not survive a pooled connection (`web/scripts/db-migrate.mjs`).
- **Collation differs:** Neon is `C.UTF-8` and a default local database is `en_US.UTF-8`, so text sorts differently. Nothing in the app orders by text today — every listing orders by `created_at` — but a future `ORDER BY name` will not match between the two.

**Branches.** `main` (the default branch) is the real data. `dev` is a branch off it for work that must not touch real accounts — schema changes, risky migrations, throwaway runs. A new branch starts as a copy of its parent, so `dev` holds a copy of the real accounts and pitches from the moment it is created; writes on either branch do not reach the other. To work against `dev`, put its connection string (unpooled, as above) in `web/.env.local` and `backend/.env`, and run `npm run db:migrate` against it after adding a migration. Automated tests do not use Neon at all: they use a local `pitch_panchayat_test`, which keeps them fast, free and offline.

**Backups.** A Neon branch is a copy-on-write clone, not a backup: it shares history with its parent and both can be lost together. Use Neon's point-in-time restore for accidents, and take a real off-site dump regularly:

```bash
pg_dump -Fc "$DATABASE_URL" -f "pitch_panchayat-$(date +%F).dump"
```

That file holds accounts, password hashes and pitches, so keep it private and out of git.

## Web app (`web/`)

The full product (landing page, accounts, credits, dashboard) is the Next.js app in `web/`. It talks to this FastAPI backend from its server only; the browser never calls the backend directly. Run both:

```bash
cd backend && .venv/bin/uvicorn app.main:app --port 8000
```

```bash
cd web && npm run dev -- -p 3100
```

Open http://localhost:3100. For free offline testing, start the backend with `LLM_PROVIDER=fake JUDGE_PROVIDER=fake` in front of the command; the web app then labels results "Demo AI".

| Setting | Where | What it is |
|---|---|---|
| `INTERNAL_API_TOKEN` | `backend/.env` | Shared secret. When set, only the web app can start or read runs, and the single-page prototype below stops working (remove the line to use it). Required when `ENV=prod`. |
| `BACKEND_API_TOKEN` | `web/.env.local` | Must equal `INTERNAL_API_TOKEN`. |
| `BACKEND_URL` | `web/.env.local` | Default `http://127.0.0.1:8000`. |
| `AUTH_SECRET` | `web/.env.local` | 32+ random characters, used to encrypt saved API keys. |
| `DATABASE_URL` | both | The Postgres database (see above). |

Credits are held when a run starts, kept when there's a verdict, and refunded otherwise (`web/lib/runs.ts`). Deleting a run or an account also erases the backend's copy (`DELETE /api/debates/{id}`). Credit changes lock the user or run row, so parallel requests can't double-spend. Running more than one server still needs a shared job queue for the run watcher, shared rate limits, and one engine (live debates are held in its memory).

## Run the prototype page (without the web app)


```bash
cd backend
.venv/bin/uvicorn app.main:app --port 8000
```

Open http://localhost:8000. With no `.env`, it runs on the **fake** AI provider: free, offline, instant. Use that to click through every flow.

First-time setup (only if `.venv` is missing):

```bash
cd backend
python3.12 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
```

## Switch to real AI (your key)

1. `cp backend/.env.example backend/.env`
2. Open `backend/.env` and paste your key. Then set the providers:

   | You have | Set in `.env` |
   |---|---|
   | Claude key only | `ANTHROPIC_API_KEY=…`, `LLM_PROVIDER=anthropic`, `JUDGE_PROVIDER=anthropic` |
   | Sarvam key only | `SARVAM_API_KEY=…`, `LLM_PROVIDER=sarvam`, `JUDGE_PROVIDER=sarvam` |
   | Both (the guide's split) | both keys, `LLM_PROVIDER=sarvam`, `JUDGE_PROVIDER=anthropic` |

3. Restart the server. The badge at the top right switches from "Demo AI" to "Live AI".

Claude runs on `claude-haiku-5-5` (set in the guide) at `ANTHROPIC_EFFORT=low`. The token caps (`MAX_TOKENS_PER_DEBATE`, `JUDGE_RESERVE_TOKENS`, `DAILY_TOKEN_LIMIT`) bound what any run can spend. If a key is wrong, the form shows the provider's error instead of starting.

Visitors can also paste their own key under **Bring your own API key** (BYOK): it's used for that one run, never stored, and doesn't count against your daily cap.

## Current setup: Sarvam personas, Claude verdicts (tested Nov 2026)

`.env` runs the split the build guide planned: `LLM_PROVIDER=sarvam` plays every persona (many cheap calls) and `JUDGE_PROVIDER=anthropic` writes the verdicts on `claude-haiku-5-5` (one call per debate). Last full run, all three modes at once:

| Mode | Result | Time | Tokens |
|---|---|---|---|
| Sharks | 9/9 turns, Claude verdict | ~70 s (plus your answers) | ~12k |
| Janta, 50 people | 50/50 in round 1, ~80-85% of swing voters in round 2, Claude summary | ~2 min | ~75k (almost all Sarvam) |
| Roast | 6/6 reviews, Claude verdict | ~6 s | ~10k |

Why Claude for verdicts: on the same real crowd data, Claude's Janta summary passed every quality check first time (4/4). Sarvam managed about 2 in 5, even with 3 attempts, because it kept copying the instructions into the fields. With `JUDGE_PROVIDER=sarvam`, a failed summary falls back to real crowd quotes, and the numbers and segment tables are always computed in code.

The Claude client uses structured outputs (`output_config.format` with `anthropic.transform_schema`) and validates in the app, so a reply that misses a length or count rule retries instead of crashing.

### Persona model comparison (Nov 2026, `scripts/model_bakeoff.py`)

Same tasks, same prompts, scored by the app's own quality checks on the first try (no retries): 9 round-2 shark turns, 10 crowd calls of 3 people, 12 round-2 swing voters, 3 Janta summaries.

| Model (`SARVAM_MODEL`) | Passed | Median call | Rs per crowd call | Notes |
|---|---|---|---|---|
| `sarvam-105b-conversations` (current) | 34/34 | 1.3 s | 0.011 | Cheapest; natural Hinglish |
| `glm5.3-flash` | 34/34 | 0.7 s | 0.018 | Fast; switched to Telugu for a Vijayawada persona |
| `gemma4` | 34/34 | 0.6 s | 0.035 | Fastest, but blander and mostly English |
| `deepseekv4.1-flash-1017` | 34/34 | 2.0 s | 0.027 | Most tokens per call |
| `glm5.3` | 34/34 | 2.7 s | 0.149 | ~13x the cost with no visible gain here |
| `sarvam-105b` (earlier test) | 23/31 | ~1 s | 0.011 | Template text and broken JSON |

The samples are small, so treat these as a first signal. Switch models with one `.env` line: endpoints (`/v1` or `/v2`) and thinking defaults are set per model in `llm/sarvam_client.py`.

### Janta personas: votes follow fit, not the label

`scripts/crowd_label_test.py` measures how often a person's attitude label alone predicts their vote. With the original thin personas (name, age, job, city, attitude), the label predicted **82-92%** of votes: early adopters agreed 9-10 times out of 10, and skeptics almost never did. A mixed-model crowd didn't change that. A "judge fit first" prompt helped only one pitch.

Personas now carry facts about their life (`personas/janta/dimensions.yaml`): household (school-age children? joint family?), how they work today, what they already pay for, phone habits and two pain points. Attitude comes last, as a tendency. Ages are now limited per job, which corrected 23 of 100 people (there was a 19-year-old retired bank manager). Same 50 people and pitches, `sarvam-105b-conversations`:

| | Thin personas | Rich personas |
|---|---|---|
| KiranaOne: label predicts | 82% | 64% (lift +34% to +0%) |
| PaathShala: label predicts | 84% | 56% |
| KiranaOne: kirana owners vs everyone else agreeing | not measured | 2/2 vs 7/48 |
| PaathShala: people with school-age kids vs others agreeing | not measured | 9/20 vs 6/30 |

The verdict also has a "By phone use" breakdown. The profiles are hand-written and plausible, not survey data; grounding them in real data is a later step. Each figure comes from one 50-person run per pitch.

What we hit on the live API, and the fix in code:

| Problem on sarvam-105b | Fix |
|---|---|
| `reasoning_effort: "none"` (from the guide) returns HTTP 400 | Uses `low` (`SARVAM_REASONING_EFFORT`) |
| Hidden thinking used the whole token limit, so the answer was cut off | Sarvam calls get at least 1,500 tokens; judges 6,000 |
| In schema mode, text fields came back as `""`, `"..."`, the pitch, or the instructions | Minimum lengths in every schema, plus checks that reject and retry: `llm/quality.py`, `turn_check`, `check_reaction` |
| A list of 10 crowd reactions came back with 1, or all with the same vote | One required field per person id, comment before vote, 3 people per call |
| Batched round-2 replies failed 8 times in 10 | Round 2 asks only swing voters, one per call |
| Judge wrote the score before its reasons (0/10 for a business with paying users) | Reasons first, score last in every verdict schema |
| ~50-60 requests/minute limit (HTTP 429) | One shared limiter for all debates (`SARVAM_RPM=50`), and 429s wait and retry |
| Hindi comments rejected by a word count that ignored Devanagari vowel signs | Counts letters and marks by Unicode category |

Each quality rule has a test built from the real bad reply it catches (`tests/test_prototype.py`).

## Crowd sensitivity test

`backend/scripts/crowd_sensitivity_test.py` checks whether the Janta crowd responds sensibly: repeat runs, price, target fit, attitude labels and peer influence, with pass rules fixed in advance. By default it uses the **free fake AI**, which only proves the script works. `--real` costs money and asks you to confirm.

```bash
cd backend
.venv/bin/python scripts/crowd_sensitivity_test.py                          # free dry run
.venv/bin/python scripts/crowd_sensitivity_test.py --real --stage basics    # PAID: checks 1-2
.venv/bin/python scripts/crowd_sensitivity_test.py --real --report-only     # free: re-read results
```

Real results are saved in `backend/data/crowd_tests/real.json`, so `--stage rest` reuses the basics runs. Passing does not show that the crowd predicts who will buy.

## Tests

### Backend (`backend/`)
```bash
cd backend
.venv/bin/python -m pytest -q
```

110 tests in `backend/tests/` (all on the fake AI provider and file store, plus 4 Postgres persistence tests when `pitch_panchayat_test` is present): personas, speaking-order supervisor, rupee arithmetic & anti-repetition checks, deal-table terms & counters, all three modes end to end, batched crowds, quality rules against real bad replies, SSRF scraper guards, internal token auth, HTTP API + share-link replay, and the fixes from the first real web run (`test_p1_fixes.py`: crowd matched to the target market, verdict reasons that follow the votes, no "never described" for something the founder said, at most 2 shark walk-outs per round).

### Web (`web/`)
```bash
cd web
npm run lint && npx tsc --noEmit && npm run build
```

## Documentation (`docs/` & `reports/`)

Detailed architecture, data flows, API contracts, pricing economics, and live model evaluations live in [`docs/`](docs/README.md) (with print-ready PDFs in `docs/pdf/`):

- [`docs/01-architecture.md`](docs/01-architecture.md) — Next.js BFF + FastAPI Engine topology, trust boundaries, LLM pipeline, and PostgreSQL schema.
- [`docs/02-user-data-flow.md`](docs/02-user-data-flow.md) — Auth, credit reserve/settle/refund lifecycle, SSE streaming, mode flows, and deletion outbox.
- [`docs/03-api-reference.md`](docs/03-api-reference.md) — Next.js Server Actions/routes and FastAPI internal REST + SSE event schemas.
- [`docs/04-pricing-and-unit-economics.md`](docs/04-pricing-and-unit-economics.md) — Measured token costs, per-mode COGS/margins, infra burn, and revenue targets.
- [`docs/05-experiments-and-findings.md`](docs/05-experiments-and-findings.md) — Persona realism experiments, live run findings, and open unknowns.
- [`reports/`](reports/) — Live Sharks run logs and quality-fix verification reports.

## How it maps to the build guide

Same architecture as the guide: one POST starts a debate, the browser reads one SSE stream, an LLM router hides the provider, every LLM reply is validated against a Pydantic model (retry once, then a fallback), and a judge reserve guarantees a verdict.

Status of prototype vs. production build:

| Area | Current implementation | Next / scale-out |
|---|---|---|
| Orchestration | Plain `asyncio` with rule-based supervisor (`debates/sharks.py: speaking_order`) | Port each mode into a LangGraph graph if needed |
| Persistence | Postgres on Neon (`db/migrations/001_init.sql`), or JSON files without `DATABASE_URL` (`store.py`) | Add migrations `002_*.sql` as schema evolves |
| Web app, auth & credits | Next.js 16 BFF (`web/`) with `scrypt` auth, credit ledger, tier gating, and sharing | Wire Razorpay webhooks & pass encrypted BYOK keys to runs |
| Live state & limits | In-memory sessions, rate limits, daily budget, and `watchRun()` poller | Redis pub/sub + job queue for multi-instance deployment |
| Landing-page scraper | Static HTML fetch with DNS/IP SSRF guard (`scraper.py`) | Headless browser for JS-rendered SPAs + IP socket pinning |

One deliberate change from the guide's code: the guide's Claude client forces a tool call and sends `temperature`. Current Claude models reject both, so `llm/anthropic_client.py` uses the SDK's structured outputs (`output_config.format` with `anthropic.transform_schema`) instead.

## Layout

```
web/                Next.js 16 BFF (landing page, auth, dashboard, credits, SSE relay)
backend/
  app/
    settings.py, models.py, prompts.py, personas.py, budget.py
    llm/            base (typed completion + retry), fake, anthropic, sarvam, factory (BYOK)
    debates/        sharks, deals, numbers, janta, roast, runner
    sessions.py     live event log + founder-reply / deal inboxes
    scraper.py      safe landing-page fetcher (public http(s) only, size/time caps)
    store.py        Postgres (engine.debates) or local JSON files
    api.py, main.py
  personas/         sharks/, roasters/, janta/dimensions.yaml
  scripts/          model_bakeoff.py, crowd_label_test.py, crowd_sensitivity_test.py
  tests/            110 pytest unit & integration tests
db/migrations/      PostgreSQL schema (public.* and engine.*)
docs/               Architecture, data flow, API, pricing, and experiments (+ pdf/)
reports/            Live run evaluations and quality-fix reports
frontend/index.html Standalone prototype UI (for engine-only local runs)
```
