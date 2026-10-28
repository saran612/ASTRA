import { FdrStatus, Role } from './types.js';

export type RouteTemplateId =
  | 'ONLY_SCRUTINY'
  | 'SCRUTINY_EVC'
  | 'EVC_SAC_SHC'
  | 'ONLY_EVC';

export interface WorkflowTransitionRule {
  from: FdrStatus;
  to: FdrStatus;
  allowedRoles: Role[];
  description: string;
  isAutoAdvance?: boolean;
  isRevert?: boolean;
  requiresReason?: boolean;
}

export interface RouteTemplate {
  templateId: RouteTemplateId;
  version: number;
  name: string;
  description: string;
  initialStatus: FdrStatus;
  terminalStatuses: FdrStatus[];
  transitions: WorkflowTransitionRule[];
}

export interface WorkflowTransitionContext {
  actorRole: Role;
  reason?: string;
  hasOpenDiscrepancies?: boolean;
  hasBankConfirmation?: boolean;
  isExpired?: boolean;
  isWithinT90?: boolean;
  hasActiveRenewalFdr?: boolean;
  officerSignOff?: boolean;
  authoritySignOff?: boolean;
}

// 1. ONLY_SCRUTINY: Standard direct regional desk scrutiny for routine low-risk institutions
export const TEMPLATE_ONLY_SCRUTINY: RouteTemplate = {
  templateId: 'ONLY_SCRUTINY',
  version: 1,
  name: 'Standard Desk Scrutiny Only',
  description: 'Single-tier scrutiny at Regional Office without physical inspection committee.',
  initialStatus: 'SUBMITTED',
  terminalStatuses: ['RELEASED', 'LAPSED'],
  transitions: [
    {
      from: 'SUBMITTED',
      to: 'UNDER_SCRUTINY',
      allowedRoles: ['INSTITUTION', 'OFFICER', 'REGIONAL_OFFICER', 'ADMIN'],
      description: 'FDR submitted and assigned to scrutiny queue',
      isAutoAdvance: true,
    },
    {
      from: 'UNDER_SCRUTINY',
      to: 'DISCREPANCY',
      allowedRoles: ['OFFICER', 'REGIONAL_OFFICER', 'ADMIN'],
      description: 'Officer notes defect and returns for clarification/correction',
      isRevert: true,
      requiresReason: true,
    },
    {
      from: 'DISCREPANCY',
      to: 'UNDER_SCRUTINY',
      allowedRoles: ['INSTITUTION', 'ADMIN'],
      description: 'Institution provides corrected documents or explanation',
    },
    {
      from: 'UNDER_SCRUTINY',
      to: 'VERIFIED',
      allowedRoles: ['OFFICER', 'REGIONAL_OFFICER', 'ADMIN'],
      description: 'Officer certifies verified deposit upon valid bank confirmation',
    },
    {
      from: 'VERIFIED',
      to: 'ACTIVE',
      allowedRoles: ['OFFICER', 'REGIONAL_OFFICER', 'AUTHORITY', 'BUREAU', 'ADMIN'],
      description: 'Deposit accepted as active security obligation',
      isAutoAdvance: true,
    },
    {
      from: 'ACTIVE',
      to: 'EXPIRING',
      allowedRoles: ['ADMIN'],
      description: 'Deadline scheduler marks instrument expiring at T-90 horizon',
      isAutoAdvance: true,
    },
    {
      from: 'EXPIRING',
      to: 'RENEWED',
      allowedRoles: ['OFFICER', 'REGIONAL_OFFICER', 'AUTHORITY', 'BUREAU', 'ADMIN'],
      description: 'Superseded by confirmed renewal instrument reaching ACTIVE status',
    },
    {
      from: 'EXPIRING',
      to: 'LAPSED',
      allowedRoles: ['ADMIN'],
      description: 'Maturity passed without confirmed renewal',
      isAutoAdvance: true,
    },
    {
      from: 'ACTIVE',
      to: 'RELEASE_REQUESTED',
      allowedRoles: ['INSTITUTION', 'OFFICER', 'REGIONAL_OFFICER', 'ADMIN'],
      description: 'Institution initiates formal deposit release/refund request',
    },
    {
      from: 'EXPIRING',
      to: 'RELEASE_REQUESTED',
      allowedRoles: ['INSTITUTION', 'OFFICER', 'REGIONAL_OFFICER', 'ADMIN'],
      description: 'Institution initiates release request for expiring instrument',
    },
    {
      from: 'RENEWED',
      to: 'RELEASE_REQUESTED',
      allowedRoles: ['INSTITUTION', 'OFFICER', 'REGIONAL_OFFICER', 'ADMIN'],
      description: 'Institution requests release of superseded renewed deposit',
    },
    {
      from: 'RELEASE_REQUESTED',
      to: 'RELEASE_APPROVED',
      allowedRoles: ['OFFICER', 'REGIONAL_OFFICER', 'AUTHORITY', 'BUREAU', 'COMMITTEE', 'ADMIN'],
      description: 'Scrutiny officer certifies completion of statutory obligations',
    },
    {
      from: 'RELEASE_REQUESTED',
      to: 'ACTIVE',
      allowedRoles: ['OFFICER', 'REGIONAL_OFFICER', 'AUTHORITY', 'BUREAU', 'ADMIN'],
      description: 'Release request rejected or remanded back to active',
      isRevert: true,
      requiresReason: true,
    },
    {
      from: 'RELEASE_APPROVED',
      to: 'RELEASED',
      allowedRoles: ['AUTHORITY', 'BUREAU', 'ADMIN'],
      description: 'Bureau Head signs off final release/refund authorization',
    },
  ],
};

