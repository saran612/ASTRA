"""Root API Router for ASTRA FDR Vault."""

from fastapi import APIRouter
from app.core.clock import Clock

api_router = APIRouter(prefix="/api")


@api_router.get("/health", tags=["Health"])
async def health_check():
    """System health & simulated clock probe."""
    return {
        "status": "ok",
        "timestamp": Clock.now().isoformat()
    }
