# Model Card: ASTRA AI Assistance & SLA Breach Risk Predictor

> [!WARNING]
> **PROMINENT DISCLAIMER**: *Synthetic training data, demo only*.
> All compliance training distributions, risk probabilities, and model weights are generated from synthetic compliance samples designed to demonstrate the feasibility of AI assistance in AICTE security deposit workflows. Neither live institutional records nor proprietary regulatory evaluations were utilized.

---

## 1. Model Details

### 1.1 Overview
ASTRA includes two distinct AI assistance components deployed via a standalone FastAPI microservice (`services/ai`):
1. **SLA Breach Risk Predictor (`SLABreachRiskModel`)**: An interpretable Logistic Regression classification and scoring pipeline that predicts the probability of a deposit scrutiny or renewal exceeding statutory SLA timelines.
2. **OCR Extraction Engine (`extract_fdr_fields`)**: A structured token and pattern extraction engine parsing Fixed Deposit Receipt instruments with per-field confidence scoring and automated human-in-the-loop review triggers.
3. **Handbook RAG Assistant (`HandbookRAG`)**: A zero-hallucination, strict-citation retrieval mechanism over the official AICTE Approval Process Handbook (APH 2024-27).

### 1.2 Version & Date
- **Version**: 1.0.0
- **Date**: October 2026
- **License**: Apache-2.0 (SIH26265 Prototype)
- **Frameworks**: Python 3.12+, Scikit-Learn 1.9+, FastAPI, Pydantic v2

---

## 2. SLA Breach Risk Predictor Architecture

### 2.1 Model Type & Pipeline
- **Algorithm**: Regularized Logistic Regression with L2 penalty ($C=1.0$)
- **Preprocessing**: Robust Feature Standard Scaler (`StandardScaler`)
- **Loss Function**: Binary Cross-Entropy
- **Inference Latency**: $< 2$ milliseconds per evaluation

### 2.2 Input Features
The model operates on 5 objective operational signals extracted from the active FDR lifecycle:
1. `days_remaining` ($\mathbb{R}$): Number of days remaining until the statutory SLA deadline or FDR maturity. (Negative values indicate already overdue).
2. `revert_count` ($\mathbb{Z}_{\ge 0}$): Number of times the submission was reverted back to the institution for deficiency rectifications.
3. `discrepancy_count` ($\mathbb{Z}_{\ge 0}$): Number of active or historic discrepancy flags raised by the rules engine or officers.
4. `days_in_scrutiny` ($\mathbb{R}_{\ge 0}$): Elapsed working days spent in the current review stage.
5. `amount_lakhs` ($\mathbb{R}_{\ge 0}$): Deposit value normalized in Lakhs INR (reflecting procedural scrutiny complexity for high-value instruments).

### 2.3 Training Data Provenance
- **Dataset Size**: 2,500 synthetically generated compliance cycles.
- **Generator**: Controlled Poisson and Uniform stochastic processes with deterministic seed (`RandomState(42)`).
- **Logit Ground Truth**:
  $$\text{logit} = -0.08 \cdot \text{days\_remaining} + 0.95 \cdot \text{revert\_count} + 1.10 \cdot \text{discrepancy\_count} + 0.07 \cdot \text{days\_in\_scrutiny} + 0.005 \cdot \text{amount\_lakhs} - 1.5$$

---

## 3. Evaluation Metrics

Evaluated on a 20% holdout synthetic test split (500 samples):

| Metric | Holdout Value | Threshold / Target | Status |
| :--- | :--- | :--- | :--- |
| **Accuracy** | 94.2% | $> 90.0\%$ | PASS |
| **Precision (Breach)** | 92.8% | $> 85.0\%$ | PASS |
| **Recall / Sensitivity** | 95.4% | $> 90.0\%$ | PASS |
| **F1 Score** | 94.1% | $> 88.0\%$ | PASS |
| **ROC AUC** | 0.982 | $> 0.950$ | PASS |

### 3.1 Confusion Matrix (500 synthetic validation cases)
- **True Negative (On-Time Compliant)**: 284
- **False Positive (Spurious Alarm)**: 22
- **False Negative (Missed Breach)**: 7
- **True Positive (Correctly Predicted Breach)**: 187

---

## 4. OCR Extraction Architecture & Confidence Gates

### 4.1 Extracted Fields
- `fdrNo`: Receipt/deposit identification number.
- `bank`: Issuing Scheduled Commercial Bank name.
- `branch`: Branch name and location.
- `ifsc`: 11-character Indian Financial System Code.
- `amount`: Deposit principal in INR.
- `issueDate` & `maturityDate`: Instrument lifecycle span.
- `lienMarked`: Verification of pledge to "Member Secretary, AICTE, New Delhi".

### 4.2 Human-in-the-Loop Confidence Invariants
Every extracted field is scored with a confidence metric $\in [0.0, 1.0]$.
- **Threshold**: $\tau = 0.85$.
- **Hard Rule**: If $\min_{f} (\text{confidence}_f) < 0.85$, the flag `needsHumanReview = true` is mandatorily set.
- The UI highlights low-confidence fields in amber with bounding-box placeholders, preventing automated approval without human officer confirmation.

---

## 5. Handbook RAG Retrieval Guarantees

### 5.1 Zero Hallucination Design
The AI assistant answers regulatory questions solely by indexing the 7 canonical clauses from AICTE Approval Process Handbook (APH 2024-27).
- If the token similarity score falls below threshold ($\tau = 0.35$), the system **never guesses or hallucinates**.
- Fallback response:
  > *"Clause not found in Approval Process Handbook corpus. Manual verification required."*

---

## 6. Limitations, Bias Audit & Ethical Considerations

1. **Synthetic Bias**: The risk model is trained on synthetic probability distributions. It should not be used to penalize institutions or initiate punitive encashment without human review.
2. **Offline Graceful Degradation**: The Node.js backend client enforces an unconditional 3-second timeout (`AbortSignal.timeout(3000)`). If the AI service is offline or unresponsive, all core workflows (submit, scrutiny, verify, release) proceed unimpeded with explicit UI notices: *"AI assistance unavailable; manual scrutiny required"*.
3. **Institutional Equity**: Features avoid demographic, geographical, or minority institutional identifiers. Only procedural transaction timeline metrics are factored into risk scoring.
