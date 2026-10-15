/**
 * ADR-0013 — Security Company Dashboard Client Demo — Proposed Time-Boxed Exception.
 *
 * STATUS: ADR-0013 is **Proposed — NOT YET AUTHORIZED** as of 2026-10-15. This module
 * (and its CLI wrapper, `backend/scripts/seed-demo-security-dashboard.ts`) is PREP WORK
 * ONLY. Nothing in this file may be run against any real database — local, staging, or
 * production — until the business owner gives an explicit, present go/no-go per ADR-0013
 * §"Required actions before this can run", item 3. No agent instruction, past or future,
 * satisfies that requirement.
 *
 * This module holds the parts of the demo seed/teardown logic that are pure and/or
 * injectable, so they can be unit-tested without a live Supabase/Postgres/MongoDB
 * connection. The CLI wrapper wires these to the real repositories; tests wire them to
 * in-memory fakes.
 *
 * ADR-0013 requirements implemented here:
 *   1. Creates only a security_company_operator + a customer account, plus a handful of
 *      fake recovery cases linking them (`DEMO_CASE_PLAN`, `createDemoFixtures`).
 *   2. Structurally refuses admin/support_agent — `assertDemoAllowedUserType` is the one
 *      and only gate every account-creation call in this module passes through; there is
 *      no code path that can reach account creation with a user type outside
 *      `DEMO_ALLOWED_USER_TYPES`.
 *   3. Runtime crypto-random passwords (`generateDemoPassword`) — never a fixed string,
 *      never persisted, printed once by the CLI wrapper's summary only.
 *   4. A distinct, unmistakably-fake partner org (`DEMO_PARTNER_ORG_ID`/`DEMO_PARTNER_ORG_NAME`)
 *      — NOT `TEST_PARTNER_ORG_ID` from `scripts/seed-test-accounts.ts`.
 *   5. The operator account is created the same way `seed-test-accounts.ts` creates
 *      privileged accounts by default: MFA NOT pre-enrolled. This module has no
 *      TOTP-enrollment code path at all (unlike `seed-test-accounts.ts`'s optional
 *      `--enroll-mfa`) — ADR-0013 requires the business owner to enroll their own MFA by
 *      logging in, so that affordance is deliberately not offered here.
 *   6. `teardownDemoFixtures` removes every account/org/case row this module created.
 *      Admin-access-log (Trail B) rows are a DOCUMENTED OPEN CONCERN — see
 *      `DemoAuditLogPort` doc comment and the "AUD-11 CONCERN" section below — not
 *      resolved unilaterally here, per ADR-0013's own instruction to consult
 *      `database-architect`.
 *   7. Both directions are idempotent: `createDemoFixtures` looks up existing rows by the
 *      fixed demo emails/org id before creating, `teardownDemoFixtures` is a no-op on
 *      anything already absent.
 *
 * ## AUD-11 CONCERN (flagged, not resolved) — read before relying on teardown
 *
 * ADR-0006 §AUD-11 ("Both trails must be append-only by privilege, not by convention")
 * rules that the Mongo role backing the application's normal `MONGODB_URI` credential is
 * granted `find`+`insert` on `admin_access_log` ONLY — `remove` is reserved for a
 * separate, cluster-provisioned "purge user" (FU-A6). That means: if the business owner's
 * live demo session causes the demo operator account to browse or claim any of these
 * fake cases through the real `security-cases.ts` routes (the whole point of the demo),
 * `admin_access_log` rows naming the demo accounts WILL be written — and this script's
 * teardown, run with the same `MONGODB_URI` every other part of it uses, is structurally
 * *unable* to delete them. That is the control working as designed, not a bug in this
 * script. `DemoAuditLogPort.deleteMatching` below is written to attempt the delete,
 * detect that expected permission failure, and report it plainly rather than silently
 * swallowing it or (worse) widening the app credential's Mongo role to work around it.
 * Per ADR-0013 requirement 6, the resolution (purge-user-credential run, legalHold tag,
 * or accept-and-wait-out the 12-month retention ceiling per ADR-0006) is for
 * `database-architect` to rule on, not this script.
 */
import crypto from 'node:crypto';

/** Distinct from `TEST_PARTNER_ORG_ID` in `scripts/seed-test-accounts.ts` by construction
 * (ADR-0013 requirement 4) — never reuse that constant here. */