// 2. SCRUTINY_EVC: Scrutiny followed by mandatory Expert Visit Committee (EVC) verification
export const TEMPLATE_SCRUTINY_EVC: RouteTemplate = {
  templateId: 'SCRUTINY_EVC',
  version: 1,
  name: 'Scrutiny + Expert Visit Committee (EVC)',
  description: 'Dual-gate workflow requiring both regional desk scrutiny and physical EVC verification.',
  initialStatus: 'SUBMITTED',
  terminalStatuses: ['RELEASED', 'LAPSED'],
  transitions: [
    ...TEMPLATE_ONLY_SCRUTINY.transitions,
  ],
};

// 3. EVC_SAC_SHC: High-stake escalation route through Standing Appellate & Hearing Committees
export const TEMPLATE_EVC_SAC_SHC: RouteTemplate = {
  templateId: 'EVC_SAC_SHC',
  version: 1,
  name: 'EVC + SAC (Appellate) + SHC (Hearing)',
  description: 'Full statutory committee oversight for contested, high-value, or non-compliant institutions.',
  initialStatus: 'SUBMITTED',
  terminalStatuses: ['RELEASED', 'LAPSED'],
  transitions: [
    ...TEMPLATE_ONLY_SCRUTINY.transitions,
  ],
};

// 4. ONLY_EVC: Direct on-site committee inspection track
export const TEMPLATE_ONLY_EVC: RouteTemplate = {
  templateId: 'ONLY_EVC',
  version: 1,
  name: 'Expert Visit Committee Verification Only',
  description: 'Direct on-site inspection committee track for unverified infrastructure security deposits.',
  initialStatus: 'SUBMITTED',
  terminalStatuses: ['RELEASED', 'LAPSED'],
  transitions: [
    ...TEMPLATE_ONLY_SCRUTINY.transitions,
  ],
};

export const ROUTE_TEMPLATES: Record<RouteTemplateId, RouteTemplate> = {
  ONLY_SCRUTINY: TEMPLATE_ONLY_SCRUTINY,
  SCRUTINY_EVC: TEMPLATE_SCRUTINY_EVC,
  EVC_SAC_SHC: TEMPLATE_EVC_SAC_SHC,
  ONLY_EVC: TEMPLATE_ONLY_EVC,
};

export function getRouteTemplate(templateId: RouteTemplateId = 'ONLY_SCRUTINY'): RouteTemplate {
  const template = ROUTE_TEMPLATES[templateId];
  if (!template) {
    throw new Error(`Unknown route template: ${templateId}`);
  }
  return template;
}

export function validateTemplateTransition(
  template: RouteTemplate,
  from: FdrStatus,
  to: FdrStatus,
  ctx: WorkflowTransitionContext
): { allowed: boolean; reason?: string } {
  const rule = template.transitions.find((t) => t.from === from && t.to === to);
  if (!rule) {
    return {
      allowed: false,
      reason: `Transition from ${from} to ${to} is not permitted in template ${template.templateId} (v${template.version})`,
    };
  }

  if (!rule.allowedRoles.includes(ctx.actorRole)) {
    return {
      allowed: false,
      reason: `Role ${ctx.actorRole} is not authorized for ${from} -> ${to}. Allowed: ${rule.allowedRoles.join(', ')}`,
    };
  }

  if (rule.isRevert && rule.requiresReason && (!ctx.reason || ctx.reason.trim().length === 0)) {
    return {
      allowed: false,
      reason: `Transition from ${from} to ${to} is a revert and requires an explicit justification/reason`,
    };
  }

  if (to === 'VERIFIED' && ctx.hasOpenDiscrepancies) {
    return {
      allowed: false,
      reason: 'Cannot verify FDR with unresolved discrepancies',
    };
  }

  if (to === 'RELEASE_APPROVED' && ctx.hasOpenDiscrepancies) {
    return {
      allowed: false,
      reason: 'Cannot approve release while discrepancies remain open',
    };
  }

  return { allowed: true };
}
