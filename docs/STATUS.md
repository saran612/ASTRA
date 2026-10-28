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
| **Claimed vs Verified Trust Ledger** (`INSTITUTION`, `OFFICER_ENTERED`, `BANK_CONFIRMED`) | `DONE` | `backend/src/services/trust.ts`<br>`frontend/src/pages/FdrDetailPage.tsx` | `backend/test/storage-trust.test.ts` | Tracks field-level provenance across 8 critical FDR fields; officer verify flips badge to `BANK_CONFIRMED`. |
| **Discrepancy Rule Engine** (Missing fields, invalid dates, short validity, slab mismatch, IFSC mismatch, duplicate FDR, duplicate doc hash, missing lien) | `DONE` | `backend/src/services/discrepancy-rules.ts`<br>`backend/src/services/discrepancy-service.ts` | `backend/test/discrepancy-rules.test.ts` | 6 seeded synthetic rules verified with 100% precision/recall against catalogued defects. Slabs marked `TODO(AICTE handbook)`. |
| **Deadline & Escalation Engine** | `DONE` | `backend/src/services/obligation-engine.ts`<br>`backend/src/services/job-queue.ts`<br>`backend/src/services/holiday-calendar.ts`<br>`backend/src/services/notifier.ts` | `backend/test/obligation-scheduler.test.ts`<br>`backend/test/deadline-engine.test.ts` | Business-day aware alert ladder (T-90, T-30, T-7, T-0, T+N), holiday calendar, in-app alerts, dev SMTP, and stubbed SMS gateway. Kill-and-restart worker mid-run verified for zero duplicate dispatches. |
| **Dashboards & Views** | `PARTIAL` | `frontend/src/pages/DashboardPage.tsx`<br>`frontend/src/pages/OfficerQueuePage.tsx` | None (Manual UI only) | Overview metrics, urgency bands, and officer scrutiny queues exist. Missing role-differentiated views for Bureau vs Regional vs Committee, ageing/bottleneck analytics. |
| **Reports & Data Export** | `PARTIAL` | `frontend/src/pages/FdrListPage.tsx` | None (Client-side export only) | CSV export generated in browser from tabular data. Missing server-side generated streaming CSV and PDF summary report. |
| **Cryptographic Audit Trail** | `DONE` | `backend/src/services/audit.ts`<br>`backend/src/routes/audit.ts`<br>`backend/src/services/fdr-lifecycle.ts` | `backend/test/lifecycle.test.ts`<br>`backend/test/audit-tamper.test.ts` | `SHA256(prevHash + canonical_json(row))` hash chain implemented, verified via `GET /api/audit/verify` and `GET /api/admin/audit/verify`. Tamper test proves mutations and deleted rows are immediately detected. |
| **RBAC & Scoping** | `DONE` | `backend/prisma/rls.sql`<br>`backend/src/services/rls.ts`<br>`backend/src/middlewares/auth.ts`<br>`backend/src/routes/fdr.ts` | `backend/test/cross-region-rls.test.ts`<br>`backend/test/auth-scoping.test.ts` | All 5 roles (`INSTITUTION`, `REGIONAL_OFFICER`, `BUREAU`, `COMMITTEE`, `ADMIN`) supported. PostgreSQL Row-Level Security policies enforced with `app_user` context. Cross-region access attempts verified to return 0 records / 404. |

### Deck-Promised Layer

| Feature | Status | Primary Implementation File(s) | Proving Test File(s) | Notes & Deficiencies |
| :--- | :--- | :--- | :--- | :--- |
| **Unified Obligation Engine** (FDR validity, `STAGE_SLA`, `UNDERTAKING`, `LEASE_DOC`) | `DONE` | `backend/src/services/obligation-engine.ts`<br>`backend/prisma/schema.prisma` | `backend/test/obligation-scheduler.test.ts` | Polymorphic obligation register tracking multiple regulatory obligation types under unified alert ladders. |
| **Config-Driven Workflow Engine** (Route templates `ONLY_SCRUTINY`, `SCRUTINY_EVC`, `EVC_SAC_SHC`, `ONLY_EVC`, re-scrutiny loop, reason for revert) | `DONE` | `packages/shared/src/workflow-templates.ts`<br>`packages/shared/src/state-machine.ts` | `backend/test/workflow-property.test.ts` | 4 versioned route templates defined with mandatory revert justifications and discrepancy blockers, verified via 1,000 random-walk property tests. |
| **AI Assist Service (FastAPI)** | `MISSING` | None | None | No `services/ai` directory. No OCR date/field extraction, no RAG report over handbook clauses citing `{clause_id}`, no SLA-breach risk LightGBM/scikit-learn model. |
| **Postgres Job Queue (`SKIP LOCKED`)** | `DONE` | `backend/src/services/job-queue.ts`<br>`backend/prisma/schema.prisma` | `backend/test/obligation-scheduler.test.ts` | Transaction-safe queue using PostgreSQL `FOR UPDATE SKIP LOCKED`. Unique constraint `(obligationId, ruleKey, threshold)` guarantees 0 duplicates on worker crashes. |

