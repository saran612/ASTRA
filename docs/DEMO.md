# FDR Vault Interactive Demo Script (7 Steps)

Follow this end-to-end 7-step walkthrough to demonstrate the core capabilities and principles of the AICTE FDR Vault portal.

---

### Step 1: Submit a New FDR (Institution Role)
1. Navigate to `/login` and click **"College Principal (Institution)"** (`inst.north@aicte-demo.edu.in`).
2. Click **"Submit FDR"** from the top navbar or dashboard.
3. Fill out the submission form:
   - **FDR No**: `FDR-DEMO-2026-001`
   - **Bank**: `State Bank of India`
   - **Branch**: `Connaught Place`
   - **IFSC**: `SBIN0000691`
   - **Amount**: `3500000`
   - **Issue Date**: Current Date
   - **Maturity Date**: Date 3 years into the future
   - **Lien Marked**: Checked
   - **Document**: Upload any sample PDF receipt
4. Click **"Submit FDR for Scrutiny"**.
5. Observe that the status immediately transitions to `UNDER_SCRUTINY`, and all 8 critical fields carry the amber badge: `CLAIMED (INSTITUTION)`.

---

### Step 2: Automated Discrepancy Detection & Scrutiny
1. In the top-right role switcher or via `/login`, switch to **"Regional Scrutiny Officer"** (`officer.north@aicte-demo.gov.in`).
2. Navigate to **"FDR Repository"** and open `FDR-DEFECT-INVALID-DATE` or `FDR-DOUBLE-PLEDGE-999`.
3. Notice the red alert finding:
   - For Invalid Date: `DATE_INVALID • HIGH`
   - For Double Pledge: `DUPLICATE_FDR_NO • HIGH (Possible double pledge across institutions)`
4. Attempt to resolve the HIGH discrepancy without remarks: the system blocks resolution until mandatory officer justification is entered.

---

### Step 3: Formal Bank Verification & Trust Badge Promotion
1. In the Officer view, go to **"Officer Queue"** (`/scrutiny`).
2. Locate an FDR under scrutiny (e.g., `FDR-DEMO-2026-001`).
3. Click **"Formal Bank Letter"**: Download the generated AICTE bank inquiry letter addressed to the Branch Manager.
4. Click **"Mock Bank Confirm [DEMO]"** (or test the manual reply upload):
   - Notice that the status transitions from `UNDER_SCRUTINY` ➔ `VERIFIED`.
   - Open the FDR detail view: notice that field trust badges have flipped to teal: `BANK_CONFIRMED`.

---

### Step 4: Time Travel & Approaching Maturity Alerts
1. Log in as **"Portal Admin"** (`admin@aicte-demo.gov.in`) and click **"Admin & Controls"** (`/admin`).
2. Under **Demo "Time Travel" Clock Offset**, select a date advancing 2 years and 10 months into the future (approaching T-90 to maturity).
3. Click **"Set Date"**: Notice the prominent orange banner across all screens:
   `SIMULATED DEMO DATE ACTIVE: [Date] (Admin Time Travel In Effect)`.
4. Click **"Run Scan Job Now"**:
   - The system detects the T-90 threshold.
   - Status automatically transitions from `ACTIVE` ➔ `EXPIRING`.
   - In-app alerts are dispatched to the Institution and Regional Officer.

---

### Step 5: FDR Renewal Linking
1. Switch back to **"College Principal (Institution)"**.
2. Click **"Submit FDR"** for a replacement instrument (e.g. `FDR-DEMO-2026-002`).
3. Notice how the previous instrument is linked in the renewal lineage.
4. When the replacement FDR completes scrutiny and reaches `ACTIVE`, the predecessor automatically updates to `RENEWED`.

---

### Step 6: Regulatory Release / Refund Workflow
1. For an active or matured FDR without open discrepancies, initiate a release request with reason: *"Permanent course closure approved"*.
2. Status moves to `RELEASE_REQUESTED`.
3. Switch to **"Regional Scrutiny Officer"**:
   - Open the release request.
   - Complete the 5-point regulatory compliance checklist.
   - Provide first-level sign-off: status moves to `RELEASE_APPROVED`.
4. Switch to **"Bureau Head (Authority)"** (`bureau.head@aicte-demo.gov.in`):
   - Review officer checklist clearance.
   - Click **"Approve Final Release"**: status transitions to `RELEASED`.
   - Notice the explicit system notice: *"FDR Vault records and routes authorizations only. It does not disburse funds or move money."*

---

### Step 7: Cryptographic Audit Hash-Chain Verification
1. Log in as **"Portal Admin"** (`admin@aicte-demo.gov.in`) or **"Bureau Head"**.
2. Navigate to `/admin`.
3. Click **"Verify Whole Chain"**:
   - The engine computes SHA-256 hashes across all insert-only audit rows starting from `GENESIS_HASH`.
   - Displays live verification banner:
     `CHAIN INTEGRITY VERIFIED: All [N] audit entries match SHA-256 hash sequence perfectly.`
