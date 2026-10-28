# ASTRA / FDR Vault — REST API Reference

> **AICTE SIH26265**: Streamline Security Deposit / Fixed Deposit Receipt (FDR) Portal & Smart Automation  
> **Protocol**: HTTPS / REST  
> **Default Port**: `4000` (Backend API)  
> **Authentication**: Bearer JWT (`Authorization: Bearer <access_token>`)

---

## 1. Authentication Endpoints (`/api/auth`)

### 1.1. Login
- **Method**: `POST`
- **Path**: `/api/auth/login`
- **Access**: Public
- **Request Body**:
  ```json
  {
    "email": "officer.north@aicte-demo.gov.in",
    "password": "Demo@123"
  }
  ```
- **Response**: `200 OK`
  ```json
  {
    "accessToken": "eyJhbGciOi...",
    "refreshToken": "4a18b...",
    "user": {
      "id": "c1f7b8e2-...",
      "email": "officer.north@aicte-demo.gov.in",
      "role": "REGIONAL_OFFICER",
      "region": "NORTHERN",
      "institutionId": null
    }
  }
  ```

### 1.2. Token Refresh
- **Method**: `POST`
- **Path**: `/api/auth/refresh`
- **Access**: Public
- **Request Body**: `{ "refreshToken": "4a18b..." }`
- **Response**: `200 OK` `{ "accessToken": "...", "refreshToken": "..." }`

### 1.3. Current User Context
- **Method**: `GET`
- **Path**: `/api/auth/me`
- **Access**: Authenticated
- **Response**: `200 OK` (User object)

---

## 2. Fixed Deposit Receipt (FDR) Endpoints (`/api/fdrs`)

### 2.1. List Instruments
- **Method**: `GET`
- **Path**: `/api/fdrs`
- **Access**: All Authenticated Roles (Scoped by RBAC & RLS)
- **Query Parameters**:
  - `status` (optional): `FdrStatus` filter (e.g. `UNDER_SCRUTINY`, `ACTIVE`, `EXPIRING`)
  - `region` (optional): AICTE region filter (for central bureau officers)
  - `bank` (optional): Bank name search
  - `page` (default: 1), `limit` (default: 20)
- **Response**: `200 OK`
  ```json
  {
    "data": [
      {
        "id": "fdr-uuid",
        "fdrNo": "FDR-2026-9812",
        "bank": "State Bank of India",
        "branch": "Connaught Place",
        "ifsc": "SBIN0000691",
        "amount": "3500000.00",
        "issueDate": "2024-06-01T00:00:00.000Z",
        "maturityDate": "2027-06-01T00:00:00.000Z",
        "status": "ACTIVE",
        "lienMarked": true,
        "institution": {
          "id": "inst-uuid",
          "name": "Northern Institute of Technology",
          "aicteId": "1-10972341",
          "region": "NORTHERN"
        }
      }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 200, "totalPages": 10 }
  }
  ```

### 2.2. Submit New FDR
- **Method**: `POST`
- **Path**: `/api/fdrs`
- **Access**: `INSTITUTION`, `ADMIN`
- **Request Body**:
  ```json
  {
    "fdrNo": "FDR-2026-9812",
    "bank": "State Bank of India",
    "branch": "Connaught Place",
    "ifsc": "SBIN0000691",
    "amount": 3500000.00,
    "issueDate": "2024-06-01T00:00:00.000Z",
    "maturityDate": "2027-06-01T00:00:00.000Z",
    "lienMarked": true,
    "supersedesFdrId": null
  }
  ```
- **Response**: `201 Created` (Initializes FDR in `SUBMITTED` / `UNDER_SCRUTINY` and field trust ledger).

### 2.3. Get FDR Details & Trust Ledger
- **Method**: `GET`
- **Path**: `/api/fdrs/:id`
- **Access**: Authenticated (Scoped by RLS)
- **Response**: `200 OK` (FDR record including `fieldTrusts`, `documents`, `events`, `discrepancies`, and `releaseRequests`).

### 2.4. Advance Status Transition
- **Method**: `PATCH`
- **Path**: `/api/fdrs/:id/status`
- **Access**: `OFFICER`, `REGIONAL_OFFICER`, `BUREAU`, `AUTHORITY`, `ADMIN`
- **Request Body**:
  ```json
  {
    "status": "VERIFIED",
    "remarks": "Bank reply memo verified against original receipt"
  }
  ```
