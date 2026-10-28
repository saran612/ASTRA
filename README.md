# FDR Vault: AICTE Security Deposit & FDR Management Portal

**SIH Problem Statement**: SIH26265 (AICTE Regulation Bureau)

FDR Vault is a centralized web portal and state-machine engine designed for the AICTE Regulation Bureau to track technical institutions' mandatory fixed deposit receipts (FDRs), bank guarantees, and security deposits.

---

## Core Principles
1. **FDR as a Strict State Machine**: All status changes go through a single transaction-safe `transition()` function.
2. **Claimed vs Verified**: Every critical field carries trust provenance (`INSTITUTION | OFFICER_ENTERED | BANK_CONFIRMED`).
3. **Cryptographic Audit Trail**: Append-only audit logs connected via SHA-256 hash chains (`hash = SHA256(prev_hash + canonical_json(row))`).
4. **Injectable Clock**: System time is driven by an injectable `Clock` service with simulated time-travel capabilities for testing deadline windows.
5. **No Fake Integrations**: Clear `BankVerifier` interface with manual response upload, mock demo verifier, and documented empty slot for real banking APIs.
6. **Configurable Rules**: Deposit slabs and thresholds are stored in `RuleConfig` with placeholder values marked `TODO: replace with AICTE handbook clause`.

---

## Monorepo Architecture
- `packages/shared`: Shared TypeScript types, Zod schemas, state machine transition graph, and guard definitions.
- `backend`: Node.js + Express + Prisma + PostgreSQL 16 + Argon2 + AES-256-GCM encrypted document storage.
- `frontend`: React 18 + Vite + Tailwind CSS + Lucide Icons + React Router.

---

## Quickstart

### 1. Requirements
- Node.js 20+
- Docker & Docker Compose (for PostgreSQL on port 5434)

### 2. Environment Setup
```bash
cp .env.example .env
npm install
```

### 3. Spin Up Postgres & Seed Demo Data
```bash
docker compose up -d
npm run seed
```

### 4. Run the Full Stack Locally
```bash
npm run dev
```
- **Web Portal**: [http://localhost:3000](http://localhost:3000)
- **API Server**: [http://localhost:4000](http://localhost:4000)

### 5. Run Test Suite
```bash
npm run test
```

### 6. Run Evaluation Harness
```bash
npm run eval
```
Produces an evaluation report in `docs/EVAL_REPORT.md`.

---

## Demo Accounts (Password: `password123`)

| Role | Email ID | Description |
| :--- | :--- | :--- |
| **INSTITUTION** | `inst.north@aicte-demo.edu.in` | College Principal / Institution Submitter |
| **OFFICER** | `officer.north@aicte-demo.gov.in` | Regional AICTE Scrutiny Officer |
| **AUTHORITY** | `bureau.head@aicte-demo.gov.in` | AICTE Bureau Head / Member Secretary |
| **ADMIN** | `admin@aicte-demo.gov.in` | Portal Administrator (Time Travel & Job Triggers) |

---

## Key Documentation
- [docs/ASSUMPTIONS.md](docs/ASSUMPTIONS.md): Documented project defaults and assumptions.
- [docs/STATE_MACHINE.md](docs/STATE_MACHINE.md): Generated Mermaid and ASCII state machine diagram.
- [docs/SEEDED_DEFECTS.md](docs/SEEDED_DEFECTS.md): Catalog of 6 deliberately seeded defects.
- [docs/EVAL_REPORT.md](docs/EVAL_REPORT.md): Evaluation scorecard and benchmark results.
- [docs/DEMO.md](docs/DEMO.md): 7-step interactive walkthrough guide.
- [docs/SECURITY.md](docs/SECURITY.md): Implemented security controls and production considerations.
