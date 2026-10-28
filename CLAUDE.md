# CLAUDE.md: ASTRA / FDR Vault (SIH26265, Team Nocturnals)

## 0. Mission
Finish a working, demoable prototype for SIH26265 (AICTE: Streamline Security Deposit / FDR Portal, Smart Automation) and write the documentation. Part of the repo already exists. **Do not rewrite what works.** Audit first, then fill gaps.

Precedence when sources conflict: **1) the PS text, 2) the submitted idea deck (ASTRA), 3) the existing repo, 4) your preferences.** Record every conflict in `docs/ASSUMPTIONS.md` and keep moving.

## 1. Scope: what "full" means
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
 BankVerifier: Manual | Mock | (documented