- **Response**: `200 OK`

### 2.5. Revert FDR with Mandatory Justification
- **Method**: `POST`
- **Path**: `/api/fdrs/:id/revert`
- **Access**: `OFFICER`, `REGIONAL_OFFICER`, `BUREAU`, `ADMIN`
- **Request Body**:
  ```json
  {
    "targetStatus": "DISCREPANCY",
    "reason": "DEFICIENCY: Joint lien endorsement letter missing bank branch seal"
  }
  ```
- **Response**: `200 OK`

---

## 3. Discrepancy & Rules Endpoints

### 3.1. Run Discrepancy Scan
- **Method**: `POST`
- **Path**: `/api/fdrs/:id/discrepancies/scan`
- **Access**: `OFFICER`, `REGIONAL_OFFICER`, `ADMIN`
- **Response**: `200 OK` `{ "findings": [...], "status": "DISCREPANCY" }`

### 3.2. Resolve or Waive Discrepancy
- **Method**: `PATCH`
- **Path**: `/api/fdrs/:id/discrepancies/:discId`
- **Access**: `OFFICER`, `REGIONAL_OFFICER`, `ADMIN`
- **Request Body**:
  ```json
  {
    "status": "RESOLVED",
    "remarks": "Institution uploaded corrected FDR receipt with valid 3-year tenure"
  }
  ```
- **Response**: `200 OK`

---

## 4. Document Management & Signed URLs

### 4.1. Upload Supporting Document
- **Method**: `POST`
- **Path**: `/api/fdrs/:id/documents`
- **Access**: `INSTITUTION`, `OFFICER`, `ADMIN`
- **Content-Type**: `multipart/form-data`
- **Payload**: `file` (binary), `type` (`FDR_RECEIPT` | `JOINT_LIEN_LETTER` | `BANK_CONFIRMATION` | `AFFIDAVIT`)
- **Response**: `201 Created` (Encrypted with AES-256-GCM; SHA-256 digest recorded).

### 4.2. Generate Expiring Signed Download URL
- **Method**: `GET`
- **Path**: `/api/documents/:id/download-url`
- **Access**: Authenticated
- **Response**: `200 OK`
  ```json
  {
    "downloadUrl": "/api/documents/uuid/download?token=hmac_digest&expires=1719876543",
    "expiresInSeconds": 900
  }
  ```

---

## 5. Bank Verification Gateway

### 5.1. Generate AICTE Inquiry Letter
- **Method**: `POST`
- **Path**: `/api/bank/inquiry-letter`
- **Access**: `OFFICER`, `REGIONAL_OFFICER`, `ADMIN`
- **Request Body**: `{ "fdrId": "uuid" }`
- **Response**: `200 OK` (Structured letter content and formal verification token).

### 5.2. Ingest Bank Confirmation Memo
- **Method**: `POST`
- **Path**: `/api/bank/verify`
- **Access**: `OFFICER`, `REGIONAL_OFFICER`, `ADMIN`
- **Content-Type**: `multipart/form-data` (upload signed bank reply PDF)
- **Response**: `200 OK` (Promotes field trust badges to `BANK_CONFIRMED`).

### 5.3. Interactive Mock Bank Verify (Demo Mode)
- **Method**: `POST`
- **Path**: `/api/bank/mock-verify`
- **Access**: `OFFICER`, `ADMIN`
- **Request Body**: `{ "fdrId": "uuid" }`
- **Response**: `200 OK`

---

## 6. Two-Tier Release & Refund Clearance

### 6.1. Initiate Release Request
- **Method**: `POST`
- **Path**: `/api/release/request`
- **Access**: `INSTITUTION`, `OFFICER`, `ADMIN`
- **Request Body**:
  ```json
  {
    "fdrId": "uuid",
    "reason": "Completion of statutory 10-year security deposit period for B.Tech CSE"
  }
  ```
- **Response**: `201 Created` (Status: `PENDING_OFFICER`)

### 6.2. Regional Officer Clearance (Tier 1)
- **Method**: `POST`
- **Path**: `/api/release/recommend`
- **Access**: `OFFICER`, `REGIONAL_OFFICER`, `ADMIN`
- **Request Body**:
  ```json
  {
    "releaseRequestId": "uuid",
    "checklist": {
      "mandatoryTenureCompleted": true,
      "noPendingStudentComplaints": true,
      "noPendingCourtLitigation": true,
      "originalReceiptSurrendered": true,
      "bureauConcurrenceObtained": true
    },
    "remarks": "All academic audit requirements fulfilled; recommend release."
  }
  ```
