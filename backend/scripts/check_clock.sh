#!/usr/bin/env bash
set -euo pipefail

echo "==> Checking for unauthorized clock calls in Python backend..."
MATCHES=$(grep -rnE "(datetime\.now\(|datetime\.utcnow\(|time\.time\()" backend/app/ || true)
FILTERED=$(echo "$MATCHES" | grep -v "backend/app/core/clock.py" | grep -v "^$" || true)

if [ -n "$FILTERED" ]; then
    echo "ERROR: Direct clock calls found outside app/core/clock.py:"
    echo "$FILTERED"
    exit 1
fi

echo "SUCCESS: Zero unauthorized clock calls found. Clock discipline verified."
