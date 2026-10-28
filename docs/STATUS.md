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

---

## 3. Summary of Build & Infrastructure Health

- **Root Unit Tests (`npm test`)**: 12 test files, 76 passing tests (including 1,000 property-based random walk iterations, DB tamper tests, PostgreSQL RLS cross-region isolation, worker restart idempotency, and discrepancy rules/trust ledger verifications).
- **Production Build (`npm run build`)**: 
  - `packages/shared`: PASSED.
  - `frontend`: PASSED.
  - `backend`: PASSED (`tsc -b && prisma generate` cleanly compiled).
- **Evaluation Harness (`npm run eval`)**: PASSED (cleanly generates `docs/EVAL_REPORT.md`).
- **Clock Service**: All business logic cleanly uses `Clock.now()` with zero direct `new Date()` or `Date.now()` calls in services.
