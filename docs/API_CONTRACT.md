# ASTRA / FDR Vault — API Contract & Behavior Checklist

> **AICTE SIH26265**: Streamline Security Deposit / Fixed Deposit Receipt (FDR) Portal & Smart Automation  
> **Source of Truth**: Node/TypeScript implementation baseline  
> **Target**: Python 3.12 / FastAPI backend port (Zero Behavioral Drift)

---

## 1. Complete REST Route Catalog & Signatures

All endpoints reside under the `/api` prefix. Status codes, query parameters, request bodies, and response JSON formats are strictly contractual and must be preserved verbatim.

### 1.1. System & Health
| Method | Path | Auth / Role | Description | Success Code | Response Shape |
| :--- | :--- | :--- | :--- | :---: | :--- |
| `GET` | `/api/health` | Public | System liveness probe & simulated clock | `200` | `{"status": "ok", "timestamp": "ISO8601"}` |

### 1.2. Authentication (`/api/auth`)
| Method | Path | Auth / Role | Description | Success Code | Response Shape |
| :--- | :--- | :--- | :--- | :---: | :--- |
| `POST` | `/api/auth/login` | Public | Password authentication via Argon2id | `200` | `{"accessToken": str, "refreshToken": str, "user": {"id": str, "email": str, "role": str, "institutionId": str\|null, "institutionName": str\|null, "region": str\|null}}` |
| `POST` | `/api/auth/refresh` | Public | Refresh token rotation | `200` | `{"accessToken": str, "refreshToken": str}` |
| `GET` | `/api/auth/me` | Bearer Token | Current session profile | `200` | `{"id": str, "email": str, "role": str, "institutionId": str\|null, "institutionName": str\|null, "region": str\|null}` |
| `POST` | `/api/auth/logout` | Bearer Token | Client session revocation | `200` | `{"success": true}` |

### 1.3. Fixed Deposit Receipts (`/api/fdrs`)
| Method | Path | Auth / Role | Description | Success Code | Request / Response Details |
| :--- | :--- | :--- | :--- | :---: | :--- |
| `GET` | `/api/fdrs` | Authenticated (RLS-scoped) | List FDRs with filters (`status`, `bank`, `search`) | `200` | Array of FDR objects with `institution`, `discrepancies` (OPEN), and `fieldTrusts`. |
| `GET` | `/api/fdrs/:id` | Authenticated (RLS-scoped) | Fetch detailed FDR record | `200` | FDR object with `institution`, `fieldTrusts`, `documents`, `discrepancies`, `events`, `supersedesFdr`, `supersededBy`, `bankRequests`, `releaseRequests`. 404 if inaccessible. |
| `POST` | `/api/fdrs` | `INSTITUTION`, `ADMIN` (or Officer on behalf) | Submit new FDR instrument + initial trust ledger | `201` | Form data: `fdrNo`, `bank`, `branch`, `ifsc`, `amount`, `issueDate`, `maturityDate`, `lienMarked`, optional `supersedesFdrId`, optional file `document`. Returns full FDR. Status: `UNDER_SCRUTINY`. |
| `POST` | `/api/fdrs/:id/documents` | Authenticated | Upload new document version | `201` | Multipart file `document`, `type` (`FDR_RECEIPT`, `BANK_CONFIRMATION`, etc.). Returns `Document` row. |
| `GET` | `/api/documents/:docId/signed-url` | Authenticated | Generate HMAC-SHA256 expiring download URL | `200` | `{"downloadUrl": "/api/documents/:id/download?token=...&expires=...", "expiresInSeconds": 900}` |
| `GET` | `/api/fdrs/documents/:docId/signed-url` | Authenticated | Alias path called by frontend | `200` | Same as `/api/documents/:docId/signed-url`. |
| `GET` | `/api/documents/:id/download` | Public with Token | Decrypt AES-256-GCM document payload | `200` | Stream `application/octet-stream` with attachment header. `401` if token missing, `403` if token invalid/expired, `404` if not found. |
| `PATCH` | `/api/fdrs/:id/field-trust` | `OFFICER`, `REGIONAL_OFFICER`, `ADMIN` | Officer manual scrutiny correction | `200` | Body: `{"field": str, "value": str}`. Updates `FdrFieldTrust` to `OFFICER_ENTERED`. |

### 1.4. Discrepancy Engine (`/api/discrepancies`)
| Method | Path | Auth / Role | Description | Success Code | Details |
| :--- | :--- | :--- | :--- | :---: | :--- |
| `POST` | `/api/discrepancies/scan/:fdrId` | Authenticated | Execute automated rules engine scan | `200` | `{"fdrId": str, "status": str, "discrepancies": [...]}`. If high-severity defects found, auto-transitions to `DISCREPANCY`. |
| `POST` | `/api/discrepancies/:id/resolve` | `OFFICER`, `ADMIN`, `AUTHORITY` | Resolve flagged discrepancy | `200` | Body: `{"remarks": str}`. Sets status to `RESOLVED`. |
| `POST` | `/api/discrepancies/:id/waive` | `OFFICER`, `ADMIN`, `AUTHORITY` | Formally waive discrepancy | `200` | Body: `{"remarks": str}` (mandatory). Sets status to `WAIVED`. |

