# ASTRA / FDR Vault — Operational Runbook & Developer Guide

> **AICTE SIH26265**: Streamline Security Deposit / Fixed Deposit Receipt (FDR) Portal & Smart Automation  
> **Target Audience**: Developers, DevOps Engineers, and Evaluation Judges

---

## 1. System Requirements & Prerequisites

To run the complete ASTRA monorepo locally, ensure the following tools are installed:

| Software | Minimum Version | Purpose |
| :--- | :--- | :--- |
| **Node.js** | `>= 20.10.0` (LTS) | Backend Core API & Frontend build toolchain |
| **npm** | `>= 10.0.0` | Workspace package management |
| **Python** | `>= 3.12.0` | Document AI microservice runtime |
| **Docker & Docker Compose** | `>= 24.0.0` | PostgreSQL 16 and MailHog containerization |
| **Git** | `>= 2.40.0` | Source version control |

---

## 2. Environment Variables Configuration

Create the local configuration files by copying the templates:

### 2.1. Backend (`backend/.env`)
```bash
# PostgreSQL 16 connection URL
DATABASE_URL="postgresql://postgres:postgres@localhost:5434/fdr_vault?schema=public"

# Authentication & Security
JWT_SECRET="astrasih26265supersecretjwtkeyforprototypeevaluation2026"
REFRESH_TOKEN_SECRET="astrasih26265refreshtokensecretforprototypeevaluation2026"

# Server-Side Document Encryption (AES-256-GCM 32-byte key)
STORAGE_ENCRYPTION_KEY="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
LOCAL_STORAGE_DIR="/tmp/fdr_vault_docs"

# AI Microservice RPC Endpoint
AI_SERVICE_URL="http://127.0.0.1:8000"

# MailHog SMTP Configuration
SMTP_HOST="localhost"
SMTP_PORT="1026"

# Server Port
PORT=4000
```

### 2.2. Frontend (`frontend/.env`)
```bash
VITE_API_URL="http://localhost:4000"
```

### 2.3. AI Microservice (`services/ai/.env`)
```bash
PORT=8000
ENVIRONMENT="development"
APH_HANDBOOK_PATH="handbook_aph_2024_27.json"
```

---

## 3. Quick-Start Guide (Step-by-Step)

### Step 1: Start Container Infrastructure
Launch PostgreSQL 16 and MailHog via Docker Compose:
```bash
docker compose up -d
```
- PostgreSQL will be accessible on `localhost:5434` (user: `postgres`, password: `postgres`).
- MailHog Web UI will be accessible on `http://localhost:8026`.

### Step 2: Install Monorepo Dependencies
From the repository root:
```bash
npm install
```

### Step 3: Initialize Database Schema, RLS, and Seed Data
Push the Prisma schema, apply PostgreSQL Row-Level Security policies, and seed 200 realistic FDR records:
```bash
# Push schema to PostgreSQL
npm run db:push --workspace=backend

# Apply Row-Level Security DDL
npm run db:rls --workspace=backend

# Seed 200 FDRs across all 8 AICTE regions with deliberate edge cases
npm run seed --workspace=backend
```

### Step 4: Start the Python AI Microservice
Set up a Python virtual environment and launch FastAPI:
```bash
cd services/ai
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

### Step 5: Start Backend Core API & Frontend SPA
From the root directory in a new terminal:
```bash
# Start backend API (port 4000)
npm run dev --workspace=backend

# In another terminal, start frontend dev server (port 5173)
npm run dev --workspace=frontend
```
The application will be live at `http://localhost:5173`.

---

## 4. Test Suite Execution & Verification

### 4.1. Root Monorepo Integration Tests (`npm test`)
Executes all 14 Vitest suites spanning property tests, RLS isolation, tamper proofs, and workflows:
```bash
npm test
```
*Expected Result*: 14 test files passed, 90 tests passed.

### 4.2. Python Microservice Unit Tests (`pytest`)
Executes the FastAPI and machine learning pipeline test suite:
```bash
cd services/ai
pytest
```
*Expected Result*: 5 passed.

### 4.3. Run Automated Compliance Evaluation Harness (`npm run eval`)
Executes the synthetic evaluation benchmark and updates `docs/EVAL_REPORT.md`:
```bash
npm run eval
```
*Expected Result*: Exits 0, confirms 100% defect recall on deliberate edge cases, zero duplicate job dispatches, and intact SHA-256 audit hash chain.

---

## 5. Seeded Demo Accounts Reference

| Role | Email Address | Password | Region / Jurisdiction | Intended Console View |
| :--- | :--- | :--- | :--- | :--- |
| **College Principal (Institution)** | `inst.north@aicte-demo.edu.in` | `Demo@123` | Northern (`1-10972341`) | Institution Portal, FDR Submission & Renewal |
| **Regional Scrutiny Officer** | `officer.north@aicte-demo.gov.in` | `Demo@123` | Northern Region | Scrutiny Queue, Bank Inquiry, Trust Ledger |
| **Bureau Authority** | `authority@aicte-demo.gov.in` | `Demo@123` | Pan-India | National Liquidity Dashboard, 2-Tier Release Approval |
| **Committee Member** | `committee@aicte-demo.gov.in` | `Demo@123` | Pan-India | Statutory Hearing Agenda & Forfeiture Appeals |
| **Portal Administrator** | `admin@aicte-demo.gov.in` | `Demo@123` | Global | Audit Explorer, Time-Travel Clock, System Diagnostics |

---

## 6. Operational Troubleshooting Runbooks

### Runbook A: Database Connection Refused (`localhost:5434`)
- **Symptom**: `PrismaClientInitializationError: Can't reach database server at localhost:5434`.
- **Diagnosis**: The Docker container is stopped or paused.
- **Resolution**:
  ```bash
  docker compose ps
  docker compose up -d
  ```

### Runbook B: Cross-Region Access Error (404 Not Found)
- **Symptom**: An officer from `NORTHERN` attempts to view an FDR from `WESTERN` and receives a 404.
- **Explanation**: This is expected behavior enforced by PostgreSQL Row-Level Security (`backend/prisma/rls.sql`). Regional officers are strictly isolated to their own geographical jurisdiction.

### Runbook C: AI Service Offline Fallback
- **Symptom**: The AI FastAPI service is stopped.
- **Resolution**: The Node.js backend (`backend/src/services/ai-client.ts`) transparently degrades to manual review after a 3-second timeout without throwing an unhandled exception. To restart the service, run `uvicorn main:app --port 8000` in `services/ai`.

### Runbook D: Re-seeding the Database from Scratch
- **Symptom**: State needs to be reset for a fresh demonstration run.
- **Resolution**:
  ```bash
  npm run db:push --workspace=backend -- --force-reset
  npm run db:rls --workspace=backend
  npm run seed --workspace=backend
  ```
