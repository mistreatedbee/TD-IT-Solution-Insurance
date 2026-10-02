#!/usr/bin/env node
/**
 * Idempotently creates four local/staging test accounts:
 *   - customer (web /login + mobile)
 *   - admin (/admin/login)
 *   - security_company_operator (/security/login)
 *   - support_agent (/call-centre/login)
 *
 * By default, privileged accounts are created UNENROLLED — the exact same
 * state as a real invited staff member who has accepted their invitation
 * but not yet set up MFA. Logging in at the printed URL with the printed
 * password walks you through the real in-browser enrollment screen (scan
 * the QR code, or use the manual entry key) — PrivilegedLoginPage already
 * handles this via the backend's enrollmentTicket response, the same path
 * a real staff member goes through. There is no separate "setup" step to
 * run first; logging in IS the setup step.
 *
 * Pass --enroll-mfa to instead auto-enroll TOTP via the Admin API and have
 * this script print the raw secret/current code directly — useful for
 * scripted API testing without a browser, but note the secret CANNOT be
 * retrieved again later (Supabase never returns an enrolled factor's
 * secret) — only a fresh --force recreate can get you a new one.
 *
 * Requires repo-root `.env.local` with Supabase + Postgres credentials.
 *
 *   npx tsx backend/scripts/seed-test-accounts.ts
 *   npx tsx backend/scripts/seed-test-accounts.ts --force       # delete + recreate
 *   npx tsx backend/scripts/seed-test-accounts.ts --enroll-mfa  # auto-enroll, print secret
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

import { loadEnv, type Env } from '../src/config/env.js';
import { getPgPool } from '../src/db/pg.js';
import { getSupabaseAdmin } from '../src/db/supabase.js';
import { createAccountsRepo, type UserType } from '../src/repositories/accounts.js';
import { generateTotpCode } from './lib/totp.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');
dotenv.config({ path: path.join(repoRoot, '.env') });
dotenv.config({ path: path.join(repoRoot, '.env.local'), override: true });

/** Seed script only needs Supabase + Postgres — not MongoDB or JWT signing keys. */
function loadSeedEnv(): Env {
  if (!process.env.MONGODB_URI) {
    process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/seed-script-unused';
  }
  if (!process.env.SESSION_JWT_SIGNING_KEYS) {
    process.env.SESSION_JWT_SIGNING_KEYS =
      'seed-script-dummy-kid:01234567890123456789012345678901';
  }
  if (!process.env.SESSION_JWT_ACTIVE_KID) {
    process.env.SESSION_JWT_ACTIVE_KID = 'seed-script-dummy-kid';
  }
  return loadEnv();
}

/** Stable partner org for the security-operator test account. */
export const TEST_PARTNER_ORG_ID = 'a0000001-0000-4000-8000-000000000001';

export const TEST_ACCOUNTS = {
  customer: {
    label: 'Customer',
    email: 'test.customer@tditsolutions.dev',
    password: 'CustomerTest1234!',
    userType: 'customer' as const,
    loginPath: '/login',
    mfaRequired: false,
  },
  admin: {
    label: 'Admin',
    email: 'test.admin@tditsolutions.dev',
    password: 'AdminTest1234567!',
    userType: 'admin' as const,
    loginPath: '/admin/login',
    mfaRequired: true,
  },
  security: {
    label: 'Security partner',
    email: 'test.security@tditsolutions.dev',
    password: 'SecurityTest1234567!',
    userType: 'security_company_operator' as const,
    loginPath: '/security/login',
    mfaRequired: true,
    partnerOrganizationId: TEST_PARTNER_ORG_ID,
  },
  support: {
    label: 'Call centre support agent',
    email: 'test.support@tditsolutions.dev',
    password: 'SupportTest1234567!',
    userType: 'support_agent' as const,
    loginPath: '/call-centre/login',
    mfaRequired: true,
  },
} as const;

interface SeedResult {
  email: string;
  userId: string;
  userType: UserType;
  loginPath: string;
  password: string;
  mfaSecret: string | null;
  mfaCode: string | null;
  created: boolean;
  /** Whether this user type requires MFA at all (independent of whether it's been enrolled yet). */
  mfaRequired: boolean;
}

