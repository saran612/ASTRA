# CLAUDE.md: ASTRA / FDR Vault (SIH26265, Team Nocturnals)

## 0. Mission
Finish a working, demoable prototype for SIH26265 (AICTE: Streamline Security Deposit / FDR Portal, Smart Automation) and write the documentation. Part of the repo already exists. **Do not rewrite what works.** Audit first, then fill gaps.

Precedence when sources conflict: **1) the PS text, 2) the submitted idea deck (ASTRA), 3) the existing repo, 4) your preferences.** Record every conflict in `docs/ASSUMPTIONS.md` and keep moving.

---

## 1. Scope: What "Full" Means
PS-critical core (build first, build well):
- FDR / security deposit lifecycle: submit, scrutiny, verify, active, expiring, renewed/lapsed, release/refund
- Claimed-vs-verified trust ledger (`INSTITUTION | OFFICER_ENTERED | BANK_CONFIRMED`)
- Discrepancy rule engine (incl. cross-institution duplicate FDR no. / document hash)
- Deadline + escalation engine, dashboards, reports, audit trail, RBAC

Deck-promised layer (build as thin, honest modules on the same core):
- **Unified obligation engine:** FDR validity is one obligation type. Others: `STAGE_SLA`, `UNDERTAKING`, `LEASE_DOC`. One register, one scheduler, one alert ladder.
- **Config-driven workflow engine:** versioned JSON route templates (`ONLY_SCRUTINY`, `SCRUTINY_EVC`, `EVC_SAC_SHC`, `ONLY_EVC`, re-scrutiny loop), auto-advance on mechanical stages, return/revert requires a reason.
- **AI assist (human-in-the-loop only):** OCR date/field extraction, evidence-linked assessment report (RAG over handbook clauses), SLA-breach risk score.

```
 React SPA (Inst | Regional | Bureau | Committee | Audit explorer)
        |  REST + JWT
 +------v----------------------------------------------+
 | Core API (existing stack)                           |
 |  Workflow | Obligations | FDR | Rules | Audit        |
 +---+-------------+---------------+-------------------+
     |             |               |
 Postgres      Object store     AI service (FastAPI, separate process)
 (RLS, jobs,   (encrypted)      OCR | RAG(pgvector) | SLA-risk
  audit chain)                  all outputs = suggestions + confidence + evidence
     |
 Scheduler (Postgres job queue, SKIP LOCKED) -> Notifier (in-app | SMTP | SMS stub)
 BankVerifier: Manual | Mock | (documented empty slot for real banking APIs)
```

---

## 2. Hard Invariants & Code Standards
- **Zero Hallucination AI**: RAG queries must cite exact AICTE handbook chapters, sections, and verbatim text. Never guess regulatory policies.
- **Strict Clock Discipline**: Business logic, transitions, and alerts consume `Clock.now()`, never direct `new Date()` or `Date.now()`.
- **Append-Only Audit Ledger**: Every mutation appends a record sealed with `SHA-256(prevHash + canonical_json(row))`.
- **Row-Level Security**: Institutional data access is strictly bounded by PostgreSQL RLS. Regional officers are isolated to their own geographical jurisdiction.
- **Honest Metrics**: Analytical baselines must be flagged with `*[ASSUMPTION]*`. Measured metrics must come from empirical test execution.

---

## 3. Milestones Roadmap & Delivery

- **Milestone 1**: Audit + `STATUS.md` + `CLAIMS_VS_REALITY.md`; Clock cleanup; Compose boots clean. (COMPLETED)
- **Milestone 2**: State machine / templates + property tests; audit chain + tamper test. (COMPLETED)
- **Milestone 3**: RBAC + Postgres RLS + cross-region test suite. (COMPLETED)
- **Milestone 4**: Obligation engine + job queue + escalation + restart-idempotency test. (COMPLETED)
- **Milestone 5**: Rules engine completion (`docs/RULES.md`) + trust ledger UI + bank verification. (COMPLETED)
- **Milestone 6**: Renewal chain + 2-tier release/refund workflow with 5-point checklist and disclaimer. (COMPLETED)
- **Milestone 7**: AI Assist service (FastAPI in `services/ai/`, OCR extraction, strict Handbook RAG, synthetic SLA breach risk model, `docs/MODEL_CARD.md`, offline graceful fallback). (COMPLETED)
- **Milestone 8**: Role-differentiated dashboards, streaming RFC 4180 CSV export (`GET /api/reports/fdrs/export.csv`), and live Audit Explorer UI (`/admin/audit`). (COMPLETED)
- **Milestone 9**: Seed database with 200 FDRs across realistic distributions and deliberate edge cases, run `npm run eval`, generate measured `docs/EVAL_REPORT.md`. (COMPLETED)
- **Milestone 10**: Complete all 14 official documentation files, verify clean clone, test suite, and push to GitHub. (COMPLETED)