- **Response**: `200 OK` (Status: `PENDING_AUTHORITY`)

### 6.3. Bureau Authority Final Authorization (Tier 2)
- **Method**: `POST`
- **Path**: `/api/release/authorize`
- **Access**: `BUREAU`, `AUTHORITY`, `ADMIN`
- **Request Body**:
  ```json
  {
    "releaseRequestId": "uuid",
    "remarks": "Final statutory refund sanctioned per APH 2024 Chapter IV."
  }
  ```
- **Response**: `200 OK` (FDR status transitions to `RELEASED`).

### 6.4. Release Rejection
- **Method**: `POST`
- **Path**: `/api/release/reject`
- **Access**: `OFFICER`, `REGIONAL_OFFICER`, `BUREAU`, `ADMIN`
- **Request Body**:
  ```json
  {
    "releaseRequestId": "uuid",
    "remarks": "Deficiency: Pending student grievance before Ombudsman; release denied."
  }
  ```
- **Response**: `200 OK` (FDR status reverts to `ACTIVE`).

---

## 7. Reports & Streaming Data Export

### 7.1. Streaming RFC 4180 CSV Export
- **Method**: `GET`
- **Path**: `/api/reports/fdrs/export.csv`
- **Access**: `OFFICER`, `REGIONAL_OFFICER`, `BUREAU`, `COMMITTEE`, `ADMIN` (Scoped by jurisdiction)
- **Query Parameters**: `status`, `region`, `bank`, `maturityWindow` (30, 60, 90 days)
- **Response**: `200 OK`
- **Content-Type**: `text/csv; charset=utf-8`
- **Transfer-Encoding**: `chunked` (Memory-safe streaming in 100-row chunks)

---

## 8. Cryptographic Audit Trail Endpoints

### 8.1. Check Chain Health
- **Method**: `GET`
- **Path**: `/api/audit/verify`
- **Access**: Authenticated
- **Response**: `200 OK` `{ "valid": true, "totalLogs": 253 }`

### 8.2. Deep Diagnostic Verification
- **Method**: `GET`
- **Path**: `/api/admin/audit/verify`
- **Access**: `ADMIN`, `BUREAU`
- **Response**: `200 OK`
  ```json
  {
    "valid": true,
    "totalLogs": 253,
    "corruptedAtId": null,
    "expectedHash": null,
    "actualHash": null,
    "reason": null
  }
  ```

### 8.3. Paginated Audit Log Explorer
- **Method**: `GET`
- **Path**: `/api/admin/audit/logs`
- **Access**: `ADMIN`, `BUREAU`
- **Query Parameters**: `page`, `limit`, `actorId`, `action`, `entity`
- **Response**: `200 OK` (Paginated list of audit records with previous hash links).

---

## 9. AI Assistance Microservice Endpoints (`/api/ai`)

### 9.1. OCR Token & Confidence Extraction
- **Method**: `POST`
- **Path**: `/api/ai/extract`
- **Access**: `OFFICER`, `REGIONAL_OFFICER`, `ADMIN`
- **Request Body**: `{ "text": "Raw OCR text snippet..." }`
- **Response**: `200 OK` (Structured fields, confidence scores, and manual review flags).

### 9.2. Handbook RAG Query
- **Method**: `POST`
- **Path**: `/api/ai/rag/query`
- **Access**: Authenticated
- **Request Body**: `{ "query": "What is the mandatory security deposit for new engineering colleges?" }`
- **Response**: `200 OK` (Verbatim clause citations from APH 2024-27).

### 9.3. SLA Breach Risk Scoring
- **Method**: `POST`
- **Path**: `/api/ai/risk/score`
- **Access**: `OFFICER`, `REGIONAL_OFFICER`, `BUREAU`, `ADMIN`
- **Request Body**:
  ```json
  {
    "days_remaining": 5,
    "revert_count": 2,
    "discrepancy_count": 1,
    "days_in_scrutiny": 12,
    "amount_lakhs": 35.0
  }
  ```
- **Response**: `200 OK`
  ```json
  {
    "risk_score": 0.842,
    "breach_predicted": true,
    "risk_level": "HIGH",
    "disclaimer": "Synthetic training data, demo only"
  }
  ```