async function ensurePartnerOrg(pool: ReturnType<typeof getPgPool>): Promise<void> {
  await pool.query(
    `insert into app.partner_organizations (id, name, status)
     values ($1, $2, 'active')
     on conflict (id) do update set name = excluded.name`,
    [TEST_PARTNER_ORG_ID, 'TD IT Solution Test Security Partner'],
  );
}

async function enrollTotpIfNeeded(
  email: string,
  password: string,
): Promise<{ secret: string | null; code: string | null }> {
  const supabase = getSupabaseAdmin(loadSeedEnv());
  const verification = await supabase.verifyPassword(email, password);
  if (!verification) {
    throw new Error(`[seed] Could not verify password for ${email} after creation`);
  }

  const existing = await supabase.findVerifiedTotpFactor(verification.userAccessToken);
  if (existing) {
    return { secret: '(already enrolled — use your authenticator app)', code: null };
  }

  const enrollment = await supabase.enrollTotpFactor(verification.userAccessToken);
  const code = generateTotpCode(enrollment.manualEntryKey);
  const challenge = await supabase.challengeTotpFactor(verification.userAccessToken, enrollment.factorId);
  const verified = await supabase.verifyTotpFactor(
    verification.userAccessToken,
    enrollment.factorId,
    challenge.challengeId,
    code,
  );
  if (!verified) {
    // Clock skew — try adjacent window
    const retryCode = generateTotpCode(enrollment.manualEntryKey, Date.now() + 30_000);
    const retryOk = await supabase.verifyTotpFactor(
      verification.userAccessToken,
      enrollment.factorId,
      challenge.challengeId,
      retryCode,
    );
    if (!retryOk) {
      throw new Error(`[seed] MFA verify failed for ${email}`);
    }
    return { secret: enrollment.manualEntryKey, code: retryCode };
  }

  return { secret: enrollment.manualEntryKey, code };
}

/**
 * Supabase's Admin API hard-deletes the auth.users row directly. If any
 * app-schema table (most likely app.accounts itself, or
 * app.account_status_cache, which is identity-linked per ADR-0002)
 * references auth.users(id) without ON DELETE CASCADE, that delete fails
 * with a generic "Database error deleting user" — no table name, no
 * constraint name, nothing actionable in the error GoTrue surfaces. Delete
 * the app-schema rows ourselves first so there is nothing left to violate a
 * constraint when GoTrue removes the identity row.
 */