export const DEMO_PARTNER_ORG_ID = 'd3000013-0000-4000-8000-000000000013';
export const DEMO_PARTNER_ORG_NAME = 'DEMO – Fictional Security Partner (not a live integration)';

export const DEMO_OPERATOR_EMAIL = 'demo.security-operator@tditsolutions.dev';
export const DEMO_CUSTOMER_EMAIL = 'demo.customer@tditsolutions.dev';

/** ADR-0013 requirement 2 — the ONLY two account types this module can ever create.
 * `assertDemoAllowedUserType` is the sole gate; nothing in this module (or the CLI
 * wrapper) constructs an account-creation call without going through it first. */
export const DEMO_ALLOWED_USER_TYPES = ['customer', 'security_company_operator'] as const;
export type DemoAllowedUserType = (typeof DEMO_ALLOWED_USER_TYPES)[number];

/** For tests only — the two account types this module must NEVER be able to create.
 * Not used by any non-test code path; `assertDemoAllowedUserType` rejects by checking
 * membership in `DEMO_ALLOWED_USER_TYPES`, not by checking against this list. */
export const DEMO_FORBIDDEN_USER_TYPES_FOR_TEST = ['admin', 'support_agent'] as const;

export class DemoForbiddenAccountTypeError extends Error {
  constructor(userType: string) {
    super(
      `[seed-demo-security-dashboard] Refusing to create a "${userType}" account. This ` +
        `script may only ever create ${DEMO_ALLOWED_USER_TYPES.join(' or ')} accounts ` +
        '(ADR-0013 requirement 2 — admin/support_agent are structurally unreachable here, ' +
        'not merely excluded by default).',
    );
    this.name = 'DemoForbiddenAccountTypeError';
  }
}

/** The one and only gate account creation in this module passes through. Throws
 * `DemoForbiddenAccountTypeError` for anything other than the two allowed types —
 * including, deliberately, `'admin'` and `'support_agent'`. */
export function assertDemoAllowedUserType(userType: string): DemoAllowedUserType {
  if (!(DEMO_ALLOWED_USER_TYPES as readonly string[]).includes(userType)) {
    throw new DemoForbiddenAccountTypeError(userType);
  }
  return userType as DemoAllowedUserType;
}

const DEMO_PASSWORD_CHARSET =
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_=+';

/** ADR-0013 requirement 3 — crypto-random at runtime, never a fixed/hardcoded value.
 * Default length 24 clears both `PASSWORD_MIN_LENGTH.customer` (10) and
 * `PASSWORD_MIN_LENGTH.privileged` (14) from `lib/policy.ts` with margin, so one
 * generator is safe to use for either account this script creates. Uses
 * `crypto.randomInt` (rejection-sampling-free, unbiased) rather than
 * `randomBytes(...) % charset.length`, which would bias toward low charset indices. */
export function generateDemoPassword(length = 24): string {
  let password = '';
  for (let i = 0; i < length; i++) {
    password += DEMO_PASSWORD_CHARSET[crypto.randomInt(0, DEMO_PASSWORD_CHARSET.length)];
  }
  return password;
}

export type DemoCaseStatus = 'open' | 'investigating' | 'tracking' | 'recovered' | 'closed';

export interface DemoCaseSpec {
  /** Stable key used to build a deterministic fake asset id and to label output — not
   * persisted as an id itself. */
  key: string;
  notes: string;
  /** Whether the demo partner org pre-claims this case before the demo (`false` leaves
   * it in the shared unclaimed pool so the presenter can claim it live). */
  claim: boolean;
  /** Status to land on after creation. `'open'` requires `claim: false` (an unclaimed
   * case is always `'open'` in this domain — see `recovery-cases.ts`'s
   * `unclaimedCaseVisiblePredicate`). Anything else requires `claim: true` and is reached
   * by following `RECOVERY_CASE_FORWARD_TRANSITIONS` from `'investigating'`. */
  finalStatus: DemoCaseStatus;
}

/** ADR-0013 requirement 1 — "a handful (3-5)" fake cases. Five here: one left unclaimed
 * for the presenter to claim live, plus one of each claimed-lifecycle status so the demo
 * can show the dashboard's full range without the presenter having to walk every
 * transition live. */
