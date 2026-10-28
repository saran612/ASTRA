# Claims vs. Reality: Pitch Deck & Architecture Audit

This document is an honest, blunt audit contrasting claims made in the ASTRA / FDR Vault pitch deck (and presentation video) against the actual codebase implementation as of Phase 0. Its purpose is to guide the team in fixing inaccurate presentation claims and prioritizing critical engineering gaps.

---

## 1. Summary Matrix

| Category | Pitch Deck Claim | Actual Reality | Classification | Evidence in Codebase |
| :--- | :--- | :--- | :--- | :--- |
| **Scale & Infrastructure** | "Stateless services on Kubernetes, partitioned event tables, queue-based jobs, multi-region rollout" | Single local Docker container running PostgreSQL 16 on port 5434. No K8s manifests, no partitioned tables, no Redis, no background worker process. | `not built` | `docker-compose.yml` only defines `postgres`. No Helm, K8s, or partitioning DDL exists. |
| **Encryption** | "Documents are encrypted at rest" (often misconstrued as "end-to-end encryption") | Server-side AES-256-GCM symmetric encryption on local disk using an env var key (`STORAGE_ENCRYPTION_KEY`). **Not** end-to-end encryption. | `implemented` (server-side only) | `backend/src/services/storage.ts`: Server encrypts on upload and decrypts on signed URL download request. |
| **Banking Integration** | "Direct CBS bank API integration... automated verification with issuing banks" | Zero live banking APIs. Bank inquiry letter generated as a PDF/text stub. Responses are either simulated by a demo mock toggle or manual PDF upload. | `stubbed` | `backend/src/services/bank-verifier.ts`: Mock response generator with explicit demo disclaimer comments. |
| **DigiLocker & AICTE SSO** | "Integrated with DigiLocker and National Single Sign-On (Parichay)" | Zero external SSO or DigiLocker code exists. Auth is internal JWT + Argon2 password hashing on seeded local accounts. | `not built` | `backend/src/services/auth.ts`: Local database lookup only. |
| **AI Field Extraction (OCR)** | "AI layer extracts dates, amounts, and FDR fields with confidence bounding boxes" | Zero OCR code, zero Python service, zero computer vision models. Fields are entered manually by institutions or pre-seeded. | `not built` | No Python/FastAPI service in repo; no OCR library in `package.json`. |
| **AI Assessment Report (RAG)** | "Evidence-linked assessment report using RAG over AICTE handbook clauses" | No vector database, no embeddings, no clause corpus, no LLM adapter. | `not built` | No `pgvector` in schema; no clause citations in any endpoint. |
| **SLA-Breach Risk Score** | "Machine learning model predicting SLA breach risk" | No machine learning model, no training pipeline, no risk scoring function. | `not built` | Zero ML dependencies or inference code. |
| **Workflow Engine** | "Config-driven workflow engine with versioned route templates (`ONLY_SCRUTINY`, `SCRUTINY_EVC`, etc.)" | Hardcoded state machine transitions restricted strictly to fixed `FdrStatus` enum steps. No JSON templates, no re-scrutiny loop reason enforcement. | `not built` | `packages/shared/src/state-machine.ts`: Static transition map. |
| **Obligation Engine** | "Unified obligation register handling FDRs, lease docs, undertakings, and stage SLAs under one alert ladder" | Only FDR maturity alerts exist. No general obligation entity, polymorphic obligation schema, or unified scheduler. | `not built` | `backend/prisma/schema.prisma`: Only `Fdr` and `Alert` models exist. |
| **Compliance KPIs** | "+35% defect detection gain (95% vs 60%), +30% alert accuracy (100% vs 70%), 4x faster turnaround" | Baseline numbers (60%, 70%, 15-minute manual check) are **arbitrary analytical assumptions**, not empirical field data. The prototype's 100% detection rate is measured against only 6 synthetic test defects. | `assumption` | `video/metrics.json` explicitly labels all sources as `"source": "assumption"`. `backend/src/eval/harness.ts` tests 6 seeded rows. |

---

## 2. In-Depth Discrepancy Analysis

### 2.1 Scale & Performance Claims
- **Claim:** The presentation highlights a 3-phase rollout scaling from a pilot regional office to a national deployment handling 10,000+ colleges with high-concurrency throughput.
- **Reality:** No load testing beyond 40 database records has been conducted. The current scan queries the database in a synchronous loop (`prisma.fdr.findMany()`). It would block the event loop or exhaust database memory on 50,000 live records.
- **Action for Team:** Remove unverified claims of "10,000+ concurrent throughput" or "national scale" from presentation decks unless accompanied by actual load-test graphs. Clearly describe the current architecture as a **modular prototype on PostgreSQL**.

### 2.2 Security & Encryption
- **Claim:** Slide text and narrative scripts frequently refer to "cryptographic security" and imply military-grade or "end-to-end" encryption.
- **Reality:** While AES-256-GCM symmetric encryption with per-file random IVs and SHA-256 verification is cleanly implemented in `storage.ts`, encryption keys are read from local process environment variables (`STORAGE_ENCRYPTION_KEY`). The server decrypts payloads to serve them via signed tokens. 
- **Action for Team:** Never use the phrase "End-to-End Encryption (E2EE)". Use the technically accurate term: **"Envelope-ready AES-256-GCM Server-Side Encryption at Rest with SHA-256 Integrity Verification"**.

### 2.3 Bank & Government System Integrations
- **Claim:** Automated real-time verification with Core Banking Systems (CBS) and seamless DigiLocker document ingestion.
- **Reality:** Indian scheduled commercial banks do not expose standardized open APIs for third-party fixed deposit lien verification. The prototype honestly introduces a `BankVerifier` interface that generates formal AICTE inquiry letters and supports manual officer upload of bank reply memos, accompanied by a simulated mock adapter for demonstration purposes.
- **Action for Team:** Be completely transparent during the pitch. Explain that the portal provides a **standardized bank verification gateway adapter** designed to ingest bank responses today via signed PDF uploads, with an architecture ready to plug into SFMS/CBS APIs when bank consortiums publish endpoints.

### 2.4 AI and Machine Learning Claims
- **Claim:** The deck promises an intelligent assistant extracting data from scanned receipts and ranking risk.
- **Reality:** As of Phase 0, there is zero AI code in the repo.
- **Action for Team:** Do not claim the AI model is in production or has "trained on millions of documents". In Milestone 7, we will implement a clean, honest FastAPI microservice providing:
  1. OCR with confidence scores and forced manual verification fallback.
  2. Rule-grounded handbook clause citation checking (rejecting any uncited hallucination).
  3. A demo-only SLA risk model trained on synthetic records with an explicit "demo only" model card.

### 2.5 Evaluation Metrics & KPIs
- **Claim:** Slides claim "+35% defect reduction" and "4x speedup".
- **Reality:** These percentages are calculated by comparing prototype automated code execution (~4.5 ms) against a theoretical human officer assumption of 15 minutes per physical file.
- **Action for Team:** Label all comparative baselines as **"Estimated Manual Baseline Assumptions"**. Highlight what was actually measured: **100% recall on 6 deliberately seeded synthetic defect classes across 40 FDR test records**.
