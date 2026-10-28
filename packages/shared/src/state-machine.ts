import { FdrStatus, Role } from './types.js';

export interface TransitionContext {
  actorRole: Role;
  hasOpenDiscrepancies?: boolean;
  hasBankConfirmation?: boolean;
  isExpired?: boolean;
  isWithinT90?: boolean;
  hasActiveRenewalFdr?: boolean;
  officerSignOff?: boolean;
  authoritySignOff?: boolean;
}

export interface TransitionRule {
  from: FdrStatus;
  to: FdrStatus;
  allowedRoles: Role[];
  description: string;
  guard?: (ctx: TransitionContext) => { allowed: boolean; reason?: string };
}

export const FDR_TRANSITIONS: TransitionRule[] = [
  // SUBMITTED -> UNDER_SCRUTINY (auto or officer/institution)
  {
    from: 'SUBMITTED',
    to: 'UNDER_SCRUTINY',
    allowedRoles: ['INSTITUTION', 'OFFICER', 'REGIONAL_OFFICER', 'ADMIN'],
    description: 'FDR moves to scrutiny queue after submission',
  },
  // UNDER_SCRUTINY -> DISCREPANCY
  {
    from: 'UNDER_SCRUTINY',
    to: 'DISCREPANCY',
    allowedRoles: ['OFFICER', 'REGIONAL_OFFICER', 'ADMIN'],
    description: 'Officer flags discrepancy requiring institution attention',
  },
  // DISCREPANCY -> UNDER_SCRUTINY
  {
    from: 'DISCREPANCY',
    to: 'UNDER_SCRUTINY',
    allowedRoles: ['INSTITUTION', 'ADMIN'],
    description: 'Institution submits corrections/explanations for scrutiny',
  },
  // UNDER_SCRUTINY -> VERIFIED
  {
    from: 'UNDER_SCRUTINY',
    to: 'VERIFIED',
    allowedRoles: ['OFFICER', 'REGIONAL_OFFICER', 'ADMIN'],
    description: 'Officer marks FDR verified after bank confirmation received and no open high discrepancies',
    guard: (ctx) => {
      if (ctx.hasOpenDiscrepancies) {
        return { allowed: false, reason: 'Cannot verify FDR with open discrepancies' };
      }
      return { allowed: true };
    },
  },
  // VERIFIED -> ACTIVE
  {
    from: 'VERIFIED',
    to: 'ACTIVE',
    allowedRoles: ['OFFICER', 'REGIONAL_OFFICER', 'AUTHORITY', 'BUREAU', 'ADMIN'],
    description: 'FDR is formally accepted as active security deposit',
  },
  // ACTIVE -> EXPIRING
  {
    from: 'ACTIVE',
    to: 'EXPIRING',
    allowedRoles: ['ADMIN'], // Scheduled clock engine or admin
    description: 'FDR reaches T-90 deadline window before maturity',
  },
  // EXPIRING -> RENEWED
  {
    from: 'EXPIRING',
    to: 'RENEWED',
    allowedRoles: ['OFFICER', 'REGIONAL_OFFICER', 'AUTHORITY', 'BUREAU', 'ADMIN'],
    description: 'Linked replacement FDR reaches ACTIVE status',
  },
  // EXPIRING -> LAPSED
  {
    from: 'EXPIRING',
    to: 'LAPSED',
    allowedRoles: ['ADMIN'], // Scheduled clock engine or admin
    description: 'Maturity date passed without active replacement FDR',
  },
  // ACTIVE|EXPIRING|RENEWED -> RELEASE_REQUESTED
  {
    from: 'ACTIVE',
    to: 'RELEASE_REQUESTED',
    allowedRoles: ['INSTITUTION', 'OFFICER', 'REGIONAL_OFFICER', 'ADMIN'],
    description: 'Institution requests release of active FDR',
    guard: (ctx) => {
      if (ctx.hasOpenDiscrepancies) {
        return { allowed: false, reason: 'Cannot request release with open discrepancies' };
      }
      return { allowed: true };
    },
  },
  {
    from: 'EXPIRING',
    to: 'RELEASE_REQUESTED',
    allowedRoles: ['INSTITUTION', 'OFFICER', 'REGIONAL_OFFICER', 'ADMIN'],
    description: 'Institution requests release of expiring FDR',
  },
  {
    from: 'RENEWED',
    to: 'RELEASE_REQUESTED',
    allowedRoles: ['INSTITUTION', 'OFFICER', 'REGIONAL_OFFICER', 'ADMIN'],
    description: 'Institution requests release of superseded renewed FDR',
  },
  // RELEASE_REQUESTED -> RELEASE_APPROVED
  {
    from: 'RELEASE_REQUESTED',
    to: 'RELEASE_APPROVED',
    allowedRoles: ['OFFICER', 'REGIONAL_OFFICER', 'AUTHORITY', 'BUREAU', 'COMMITTEE', 'ADMIN'],
    description: 'Officer provides first-level recommendation and checklist clearance',
    guard: (ctx) => {
      if (ctx.hasOpenDiscrepancies) {
        return { allowed: false, reason: 'Cannot approve release while discrepancies are open' };
      }
      return { allowed: true };
    },
  },
  // RELEASE_APPROVED -> RELEASED
  {
    from: 'RELEASE_APPROVED',
    to: 'RELEASED',
    allowedRoles: ['AUTHORITY', 'BUREAU', 'ADMIN'],
    description: 'Competent authority grants final release/refund approval',
  },
  // RELEASE_REQUESTED -> ACTIVE (officer rejection)
  {
    from: 'RELEASE_REQUESTED',
    to: 'ACTIVE',
    allowedRoles: ['OFFICER', 'REGIONAL_OFFICER', 'AUTHORITY', 'BUREAU', 'ADMIN'],
    description: 'Release request rejected, restoring FDR to active status',
  },
  // RELEASE_APPROVED -> ACTIVE (authority rejection)
  {
    from: 'RELEASE_APPROVED',
    to: 'ACTIVE',
    allowedRoles: ['AUTHORITY', 'BUREAU', 'ADMIN'],
    description: 'Authority rejects release recommendation, restoring FDR to active status',
  },
];

export function findTransition(from: FdrStatus, to: FdrStatus): TransitionRule | undefined {
  return FDR_TRANSITIONS.find((t) => t.from === from && t.to === to);
}

export function validateTransition(
  from: FdrStatus,
  to: FdrStatus,
  ctx: TransitionContext
): { allowed: boolean; reason?: string } {
  const rule = findTransition(from, to);
  if (!rule) {
    return {
      allowed: false,
      reason: `Illegal state transition from ${from} to ${to}`,
    };
  }

  if (!rule.allowedRoles.includes(ctx.actorRole)) {
    return {
      allowed: false,
      reason: `Role ${ctx.actorRole} is not authorized to transition from ${from} to ${to}. Allowed: ${rule.allowedRoles.join(', ')}`,
    };
  }

  if (rule.guard) {
    return rule.guard(ctx);
  }

  return { allowed: true };
}