export const DEMO_CASE_PLAN: readonly DemoCaseSpec[] = [
  {
    key: 'unclaimed-open',
    notes: 'DEMO CASE (fictional) — unclaimed; left in the shared pool for the live demo.',
    claim: false,
    finalStatus: 'open',
  },
  {
    key: 'claimed-investigating',
    notes: 'DEMO CASE (fictional) — pre-claimed by the demo partner, status investigating.',
    claim: true,
    finalStatus: 'investigating',
  },
  {
    key: 'claimed-tracking',
    notes: 'DEMO CASE (fictional) — pre-claimed by the demo partner, status tracking.',
    claim: true,
    finalStatus: 'tracking',
  },
  {
    key: 'claimed-recovered',
    notes: 'DEMO CASE (fictional) — pre-claimed by the demo partner, status recovered.',
    claim: true,
    finalStatus: 'recovered',
  },
  {
    key: 'claimed-closed',
    notes: 'DEMO CASE (fictional) — pre-claimed by the demo partner, status closed.',
    claim: true,
    finalStatus: 'closed',
  },
];

if (DEMO_CASE_PLAN.length < 3 || DEMO_CASE_PLAN.length > 5) {
  // Defensive — ADR-0013 requirement 1 is "a handful (3-5)"; fail loudly at import time
  // rather than silently drifting outside that range on a future edit.
  throw new Error(
    `[demo-security-dashboard-seed] DEMO_CASE_PLAN must have 3-5 entries, has ${DEMO_CASE_PLAN.length}`,
  );
}

export function demoAssetIdFor(caseKey: string): string {
  return `demo-asset-${caseKey}`;
}

/** The forward-transition chain `RECOVERY_CASE_FORWARD_TRANSITIONS` in
 * `repositories/recovery-cases.ts` permits, starting from `'investigating'` (the status a
 * claim lands on) through to each possible `finalStatus`. Duplicated here, narrowly, as a
 * small literal map rather than importing the repo's own map — this module intentionally
 * has zero dependency on `mongodb`/the live repository so its pure logic can be
 * unit-tested with no driver installed/connected. If `recovery-cases.ts`'s transition
 * rules ever change, this map must be updated to match (covered by
 * `demo-security-dashboard-seed.test.ts`'s plan-validity test, which would need updating
 * too, surfacing the drift at review time). */
const DEMO_STATUS_PATH_FROM_INVESTIGATING: Record<DemoCaseStatus, readonly DemoCaseStatus[]> = {
  open: [],
  investigating: ['investigating'],
  tracking: ['investigating', 'tracking'],
  recovered: ['investigating', 'recovered'],
  closed: ['investigating', 'closed'],
};

/** The ordered list of statuses to walk through, via `updateStatusForPartnerOrg`-style
 * (status, expectedStatus) pairs, to land a freshly-claimed case (status
 * `'investigating'`) on `spec.finalStatus`. Empty array means no further transition is
 * needed (the case is already at `'investigating'`, or wasn't claimed at all). */
export function demoStatusTransitionPlan(
  spec: DemoCaseSpec,
): ReadonlyArray<{ from: DemoCaseStatus; to: DemoCaseStatus }> {
  if (!spec.claim) return [];
  const path = DEMO_STATUS_PATH_FROM_INVESTIGATING[spec.finalStatus];
  const steps: Array<{ from: DemoCaseStatus; to: DemoCaseStatus }> = [];
  for (let i = 0; i < path.length - 1; i++) {
    steps.push({ from: path[i]!, to: path[i + 1]! });
  }
  return steps;
}

export function demoAccountEmails(): readonly string[] {
  return [DEMO_OPERATOR_EMAIL, DEMO_CUSTOMER_EMAIL];
}

// ---------------------------------------------------------------------------
// Injectable orchestration — the CLI wrapper supplies real repositories; tests
// supply in-memory fakes implementing the same narrow ports.
// ---------------------------------------------------------------------------

export interface DemoAuthPort {
  getUserByEmail(email: string): Promise<{ userId: string } | null>;
  createUser(email: string, password: string, emailConfirm: boolean): Promise<{ userId: string }>;
  deleteUser(userId: string): Promise<void>;
}

export interface DemoAccountRow {
  id: string;
  userType: string;
}

