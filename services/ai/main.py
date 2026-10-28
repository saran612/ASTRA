from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List

from ocr import extract_fdr_fields
from rag import rag_engine
from risk_model import risk_predictor

app = FastAPI(
    title="ASTRA AI Assist Service",
    description="Microservice providing OCR extraction, strict Handbook RAG, and synthetic SLA breach prediction for AICTE FDR Vault.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class HealthResponse(BaseModel):
    status: str
    service: str
    version: str

class OCRExtractRequest(BaseModel):
    textContent: str = Field(..., description="Raw text extracted or mocked from deposit receipt")
    filename: Optional[str] = Field("", description="Optional original filename")

class OCRExtractResponse(BaseModel):
    fields: Dict[str, Any]
    confidences: Dict[str, float]
    minConfidence: float
    needsHumanReview: bool
    flaggedFields: List[str]
    boundingBoxPlaceholders: Dict[str, Dict[str, Any]]

class RAGQueryRequest(BaseModel):
    query: str = Field(..., description="Query regarding AICTE Approval Process Handbook regulations")

class RAGQueryResponse(BaseModel):
    found: bool
    clause_id: Optional[str] = None
    title: Optional[str] = None
    category: Optional[str] = None
    text: Optional[str] = None
    answer: str
    similarity: float

class SLARiskRequest(BaseModel):
    daysRemaining: float = Field(30.0, description="Days remaining until maturity or deadline")
    revertCount: int = Field(0, description="Number of previous scrutiny reverts")
    discrepancyCount: int = Field(0, description="Number of active or historic discrepancies")
    daysInScrutiny: float = Field(5.0, description="Elapsed days in current review stage")
    amount: float = Field(1500000.0, description="Deposit amount in INR")

class SLARiskResponse(BaseModel):
    slaRiskScore: float
    riskCategory: str
    breachProbability: float
    topRiskFactors: List[str]
    disclaimer: str

@app.get("/health", response_model=HealthResponse)
def health():
    return {
        "status": "ok",
        "service": "ASTRA AI Microservice",
        "version": "1.0.0",
    }

@app.post("/ocr/extract", response_model=OCRExtractResponse)
def ocr_extract(req: OCRExtractRequest):
    if not req.textContent.strip():
        raise HTTPException(status_code=400, detail="Text content cannot be empty")
    result = extract_fdr_fields(req.textContent, req.filename or "")
    return result

@app.post("/rag/query", response_model=RAGQueryResponse)
def rag_query(req: RAGQueryRequest):
    return rag_engine.search(req.query)

@app.post("/risk/sla-predict", response_model=SLARiskResponse)
def sla_predict(req: SLARiskRequest):
    return risk_predictor.predict(
        days_remaining=req.daysRemaining,
        revert_count=req.revertCount,
        discrepancy_count=req.discrepancyCount,
        days_in_scrutiny=req.daysInScrutiny,
        amount=req.amount,
    )
