# ASTRA / FDR Vault — Discrepancy Rules Catalog

This document defines the complete catalog of automated discrepancy and compliance validation rules implemented in the ASTRA FDR Vault rules engine (`backend/src/services/discrepancy-rules.ts`).

---

## 1. Overview & Architecture

The discrepancy engine executes whenever:
1. An institution submits a new FDR instrument (`POST /api/fdrs`).
2. New compliance documents are attached to an existing FDR (`POST /api/fdrs/:id/documents`).
3. An officer initiates manual or scheduled re-scrutiny.

### Design Principles:
- **Pure Function Evaluation**: The core engine (`evaluateAllRules`) is a deterministic, side-effect-free function accepting structured FDR metadata, document digests, and existing database records.
- **Cross-Institution Isolation Check**: Detects cross-institutional fraud (duplicate FDR numbers or document sha256 collisions) without leaking unauthorized institution details to unauthenticated users.
- **Honesty & Handbook Grounding**: Rules whose precise thresholds vary across AICTE Approval Process Handbook (APH) editions are parameterized via configuration dictionaries and explicitly marked with `TODO: replace with AICTE handbook clause` placeholders.

---

## 2. Rules Catalog

| Rule Code | Rule Name | Severity | Primary Inputs | Config Key / Handbook Status |
| :--- | :--- | :--- | :--- | :--- |
| `DATE_INVALID` | Inverted Date Order | `HIGH` | `issueDate`, `maturityDate` | Core invariant: `maturityDate > issueDate` |
| `VALIDITY_TOO_SHORT` | Insufficient Validity Period | `MEDIUM` | `issueDate`, `maturityDate` | `rulesConfig.minValidityDays` (Default: 1095 days / 3 years). *Awaits APH 2024-27 clause for specific program categories.* |
| `AMOUNT_BELOW_SLAB` | Deposit Below Prescribed Slab | `HIGH` | `amount`, `institutionCategory` | `rulesConfig.depositSlabs` (Default: ₹10,00,000 for standard programs). *Awaits APH Chapter II/IV slab matrix for UG/PG/Diploma tiers.* |
| `DUPLICATE_FDR_NO` | Cross-Institution Double Pledge | `HIGH` | `fdrNo`, `bank`, `institutionId` | DB index scan across all non-matching `institutionId`. Zero config needed. |
| `DUPLICATE_DOCUMENT_HASH` | Document Hash Collision / Re-use | `HIGH` | `document.sha256`, `institutionId` | DB scan across all uploaded document SHA-256 digests. Zero config needed. |
| `IFSC_BANK_MISMATCH` | IFSC Code / Bank Inconsistency | `MEDIUM` | `bank`, `ifsc` | `BANK_IFSC_MAP` registry (Validates standard RBI 4-letter bank code prefixes: `SBIN`, `PUNB`, `HDFC`, etc.). |
| `LIEN_NOT_MARKED` | Absence of Joint Lien to AICTE | `HIGH` | `lienMarked` (boolean) | Mandatory statutory requirement under AICTE Act. Must be `true`. |
| `MISSING_DOCUMENT` | Missing Mandatory Compliance Docs | `MEDIUM` | `document.type` array | `rulesConfig.requiredDocTypes` (Mandatory: `FDR_RECEIPT`, `JOINT_LIEN_LETTER`). |

---

## 3. Detailed Rule Specifications

### 3.1. `DATE_INVALID`
- **Description**: Verifies that the FDR maturity date is chronologically after the issue date.
- **Condition for Trigger**: `fdr.maturityDate <= fdr.issueDate`
- **Severity**: `HIGH`
- **Impact**: Blocks progression to `VERIFIED` or `ACTIVE` until rectified.
- **Handbook Status**: Core date arithmetic invariant.

### 3.2. `VALIDITY_TOO_SHORT`
- **Description**: FDRs pledged as security deposits to AICTE must maintain a mandatory minimum tenure (typically 3 to 10 years depending on the establishment category: New Technical Institution, Integrated Campus, or Existing Expansion).
- **Condition for Trigger**: `(fdr.maturityDate - fdr.issueDate) in days < minValidityDays`
- **Default Threshold**: 1,095 days (3 years).
- **Severity**: `MEDIUM`
- **Impact**: Flagged in officer scrutiny dashboard; can be resolved with officer justification if backed by a valid auto-renewal instruction letter.
- **Handbook Status**: Parameterized. `TODO: replace with AICTE handbook clause` per specific technical discipline (Engineering, Management, Architecture).

