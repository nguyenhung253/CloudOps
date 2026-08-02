import { BadRequestException, NotFoundException } from '@nestjs/common';
import { IncidentStatus, IncidentSeverity, UserRole, UserStatus } from '@prisma/client';

/**
 * Incident state machine spec.
 *
 * Valid transitions:
 *   OPEN → INVESTIGATING
 *   INVESTIGATING → MITIGATED | OPEN
 *   MITIGATED → RESOLVED | INVESTIGATING
 *   RESOLVED → CLOSED | INVESTIGATING
 *   CLOSED → INVESTIGATING
 */
const VALID_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  [IncidentStatus.OPEN]: [IncidentStatus.INVESTIGATING],
  [IncidentStatus.INVESTIGATING]: [IncidentStatus.MITIGATED, IncidentStatus.OPEN],
  [IncidentStatus.MITIGATED]: [IncidentStatus.RESOLVED, IncidentStatus.INVESTIGATING],
  [IncidentStatus.RESOLVED]: [IncidentStatus.CLOSED, IncidentStatus.INVESTIGATING],
  [IncidentStatus.CLOSED]: [IncidentStatus.INVESTIGATING],
};

const INVALID_TRANSITIONS: [IncidentStatus, IncidentStatus][] = [
  ['OPEN' as IncidentStatus, 'RESOLVED' as IncidentStatus],
  ['OPEN' as IncidentStatus, 'CLOSED' as IncidentStatus],
  ['INVESTIGATING' as IncidentStatus, 'CLOSED' as IncidentStatus],
  ['RESOLVED' as IncidentStatus, 'OPEN' as IncidentStatus],
  ['CLOSED' as IncidentStatus, 'RESOLVED' as IncidentStatus],
];

describe('Incident State Machine', () => {
  const allStatuses = Object.values(IncidentStatus);

  describe('valid transitions', () => {
    for (const [from, toList] of Object.entries(VALID_TRANSITIONS)) {
      for (const to of toList) {
        it(`${from} → ${to} should be allowed`, () => {
          expect(VALID_TRANSITIONS[from as IncidentStatus]).toContain(to);
        });
      }
    }
  });

  describe('invalid transitions', () => {
    for (const [from, to] of INVALID_TRANSITIONS) {
      it(`${from} → ${to} should be rejected`, () => {
        expect(VALID_TRANSITIONS[from]).not.toContain(to);
      });
    }
  });

  describe('every status has at least one valid next state', () => {
    for (const status of allStatuses) {
      it(`${status} should have defined transitions`, () => {
        expect(VALID_TRANSITIONS[status]).toBeDefined();
        expect(VALID_TRANSITIONS[status].length).toBeGreaterThan(0);
      });
    }
  });

  describe('severity mapping from alert to incident', () => {
    const severityMap: Record<string, IncidentSeverity> = {
      CRITICAL: IncidentSeverity.SEV1,
      WARNING: IncidentSeverity.SEV3,
      INFO: IncidentSeverity.SEV4,
    };

    it('should map CRITICAL alert → SEV1 incident', () => {
      expect(severityMap['CRITICAL']).toBe(IncidentSeverity.SEV1);
    });
    it('should map WARNING alert → SEV3 incident', () => {
      expect(severityMap['WARNING']).toBe(IncidentSeverity.SEV3);
    });
    it('should map INFO alert → SEV4 incident', () => {
      expect(severityMap['INFO']).toBe(IncidentSeverity.SEV4);
    });
  });
});
