"""Unit test for Clock abstraction and API Health endpoint."""

import pytest
from datetime import datetime, timezone, timedelta
from httpx import AsyncClient, ASGITransport

from app.core.clock import Clock
from app.main import app


def test_clock_offset_and_reset():
    Clock.reset()
    assert not Clock.is_simulated()
    assert Clock.get_offset_ms() == 0

    target = datetime(2028, 6, 1, 12, 0, 0, tzinfo=timezone.utc)
    Clock.set_simulated_date(target)
    assert Clock.is_simulated()

    now = Clock.now()
    diff = abs((now - target).total_seconds())
    assert diff < 2.0  # within 2 seconds of simulated target

    Clock.reset()
    assert not Clock.is_simulated()
    assert Clock.get_offset_ms() == 0


@pytest.mark.asyncio
async def test_api_health_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert "timestamp" in data
