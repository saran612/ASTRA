# Milestone 1: Scaffold, Docker Compose, Prisma Schema & Clock Service

## Summary of Completed Work
1. **Repository Structure**: Monorepo created with npm workspaces (`packages/shared`, `apps/api`, `apps/web`). Root scripts and TypeScript configs configured.
2. **PostgreSQL & Docker Compose**: Configured containerized Postgres 16 running on port `5434` (to avoid collision with pre-existing port 5432 services). Tested container spin-up and connectivity.
3. **Prisma Schema**: Designed and pushed all 12 core models:
   - `Institution`
   - `User` (with roles: `INSTITUTION`, `OFFICER`, `AUTHORITY`, `ADMIN`)
   - `Fdr` (with unique `[bank, fdrNo]`, renewal self-relation via `supersedesFdrId`)
   - `FdrFieldTrust` (with trust sources `INSTITUTION`, `OFFICER_ENTERED`, `BANK_CONFIRMED`)
   - `Document`
   - `FdrEvent` (append-only lifecycle audit)
   - `Discrepancy`
   - `BankVerificationRequest`
   - `ReleaseRequest`
   - `Alert`
   - `AuditLog` (with `prevHash` and `hash`)
   - `RuleConfig` (seeded placeholder configs marked with `TODO: replace with AICTE handbook clause`)
4. **Clock Service**: Created singleton `ClockService` with injectable time-travel offset and reset capabilities in `apps/api/src/services/clock.ts`.
5. **Assumptions**: Created `docs/ASSUMPTIONS.md`.
6. **Seed Skeleton**: Tested `npm run seed` which seeded the 5 initial placeholder rule configurations into Postgres.

## Status
- **What works**: Monorepo scaffolding, Postgres connection, schema sync, seed execution, clock service.
- **What's stubbed**: Full seed dataset (reserved for Milestone 11), UI app (Milestone 9).
- **Known-broken**: None.
