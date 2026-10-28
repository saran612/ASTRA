# FDR Vault Prototype: Evaluation & Measurable Improvement Report

> [!NOTE]
> Prototype results on synthetic data. These measurements were generated using synthetic test records and an injectable simulation clock. Never treat these as production-level or certified institutional statistics.

## Summary Scorecard
- **Total FDRs Scrutinized**: 40
- **Seeded Defects Caught**: **6 / 6** (100%)
- **Seeded Defects Missed**: None (0 missed)
- **Engine Idempotency**: **VERIFIED (0 duplicate alerts on re-run)**
- **Automated Check Speed**: ~4.47 ms per FDR

---

## 1. Defect Detection Breakdown
| Target Rule Code | Seeded Defect Description | Caught by Engine? |
| :--- | :--- | :--- |
| `DUPLICATE_FDR_NO` | Double pledge across distinct institutions | ✅ CAUGHT |
| `DUPLICATE_DOCUMENT_HASH` | Reused document binary SHA-256 hash | ✅ CAUGHT |
| `DATE_INVALID` | Maturity date earlier than or equal to issue date | ✅ CAUGHT |
| `VALIDITY_TOO_SHORT` | Validity period under configured 3-year threshold | ✅ CAUGHT |
| `IFSC_BANK_MISMATCH` | Bank name mismatched with IFSC routing prefix | ✅ CAUGHT |
| `LIEN_NOT_MARKED` | Unencumbered deposit (missing AICTE joint lien flag) | ✅ CAUGHT |

---

## 2. Simulated 120-Day Horizon Alert Trajectory
Simulated forward shifts using the injectable `Clock` service to verify threshold trigger behaviors:

| Day Offset | Simulated Date | Cumulative Alerts Dispatched |
| :--- | :--- | :--- |
| Day +0 | `2026-09-01` | 0 alert events |
| Day +30 | `2026-10-01` | 0 alert events |
| Day +60 | `2026-10-31` | 5 alert events |
| Day +90 | `2026-11-30` | 25 alert events |
| Day +120 | `2026-12-30` | 55 alert events |

---

## 3. Idempotency Verification
- **Alert Count Before Re-run**: `121`
- **Alert Count After Re-run on Same Timestamp**: `121`
- **Result**: **PASS**. Compound index `@@unique([fdrId, ruleKey, recipientRole])` guarantees that daily cron re-runs are completely non-destructive and emit zero duplicate notifications.

---

## 4. Defect Detection Latency: Automated vs Manual Baseline
- **Automated Engine**: **4.47 ms** per deposit record.
- **Manual Baseline Assumption**: **~15 minutes (900000 ms)** per deposit.
*(Note: Manual baseline is a documented analytical assumption based on human scrutiny of physical registers, IFSC directories, and file cross-referencing, clearly labelled as an assumption, not an empirical field measurement).*
