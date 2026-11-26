# 02 · User & Data Flow

> **Written before the rename.** This document says "Pitch Panchayat"; the product is now **Sabhora by Neevora Labs**. The architecture, data flows and APIs are unchanged. Internal names (folder, database, log tags) still use the old name on purpose. The PDF in `pdf/` is from before the rename.


**Scope:** This document traces how user actions, money (credits), and AI events move through Pitch Panchayat at runtime. For module structure, see [01 · Architecture](./01-architecture.md). For exact endpoint schemas, see [03 · API Reference](./03-api-reference.md).

---

## 1. Authentication & Account Data Flow

```mermaid
sequenceDiagram
    actor User as Founder
    participant Web as Next.js Auth Actions
    participant Crypto as crypto.ts & session.ts
    participant DB as PostgreSQL

    rect rgb(240, 244, 255)
        note right of User: Sign-up Flow
        User->>Web: signup(name, email, password, terms)
        Web->>Crypto: hashPassword (scrypt N=32768)
        Web->>DB: TX: INSERT users + credit_ledger (+50 free_grant)
        Web->>Crypto: createSession (32B token -> sha256)
        Web->>DB: INSERT sessions (30d TTL)
        Web-->>User: Set HttpOnly pp_session + Redirect /dashboard?welcome=1
    end

    rect rgb(245, 250, 245)
        note right of User: Password Reset Flow
        User->>Web: requestPasswordReset(email)
        Web->>DB: TX: DELETE old resets + INSERT sha256(token) (30m TTL)
        User->>Web: resetPassword(token, newPassword)
        Web->>DB: TX: UPDATE password_resets SET used=TRUE RETURNING user_id
        Web->>DB: UPDATE password_hash + DELETE ALL user sessions
        Web->>Crypto: createSession (24h TTL)
        Web-->>User: Set new pp_session + Redirect /dashboard
    end
```

### Key Auth Details
- **Login Timing Protection:** `login` (`5 / 15m` per IP+email, `30 / 15m` per IP) always executes `verifyPassword()` against the user's hash—or `getDummyHash()` for unknown emails—to equalize response time.
- **Session Rotation:** Signing in deletes the prior `pp_session` row; `changePassword` revokes all *other* sessions; `resetPassword` revokes *all* sessions.

---

## 2. Run & Credit Lifecycle (Reserve → Stream → Settle / Refund)

### 2.1 End-to-End Sequence

```mermaid
sequenceDiagram
    actor User as Founder (Browser)
    participant Web as Next.js (web/)
    participant DB as PostgreSQL
    participant Engine as FastAPI (backend/)

    User->>Web: Submit NewRunForm (createRun)
    Web->>DB: BEGIN + SELECT users FOR UPDATE
    Web->>DB: Check SUM(credit_ledger.delta) >= cost & running < 2
    Web->>DB: INSERT runs(status='running') + ledger(-cost, 'reserve')
    Web->>DB: COMMIT
    Web->>Engine: POST /api/debates (x-internal-token, x-client-id)
    alt Engine fails to start
        Engine-->>Web: 4xx / 5xx / timeout
        Web->>DB: DELETE runs WHERE status='running' + ledger(+cost, 'refund')
        Web-->>User: Show error ("You haven't been charged")
    else Engine starts debate
        Engine-->>Web: 201 { id: backendId }
        Web->>DB: UPDATE runs SET backend_id = backendId
        Web->>Web: Start watchRun(runId) background poller
        Web-->>User: Redirect to /dashboard/runs/{runId}
        User->>Web: GET /api/runs/{runId}/stream (EventSource)
        Web->>Engine: GET /api/debates/{backendId}/stream
        loop Live events
            Engine-->>Web: SSE event (start, round, message, reaction, verdict...)
            Web->>Web: sanitizeEvent() removes internal tokens & models
            Web-->>User: Relayed SSE event
        end
        Engine-->>Web: SSE "done" + persist snapshot to engine.debates
        Web->>Web: syncRun(runId) -> settle()
        Web->>DB: SELECT runs FOR UPDATE -> status='done' or 'failed' + refund
        Web-->>User: SSE "done" -> router.refresh() loads final state
    end
```