async function deleteSeedUser(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  pool: ReturnType<typeof getPgPool>,
  userId: string,
): Promise<void> {
  await pool.query('delete from app.account_status_cache where id = $1', [userId]);
  await pool.query('delete from app.accounts where id = $1', [userId]);
  try {
    await supabase.deleteUser(userId);
  } catch (err) {
    throw new Error(
      `[seed] Deleting app-schema rows for ${userId} succeeded, but Supabase's Admin API ` +
        `still refused to delete the auth user — some other table still references ` +
        `auth.users(${userId}) without ON DELETE CASCADE. Find it with: ` +
        `select conrelid::regclass, conname from pg_constraint where confrelid = 'auth.users'::regclass ` +
        `and connamespace = 'app'::regnamespace and confdeltype != 'c'; ` +
        `Underlying error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

async function seedOne(
  spec: (typeof TEST_ACCOUNTS)[keyof typeof TEST_ACCOUNTS],
  force: boolean,
  invitedBy: string | null,
  enrollMfa: boolean,
): Promise<SeedResult> {
  const env = loadSeedEnv();
  const supabase = getSupabaseAdmin(env);
  const accounts = createAccountsRepo(getPgPool(env));

  const existingAccount = await accounts.findByEmail(spec.email);
  const existingAuth = await supabase.getUserByEmail(spec.email);

  if ((existingAccount || existingAuth) && force) {
    const userId = existingAccount?.id ?? existingAuth?.userId;
    if (userId) {
      await deleteSeedUser(supabase, getPgPool(env), userId);
    }
  } else if (existingAccount) {
    let mfaSecret: string | null = null;
    let mfaCode: string | null = null;
    if (spec.mfaRequired && enrollMfa) {
      const mfa = await enrollTotpIfNeeded(spec.email, spec.password);
      mfaSecret = mfa.secret;
      mfaCode = mfa.code ?? (mfa.secret && !mfa.secret.startsWith('(') ? generateTotpCode(mfa.secret) : null);
    }
    return {
      email: spec.email,
      userId: existingAccount.id,
      userType: existingAccount.userType,
      loginPath: spec.loginPath,
      password: spec.password,
      mfaSecret,
      mfaCode,
      created: false,
      mfaRequired: spec.mfaRequired,
    };
  }

  const { userId } = await supabase.createUser(spec.email, spec.password, true);

  if (spec.userType === 'customer') {
    await accounts.createCustomerAccount(userId, spec.email);
    await accounts.markEmailVerified(userId);
  } else {
    const partnerOrganizationId =
      'partnerOrganizationId' in spec ? spec.partnerOrganizationId : null;
    await accounts.createPrivilegedAccountFromInvitation({
      id: userId,
      email: spec.email,
      userType: spec.userType,
      partnerOrganizationId,
      invitedBy: invitedBy ?? userId,
    });
  }

  let mfaSecret: string | null = null;
  let mfaCode: string | null = null;
  if (spec.mfaRequired && enrollMfa) {
    const mfa = await enrollTotpIfNeeded(spec.email, spec.password);
    mfaSecret = mfa.secret;
    mfaCode = mfa.code;
  }

  return {
    email: spec.email,
    userId,
    userType: spec.userType,
    loginPath: spec.loginPath,
    password: spec.password,
    mfaSecret,
    mfaCode,
    created: true,
    mfaRequired: spec.mfaRequired,
  };
}

function printSummary(results: SeedResult[], webBase: string): void {
  // eslint-disable-next-line no-console
  console.log('\n[seed-test-accounts] Done. Use these credentials:\n');
  for (const row of results) {
    // eslint-disable-next-line no-console
    console.log(`--- ${row.userType.toUpperCase()} ---`);
    // eslint-disable-next-line no-console
    console.log(`  Login:    ${webBase}${row.loginPath}`);
    // eslint-disable-next-line no-console
    console.log(`  Email:    ${row.email}`);
    // eslint-disable-next-line no-console
    console.log(`  Password: ${row.password}`);
    if (row.mfaSecret) {
      // eslint-disable-next-line no-console
      console.log(`  MFA secret (authenticator): ${row.mfaSecret}`);
      if (row.mfaCode) {
        // eslint-disable-next-line no-console
        console.log(`  MFA code (now): ${row.mfaCode}`);
      }
    } else if (row.mfaRequired) {
      // eslint-disable-next-line no-console
      console.log(
        '  MFA:      not yet enrolled — log in at the URL above with the email/password ' +
          'above and you will land on the real in-browser QR-code enrollment screen ' +
          '(same flow a real invited staff member goes through). Scan it with an ' +
          'authenticator app (Google Authenticator, Authy, 1Password, etc.), or use the ' +
          'manual entry key shown on that screen, then enter the 6-digit code it generates.',
      );
    }
    // eslint-disable-next-line no-console
    console.log(`  Status:   ${row.created ? 'created' : 'already existed'}\n`);
  }
  // eslint-disable-next-line no-console
  console.log(
    'Privileged accounts start UNENROLLED by default — just log in at the URL above and ' +
      'follow the on-screen QR code / manual key prompt. Pass --enroll-mfa to instead have ' +
      'this script auto-enroll via the API and print the raw secret (useful for headless/API ' +
      'testing only; note the secret cannot be retrieved again later — only --force + ' +
      '--enroll-mfa together can get you a fresh one).\n',
  );
}

interface TeardownResult {
  email: string;
  found: boolean;
  userId: string | null;
  deleted: boolean;
}

/**
 * CT-5 / clause 19(d): remove the seeded test accounts by their known,
 * hardcoded email addresses only. This function never accepts a caller-
 * supplied list — the only accounts it will ever touch are the four in
 * `TEST_ACCOUNTS`.
 */
async function teardownOne(
  spec: (typeof TEST_ACCOUNTS)[keyof typeof TEST_ACCOUNTS],
  env: Env,
  pool: ReturnType<typeof getPgPool>,
  apply: boolean,
): Promise<TeardownResult> {
  const supabase = getSupabaseAdmin(env);
  const accounts = createAccountsRepo(pool);

  const existingAccount = await accounts.findByEmail(spec.email);
  const existingAuth = await supabase.getUserByEmail(spec.email);
  const userId = existingAccount?.id ?? existingAuth?.userId ?? null;

  if (!userId) {
    return { email: spec.email, found: false, userId: null, deleted: false };
  }

  if (!apply) {
    return { email: spec.email, found: true, userId, deleted: false };
  }

  await deleteSeedUser(supabase, pool, userId);
  return { email: spec.email, found: true, userId, deleted: true };
}

function printTeardownSummary(results: TeardownResult[], apply: boolean): void {
  // eslint-disable-next-line no-console
  console.log(
    apply
      ? '\n[seed-test-accounts] --teardown --confirm: deletion results:\n'
      : '\n[seed-test-accounts] --teardown (dry run — pass --confirm to actually delete):\n',
  );
  for (const row of results) {
    if (!row.found) {
      // eslint-disable-next-line no-console
      console.log(`  ${row.email}: not found — nothing to do`);
      continue;
    }
    // eslint-disable-next-line no-console
    console.log(
      `  ${row.email} (${row.userId}): ${
        apply ? (row.deleted ? 'deleted' : 'FAILED') : 'would be deleted'
      }`,
    );
  }
  console.log('');
}

async function runTeardown(): Promise<void> {
  const apply = process.argv.includes('--confirm');
  const env = loadSeedEnv();
  const pool = getPgPool(env);

  await pool.query('select 1');
  // eslint-disable-next-line no-console
  console.log('[seed-test-accounts] Connected to Postgres (app schema).');
  // eslint-disable-next-line no-console
  console.log(`[seed-test-accounts] Target Supabase project: ${env.supabaseUrl}`);

  const targets = Object.values(TEST_ACCOUNTS);

  if (apply) {
    // eslint-disable-next-line no-console
    console.log(
      `\nAbout to PERMANENTLY delete up to ${targets.length} test account(s) and all data ` +
        'that cascades from them (sessions, state-transition history, MFA factors) from the ' +
        'Supabase project above. This only ever targets the fixed seeded test-account emails ' +
        'listed in this script — no other accounts are affected.\n',
    );
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question('Type YES to confirm and continue: ');
    rl.close();
    if (answer.trim() !== 'YES') {
      // eslint-disable-next-line no-console
      console.log('[seed-test-accounts] Confirmation not given ("YES" required). Aborting — nothing deleted.');
      return;
    }
  }

  const results: TeardownResult[] = [];
  for (const spec of targets) {
    results.push(await teardownOne(spec, env, pool, apply));
  }

  printTeardownSummary(results, apply);

  if (!apply) {
    // eslint-disable-next-line no-console
    console.log('Re-run with --teardown --confirm to actually delete the account(s) listed above.\n');
  }
}

async function main(): Promise<void> {
  if (process.argv.includes('--teardown')) {
    await runTeardown();
    return;
  }

  const force = process.argv.includes('--force');
  const enrollMfa = process.argv.includes('--enroll-mfa');
  const env = loadSeedEnv();
  const pool = getPgPool(env);

  await pool.query('select 1');
  // eslint-disable-next-line no-console
  console.log('[seed-test-accounts] Connected to Postgres (app schema).');

  await ensurePartnerOrg(pool);

  const adminResult = await seedOne(TEST_ACCOUNTS.admin, force, null, enrollMfa);
  const securityResult = await seedOne(TEST_ACCOUNTS.security, force, adminResult.userId, enrollMfa);
  const customerResult = await seedOne(TEST_ACCOUNTS.customer, force, adminResult.userId, enrollMfa);
  const supportResult = await seedOne(TEST_ACCOUNTS.support, force, adminResult.userId, enrollMfa);

  const webBase = process.env.TEST_WEB_BASE_URL?.trim() || 'http://localhost:5173';
  printSummary(
    [customerResult, adminResult, securityResult, supportResult],
    webBase.replace(/\/+$/, ''),
  );
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[seed-test-accounts] Failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
