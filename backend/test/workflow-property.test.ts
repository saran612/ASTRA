import { describe, it, expect } from 'vitest';
import {
  FdrStatus,
  Role,
  ROUTE_TEMPLATES,
  validateTemplateTransition,
  RouteTemplateId,
  WorkflowTransitionContext,
} from '@fdr-vault/shared';

const ALL_STATUSES: FdrStatus[] = [
  'SUBMITTED',
  'UNDER_SCRUTINY',
  'DISCREPANCY',
  'VERIFIED',
  'ACTIVE',
  'EXPIRING',
  'RENEWED',
  'LAPSED',
  'RELEASE_REQUESTED',
  'RELEASE_APPROVED',
  'RELEASED',
];

const ALL_ROLES: Role[] = ['INSTITUTION', 'OFFICER', 'AUTHORITY', 'ADMIN'];

describe('Milestone 2: Workflow Route Templates & Property-Based Random Walk Tests', () => {
  it('enforces that terminal statuses have zero outgoing transitions', () => {
    for (const [templateId, template] of Object.entries(ROUTE_TEMPLATES)) {
      for (const terminal of template.terminalStatuses) {
        for (const target of ALL_STATUSES) {
          for (const role of ALL_ROLES) {
            const res = validateTemplateTransition(template, terminal, target, {
              actorRole: role,
              reason: 'Mandatory justification test',
            });
            expect(res.allowed).toBe(false);
          }
        }
      }
    }
  });

  it('mandates revert reasons on backward transitions across all templates', () => {
    for (const [templateId, template] of Object.entries(ROUTE_TEMPLATES)) {
      const revertRules = template.transitions.filter((t) => t.isRevert && t.requiresReason);
      expect(revertRules.length).toBeGreaterThan(0);

      for (const rule of revertRules) {
        // Without reason -> MUST FAIL
        const resWithoutReason = validateTemplateTransition(template, rule.from, rule.to, {
          actorRole: rule.allowedRoles[0],
          reason: '',
        });
        expect(resWithoutReason.allowed).toBe(false);
        expect(resWithoutReason.reason).toMatch(/requires an explicit justification\/reason/);

        // With reason -> Passes guard
        const resWithReason = validateTemplateTransition(template, rule.from, rule.to, {
          actorRole: rule.allowedRoles[0],
          reason: 'Defect detected in bank seal clarity',
        });
        expect(resWithReason.allowed).toBe(true);
      }
    }
  });

  it('guarantees unresolved discrepancies block promotion to VERIFIED and RELEASE_APPROVED', () => {
    for (const [templateId, template] of Object.entries(ROUTE_TEMPLATES)) {
      // UNDER_SCRUTINY -> VERIFIED with discrepancies
      const verifyRes = validateTemplateTransition(template, 'UNDER_SCRUTINY', 'VERIFIED', {
        actorRole: 'OFFICER',
        hasOpenDiscrepancies: true,
      });
      expect(verifyRes.allowed).toBe(false);
      expect(verifyRes.reason).toMatch(/Cannot verify FDR with unresolved discrepancies/);

      // RELEASE_REQUESTED -> RELEASE_APPROVED with discrepancies
      const releaseRes = validateTemplateTransition(template, 'RELEASE_REQUESTED', 'RELEASE_APPROVED', {
        actorRole: 'OFFICER',
        hasOpenDiscrepancies: true,
      });
      expect(releaseRes.allowed).toBe(false);
      expect(releaseRes.reason).toMatch(/Cannot approve release while discrepancies remain open/);
    }
  });

  it('property test: 1,000 random walks over route templates never reach an illegal state', () => {
    const NUM_WALKS = 1000;
    const MAX_STEPS = 25;
    let totalTransitionsChecked = 0;
    let successfulTransitionsExecuted = 0;

    const pseudoRandom = (seed: number) => {
      let s = seed;
      return () => {
        s = (s * 9301 + 49297) % 233280;
        return s / 233280;
      };
    };

    const rand = pseudoRandom(42);

    for (let walk = 0; walk < NUM_WALKS; walk++) {
      const templateKeys = Object.keys(ROUTE_TEMPLATES) as RouteTemplateId[];
      const templateId = templateKeys[Math.floor(rand() * templateKeys.length)];
      const template = ROUTE_TEMPLATES[templateId];

      let currentStatus = template.initialStatus;

      for (let step = 0; step < MAX_STEPS; step++) {
        if (template.terminalStatuses.includes(currentStatus)) {
          break;
        }

        const candidateTarget = ALL_STATUSES[Math.floor(rand() * ALL_STATUSES.length)];
        const actorRole = ALL_ROLES[Math.floor(rand() * ALL_ROLES.length)];
        const hasOpenDiscrepancies = rand() > 0.7;
        const reason = rand() > 0.5 ? 'Operational audit verification test reason' : '';

        const ctx: WorkflowTransitionContext = {
          actorRole,
          hasOpenDiscrepancies,
          reason,
        };

        const res = validateTemplateTransition(template, currentStatus, candidateTarget, ctx);
        totalTransitionsChecked++;

        if (res.allowed) {
          // Invariant 1: The transition rule MUST exist in the template
          const matchingRule = template.transitions.find(
            (t) => t.from === currentStatus && t.to === candidateTarget
          );
          expect(matchingRule).toBeDefined();

          // Invariant 2: Actor role MUST be in allowedRoles
          expect(matchingRule!.allowedRoles).toContain(actorRole);

          // Invariant 3: If revert requires reason, reason MUST be non-empty
          if (matchingRule!.isRevert && matchingRule!.requiresReason) {
            expect(ctx.reason && ctx.reason.trim().length > 0).toBe(true);
          }

          // Advance state
          currentStatus = candidateTarget;
          successfulTransitionsExecuted++;
        } else {
          // If not allowed, reason MUST be non-empty
          expect(res.reason).toBeDefined();
          expect(typeof res.reason).toBe('string');
        }
      }
    }

    expect(totalTransitionsChecked).toBeGreaterThan(5000);
    expect(successfulTransitionsExecuted).toBeGreaterThan(100);
  });
});
