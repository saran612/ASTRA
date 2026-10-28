# Workflow Route Templates & State Transition Policies

> [!NOTE]
> Implemented: Versioned workflow route templates and programmatic validation are implemented in `@fdr-vault/shared/workflow-templates.ts`.

---

## 1. Overview & Architecture

AICTE regulations mandate differentiated scrutiny and review workflows depending on institution risk profile, program category, and previous compliance track record. 

Instead of a single monolithic state machine, ASTRA uses **versioned workflow route templates**:
- Every route template specifies allowed forward moves, mechanical auto-advance stages, and revert gates.
- Reverts (e.g. flagging a discrepancy or rejecting a release request) **mandatorily require an explicit reason string**.
- Terminal states (`RELEASED`, `LAPSED`) cannot transition to any other status.

---

## 2. Defined Route Templates

### Template 1: `ONLY_SCRUTINY` (Version 1)
- **Target Institutions**: Established government and autonomous colleges undergoing routine renewal.
- **Workflow Topology**:
  `SUBMITTED` ➔ `UNDER_SCRUTINY` ➔ `VERIFIED` ➔ `ACTIVE` ➔ `EXPIRING` ➔ `RENEWED` / `LAPSED` / `RELEASED`
- **Revert Loops**:
  - `UNDER_SCRUTINY` ➔ `DISCREPANCY` (Requires officer defect reason)
  - `DISCREPANCY` ➔ `UNDER_SCRUTINY` (Institution corrective resubmission)
  - `RELEASE_REQUESTED` ➔ `ACTIVE` (Officer/Authority rejection with written remand justification)

### Template 2: `SCRUTINY_EVC` (Version 1)
- **Target Institutions**: New technical institutions, major intake expansions, or campuses changing sites.
- **Workflow Topology**: Combines desk scrutiny with physical Expert Visit Committee (EVC) verification.

### Template 3: `EVC_SAC_SHC` (Version 1)
- **Target Institutions**: Contested institutional appeals, non-compliant colleges, or high-value disputed deposits.
- **Workflow Topology**: Standing Appellate Committee (SAC) hearing followed by apex Standing Hearing Committee (SHC) determination.

### Template 4: `ONLY_EVC` (Version 1)
- **Target Institutions**: Direct on-site infrastructure and land verification checks where institutional documents are pre-cleared.

---

## 3. Transition Rules & Invariants

1. **Revert Reason Enforcement**:
   Any backward transition marked `isRevert: true` (such as `UNDER_SCRUTINY -> DISCREPANCY` or `RELEASE_REQUESTED -> ACTIVE`) throws a validation error if the caller does not supply a non-empty `reason`.

2. **Unresolved Discrepancy Gate**:
   Transitioning to `VERIFIED` or approving release (`RELEASE_APPROVED`) is strictly rejected whenever `hasOpenDiscrepancies: true`.

3. **Auto-Advance Stages**:
   - `SUBMITTED -> UNDER_SCRUTINY` auto-advances upon upload.
   - `VERIFIED -> ACTIVE` auto-advances once trust ledger entries reach `BANK_CONFIRMED`.
   - `ACTIVE -> EXPIRING` and `EXPIRING -> LAPSED` auto-advance via the deadline scheduler.