### 1.5. Bank Verification Gateway (`/api/bank-verification`)
| Method | Path | Auth / Role | Description | Success Code | Details |
| :--- | :--- | :--- | :--- | :---: | :--- |
| `POST` | `/api/bank-verification/request/:fdrId` | `OFFICER`, `REGIONAL_OFFICER`, `ADMIN` | Initiate bank verification request | `201` | Query: `mock=true\|false`. Response: `{"requestId": str, "verifierName": str, "isMock": bool}`. |
| `GET` | `/api/bank-verification/:id/template` | Authenticated | Download AICTE formal inquiry letter | `200` | `text/plain` attachment with formatted verification text. |
| `POST` | `/api/bank-verification/:id/manual-confirm` | `OFFICER`, `REGIONAL_OFFICER`, `ADMIN` | Upload signed bank verification memo | `200` | Multipart file `replyDocument`, body `bankRemarks`. Promotes field trust to `BANK_CONFIRMED`. |
| `POST` | `/api/bank-verification/:id/mock-confirm` | `OFFICER`, `REGIONAL_OFFICER`, `ADMIN` | Demo mock bank verification confirmation | `200` | Promotes field trust to `BANK_CONFIRMED` and advances status to `VERIFIED`. |

### 1.6. Two-Tier Release & Refund Clearance (`/api/release`)
| Method | Path | Auth / Role | Description | Success Code | Details |
| :--- | :--- | :--- | :--- | :---: | :--- |
| `POST` | `/api/release/fdrs/:fdrId/request` | `INSTITUTION`, `OFFICER`, `ADMIN` | Create release clearance request | `201` | Body: `{"reason": str}`. Status: `PENDING_OFFICER`. |
| `POST` | `/api/release/requests/:id/officer-approve` | `OFFICER`, `REGIONAL_OFFICER`, `ADMIN` | Tier 1 RO sign-off on 5-point checklist | `200` | Body: `{"checklist": {...}, "remarks": str}`. Status: `PENDING_AUTHORITY`. |
| `POST` | `/api/release/requests/:id/authority-approve` | `AUTHORITY`, `BUREAU`, `ADMIN` | Tier 2 Bureau Authority sanction | `200` | Body: `{"remarks": str}`. FDR transitions to `RELEASED`. Returns statutory disclaimer notice. |
| `POST` | `/api/release/requests/:id/reject` | `OFFICER`, `AUTHORITY`, `BUREAU`, `ADMIN` | Reject release request | `200` | Body: `{"rejectionReason": str}`. FDR reverts to `ACTIVE`. |
| `GET` | `/api/release/requests` | Authenticated (scoped) | List release requests | `200` | Array of `ReleaseRequest` with `fdr` and `institution`. |

### 1.7. Administration, Clock, & Alerts (`/api/admin`, `/api/alerts`)
| Method | Path | Auth / Role | Description | Success Code | Details |
| :--- | :--- | :--- | :--- | :---: | :--- |
| `POST` | `/api/admin/clock/time-travel` | `ADMIN` | Shift simulated global system clock | `200` | Body: `{"targetDate": "YYYY-MM-DD"}`. Response: `{"simulatedDate": "...", "offsetMs": int, "isSimulated": true}`. |
| `POST` | `/api/admin/clock/reset` | `ADMIN` | Reset clock to real UTC time | `200` | `{"simulatedDate": "...", "isSimulated": false}`. |
| `GET` | `/api/admin/clock/status` | Authenticated | Read current active clock state | `200` | `{"currentClock": "...", "offsetMs": int, "isSimulated": bool}`. |
| `POST` | `/api/admin/jobs/scan-now` | `ADMIN` | Run deadline and escalation scan | `200` | `{"scannedCount": int, "alertsCreated": int, "transitionsTriggered": int}`. |
| `POST` | `/api/admin/audit/verify-chain` | `ADMIN`, `AUTHORITY` | Verify cryptographic SHA-256 hash chain | `200` | `{"valid": bool, "totalLogs": int, ...}`. |
| `GET` | `/api/admin/audit/verify` | `ADMIN`, `AUTHORITY` | Alias for chain verification | `200` | Same payload as above. |
| `GET` | `/api/admin/rules` | `ADMIN` | List parameterized compliance rules | `200` | Array of `RuleConfig` rows. |
| `PUT` | `/api/admin/rules/:key` | `ADMIN` | Update rule parameters | `200` | Body: `{"value": any, "note": str}`. Returns updated `RuleConfig`. |
| `GET` | `/api/alerts` | Authenticated (role-filtered) | Active notifications inbox | `200` | Array of `Alert` rows with `fdr`. |
| `POST` | `/api/alerts/:id/ack` | Authenticated | Acknowledge alert | `200` | Returns updated `Alert` with `ackedAt`. |

