# Catalog of Deliberately Seeded Defects

To evaluate the FDR Vault discrepancy engine objectively, 6 deliberate defects were seeded across synthetic test records during `npm run seed`. 

| # | Seeded FDR No | Associated Bank & Institution | Seeded Defect Description | Target Rule Code | Severity |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | `FDR-DOUBLE-PLEDGE-999` | State Bank of India<br>(Pledged by Northern Inst. of Tech AND Delhi School of Engg.) | **Duplicate FDR Number / Double Pledge**: Exact same FDR number at the same bank pledged across two distinct institutions. | `DUPLICATE_FDR_NO` | HIGH |
| **2** | Reused Document on `FDR-DOUBLE-PLEDGE-999` | Attached to Delhi School of Engg. | **Document Hash Reuse**: Scanned document binary SHA-256 hash was previously submitted by another institution. | `DUPLICATE_DOCUMENT_HASH` | HIGH |
| **3** | `FDR-DEFECT-INVALID-DATE` | Punjab National Bank<br>(Southern College of Pharmacy) | **Invalid Dates**: Maturity date (`2024-06-01`) is set earlier than issue date (`2025-06-01`). | `DATE_INVALID` | HIGH |
| **4** | `FDR-DEFECT-SHORT-VALIDITY` | Canara Bank<br>(Deccan Polytechnic Academy) | **Short Validity**: Instrument duration is only 180 days (below the 3-year minimum threshold). | `VALIDITY_TOO_SHORT` | MEDIUM |
| **5** | `FDR-DEFECT-IFSC-MISMATCH` | State Bank of India<br>(Eastern Management Institute) | **Bank / IFSC Inconsistency**: Bank declared as State Bank of India, but IFSC entered as `HDFC0000555`. | `IFSC_BANK_MISMATCH` | MEDIUM |
| **6** | `FDR-DEFECT-NO-LIEN` | Bank of Baroda<br>(Bengal Engineering College) | **Missing Lien**: Instrument created with `lienMarked = false` (unencumbered deposit). | `LIEN_NOT_MARKED` | HIGH |

> [!NOTE]
> All banks, institution names, and instrument numbers are completely synthetic and fake.