### 2.2 Run & Credit State Machine (`web/lib/runs.ts`)

```mermaid
stateDiagram-v2
    [*] --> Reserved: "createRun() locks user row + ledger(-cost, reserve)"
    Reserved --> RolledBack: "POST /api/debates fails -> DELETE run + ledger(+cost, refund)"
    Reserved --> Running: "Engine returns 201 backend_id -> start watchRun()"

    Running --> SettledDone: "Verdict present -> status=done, keep credits"
    Running --> SettledFailed: "Error event, engine 404, or >30m timeout -> status=failed + ledger(+cost, refund)"

    SettledDone --> PublicShared: "setShared(1) -> visible at /v/{shareId}"
    SettledDone --> Deleted: "deleteRun() -> queue engine_deletions"
    SettledFailed --> Deleted: "deleteRun() -> queue engine_deletions"
```

### Credit Invariants
- **No Double-Spend:** `startRun()` locks `users` (`FOR UPDATE`), checks `SUM(delta) >= cost`, enforces `MAX_RUNNING = 2`, and writes `-cost` with `idempotency_key = 'reserve:' + runId`.
- **No Double-Refund / Double-Settle:** `settle()` locks `runs` (`FOR UPDATE`). If `status !== 'running'`, it returns immediately; unique `idempotency_key` (`'refund:' + runId`) prevents duplicate ledger entries.
- **Crash / Tab-Close Recovery:** `watchRun()` polls `syncRun()` every 3s (up to 31 minutes) even if the browser closes. If `web/` restarts, `reconcileRuns(userId)` catches up whenever the user loads the dashboard, runs list, run page, or ledger.

---

## 3. Room-Specific Execution Data Flows

### 3.1 Sharks Mode (`backend/app/debates/sharks.py` + `deals.py`)

```mermaid
flowchart TD
    Start["emit start + panel (5 sharks) + ask"] --> R1["Round 1 · File order · out forbidden"]
    R1 --> W1{"Wait <= 45s for replyToSharks()"}
    W1 -->|"reply / skip / timeout"| R2["Round 2 · Skeptics first · sharks may go out"]
    R2 --> W2{"Wait <= 45s for replyToSharks()"}
    W2 -->|"reply / skip / timeout"| R3["Round 3 · Remaining sharks speak"]
    R3 --> HasAsk{"Did founder provide an ask?"}
    HasAsk -->|"No"| Judge["Judge LLM writes SharkVerdict"]
    HasAsk -->|"Yes"| Table["Deal Table · Opening offers/joins -> Bidding raises"]
    Table --> Offers{"Any standing offers?"}
    Offers -->|"No"| CloseNo["emit deal (no_deal)"] --> Judge
    Offers -->|"Yes"| Choice{"Wait <= 90s · founder_choice"}
    Choice -->|"accept / walk / timeout"| CloseDeal["emit deal (accepted / walked / timeout)"] --> Judge
    Choice -->|"counter (once)"| Counter["Lead shark answers: accept / revise / hold / out"]
    Counter -->|"accept"| CloseDeal
    Counter -->|"revise / hold / out"| Choice
    Judge --> Done["emit verdict + done -> persist snapshot"]
```

1. **Questioning (`3` rounds):** Round 1 uses YAML order (`meera`, `arjun`, `ananya`, `vikram`, `farah`). Rounds 2–3 sort remaining sharks by skepticism (`pass` → `maybe` → `invest`).
2. **Deal Table (`deals.py`):** `check_terms()` enforces `0.5x–1.5x` ask amount, `<=75%` equity, `<=15%` royalty, and `<=24%` debt interest. In bidding, `is_better()` guarantees competing raises only improve terms for the founder. Accepted counters always lock in the founder's exact numbers.

