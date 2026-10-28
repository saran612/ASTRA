"""Injectable Clock service for ASTRA FDR Vault.

Enforces zero direct system clock calls across domain and business services.
All services must consume Clock.now() for deterministic evaluation and time travel.
"""

from datetime import datetime, timezone, timedelta
from typing import Optional


class Clock:
    """System clock abstraction with injectable simulated offset."""

    _offset_ms: int = 0
    _is_simulated: bool = False

    @classmethod
    def now(cls) -> datetime:
        """Returns the current UTC datetime adjusted by any simulated offset."""
        # This is the SINGLE designated location in the entire codebase where system time is read.
        utc_now = datetime.now(timezone.utc)
        if cls._offset_ms != 0:
            return utc_now + timedelta(milliseconds=cls._offset_ms)
        return utc_now

    @classmethod
    def set_simulated_date(cls, target: datetime) -> None:
        """Sets simulated clock to a specific target UTC date."""
        if target.tzinfo is None:
            target = target.replace(tzinfo=timezone.utc)
        else:
            target = target.astimezone(timezone.utc)

        base_now = datetime.now(timezone.utc)
        diff = target - base_now
        cls._offset_ms = int(diff.total_seconds() * 1000)
        cls._is_simulated = True

    @classmethod
    def reset(cls) -> None:
        """Resets the clock back to real system UTC time."""
        cls._offset_ms = 0
        cls._is_simulated = False

    @classmethod
    def get_offset_ms(cls) -> int:
        """Returns simulated offset in milliseconds."""
        return cls._offset_ms

    @classmethod
    def is_simulated(cls) -> bool:
        """Indicates if simulated time travel is currently active."""
        return cls._is_simulated
