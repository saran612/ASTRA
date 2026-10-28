# FDR Vault Security & Architecture Notes

This document summarizes implemented security controls and architectural considerations for the AICTE FDR Vault prototype.

## Implemented Prototype Controls
- **Password Hashing**: Implemented with Argon2id using salt and memory-hard computational hashing.
- **Access & Refresh Tokens**: JSON Web Tokens with short 15-minute access lifetimes and 7-day refresh token rotation.
- **Request Validation**: Zod schemas on every API endpoint validating input types, regex, date formats, and payloads.
- **Role-Based Access Control (RBAC)**: Route-level guards enforcing role privileges (`INSTITUTION`, `OFFICER`, `AUTHORITY`, `ADMIN`).
- **Row-Level Scoping**: Strict Prisma query scoping preventing institutional users from reading or mutating other institutions' FDR deposits, documents, or alerts.
- **Document Encryption at Rest**: AES-256-GCM symmetric encryption with random per-file 12-byte IVs, 16-byte authentication tags, and SHA-256 payload integrity validation.
- **Expiring Signed URLs**: HMAC-SHA256 signed download tokens valid for 15 minutes to prevent unauthenticated direct file enumeration.
- **Cryptographic Audit Hash-Chain**: Insert-only audit logging where each record contains `prev_hash` and `hash = SHA256(prev_hash + canonical_json(row))`. Genesis hash initialized to 64 zeros.
- **Rate Limiting & Headers**: Express rate limiting on auth endpoints and Helmet security HTTP headers.

---

## Production Architecture Considerations (Document Only)
- **TLS Termination & Ingress**: Strict mTLS or TLS 1.3 termination at API gateway/reverse proxy with HSTS and OCSP stapling.
- **Key Management Service (KMS)**: Replace environment variable symmetric keys with AWS KMS, Azure Key Vault, or HashiCorp Vault with automated envelope encryption and master key rotation.
- **Government / AICTE SSO Integration**: Integration with DigiLocker, AICTE Portal SAML/OIDC, and Parichay (National Single Sign-On).
- **Anti-Malware & Content Scanning**: Asynchronous ClamAV or sandbox inspection for all uploaded institution files prior to persistent storage.
- **Digital Personal Data Protection (DPDP) Act Compliance**: Strict institutional consent management, purpose limitation, and anonymization of officer/signatory records upon data archival.
- **High Availability & Disaster Recovery (DR)**: Multi-region active-passive PostgreSQL streaming replication, geo-redundant S3/blob object storage, and write-ahead log (WAL) archiving.