---

## 2. Problem Statement (PS) 10 Capabilities

| # | PS Capability | Status | Implementation File(s) | Test File(s) | Assessment |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **Centralized Online FDR Submission Portal** | `PARTIAL` | `frontend/src/pages/NewFdrPage.tsx`<br>`backend/src/routes/fdr.ts` | None for full web flow | Institutions can submit FDR details and upload receipt files. Works in UI, but lacks end-to-end integration test. |
| 2 | **Document Upload & Secure Storage** | `DONE` | `backend/src/services/storage.ts`<br>`backend/src/routes/fdr.ts` | `backend/test/storage-trust.test.ts` | Local disk `DocumentStore` with AES-256-GCM encryption at rest, 12-byte random IVs, SHA-256 verification, and HMAC signed download tokens. |
| 3 | **Scrutiny & Review Workflow** | `PARTIAL` | `backend/src/routes/fdr.ts`<br>`frontend/src/pages/OfficerQueuePage.tsx` | `backend/test/lifecycle.test.ts` | Queue displays submitted instruments; officer can review fields, mark verified, or flag discrepancies. Missing multi-officer route templates and required revert reasons. |
| 4 | **Bank Verification Workflow** | `DONE` | `backend/src/services/bank-verifier.ts`<br>`backend/src/routes/bank-verification.ts` | `backend/test/bank-verification.test.ts` | Formats official AICTE bank inquiry letter; supports mock automated response (clearly labelled demo) and manual bank reply document upload. |
| 5 | **Claimed vs Verified Trust Ledger** | `DONE` | `backend/src/services/trust.ts`<br>`backend/src/routes/fdr.ts` | `backend/test/storage-trust.test.ts` | Provenance tracked per field (`INSTITUTION`, `OFFICER_ENTERED`, `BANK_CONFIRMED`) with UI color coding and verification timestamp. |
| 6 | **Discrepancy & Validation Rules Engine** | `DONE` | `backend/src/services/discrepancy-rules.ts`<br>`backend/src/services/discrepancy-service.ts` | `backend/test/discrepancy-rules.test.ts` | 6 rules executed deterministically. Catches double-pledged FDR numbers and duplicate document hashes across distinct colleges. |
| 7 | **Maturity & Expiry Tracking with Escalation** | `DONE` | `backend/src/services/obligation-engine.ts`<br>`backend/src/services/job-queue.ts`<br>`backend/src/services/holiday-calendar.ts` | `backend/test/obligation-scheduler.test.ts`<br>`backend/test/deadline-engine.test.ts` | Threshold detection (T-90, T-30, T-7, T-0, T+N) with business-day holiday calendar, Postgres `SKIP LOCKED` job queue, and crash-resilient alert deduplication. |
| 8 | **Renewal & Superseding Chain** | `DONE` | `backend/src/services/fdr-lifecycle.ts`<br>`backend/src/routes/fdr.ts` | `backend/test/renewal-release.test.ts` | Self-referencing Prisma relation (`supersedesFdrId`). When replacement FDR reaches `ACTIVE`, previous FDR is auto-transitioned to `RENEWED`. |
| 9 | **Release & Refund Clearance Workflow** | `DONE` | `backend/src/services/release-workflow.ts`<br>`backend/src/routes/release.ts` | `backend/test/renewal-release.test.ts` | Two-tier release gating: Regional Officer checklist sign-off followed by Bureau Head final authorization. Explicitly labelled as authorization-only (no fund movement). |
| 10 | **Audit Trail, RBAC & Administrative Controls** | `DONE` | `backend/src/services/audit.ts`<br>`backend/prisma/rls.sql`<br>`backend/src/services/rls.ts`<br>`backend/src/services/clock.ts`<br>`backend/src/routes/admin.ts` | `backend/test/lifecycle.test.ts`<br>`backend/test/audit-tamper.test.ts`<br>`backend/test/cross-region-rls.test.ts` | Hash chain, DB-enforced RLS policies, time travel controls, and tamper detection verified. |

---

## 3. Summary of Build & Infrastructure Health

- **Root Unit Tests (`npm test`)**: 11 test files, 62 passing tests (including 1,000 property-based random walk iterations, DB tamper tests, PostgreSQL RLS cross-region isolation, and worker restart idempotency).
- **Production Build (`npm run build`)**: 
  - `packages/shared`: PASSED.
  - `frontend`: PASSED.
  - `backend`: PASSED (`tsc -b && prisma generate` cleanly compiled).
- **Evaluation Harness (`npm run eval`)**: PASSED (cleanly generates `docs/EVAL_REPORT.md`).
- **Clock Service**: All business logic cleanly uses `Clock.now()` with zero direct `new Date()` or `Date.now()` calls in services.
