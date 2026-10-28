# Project Implementation Status (Audit as of Phase 0)

> [!IMPORTANT]
> Strict ground rule: If there is no automated test proving a capability, it is **not** classified as `DONE`.
> Status categories:
> - `DONE`: Implemented in application code AND verified by automated test suite.
> - `PARTIAL`: Partially built in code or UI, but missing full workflow, edge-case handling, or complete test coverage.
> - `STUBBED`: Interface or mock exists as a placeholder without real execution.
> - `MISSING`: Not yet designed or built in the repository.

---

## 1. Section 1: Core & Deck-Promised Features

### PS-Critical Core

| Feature | Status | Primary Implementation File(s) | Proving Test File(s) | Notes & Deficiencies |
| :--- | :--- | :--- | :--- | :--- |
| **FDR Lifecycle State Machine** (Submit, Scrutiny, Verified, Active, Expiring, Renewed, Lapsed, Release) | `DONE` | `packages/shared/src/state-machine.ts`<br>`packages/shared/src/workflow-templates.ts`<br>`backend/src/services/fdr-lifecycle.ts`<br>`backend/src/services/release-workflow.ts` | `backend/test/lifecycle.test.ts`<br>`backend/test/workflow-property.test.ts`<br>`backend/test/renewal-release.test.ts` | Guarded `transition()` with append-only `FdrEvent` and audit ledger. Verified via 1,000-iteration random-walk property tests. |
| **Claimed vs Verified Trust Ledger** (`INSTITUTION`, `OFFICER_ENTERED`, `BANK_CONFIRMED`) | `DONE` | `backend/src/services/trust.ts`<br>`backend/src/routes/fdr.ts`<br>`frontend/src/pages/FdrDetailPage.tsx` | `backend/test/storage-trust.test.ts`<br>`backend/test/milestone5-rules-trust.test.ts` | Tracks field-level provenance across 8 critical FDR fields; officer verify or manual bank response upload flips badges to `BANK_CONFIRMED` or `OFFICER_ENTERED`. |
| **Discrepancy Rule Engine** (Missing fields, invalid dates, short validity, slab mismatch, IFSC mismatch, duplicate FDR, duplicate doc hash, missing lien) | `DONE` | `backend/src/services/discrepancy-rules.ts`<br>`backend/src/services/discrepancy-service.ts`<br>`docs/RULES.md` | `backend/test/discrepancy-rules.test.ts`<br>`backend/test/milestone5-rules-trust.test.ts` | 8 rules catalogued in `docs/RULES.md`, parameterized with `TODO(AICTE handbook)` placeholders. Verified with cross-institution duplicate FDR and document hash detection. |
| **Deadline & Escalation Engine** | `DONE` | `backend/src/services/obligation-engine.ts`<br>`backend/src/services/job-queue.ts`<br>`backend/src/services/holiday-calendar.ts`<br>`backend/src/services/notifier.ts` | `backend/test/obligation-scheduler.test.ts`<br>`backend/test/deadline-engine.test.ts` | Business-day aware alert ladder (T-90, T-30, T-7, T-0, T+N), holiday calendar, in-app alerts, dev SMTP, and stubbed SMS gateway. Kill-and-restart worker mid-run verified for zero duplicate dispatches. |
| **Renewal & Superseding Chain** | `DONE` | `backend/src/services/fdr-lifecycle.ts`<br>`backend/src/routes/fdr.ts` | `backend/test/renewal-release.test.ts` | Self-referencing relation (`supersedesFdrId`). Predecessor in `EXPIRING` or `LAPSED` auto-transitions to `RENEWED` with cryptographic audit chain preservation when successor reaches `ACTIVE`. |
| **Release / Refund Clearance Workflow** | `DONE` | `backend/src/services/release-workflow.ts`<br>`backend/src/routes/release.ts`<br>`frontend/src/pages/FdrDetailPage.tsx` | `backend/test/renewal-release.test.ts` | Two-tier statutory release gating: 5-point checklist sign-off by Regional Officer, final authorization by Bureau Authority, discrepancy blockers, rejection fallback to `ACTIVE`, and explicit disclaimer (*"FDR Vault records authorizations only; does not disburse funds"*). |
| **Cryptographic Audit Trail** | `DONE` | `backend/src/services/audit.ts`<br>`backend/src/routes/audit.ts`<br>`backend/src/services/fdr-lifecycle.ts` | `backend/test/lifecycle.test.ts`<br>`backend/test/audit-tamper.test.ts`<br>`backend/test/renewal-release.test.ts` | `SHA256(prevHash + canonical_json(row))` hash chain implemented, verified via `GET /api/audit/verify` and `GET /api/admin/audit/verify`. Pointer-based verification detects payload tampering and deleted records. |
| **RBAC & Scoping** | `DONE` | `backend/prisma/rls.sql`<br>`backend/src/services/rls.ts`<br>`backend/src/middlewares/auth.ts`<br>`backend/src/routes/fdr.ts` | `backend/test/cross-region-rls.test.ts`<br>`backend/test/auth-scoping.test.ts` | All 5 roles (`INSTITUTION`, `REGIONAL_OFFICER`, `BUREAU`, `COMMITTEE`, `ADMIN`) supported. PostgreSQL Row-Level Security policies enforced with `app_user` context. Cross-region access attempts verified to return 0 records / 404. |
| **Dashboards & Views** | `PARTIAL` | `frontend/src/pages/DashboardPage.tsx`<br>`frontend/src/pages/OfficerQueuePage.tsx` | None (Manual UI only) | Overview metrics, urgency bands, and officer scrutiny queues exist. Missing role-differentiated views for Bureau vs Regional vs Committee, ageing/bottleneck analytics. |
| **Reports & Data Export** | `PARTIAL` | `frontend/src/pages/FdrListPage.tsx` | None (Client-side export only) | CSV export generated in browser from tabular data. Missing server-side generated streaming CSV and PDF summary report. |

