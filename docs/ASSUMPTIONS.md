# Assumptions & Defaults

This document tracks all assumptions, trade-offs, and defaults used across the FDR Vault prototype.

## General
- **Prototype Scope**: Designed for demonstrative fidelity, correct lifecycle logic, and honest evaluation rather than hardened multi-tenant production infrastructure.
- **Clock Service**: The application relies on an injectable `Clock` service. When a time-travel offset is applied by an Admin, the simulated time applies system-wide to all deadline calculations, event timestamps, and scans.
- **Audit Hash Chain**: Audits are insert-only. Genesis hash is 64 zeros (`0000000000000000000000000000000000000000000000000000000000000000`). Canonical JSON serialization uses sorted keys to ensure deterministic hashing.

## Storage
- **Local Disk DocumentStore**: Encrypted at rest using AES-256-GCM. 32-byte encryption key configured via `STORAGE_ENCRYPTION_KEY` env var. Per-file 12-byte IV prepended to encrypted binary payload.
- **Signed URLs**: Prototype uses HMAC-SHA256 signed download tokens valid for 15 minutes.

## AICTE Rules & Thresholds
- **Placeholder Rule Configs**: All rule thresholds (reminder days, deposit minimum slabs, lien requirements) are seeded into `RuleConfig` with key prefix `aicte.` and marked clearly as `TODO: replace with AICTE handbook clause`. None represent legal or official AICTE regulatory policy.
- **Alert Thresholds**: Placeholder stages default to T-90, T-60, T-30, T-7, and overdue (T-0 / expired).
