# Sabhora Documentation

This folder contains the technical, commercial, and verification documentation for **Sabhora** (formerly Pitch Panchayat). Print-ready PDFs with rendered diagrams for documents `01`–`05` are in [`pdf/`](./pdf/). Those PDFs were regenerated on 2026-11-26: the covers and top-of-page strip say Sabhora by Neevora Labs, and each PDF carries the same rename note as the markdown; the body text, examples and diagrams were kept as they were, so references inside still read "Pitch Panchayat".

## Document Index

| Document | PDF | Scope | Best for |
|---|---|---|---|
| [01 · Architecture](./01-architecture.md) | [01-architecture.pdf](./pdf/01-architecture.pdf) | System topology, component responsibilities, trust boundaries, LLM & persona engine, database schema, and scaling limits. | Understanding how the system is built and deployed. |
| [02 · User & Data Flow](./02-user-data-flow.md) | [02-user-data-flow.pdf](./pdf/02-user-data-flow.pdf) | End-to-end journeys for auth, credit hold/settle/refund, SSE streaming, Sharks/Janta/Roast execution, follow-up chat, and sharing/deletion. | Tracing how requests, money, and events move through the app. |
| [03 · API Reference](./03-api-reference.md) | [03-api-reference.pdf](./pdf/03-api-reference.pdf) | Complete specification of Next.js endpoints/Server Actions and FastAPI internal REST + SSE routes, payloads, event schemas, and error codes. | Integrating with, testing, or extending the backend and web layers. |
| [04 · Pricing & Unit Economics](./04-pricing-and-unit-economics.md) | [04-pricing-and-unit-economics.pdf](./pdf/04-pricing-and-unit-economics.pdf) | Measured AI token costs, per-mode COGS and gross margins, infrastructure burn, break-even math, MRR targets, and pricing recommendations. | Setting credit prices, subscription tiers, and revenue/conversion targets. |
| [05 · Approaches & Findings](./05-experiments-and-findings.md) | [05-experiments-and-findings.pdf](./pdf/05-experiments-and-findings.pdf) | What we tried to make the AI panels believable, what the tests showed, and what is unproven. | Deciding what to build or test next. |
| [06 · Business Logic & Evidence](./06-business-logic-and-evidence.md) | — | What the product does, what code enforces vs. AI judgement, money/limit guarantees, and evidence ledger (`REAL` / `REPLAY` / `TEST` / `CODE`). | Auditing product guarantees and test coverage. |

## Related Project Files

- [Project README](../README.md) — Local setup, environment variables, and model notes.
- [Database Migration 001](../db/migrations/001_init.sql) — Authoritative PostgreSQL DDL for `public.*` and `engine.*`.
- [Pricing & Entitlements Source](../web/lib/pricing.ts) — Credit costs, tiers, and plans used by the web app.
