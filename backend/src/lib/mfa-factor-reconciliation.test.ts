/**
 * SR-14(b) + INC-003 A-19 reconciliation — pure-logic tests.
 */
import { describe, it, expect } from 'vitest';
import { reconcileMfaFactors, type ReconciliationFactor } from './mfa-factor-reconciliation.js';
import { ENROLLMENT_TICKET_TTL_SECONDS } from './policy.js';

const T0 = new Date('2026-10-01T10:00:00.000Z');
const plus = (d: Date, seconds: number) => new Date(d.getTime() + seconds * 1000);

function totp(id: string, createdAt: Date, status = 'verified'): ReconciliationFactor {
  return { factorId: id, factorType: 'totp', status, createdAt };
}

describe('reconcileMfaFactors', () => {
  it('a backend-mediated enrolment (mfa_enrolled shortly after factor creation) is clean', () => {
    const findings = reconcileMfaFactors({
      accounts: [{ accountId: 'a1', mfaRequired: true, userType: 'admin' }],
      factorsByAccount: new Map([['a1', [totp('f1', T0)]]]),
      enrolmentEventsByAccount: new Map([['a1', [plus(T0, 45)]]]),
    });
    expect(findings).toEqual([]);
  });

  it('A-19: a verified factor with no matching backend enrolment event is flagged (GoTrue-direct C-10)', () => {
    const findings = reconcileMfaFactors({
      accounts: [{ accountId: 'c1', mfaRequired: false, userType: 'customer' }],
      factorsByAccount: new Map([['c1', [totp('attacker-factor', T0)]]]),
      enrolmentEventsByAccount: new Map(),
    });
    expect(findings).toEqual([
      {
        kind: 'verified_factor_without_backend_enrolment',
        accountId: 'c1',
        userType: 'customer',
        factorId: 'attacker-factor',
        factorCreatedAt: T0.toISOString(),
      },
    ]);
  });

  it('an event outside the enrolment window does not vouch for the factor', () => {
    const findings = reconcileMfaFactors({
      accounts: [{ accountId: 'c1', mfaRequired: false, userType: 'customer' }],
      factorsByAccount: new Map([['c1', [totp('f1', T0)]]]),
      enrolmentEventsByAccount: new Map([['c1', [plus(T0, ENROLLMENT_TICKET_TTL_SECONDS + 3600)]]]),
    });
    expect(findings.map((f) => f.kind)).toEqual(['verified_factor_without_backend_enrolment']);
  });

  it('one legitimate event cannot vouch for two factors (attacker factor enrolled right after the real one)', () => {
    const findings = reconcileMfaFactors({
      accounts: [{ accountId: 'c1', mfaRequired: false, userType: 'customer' }],
      factorsByAccount: new Map([['c1', [totp('real', T0), totp('attacker', plus(T0, 30))]]]),
      enrolmentEventsByAccount: new Map([['c1', [plus(T0, 40)]]]),
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ kind: 'verified_factor_without_backend_enrolment', factorId: 'attacker' });
  });

  it('unverified factors are ignored (harmless — cannot gate login)', () => {
    const findings = reconcileMfaFactors({
      accounts: [{ accountId: 'c1', mfaRequired: false, userType: 'customer' }],
      factorsByAccount: new Map([['c1', [totp('pending', T0, 'unverified')]]]),
      enrolmentEventsByAccount: new Map(),
    });
    expect(findings).toEqual([]);
  });

  it('SR-14(b): an mfa_required account with no verified factor is flagged', () => {
    const findings = reconcileMfaFactors({
      accounts: [{ accountId: 's1', mfaRequired: true, userType: 'support_agent' }],
      factorsByAccount: new Map([['s1', [totp('pending', T0, 'unverified')]]]),
      enrolmentEventsByAccount: new Map(),
    });
    expect(findings).toEqual([
      { kind: 'mfa_required_without_verified_factor', accountId: 's1', userType: 'support_agent' },
    ]);
  });
});