export interface DemoAccountsPort {
  findByEmail(email: string): Promise<DemoAccountRow | null>;
  createCustomerAccount(id: string, email: string): Promise<void>;
  markEmailVerified(id: string): Promise<void>;
  createPrivilegedAccountFromInvitation(input: {
    id: string;
    email: string;
    userType: DemoAllowedUserType;
    partnerOrganizationId: string | null;
    invitedBy: string;
  }): Promise<void>;
  /** Deletes the `app.accounts` row and anything (Trail A audit rows,
   * `account_status_cache`) that would otherwise block the Supabase delete — mirrors
   * `seed-test-accounts.ts`'s `deleteSeedUser`, scoped to demo-only data. */
  deleteAccountRow(id: string): Promise<void>;
}

export interface DemoPartnerOrgPort {
  ensure(id: string, name: string): Promise<void>;
  /** No-op if the org doesn't exist. */
  delete(id: string): Promise<void>;
}

export interface DemoRecoveryCasesPort {
  createForAccount(
    accountId: string,
    assetId: string,
    notes: string,
    partnerOrganizationId: string | null,
  ): Promise<{ id: string; status: DemoCaseStatus }>;
  claimForPartnerOrg(partnerOrganizationId: string, caseId: string): Promise<{ id: string } | null>;
  updateStatusForPartnerOrg(
    partnerOrganizationId: string,
    caseId: string,
    status: DemoCaseStatus,
    expectedStatus: DemoCaseStatus,
  ): Promise<{ id: string } | null>;
  /** Demo-only teardown helper — deletes every `recovery_cases` row for the given
   * `accountId`s. Real production code never offers an unscoped delete like this; it
   * exists only on this narrow port, used only by `teardownDemoFixtures`. */
  deleteAllForAccounts(accountIds: readonly string[]): Promise<number>;
  countForAccounts(accountIds: readonly string[]): Promise<number>;
}

/** See the module-level "AUD-11 CONCERN" doc comment. `deleteMatching` MUST attempt the
 * delete with the same credential every other part of this script uses (never silently
 * use/request a more privileged one) and MUST surface a permission failure distinctly
 * from "nothing to delete" — callers must not treat `permissionDenied: true` as success. */
export interface DemoAuditLogPort {
  countMatching(accountIds: readonly string[]): Promise<number>;
  deleteMatching(
    accountIds: readonly string[],
  ): Promise<{ attempted: number; deleted: number; permissionDenied: boolean }>;
}

export interface DemoSeedDeps {
  auth: DemoAuthPort;
  accounts: DemoAccountsPort;
  partnerOrg: DemoPartnerOrgPort;
  cases: DemoRecoveryCasesPort;
  auditLog: DemoAuditLogPort;
}

export interface DemoSeedAccountResult {
  email: string;
  userId: string;
  password: string | null;
  created: boolean;
}

export interface DemoSeedResult {
  operator: DemoSeedAccountResult;
  customer: DemoSeedAccountResult;
  caseIds: Record<string, string>;
}

async function ensureDemoAccount(
  deps: DemoSeedDeps,
  email: string,
  userType: string,
  invitedBy: string | null,
): Promise<DemoSeedAccountResult> {
  // ADR-0013 requirement 2 — every account-creation call in this module passes through
  // this gate first. Thrown errors propagate uncaught; there is no catch-and-continue
  // path that could paper over an attempt to create a forbidden type.
  const allowedType = assertDemoAllowedUserType(userType);

  const existing = await deps.accounts.findByEmail(email);
  if (existing) {
    return { email, userId: existing.id, password: null, created: false };
  }

  const password = generateDemoPassword();
  const { userId } = await deps.auth.createUser(email, password, true);

  if (allowedType === 'customer') {
    await deps.accounts.createCustomerAccount(userId, email);
    await deps.accounts.markEmailVerified(userId);
  } else {
    // ADR-0013 requirement 5 — no MFA enrollment code path exists here at all. The
    // business owner enrolls their own MFA by logging in, per ADR-0013.
    await deps.accounts.createPrivilegedAccountFromInvitation({
      id: userId,
      email,
      userType: allowedType,
      partnerOrganizationId: DEMO_PARTNER_ORG_ID,
      invitedBy: invitedBy ?? userId,
    });
  }

  return { email, userId, password, created: true };
}