### Deck-Promised Layer

| Feature | Status | Primary Implementation File(s) | Proving Test File(s) | Notes & Deficiencies |
| :--- | :--- | :--- | :--- | :--- |
| **Unified Obligation Engine** (FDR validity, `STAGE_SLA`, `UNDERTAKING`, `LEASE_DOC`) | `DONE` | `backend/src/services/obligation-engine.ts`<br>`backend/prisma/schema.prisma` | `backend/test/obligation-scheduler.test.ts` | Polymorphic obligation register tracking multiple regulatory obligation types under unified alert ladders. |
| **Config-Driven Workflow Engine** (Route templates `ONLY_SCRUTINY`, `SCRUTINY_EVC`, `EVC_SAC_SHC`, `ONLY_EVC`, re-scrutiny loop, reason for revert) | `DONE` | `packages/shared/src/workflow-templates.ts`<br>`packages/shared/src/state-machine.ts` | `backend/test/workflow-property.test.ts` | 4 versioned route templates defined with mandatory revert justifications and discrepancy blockers, verified via 1,000 random-walk property tests. |
| **AI Assist Service (FastAPI)** | `DONE` | `services/ai/main.py`<br>`services/ai/ocr.py`<br>`services/ai/rag.py`<br>`services/ai/risk_model.py`<br>`backend/src/services/ai-client.ts`<br>`backend/src/routes/ai.ts`<br>`docs/MODEL_CARD.md` | `services/ai/test_ai_service.py`<br>`backend/test/ai-service-fallback.test.ts` | Standalone FastAPI microservice providing OCR token extraction with confidence gates (< 0.85 requires human review), zero-hallucination Handbook RAG citing exact APH clauses, synthetic SLA breach risk prediction (`scikit-learn` pipeline with demo disclaimer), and Node backend client with 3-second timeout and offline graceful degradation. |
| **Postgres Job Queue (`SKIP LOCKED`)** | `DONE` | `backend/src/services/job-queue.ts`<br>`backend/prisma/schema.prisma` | `backend/test/obligation-scheduler.test.ts` | Transaction-safe queue using PostgreSQL `FOR UPDATE SKIP LOCKED`. Unique constraint `(obligationId, ruleKey, threshold)` guarantees 0 duplicates on worker crashes. |

---

## 2. Summary of Build & Infrastructure Health

- **Root Unit Tests (`npm test`)**: 13 test files, 87 passing tests (including 1,000 property-based random walk iterations, DB tamper tests, PostgreSQL RLS cross-region isolation, worker restart idempotency, discrepancy rules, trust ledger verifications, renewal superseding, 2-tier release/rejection workflows, and AI service offline fallback resilience).
- **Python AI Microservice Tests (`pytest`)**: 5 passing tests in `services/ai/test_ai_service.py`.
- **Production Build (`npm run build`)**: 
  - `packages/shared`: PASSED.
  - `frontend`: PASSED.
  - `backend`: PASSED (`tsc -b && prisma generate` cleanly compiled).
- **Evaluation Harness (`npm run eval`)**: PASSED (cleanly generates `docs/EVAL_REPORT.md`).
- **Clock Service**: All business logic cleanly uses `Clock.now()` with zero direct `new Date()` or `Date.now()` calls in services.