### 1.8. Streaming Reports & Data Export (`/api/reports`)
| Method | Path | Auth / Role | Description | Success Code | Details |
| :--- | :--- | :--- | :--- | :---: | :--- |
| `GET` | `/api/reports/fdrs/export.csv` | Authenticated (scoped) | Server-side streaming RFC 4180 CSV export | `200` | `text/csv; charset=utf-8` chunked stream with headers: FDR Number, Institution Name, AICTE Region, Issuing Bank, Branch, IFSC, Principal Amount (INR), Issue Date, Maturity Date, Lien Marked, Status, Discrepancies Count, Created At. |

### 1.9. Cryptographic Audit Trail (`/api/audit`)
| Method | Path | Auth / Role | Description | Success Code | Details |
| :--- | :--- | :--- | :--- | :---: | :--- |
| `GET` | `/api/audit/verify` | Authenticated (`ADMIN`, `AUTHORITY`, `OFFICER`) | Forensic SHA-256 chain verification | `200` | `{"valid": bool, "totalLogs": int, "corruptedAtId": str\|null, "reason": str\|null}`. |
| `GET` | `/api/audit/logs` | Authenticated (`ADMIN`, `AUTHORITY`, `OFFICER`) | Paginated audit log explorer | `200` | Query: `limit`, `cursor`, `entityId`. Returns `{"logs": [...], "nextCursor": str\|null}`. |

### 1.10. Document AI Assistance (`/api/ai`)
| Method | Path | Auth / Role | Description | Success Code | Details |
| :--- | :--- | :--- | :--- | :---: | :--- |
| `GET` | `/api/ai/health` | Authenticated | AI microservice health status | `200` | `{"status": "online"\|"offline", "notice": str\|null}`. |
| `POST` | `/api/ai/ocr` | Authenticated | Extract FDR fields from text | `200` | Body: `{"textContent": str, "filename": str}`. Returns structured tokens with confidence scores. |
| `POST` | `/api/ai/rag` | Authenticated | Query Handbook RAG (APH 2024–27) | `200` | Body: `{"query": str}`. Returns verbatim clause citations. |
| `POST` | `/api/ai/risk` | Authenticated | Predict SLA breach risk | `200` | Body: `{"daysRemaining": int, "revertCount": int, "discrepancyCount": int, "daysInScrutiny": int, "amount": float}`. Returns risk probability & synthetic data disclaimer. |

---

## 2. Test Suite Behavior Checklist

The Python test suite (`backend/tests/`) must prove the following behaviors verbatim:

- [ ] **State Machine Invariants**:
  - Linear progression matches `SUBMITTED -> UNDER_SCRUTINY -> VERIFIED -> ACTIVE -> EXPIRING -> RELEASE_REQUESTED -> RELEASE_APPROVED -> RELEASED`.
  - Illegal status jumps are blocked with 400 Bad Request.
  - Active discrepancies block transitions to `VERIFIED` and `ACTIVE`.
  - Every transition creates an `FdrEvent` and an `AuditLog` row in the same DB transaction.
- [ ] **Hypothesis Property Test**:
  - Random transition walks never enter an undefined status; every executed step satisfies guard predicates.
- [ ] **Cryptographic Audit Tamper Evidence**:
  - `GET /api/audit/verify` returns `valid: true` on clean history.
  - Modifying any `AuditLog.payload` causes verification to fail with `PAYLOAD_TAMPERING`.
  - Deleting an intermediate `AuditLog` row causes verification to fail with `BROKEN_CHAIN_LINK`.
- [ ] **Postgres Job Queue & Idempotency**:
  - Job queue uses `FOR UPDATE SKIP LOCKED`.
  - Unique constraint `(fdr_id, rule_key, threshold)` prevents duplicate alert dispatches.
  - Simulated crash/restart mid-execution leaves zero duplicate notifications.
- [ ] **Multi-Tenant RBAC & Scoping**:
  - Institutional users can only see/mutate their own FDRs, documents, and alerts.
  - Regional officers are strictly confined to their geographical region.
  - Cross-tenant requests return 403 Forbidden or 404 Not Found (empty). Report exact test count $N$.
- [ ] **Discrepancy Rules Engine**:
  - Exactly one positive and one negative test case for all 8 rules (`DATE_INVALID`, `VALIDITY_TOO_SHORT`, `AMOUNT_BELOW_SLAB`, `DUPLICATE_FDR_NO`, `DUPLICATE_DOCUMENT_HASH`, `IFSC_BANK_MISMATCH`, `LIEN_NOT_MARKED`, `MISSING_DOCUMENT`).
- [ ] **Document Storage Encryption**:
  - Stored files are ciphertext using AES-256-GCM with per-file 12-byte random IV.
  - Plaintext SHA-256 hash is verified on ingestion.
  - Signed URLs expire in 15 minutes; expired or tampered tokens return 403.
- [ ] **Two-Tier Release & Renewal Chain**:
  - Successor FDR reaching `ACTIVE` auto-transitions linked predecessor to `RENEWED`.
  - Release request requires 5-point checklist sign-off by RO before Bureau Authority can authorize.
  - Release rejection cleanly returns FDR to `ACTIVE`.
- [ ] **Clock & Time-Travel Isolation**:
  - Zero direct `datetime.now()` or `time.time()` calls in domain services; all use `Clock.now()`.