### 3.2 Janta Mode (`backend/app/debates/janta.py`)

```mermaid
flowchart LR
    Gen["generate_crowd(N, seed=42)"] --> R1["Round 1 · Batches of 3 (6 parallel) -> CrowdReaction"]
    R1 -->|"Batch LLMError"| Fallback1["Fallback: 1 call per person"]
    R1 --> Digest["digest() · R1 tally + sample quotes"]
    Fallback1 --> Digest
    Digest --> R2["Round 2 · Swing voters only (all neutral + 1/3 decided) · 1 per call"]
    R2 --> Math["Code Math · tally() & segment_breakdown()"]
    Math --> Judge["Judge LLM writes JantaSummary"]
    Judge --> Done["emit verdict + done"]
```

- **Why Two-Stage:** Round 1 captures independent reactions in batches of 3 (`JANTA_BATCH_SIZE=3`) to cut API calls by ≈3x. Round 2 re-asks swing voters individually so they don't copy Round 1 quotes verbatim (`check_reaction` verifies uniqueness).
- **Zero-Token Analytics:** Vote percentages, willingness-to-pay (`would_pay_pct`), and breakdowns (`City tier`, `Age`, `Attitude`, `Phone use`, `Model`) are computed deterministically in Python.

### 3.3 Roast Mode (`backend/app/debates/roast.py` + `scraper.py`)

```mermaid
flowchart LR
    URL["Founder submits URL"] --> WebVal["validatePublicUrl() in web/"]
    WebVal --> Fetch["fetch_page() · DNS check per hop (<=5 redirects, <=2MB, <=12s)"]
    Fetch -->|"Private/Invalid"| Err["emit error + done -> Auto-refund"]
    Fetch -->|"Public HTML"| Parse["parse_html() · title, meta, 15 headings, 20 CTAs, 3500 chars"]
    Parse --> Roasters["6 Roasters in parallel (ROAST_PARALLEL=3) -> stream reviews"]
    Roasters --> Avg["Code Math · averages(clarity, trust, design, cta)"]
    Avg --> Judge["Judge LLM writes RoastVerdict (top_fixes, one_liner, overall)"]
    Judge --> Done["emit verdict + done"]
```

---

## 4. Post-Verdict Chat, Sharing & Deletion Data Flows

```mermaid
sequenceDiagram
    actor Owner as Founder
    actor Guest as Public Visitor
    participant Web as Next.js
    participant DB as PostgreSQL
    participant Engine as FastAPI

    rect rgb(245, 245, 255)
        note right of Owner: Stateless Follow-up Chat
        Owner->>Web: chatWithPersona(runId, personaId, msg, history)
        Web->>DB: Verify run owner & status='done'
        Web->>Engine: POST /api/debates/{backendId}/chat
        Engine->>DB: Load snapshot (if not in SessionStore)
        Engine->>Engine: find_persona() + LLM reply + anti-repetition check
        Engine-->>Web: { reply, position, position_before }
        Web-->>Owner: Updated React state (nothing stored server-side)
    end

    rect rgb(245, 255, 245)
        note right of Owner: Public Share Link
        Owner->>Web: setShared(runId, true)
        Web->>DB: UPDATE runs SET is_public=TRUE
        Guest->>Web: GET /v/{shareId}
        Web->>DB: SELECT runs + owner first name WHERE is_public AND done
        Web-->>Guest: Read-only RunView (no reply, deal, or chat)
    end

    rect rgb(255, 245, 245)
        note right of Owner: Deletion Outbox
        Owner->>Web: deleteRun(runId) or deleteAccount()
        Web->>DB: TX: DELETE public rows + INSERT engine_deletions(backend_id)
        Web->>Engine: DELETE /api/debates/{backendId}
        Engine->>Engine: Cancel live task + remove from SessionStore
        Engine->>DB: DELETE FROM engine.debates
        Web->>DB: DELETE FROM engine_deletions (retried via reconcileRuns if failed)
    end
```
