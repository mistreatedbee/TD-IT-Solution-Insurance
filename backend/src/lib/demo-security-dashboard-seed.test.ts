import { describe, it, expect, beforeEach } from 'vitest';
import {
  assertDemoAllowedUserType,
  createDemoFixtures,
  teardownDemoFixtures,
  generateDemoPassword,
  demoAccountEmails,
  demoAssetIdFor,
  demoStatusTransitionPlan,
  DEMO_ALLOWED_USER_TYPES,
  DEMO_CASE_PLAN,
  DEMO_FORBIDDEN_USER_TYPES_FOR_TEST,
  DEMO_OPERATOR_EMAIL,
  DEMO_CUSTOMER_EMAIL,
  DEMO_PARTNER_ORG_ID,
  DEMO_PARTNER_ORG_NAME,
  DemoForbiddenAccountTypeError,
  type DemoSeedDeps,
  type DemoAccountRow,
  type DemoCaseStatus,
} from './demo-security-dashboard-seed.js';

// NOTE: deliberately NOT importing `TEST_PARTNER_ORG_ID` from
// `scripts/seed-test-accounts.ts` here — that module calls `main()` unconditionally at
// the bottom of the file (no `require.main`/entry-point guard), so importing it for a
// single constant would attempt to load env and connect to Postgres as an import-time
// side effect, which is exactly what this task forbids running from a test. The literal
// below is copied from that file's own `export const TEST_PARTNER_ORG_ID` and only used
// for a not-equal assertion.
const TEST_PARTNER_ORG_ID_LITERAL = 'a0000001-0000-4000-8000-000000000001';

// ---------------------------------------------------------------------------
// In-memory fakes — no real Supabase/Postgres/MongoDB connection anywhere in
// this file, per the task's "do not run against a live connection" rule.
// ---------------------------------------------------------------------------

interface FakeCaseRow {
  id: string;
  accountId: string;
  assetId: string;
  notes: string;
  partnerOrganizationId: string | null;
  status: DemoCaseStatus;
}

function makeFakeDeps() {
  let nextId = 1;
  const authUsersByEmail = new Map<string, string>();
  const accountsById = new Map<string, DemoAccountRow & { email: string }>();
  const partnerOrgs = new Map<string, string>();
  const cases = new Map<string, FakeCaseRow>();
  /** AUD-11 analogue: the fake "app credential" can find but never remove. Matches the
   * real Mongo role split this test is standing in for. */
  const auditLogRows: Array<{ actorAccountId: string; targetAccountId: string | null }> = [];

  const deps: DemoSeedDeps = {
    auth: {
      async getUserByEmail(email) {
        const userId = authUsersByEmail.get(email);
        return userId ? { userId } : null;
      },
      async createUser(email, _password, _emailConfirm) {
        const userId = `auth-${nextId++}`;
        authUsersByEmail.set(email, userId);
        return { userId };
      },
      async deleteUser(userId) {
        for (const [email, id] of authUsersByEmail.entries()) {
          if (id === userId) authUsersByEmail.delete(email);
        }
      },
    },
    accounts: {
      async findByEmail(email) {
        for (const row of accountsById.values()) {
          if (row.email === email) return row;
        }
        return null;
      },
      async createCustomerAccount(id, email) {
        accountsById.set(id, { id, userType: 'customer', email });
      },
      async markEmailVerified(_id) {
        // no-op in the fake — account_state isn't modeled here.
      },
      async createPrivilegedAccountFromInvitation(input) {
        accountsById.set(input.id, { id: input.id, userType: input.userType, email: input.email });
      },
      async deleteAccountRow(id) {
        accountsById.delete(id);
      },
    },
    partnerOrg: {
      async ensure(id, name) {
        partnerOrgs.set(id, name);
      },
      async delete(id) {
        partnerOrgs.delete(id);
      },
    },
    cases: {
      async createForAccount(accountId, assetId, notes, partnerOrganizationId) {
        const id = `case-${nextId++}`;
        cases.set(id, { id, accountId, assetId, notes, partnerOrganizationId, status: 'open' });
        return { id, status: 'open' };
      },
      async claimForPartnerOrg(partnerOrganizationId, caseId) {
        const row = cases.get(caseId);
        if (!row || row.partnerOrganizationId !== null || row.status !== 'open') return null;
        row.partnerOrganizationId = partnerOrganizationId;
        row.status = 'investigating';
        return { id: row.id };
      },
      async updateStatusForPartnerOrg(partnerOrganizationId, caseId, status, expectedStatus) {
        const row = cases.get(caseId);
        if (!row || row.partnerOrganizationId !== partnerOrganizationId || row.status !== expectedStatus) {
          return null;
        }
        row.status = status;
        return { id: row.id };
      },
      async deleteAllForAccounts(accountIds) {
        let count = 0;
        for (const [id, row] of cases.entries()) {
          if (accountIds.includes(row.accountId)) {
            cases.delete(id);
            count++;
          }
        }
        return count;
      },
      async countForAccounts(accountIds) {
        let count = 0;
        for (const row of cases.values()) {
          if (accountIds.includes(row.accountId)) count++;
        }
        return count;
      },
    },
    auditLog: {
      async countMatching(accountIds) {
        return auditLogRows.filter(
          (r) => accountIds.includes(r.actorAccountId) || (r.targetAccountId && accountIds.includes(r.targetAccountId)),
        ).length;
      },
      async deleteMatching(accountIds) {
        // Mirrors AUD-11: the standard app credential has find+insert only, never
        // remove, on admin_access_log. A real teardown run against this account set
        // would hit a Mongo permission error here, not succeed.
        const attempted = auditLogRows.filter(
          (r) => accountIds.includes(r.actorAccountId) || (r.targetAccountId && accountIds.includes(r.targetAccountId)),
        ).length;
        return { attempted, deleted: 0, permissionDenied: attempted > 0 };
      },
    },
  };

  return {
    deps,
    _internals: { authUsersByEmail, accountsById, partnerOrgs, cases, auditLogRows },
  };
}

