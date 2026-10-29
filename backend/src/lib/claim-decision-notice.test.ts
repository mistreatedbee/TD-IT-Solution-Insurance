/**
 * security-review.md §12.3 (SR-018-6 compliance ruling) — the claim
 * decision-notice builder. Pure-function unit coverage, independent of the
 * route-level coverage in `routes/admin-claims.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import type { Env } from '../config/env.js';
import {
  appendMoreInfoBoilerplate,
  buildAdministrativeCloseNotice,
  buildPartialApprovalShortfallNotice,
  buildRejectionNotice,
  CLAIM_ADMIN_CLOSE_GROUNDS,
  CLAIM_DECISION_NOTICE_TEMPLATE_VERSION,
  CLAIM_REJECTION_GROUND_CODES,
  ClaimDecisionNoticeConfigError,
  isClaimAdminCloseGround,
  isClaimRejectionGroundCode,
} from './claim-decision-notice.js';

const COMPLETE_CONFIG: Env['claimsNotice'] = {
  internalComplaintsContact: 'complaints@test.example',
  nfoContactName: 'Test NFO',
  nfoWebsite: 'https://nfo.test.example',
  nfoPhone: '0000000000',
  nfoEmail: 'nfo@test.example',
  faisOmbudContactName: 'Test FAIS Ombud',
  faisOmbudWebsite: 'https://fais.test.example',
  faisOmbudPhone: '0000000001',
  faisOmbudEmail: 'fais@test.example',
  insurerLegalName: 'Test Insurer (Pty) Ltd',
  insurerLicenceNumber: 'TEST-LIC-0001',
  insurerFspNumber: 'TEST-FSP-0001',
};

function fakeEnv(claimsNotice?: Env['claimsNotice']): Env {
  return {
    nodeEnv: 'test',
    isProduction: false,
    port: 0,
    mongodbUri: 'mongodb://unused',
    supabaseUrl: 'https://unused.supabase.co',
    supabaseServiceRoleKey: 'unused',
    supabaseDbUrl: 'postgres://unused',
    supabaseDbCaCertPath: undefined,
    redisUrl: undefined,
    jwtSigningKeys: [{ kid: 'test-kid', secret: 'x'.repeat(32) }],
    jwtActiveKid: 'test-kid',
    internalServiceCredentials: [],
    trustProxyHops: 0,
    corsAllowedOrigins: [],
    emailVerificationRedirectUrl: 'tditinsurance://verify-email',
    passwordResetRedirectUrl: 'tditinsurance://reset-password',
    invitationAcceptRedirectUrl: 'tditinsurance://invitations/accept',
    claimsNotice,
  };
}

describe('ground codes / close grounds', () => {
  it('exposes the v1 rejection ground codes and type guard', () => {
    expect(CLAIM_REJECTION_GROUND_CODES).toContain('LOSS_OUTSIDE_PERIOD_OF_COVER');
    expect(CLAIM_REJECTION_GROUND_CODES).toContain('QUANTUM_DISPUTED');
    expect(CLAIM_REJECTION_GROUND_CODES).toContain('OTHER');
    expect(isClaimRejectionGroundCode('OTHER')).toBe(true);
    expect(isClaimRejectionGroundCode('MADE_UP')).toBe(false);
  });

  it('exposes a narrower, non-merits-only set of admin close grounds', () => {
    expect(CLAIM_ADMIN_CLOSE_GROUNDS).toEqual([
      'DUPLICATE_CLAIM',
      'FILED_IN_ERROR_CONFIRMED_BY_CUSTOMER',
      'WITHDRAWN_AT_CUSTOMER_REQUEST',
    ]);
    expect(isClaimAdminCloseGround('DUPLICATE_CLAIM')).toBe(true);
    // merits-based grounds must NOT appear in the close-ground set.
    expect(isClaimAdminCloseGround('INSUFFICIENT_EVIDENCE_OF_LOSS')).toBe(false);
    expect(isClaimAdminCloseGround('QUANTUM_DISPUTED')).toBe(false);
  });
});

describe('buildRejectionNotice', () => {
  const baseInput = {
    claimId: '507f1f77bcf86cd799439055',
    assetDisplayName: 'Work laptop',
    submittedAt: new Date('2026-09-01T00:00:00.000Z'),
    decidedAt: new Date('2026-10-01T00:00:00.000Z'),
    claimedAmount: 1000,
    claimedAmountCurrency: 'ZAR',
    groundCode: 'INSUFFICIENT_EVIDENCE_OF_LOSS' as const,
    adminReason: 'No photographic evidence was provided.',
  };

  it('composes a notice with every §12.3 N-2 required element', () => {
    const notice = buildRejectionNotice({ ...baseInput, env: fakeEnv(COMPLETE_CONFIG) });
    expect(notice.kind).toBe('rejection');
    expect(notice.templateVersion).toBe(CLAIM_DECISION_NOTICE_TEMPLATE_VERSION);
    expect(notice.groundCode).toBe('INSUFFICIENT_EVIDENCE_OF_LOSS');
    expect(notice.issuedAt).toBeTruthy();
    expect(notice.deliveries).toEqual([]);

    const text = notice.renderedText;
    // 1. decision + date
    expect(text).toContain('REJECTED');
    expect(text).toContain('2026-10-01');
    // 2. ground + admin reason (+ clause, when supplied)
    expect(text).toContain('INSUFFICIENT_EVIDENCE_OF_LOSS');
    expect(text).toContain('No photographic evidence was provided.');
    // 3. 90-day representation right
    expect(text).toMatch(/90 days/);
    // 4. internal complaints contact
    expect(text).toContain('complaints@test.example');
    // 5. NFO + FAIS Ombud contacts
    expect(text).toContain('Test NFO');
    expect(text).toContain('https://nfo.test.example');
    expect(text).toContain('Test FAIS Ombud');
    // 7. re-filing
    expect(text).toMatch(/file a new claim/);
    // 8. insurer identity + licence/FSP numbers
    expect(text).toContain('Test Insurer (Pty) Ltd');
    expect(text).toContain('TEST-LIC-0001');
    expect(text).toContain('TEST-FSP-0001');
  });

  it('includes the policy clause reference when supplied, omits it when not', () => {
    const withClause = buildRejectionNotice({
      ...baseInput,
      env: fakeEnv(COMPLETE_CONFIG),
      policyClauseReference: 'Clause 7.2',
    });
    expect(withClause.renderedText).toContain('Clause 7.2');

    const withoutClause = buildRejectionNotice({ ...baseInput, env: fakeEnv(COMPLETE_CONFIG) });
    expect(withoutClause.renderedText).not.toContain('Clause 7.2');
  });

  it('includes the legal-action time limit (and that the 90 days does not count against it) only when the policy states one', () => {
    const withLimit = buildRejectionNotice({
      ...baseInput,
      env: fakeEnv(COMPLETE_CONFIG),
      legalActionTimeLimit: '180 days from the date of this notice',
    });
    expect(withLimit.renderedText).toContain('180 days from the date of this notice');
    expect(withLimit.renderedText).toContain('does not count against this time limit');

    const withoutLimit = buildRejectionNotice({ ...baseInput, env: fakeEnv(COMPLETE_CONFIG) });
    expect(withoutLimit.renderedText).not.toContain('does not count against this time limit');
  });

  it('never mentions fraud-flag names or heuristics', () => {
    const notice = buildRejectionNotice({ ...baseInput, env: fakeEnv(COMPLETE_CONFIG) });
    expect(notice.renderedText).not.toMatch(/FLAG_/);
  });

  it('throws ClaimDecisionNoticeConfigError and never returns a notice when claimsNotice is entirely unset', () => {
    expect(() => buildRejectionNotice({ ...baseInput, env: fakeEnv(undefined) })).toThrow(
      ClaimDecisionNoticeConfigError,
    );
  });

  it('throws when a single required config field is blank, even if every other field is set', () => {
    const almostComplete = { ...COMPLETE_CONFIG, nfoEmail: '   ' };
    expect(() => buildRejectionNotice({ ...baseInput, env: fakeEnv(almostComplete) })).toThrow(
      ClaimDecisionNoticeConfigError,
    );
  });

  // SR-018-11 / CR-018-10: `config/env.ts`'s `loadEnv()` substitutes a
  // `TODO_OWNER_MUST_CONFIGURE: ...` placeholder for an unset claims-notice
  // var — non-blank in form, but blank in substance. A rejection notice must
  // never be issued, and the claim's status/audit trail must never be
  // mutated, while even one field is still a placeholder.
  it('treats a TODO_OWNER_MUST_CONFIGURE placeholder value the same as blank — no notice is composed', () => {
    const withPlaceholder = {
      ...COMPLETE_CONFIG,
      insurerLicenceNumber: 'TODO_OWNER_MUST_CONFIGURE: the insurer licence number not yet configured (CLAIMS_NOTICE_INSURER_LICENCE_NUMBER)',
    };
    expect(() => buildRejectionNotice({ ...baseInput, env: fakeEnv(withPlaceholder) })).toThrow(
      ClaimDecisionNoticeConfigError,
    );
  });

  it('rejects a placeholder value even without the full "not yet configured" wording, as long as it starts with the sentinel', () => {
    const withPlaceholder = { ...COMPLETE_CONFIG, nfoEmail: 'TODO_OWNER_MUST_CONFIGURE' };
    expect(() => buildRejectionNotice({ ...baseInput, env: fakeEnv(withPlaceholder) })).toThrow(
      ClaimDecisionNoticeConfigError,
    );
  });
});

describe('buildPartialApprovalShortfallNotice', () => {
  it('is always QUANTUM_DISPUTED and states the claimed/approved/shortfall amounts', () => {
    const notice = buildPartialApprovalShortfallNotice({
      env: fakeEnv(COMPLETE_CONFIG),
      claimId: '507f1f77bcf86cd799439055',
      assetDisplayName: 'Work laptop',
      submittedAt: new Date('2026-09-01T00:00:00.000Z'),
      decidedAt: new Date('2026-10-01T00:00:00.000Z'),
      claimedAmount: 1000,
      approvedAmount: 600,
      currency: 'ZAR',
      quantumReason: 'Depreciated value was lower than claimed.',
    });
    expect(notice.kind).toBe('partial_approval_shortfall');
    expect(notice.groundCode).toBe('QUANTUM_DISPUTED');
    expect(notice.renderedText).toContain('1000.00');
    expect(notice.renderedText).toContain('600.00');
    expect(notice.renderedText).toContain('400.00'); // shortfall
    expect(notice.renderedText).toContain('Depreciated value was lower than claimed.');
    expect(notice.renderedText).toMatch(/90 days/);
  });
});

describe('buildAdministrativeCloseNotice', () => {
  it('states this is not a merits decision, how to re-file, and the internal/NFO contacts', () => {
    const notice = buildAdministrativeCloseNotice({
      env: fakeEnv(COMPLETE_CONFIG),
      claimId: '507f1f77bcf86cd799439055',
      assetDisplayName: 'Work laptop',
      submittedAt: new Date('2026-09-01T00:00:00.000Z'),
      decidedAt: new Date('2026-10-01T00:00:00.000Z'),
      closeGround: 'DUPLICATE_CLAIM',
      adminReason: 'Duplicate of another open claim.',
      survivingClaimId: '507f1f77bcf86cd799439077',
    });
    expect(notice.kind).toBe('administrative_close');
    expect(notice.groundCode).toBe('DUPLICATE_CLAIM');
    expect(notice.renderedText).toContain('507f1f77bcf86cd799439077');
    expect(notice.renderedText).toMatch(/not.*decision on whether your claim is covered/i);
    expect(notice.renderedText).toMatch(/file a new claim/i);
    expect(notice.renderedText).toContain('complaints@test.example');
    expect(notice.renderedText).toContain('Test NFO');
  });

  it('omits the surviving-claim line for a non-DUPLICATE_CLAIM ground', () => {
    const notice = buildAdministrativeCloseNotice({
      env: fakeEnv(COMPLETE_CONFIG),
      claimId: '507f1f77bcf86cd799439055',
      assetDisplayName: 'Work laptop',
      submittedAt: new Date('2026-09-01T00:00:00.000Z'),
      decidedAt: new Date('2026-10-01T00:00:00.000Z'),
      closeGround: 'WITHDRAWN_AT_CUSTOMER_REQUEST',
      adminReason: 'Customer asked us to close this by phone.',
    });
    expect(notice.renderedText).not.toContain('Related open claim reference');
  });
});

describe('appendMoreInfoBoilerplate', () => {
  it('keeps the admin text and appends fixed "stays open" / "no rejection without further notice" boilerplate', () => {
    const rendered = appendMoreInfoBoilerplate('Please send a copy of the police case report.');
    expect(rendered).toContain('Please send a copy of the police case report.');
    expect(rendered).toMatch(/remains open/i);
    expect(rendered).toMatch(/will NOT be rejected/);
    expect(rendered).toMatch(/further written notice/);
  });
});
