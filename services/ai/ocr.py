import re
from typing import Dict, Any, List

KNOWN_BANKS = [
    "STATE BANK OF INDIA",
    "PUNJAB NATIONAL BANK",
    "BANK OF BARODA",
    "CANARA BANK",
    "UNION BANK OF INDIA",
    "HDFC BANK",
    "ICICI BANK",
    "AXIS BANK",
    "INDIAN BANK",
    "CENTRAL BANK OF INDIA",
]

def extract_fdr_fields(text_content: str, filename: str = "") -> Dict[str, Any]:
    """
    Extracts structured FDR metadata with per-field confidence scores.
    If any confidence is below 0.85, flags for mandatory officer review.
    """
    clean_text = text_content.upper()
    fields: Dict[str, Any] = {}
    confidences: Dict[str, float] = {}
    flagged_fields: List[str] = []

    # 1. FDR Number
    fdr_match = re.search(r"(?:FDR|TDR|RECEIPT|DEPOSIT\s*A\/C|NO\.?)\s*[:#-]?\s*([A-Z0-9\-\/]{6,20})", clean_text)
    if fdr_match:
        fields["fdrNo"] = fdr_match.group(1).strip()
        confidences["fdrNo"] = 0.94
    else:
        fields["fdrNo"] = "FDR-OCR-PENDING"
        confidences["fdrNo"] = 0.40
        flagged_fields.append("fdrNo")

    # 2. Bank Name
    detected_bank = None
    for bank in KNOWN_BANKS:
        if bank in clean_text:
            detected_bank = bank
            break
    if detected_bank:
        fields["bank"] = detected_bank
        confidences["bank"] = 0.96
    else:
        fields["bank"] = "UNKNOWN BANK"
        confidences["bank"] = 0.45
        flagged_fields.append("bank")

    # 3. Branch & IFSC
    ifsc_match = re.search(r"\b([A-Z]{4}0[A-Z0-9]{6})\b", clean_text)
    if ifsc_match:
        fields["ifsc"] = ifsc_match.group(1)
        confidences["ifsc"] = 0.95
    else:
        fields["ifsc"] = "SBIN0000000"
        confidences["ifsc"] = 0.50
        flagged_fields.append("ifsc")

    branch_match = re.search(r"(?:BRANCH|AT)\s*[:\-]?\s*([A-Z\s]{3,30})", clean_text)
    if branch_match:
        fields["branch"] = branch_match.group(1).strip().title()
        confidences["branch"] = 0.88
    else:
        fields["branch"] = "Main Branch"
        confidences["branch"] = 0.70
        flagged_fields.append("branch")

    # 4. Amount
    amt_match = re.search(r"(?:INR|RS\.?|RUPEES|AMOUNT)\s*[:\-]?\s*([0-9,]+(?:\.[0-9]{2})?)", clean_text)
    if amt_match:
        raw_amt = amt_match.group(1).replace(",", "")
        try:
            fields["amount"] = float(raw_amt)
            confidences["amount"] = 0.92
        except ValueError:
            fields["amount"] = 1000000.0
            confidences["amount"] = 0.60
            flagged_fields.append("amount")
    else:
        fields["amount"] = 1000000.0
        confidences["amount"] = 0.55
        flagged_fields.append("amount")

    # 5. Issue Date
    date_matches = re.findall(r"\b(\d{4}[-/]\d{2}[-/]\d{2}|\d{2}[-/]\d{2}[-/]\d{4})\b", clean_text)
    if len(date_matches) >= 2:
        fields["issueDate"] = date_matches[0]
        fields["maturityDate"] = date_matches[1]
        confidences["issueDate"] = 0.90
        confidences["maturityDate"] = 0.90
    elif len(date_matches) == 1:
        fields["issueDate"] = date_matches[0]
        fields["maturityDate"] = "2029-01-01"
        confidences["issueDate"] = 0.88
        confidences["maturityDate"] = 0.60
        flagged_fields.append("maturityDate")
    else:
        fields["issueDate"] = "2026-01-01"
        fields["maturityDate"] = "2029-01-01"
        confidences["issueDate"] = 0.50
        confidences["maturityDate"] = 0.50
        flagged_fields.extend(["issueDate", "maturityDate"])

    # 6. Lien Marking
    if any(k in clean_text for k in ["LIEN", "AICTE", "MEMBER SECRETARY", "PLEDGED"]):
        fields["lienMarked"] = True
        confidences["lienMarked"] = 0.91
    else:
        fields["lienMarked"] = False
        confidences["lienMarked"] = 0.75
        flagged_fields.append("lienMarked")

    # Determine if human officer scrutiny is required (threshold < 0.85)
    min_confidence = min(confidences.values()) if confidences else 0.0
    needs_review = min_confidence < 0.85

    return {
        "fields": fields,
        "confidences": confidences,
        "minConfidence": round(min_confidence, 2),
        "needsHumanReview": needs_review,
        "flaggedFields": flagged_fields,
        "boundingBoxPlaceholders": {
            k: {"x": 10, "y": 20, "w": 200, "h": 30, "page": 1}
            for k in fields.keys()
        },
    }