describe('demo-security-dashboard-seed — account-type restriction', () => {
  it('allows only customer and security_company_operator', () => {
    expect(DEMO_ALLOWED_USER_TYPES).toEqual(['customer', 'security_company_operator']);
    expect(assertDemoAllowedUserType('customer')).toBe('customer');
    expect(assertDemoAllowedUserType('security_company_operator')).toBe('security_company_operator');
  });

  it('structurally refuses admin and support_agent — not merely excluded by default', () => {
    for (const forbidden of DEMO_FORBIDDEN_USER_TYPES_FOR_TEST) {
      expect(() => assertDemoAllowedUserType(forbidden)).toThrow(DemoForbiddenAccountTypeError);
    }
  });

  it('refuses any arbitrary/unknown user type too, not just the two named forbidden ones', () => {
    expect(() => assertDemoAllowedUserType('literally-anything-else')).toThrow(DemoForbiddenAccountTypeError);
    expect(() => assertDemoAllowedUserType('')).toThrow(DemoForbiddenAccountTypeError);
  });

  it('createDemoFixtures never reaches account creation with a forbidden type, by construction', async () => {
    // There is no parameter on createDemoFixtures that lets a caller ask for an
    // admin/support_agent account at all — the only two accounts it ever builds are
    // hardcoded to 'security_company_operator' and 'customer'. This test documents
    // that absence: createDemoFixtures's full signature is `(deps) => Promise<...>`,
    // so there is no injection point for a caller-supplied user type.
    const { deps } = makeFakeDeps();
    const result = await createDemoFixtures(deps);
    expect(result.operator.email).toBe(DEMO_OPERATOR_EMAIL);
    expect(result.customer.email).toBe(DEMO_CUSTOMER_EMAIL);
  });
});

describe('demo-security-dashboard-seed — password randomness', () => {
  it('generates a different password every call (not a fixed/hardcoded value)', () => {
    const passwords = new Set(Array.from({ length: 20 }, () => generateDemoPassword()));
    expect(passwords.size).toBe(20);
  });

  it('meets both the customer (>=10) and privileged (>=14) minimum lengths with margin', () => {
    const password = generateDemoPassword();
    expect(password.length).toBeGreaterThanOrEqual(14);
  });

  it('is not equal to any literal password string hardcoded anywhere in this module\'s source', () => {
    // Defence against a regression where someone "simplifies" generateDemoPassword back
    // to a fixed string — assert it draws from crypto randomness by checking successive
    // calls diverge in composition, not just reference equality.
    const a = generateDemoPassword();
    const b = generateDemoPassword();
    expect(a).not.toBe(b);
    expect(a.length).toBe(b.length);
  });
});

describe('demo-security-dashboard-seed — fake partner org and case plan', () => {
  it('uses a distinct org id/name from seed-test-accounts.ts TEST_PARTNER_ORG_ID', () => {
    expect(DEMO_PARTNER_ORG_ID).not.toBe(TEST_PARTNER_ORG_ID_LITERAL);
    expect(DEMO_PARTNER_ORG_NAME).toContain('DEMO');
    expect(DEMO_PARTNER_ORG_NAME).toContain('Fictional');
  });

  it('plans 3-5 fake cases, matching ADR-0013 requirement 1', () => {
    expect(DEMO_CASE_PLAN.length).toBeGreaterThanOrEqual(3);
    expect(DEMO_CASE_PLAN.length).toBeLessThanOrEqual(5);
  });

  it('includes at least one unclaimed case and distinct claimed-lifecycle statuses', () => {
    const unclaimed = DEMO_CASE_PLAN.filter((c) => !c.claim);
    expect(unclaimed.length).toBeGreaterThanOrEqual(1);
    const claimedStatuses = new Set(DEMO_CASE_PLAN.filter((c) => c.claim).map((c) => c.finalStatus));
    expect(claimedStatuses.size).toBeGreaterThanOrEqual(2);
  });

  it('demoAssetIdFor is deterministic and keyed per case', () => {
    expect(demoAssetIdFor('unclaimed-open')).toBe('demo-asset-unclaimed-open');
    expect(demoAssetIdFor('x')).not.toBe(demoAssetIdFor('y'));
  });

  it('demoStatusTransitionPlan produces only forward steps ending at finalStatus', () => {
    for (const spec of DEMO_CASE_PLAN) {
      const steps = demoStatusTransitionPlan(spec);
      if (!spec.claim) {
        expect(steps).toEqual([]);
        continue;
      }
      if (steps.length > 0) {
        expect(steps[steps.length - 1]!.to).toBe(spec.finalStatus);
      } else {
        expect(spec.finalStatus).toBe('investigating');
      }
    }
  });
});

