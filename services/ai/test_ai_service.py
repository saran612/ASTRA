import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_health():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"

def test_ocr_extraction_high_confidence():
    text = (
        "STATE BANK OF INDIA FDR NO: SBIN-2026-88123 "
        "IFSC: SBIN0001234 BRANCH: CONNAUGHT PLACE "
        "AMOUNT: RS. 15,00,000 ISSUE DATE: 2026-03-01 MATURITY DATE: 2029-03-01 "
        "PLEDGED AND LIEN MARKED IN FAVOUR OF MEMBER SECRETARY AICTE"
    )
    resp = client.post("/ocr/extract", json={"textContent": text})
    assert resp.status_code == 200
    data = resp.json()
    assert data["fields"]["bank"] == "STATE BANK OF INDIA"
    assert data["fields"]["fdrNo"] == "SBIN-2026-88123"
    assert data["fields"]["amount"] == 1500000.0
    assert data["fields"]["lienMarked"] is True
    assert "boundingBoxPlaceholders" in data

def test_rag_strict_retrieval():
    resp = client.post("/rag/query", json={"query": "refund and release procedure checklist"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["found"] is True
    assert "APH 2024-27 Clause 4.4.1" in data["clause_id"]

def test_rag_fallback_when_not_in_corpus():
    resp = client.post("/rag/query", json={"query": "quantum entanglement astrophysics satellite telecommunications"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["found"] is False
    assert "Clause not found in Approval Process Handbook corpus. Manual verification required." in data["answer"]

def test_sla_risk_synthetic_prediction():
    resp = client.post("/risk/sla-predict", json={
        "daysRemaining": 3,
        "revertCount": 3,
        "discrepancyCount": 2,
        "daysInScrutiny": 25,
        "amount": 2500000.0
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["riskCategory"] in ["HIGH", "CRITICAL"]
    assert data["disclaimer"] == "Synthetic training data, demo only"
    assert len(data["topRiskFactors"]) > 0
