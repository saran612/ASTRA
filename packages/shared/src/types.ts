export type Role =
  | 'INSTITUTION'
  | 'OFFICER'
  | 'REGIONAL_OFFICER'
  | 'AUTHORITY'
  | 'BUREAU'
  | 'COMMITTEE'
  | 'ADMIN';

export type FdrStatus =
  | 'SUBMITTED'
  | 'UNDER_SCRUTINY'
  | 'DISCREPANCY'
  | 'VERIFIED'
  | 'ACTIVE'
  | 'EXPIRING'
  | 'RENEWED'
  | 'LAPSED'
  | 'RELEASE_REQUESTED'
  | 'RELEASE_APPROVED'
  | 'RELEASED';

export type TrustSource = 'INSTITUTION' | 'OFFICER_ENTERED' | 'BANK_CONFIRMED';

export type DiscrepancySeverity = 'LOW' | 'MEDIUM' | 'HIGH';
export type DiscrepancyStatus = 'OPEN' | 'RESOLVED' | 'WAIVED';

export type BankVerificationStatus = 'PENDING' | 'CONFIRMED' | 'MISMATCH' | 'NO_RESPONSE';
export type ReleaseRequestStatus = 'PENDING_OFFICER' | 'PENDING_AUTHORITY' | 'APPROVED' | 'REJECTED';

export type ObligationType = 'FDR_VALIDITY' | 'STAGE_SLA' | 'UNDERTAKING' | 'LEASE_DOC';
export type ObligationStatus = 'PENDING' | 'ACTIVE' | 'FULFILLED' | 'BREACHED' | 'LAPSED';
export type JobStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
export type DispatchChannel = 'IN_APP' | 'SMTP' | 'SMS';