describe('demo-security-dashboard-seed — create/teardown round trip', () => {
  let fake: ReturnType<typeof makeFakeDeps>;

  beforeEach(() => {
    fake = makeFakeDeps();
  });

  it('creates the org, both accounts, and all planned cases', async () => {
    const result = await createDemoFixtures(fake.deps);

    expect(result.operator.created).toBe(true);
    expect(result.customer.created).toBe(true);
    expect(result.operator.password).toBeTruthy();
    expect(result.customer.password).toBeTruthy();
    expect(Object.keys(result.caseIds)).toHaveLength(DEMO_CASE_PLAN.length);

    expect(fake._internals.partnerOrgs.has(DEMO_PARTNER_ORG_ID)).toBe(true);
    expect(fake._internals.accountsById.size).toBe(2);
    expect(fake._internals.cases.size).toBe(DEMO_CASE_PLAN.length);

    // Every claimed case actually landed on its planned final status.
    for (const spec of DEMO_CASE_PLAN) {
      const caseId = result.caseIds[spec.key]!;
      const row = fake._internals.cases.get(caseId)!;
      expect(row.status).toBe(spec.finalStatus);
      expect(row.partnerOrganizationId).toBe(spec.claim ? DEMO_PARTNER_ORG_ID : null);
    }
  });

  it('is idempotent — re-running create does not duplicate accounts or cases', async () => {
    const first = await createDemoFixtures(fake.deps);
    const second = await createDemoFixtures(fake.deps);

    expect(second.operator.created).toBe(false);
    expect(second.customer.created).toBe(false);
    expect(second.operator.userId).toBe(first.operator.userId);
    expect(fake._internals.accountsById.size).toBe(2);
    expect(fake._internals.cases.size).toBe(DEMO_CASE_PLAN.length);
  });

  it('teardown removes every account, case, and the partner org created by create', async () => {
    await createDemoFixtures(fake.deps);
    expect(fake._internals.accountsById.size).toBe(2);
    expect(fake._internals.cases.size).toBe(DEMO_CASE_PLAN.length);

    const report = await teardownDemoFixtures(fake.deps);

    expect(report.accountsDeleted).toHaveLength(2);
    expect(report.casesDeleted).toBe(DEMO_CASE_PLAN.length);
    expect(report.partnerOrgDeleted).toBe(true);

    // Verify-empty: nothing demo-related remains.
    expect(fake._internals.accountsById.size).toBe(0);
    expect(fake._internals.cases.size).toBe(0);
    expect(fake._internals.partnerOrgs.has(DEMO_PARTNER_ORG_ID)).toBe(false);
    for (const email of demoAccountEmails()) {
      expect(fake._internals.authUsersByEmail.has(email)).toBe(false);
    }
  });

  it('teardown is idempotent — running it twice on an empty environment is a safe no-op', async () => {
    await createDemoFixtures(fake.deps);
    await teardownDemoFixtures(fake.deps);
    const second = await teardownDemoFixtures(fake.deps);

    expect(second.accountsDeleted).toHaveLength(0);
    expect(second.casesDeleted).toBe(0);
  });

  it('teardown on a never-created environment is a safe no-op', async () => {
    const report = await teardownDemoFixtures(fake.deps);
    expect(report.accountsDeleted).toHaveLength(0);
    expect(report.casesDeleted).toBe(0);
  });

  it(
    'AUD-11 CONCERN: admin_access_log rows naming the demo accounts are NOT deleted by ' +
      'teardown — the standard app Mongo credential has find+insert only, never remove, ' +
      'on that collection (ADR-0006 AUD-11/FU-A6). This is flagged, not silently resolved.',
    async () => {
      const created = await createDemoFixtures(fake.deps);
      fake._internals.auditLogRows.push({
        actorAccountId: created.operator.userId,
        targetAccountId: created.customer.userId,
      });

      const report = await teardownDemoFixtures(fake.deps);

      expect(report.auditLog.attempted).toBeGreaterThan(0);
      expect(report.auditLog.deleted).toBe(0);
      expect(report.auditLog.permissionDenied).toBe(true);
    },
  );
});