### 3.3. `AMOUNT_BELOW_SLAB`
- **Description**: Ensures the FDR deposit principal meets or exceeds the mandatory security deposit stipulated in the AICTE Approval Process Handbook (APH) for the institution's program type and land/establishment status.
- **Condition for Trigger**: `fdr.amount < slabs[institutionCategory]`
- **Default Threshold**: ₹10,00,000 (Default baseline).
- **Severity**: `HIGH`
- **Impact**: Requires top-up FDR or formal waiver resolution. High-severity resolution requires mandatory written justification from the Regional Officer.
- **Handbook Status**: Parameterized. `TODO: replace with AICTE handbook clause` to reflect full APH Table 1.1 slab breakdown (e.g., ₹15 Lakhs for Engineering & Technology, ₹10 Lakhs for MCA/MBA, etc.).

### 3.4. `DUPLICATE_FDR_NO` (Anti-Fraud / Double-Pledge Detection)
- **Description**: Detects if an FDR with the exact same FDR number and issuing bank has already been pledged by another institution in the system.
- **Condition for Trigger**: Matches `other.fdrNo === current.fdrNo && other.bank === current.bank && other.institutionId !== current.institutionId`
- **Severity**: `HIGH`
- **Impact**: Immediate fraud hold. Automatic escalation flag to Bureau Head.
- **Handbook Status**: Core security control against multi-pledge fraud.

### 3.5. `DUPLICATE_DOCUMENT_HASH`
- **Description**: Compares the SHA-256 digest of newly uploaded documents against all previously uploaded documents across all institutions.
- **Condition for Trigger**: Matches `other.sha256 === current.sha256 && other.institutionId !== current.institutionId`
- **Severity**: `HIGH`
- **Impact**: Identifies forged or re-used bank deposit receipts or fake lien letters copied across institutions.
- **Handbook Status**: Core cryptographic integrity control.

### 3.6. `IFSC_BANK_MISMATCH`
- **Description**: Validates that the first four characters of the 11-character Indian Financial System Code (IFSC) correspond to the selected scheduled bank.
- **Condition for Trigger**: Selected bank's expected prefix (e.g., `SBIN` for State Bank of India, `BARB` for Bank of Baroda) does not match `fdr.ifsc.slice(0, 4)`.
- **Severity**: `MEDIUM`
- **Impact**: Flagged for institution correction during scrutiny phase.
- **Handbook Status**: Standard RBI IFSC structure.

### 3.7. `LIEN_NOT_MARKED`
- **Description**: Verifies that the instrument is formally lien-marked in favour of Member Secretary, AICTE, New Delhi.
- **Condition for Trigger**: `fdr.lienMarked === false`
- **Severity**: `HIGH`
- **Impact**: FDR cannot be activated. A security deposit without a recorded lien allows institutions to encash or borrow against the deposit without AICTE knowledge.
- **Handbook Status**: AICTE Act / Regulations statutory mandate.

### 3.8. `MISSING_DOCUMENT`
- **Description**: Asserts that all prerequisite regulatory documents are attached.
- **Condition for Trigger**: Any document type in `rulesConfig.requiredDocTypes` (default: `['FDR_RECEIPT', 'JOINT_LIEN_LETTER']`) is absent from the FDR document ledger.
- **Severity**: `MEDIUM`
- **Impact**: Prevents officer approval until missing records are submitted.
- **Handbook Status**: Parameterized list. `TODO: replace with AICTE handbook clause` for additional attachments (e.g., Board Resolution, Land Title Affidavit).

---

## 4. Discrepancy Resolution Protocol

1. **Medium Severity Issues**:
   - Can be resolved by the Scrutiny Officer (`OFFICER` or `REGIONAL_OFFICER`) with optional contextual remarks.
2. **High Severity Issues**:
   - Cannot be bypassed silently.
   - Requires mandatory justification text recording the legal basis, verified physical documentation, or bank verification reference.
   - All resolutions append an immutable cryptographic record to the audit log (`fdrAuditLog`).
