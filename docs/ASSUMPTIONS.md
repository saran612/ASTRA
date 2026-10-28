# ASTRA / FDR Vault — Engineering & Regulatory Assumptions

> **AICTE SIH26265**: Streamline Security Deposit / Fixed Deposit Receipt (FDR) Portal & Smart Automation  
> **Precedence Order**: 1) Problem Statement (PS) text, 2) Submitted Idea Deck (ASTRA), 3) Existing Repo, 4) Engineering Preferences.

---

## 1. Regulatory & Statutory Assumptions (AICTE Approval Process Handbook)

### 1.1. Deposit Slabs & Tenures
- **Minimum Tenure Baseline**: Defaulted to **1,095 days (3 years)** for general security deposits, parameterized in `RuleConfig` under `aicte.min_validity_days`. Where specific APH programs (e.g. establishment of new technical institutions) mandate 8 or 10 years, these are marked with `TODO: replace with AICTE handbook clause` to reflect full APH Table 1.1 breakdowns.
- **Minimum Deposit Slab**: Baseline set to **₹10,00,000 (10 Lakhs INR)** for standard technical programs. Different tiers (e.g., ₹15 Lakhs for Engineering & Tech, ₹10 Lakhs for Management, ₹5 Lakhs for Diploma) are represented as configuration entries rather than hardcoded magic numbers.
- **Joint Lien Requirement**: Assumed to be mandatory under all circumstances. Every valid deposit must be endorsed jointly to "Member Secretary, AICTE, New Delhi" and the institution.

### 1.2. Two-Tier Release & Refund Clearance
- **Statutory Disbursement Disclaimer**: *FDR Vault records administrative clearances and authorizations only; it does NOT directly disburse funds or hold custody of cash.* Pledged fixed deposits reside entirely within the issuing scheduled commercial bank accounts.
- **Mandatory 5-Point Checklist**: Regional Officer sign-off requires confirmation that:
  1. Mandatory statutory deposit tenure is completed.
  2. No pending student or faculty complaints exist before the Ombudsman.
  3. No pending court litigation or adverse judicial orders apply.
  4. Original FDR receipt is surrendered or accounted for.
  5. Central Bureau concurrence is obtained.
- **Rejection Path**: Rejection at either tier cleanly reverts the FDR status back to `ACTIVE`, preserving the legal security deposit encumbrance.

---

## 2. Banking Integrations & CBS APIs

- **Absence of Standard Open Banking APIs**: Indian scheduled commercial banks (SBI, PNB, HDFC, Canara, etc.) do not expose public or standardized APIs for third-party fixed deposit lien placement or verification.
- **Standardized Gateway Model**: ASTRA provides a practical regulatory gateway:
  1. It generates a formal, machine-readable AICTE inquiry letter with unique verification tokens.
  2. It accepts signed, stamped PDF verification reply memos uploaded by scrutiny officers.
  3. For interactive evaluation demonstrations, it includes an explicit mock toggle (`POST /api/bank/mock-verify`) with visible `[DEMO]` indicators.

---

## 3. Artificial Intelligence & Document Extraction

- **Synthetic Training Data Disclaimer**: All machine learning risk prediction weights and synthetic compliance cycles are generated stochastically for demonstration purposes. Neither confidential live institutional records nor proprietary regulatory evaluations were utilized.
- **Zero-Hallucination Handbook RAG**: Assumed that AI models must never synthesize regulatory policies. The RAG engine returns only verbatim clauses from the ingested AICTE Approval Process Handbook (APH 2024-27). If query similarity falls below threshold, the system returns `UNRESOLVED_QUERY` rather than guessing.
- **Human-in-the-Loop Constraint**: AI field extraction is strictly advisory. Any extracted token with confidence score $< 0.85$ is flagged for forced human officer verification.

---

## 4. Analytical Performance Baselines & Measured Metrics

- **Manual Review Baseline Assumption *[ASSUMPTION]* **: Historical manual processing time is estimated at **15 minutes per physical file**, reflecting manual registry logging, physical document comparison, and offline letter dispatch.
- **Historical Alert Accuracy Assumption *[ASSUMPTION]* **: Baseline manual alert reliability is estimated at **70%**, accounting for human oversight during manual ledger reviews.
- **Measured Defect Recall Rate**: Measured at **100% (7/7 defect classes detected)** across 200 synthetic seeded FDR records using pure automated rule evaluation.
- **Measured Execution Latency**: Automated rule evaluation completes in $< 5 \text{ ms}$ per instrument.

---

## 5. Architectural & Cryptographic Decisions

- **Server-Side Encryption vs. E2EE**: Documents are encrypted at rest using AES-256-GCM on the server with environment variable keys (`STORAGE_ENCRYPTION_KEY`). This is **Server-Side Encryption at Rest with SHA-256 Integrity Verification**, not End-to-End Encryption (which would prevent server-side OCR parsing).
- **Database-Native Job Queue**: Implemented using PostgreSQL 16 `SELECT ... FOR UPDATE SKIP LOCKED` rather than external brokers (Redis/RabbitMQ). This guarantees atomic two-phase commit consistency with business transactions and eliminates multi-container operational failure points.
- **Clock Abstraction**: All business-day math, deadline triggers, and time-sensitive transitions consume `Clock.now()` rather than direct system clocks, enabling deterministic testing and admin time-travel simulation.

---

## 6. Precedence & Conflict Resolution Ledger

| Topic | PS Text Requirement | Idea Deck Claim | Existing Repo Baseline | Adopted Resolution |
| :--- | :--- | :--- | :--- | :--- |
| **Workflow Stages** | Fixed deposit lifecycle: Scrutiny ➔ Verification ➔ Active ➔ Expiry ➔ Release | Config-driven route templates (`SCRUTINY_EVC`, `EVC_SAC_SHC`) | Hardcoded enum transitions | Implemented versioned JSON route templates layered seamlessly over core `FdrStatus` enums. |
| **Obligations** | FDR validity & reminders | Unified obligation engine (lease, stage SLAs, affidavits) | Only FDR maturity alerts | Unified polymorphic `Obligation` entity tracking FDRs, stage SLAs, undertakings, and lease deeds. |
| **AI Layer** | Not explicitly mandated in core PS | Deck promised OCR, Handbook RAG, and SLA risk score | Zero AI code | Built lightweight, honest Python FastAPI microservice with clear "demo only" disclaimers. |
| **Bank Verification** | Automated verification with issuing banks | Direct CBS bank API integration | Mock toggle | Standardized bank gateway: generates inquiry letters, ingests signed replies, provides mock demo toggle. |