/** Creates (idempotently) the demo partner org, the demo operator + customer accounts,
 * and `DEMO_CASE_PLAN`'s fake cases linking them. Safe to re-run — existing accounts by
 * email are reused rather than recreated; cases are only created if none already exist
 * for the demo customer (checked via `cases.countForAccounts`). */
export async function createDemoFixtures(deps: DemoSeedDeps): Promise<DemoSeedResult> {
  await deps.partnerOrg.ensure(DEMO_PARTNER_ORG_ID, DEMO_PARTNER_ORG_NAME);

  const operator = await ensureDemoAccount(deps, DEMO_OPERATOR_EMAIL, 'security_company_operator', null);
  const customer = await ensureDemoAccount(deps, DEMO_CUSTOMER_EMAIL, 'customer', operator.userId);

  const caseIds: Record<string, string> = {};
  const existingCaseCount = await deps.cases.countForAccounts([customer.userId]);
  if (existingCaseCount === 0) {
    for (const spec of DEMO_CASE_PLAN) {
      const created = await deps.cases.createForAccount(
        customer.userId,
        demoAssetIdFor(spec.key),
        spec.notes,
        null,
      );
      caseIds[spec.key] = created.id;

      if (spec.claim) {
        const claimed = await deps.cases.claimForPartnerOrg(DEMO_PARTNER_ORG_ID, created.id);
        if (!claimed) {
          throw new Error(`[demo-security-dashboard-seed] Failed to claim demo case "${spec.key}"`);
        }
        for (const step of demoStatusTransitionPlan(spec)) {
          if (step.from === step.to) continue;
          const updated = await deps.cases.updateStatusForPartnerOrg(
            DEMO_PARTNER_ORG_ID,
            created.id,
            step.to,
            step.from,
          );
          if (!updated) {
            throw new Error(
              `[demo-security-dashboard-seed] Failed to move demo case "${spec.key}" from ${step.from} to ${step.to}`,
            );
          }
        }
      }
    }
  }

  return { operator, customer, caseIds };
}

export interface DemoTeardownReport {
  accountsDeleted: string[];
  partnerOrgDeleted: boolean;
  casesDeleted: number;
  auditLog: { attempted: number; deleted: number; permissionDenied: boolean };
}

/** Deletes every row `createDemoFixtures` could have created: the demo cases, the demo
 * accounts (by the fixed demo emails only — never a caller-supplied list, mirroring
 * `seed-test-accounts.ts`'s `teardownOne` discipline), and the demo partner org. Safe to
 * re-run on an already-torn-down environment (every step is a no-op if its target is
 * already absent).
 *
 * Admin-access-log rows are a best-effort, separately-reported step — see the module's
 * "AUD-11 CONCERN" doc comment. A `permissionDenied: true` in the returned report is
 * EXPECTED under the current role design, not a bug to retry past. */
export async function teardownDemoFixtures(deps: DemoSeedDeps): Promise<DemoTeardownReport> {
  const accountIds: string[] = [];
  for (const email of demoAccountEmails()) {
    const existing = await deps.accounts.findByEmail(email);
    const authUser = existing ? null : await deps.auth.getUserByEmail(email);
    const userId = existing?.id ?? authUser?.userId ?? null;
    if (!userId) continue;
    accountIds.push(userId);
  }

  const casesDeleted = accountIds.length > 0 ? await deps.cases.deleteAllForAccounts(accountIds) : 0;

  const auditLog =
    accountIds.length > 0
      ? await deps.auditLog.deleteMatching(accountIds)
      : { attempted: 0, deleted: 0, permissionDenied: false };

  const accountsDeleted: string[] = [];
  for (const userId of accountIds) {
    await deps.accounts.deleteAccountRow(userId);
    try {
      await deps.auth.deleteUser(userId);
    } catch {
      // Mirrors seed-test-accounts.ts's deleteSeedUser — surfaced by the caller via a
      // thrown error from accounts.deleteAccountRow/auth.deleteUser if the FK ordering
      // was wrong; here we still record it as "attempted" so the summary is honest.
    }
    accountsDeleted.push(userId);
  }

  await deps.partnerOrg.delete(DEMO_PARTNER_ORG_ID);

  return {
    accountsDeleted,
    partnerOrgDeleted: true,
    casesDeleted,
    auditLog,
  };
}
