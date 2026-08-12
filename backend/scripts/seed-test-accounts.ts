#!/usr/bin/env node
/**
 * Idempotently creates three local/staging test accounts:
 *   - customer (web /login + mobile)
 *   - admin (/admin/login)
 *   - security_company_operator (/security/login)
 *
 * Privileged accounts get TOTP MFA enrolled; the script prints each TOTP
 * secret so you can add it to an authenticator app (or re-run and read
 * the current 6-digit code from the summary).
 *
 * Requires repo-root `.env.local` with Supabase + Postgres credentials.
 *
 *   npx tsx backend/scripts/seed-test-accounts.ts
 *   npx tsx backend/scripts/seed-test-accounts.ts --force   # delete + recreate
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
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

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

async function seedOne(
  spec: (typeof TEST_ACCOUNTS)[keyof typeof TEST_ACCOUNTS],
  force: boolean,
  invitedBy: string | null,
): Promise<SeedResult> {
  const env = loadSeedEnv();
  const supabase = getSupabaseAdmin(env);
  const accounts = createAccountsRepo(getPgPool(env));

  const existingAccount = await accounts.findByEmail(spec.email);
  const existingAuth = await supabase.getUserByEmail(spec.email);

  if ((existingAccount || existingAuth) && force) {
    const userId = existingAccount?.id ?? existingAuth?.userId;
    if (userId) {
      await supabase.deleteUser(userId);
    }
  } else if (existingAccount) {
    let mfaSecret: string | null = null;
    let mfaCode: string | null = null;
    if (spec.mfaRequired) {
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
  if (spec.mfaRequired) {
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
    }
    // eslint-disable-next-line no-console
    console.log(`  Status:   ${row.created ? 'created' : 'already existed (verified/enrolled)'}\n`);
  }
  // eslint-disable-next-line no-console
  console.log(
    'Add MFA secrets to Google Authenticator / 1Password if prompted for a 6-digit code at login.\n' +
      'Re-run this script anytime to print a fresh TOTP code from the stored secret.\n',
  );
}

async function main(): Promise<void> {
  const force = process.argv.includes('--force');
  const env = loadSeedEnv();
  const pool = getPgPool(env);

  await pool.query('select 1');
  // eslint-disable-next-line no-console
  console.log('[seed-test-accounts] Connected to Postgres (app schema).');

  await ensurePartnerOrg(pool);

  const adminResult = await seedOne(TEST_ACCOUNTS.admin, force, null);
  const securityResult = await seedOne(TEST_ACCOUNTS.security, force, adminResult.userId);
  const customerResult = await seedOne(TEST_ACCOUNTS.customer, force, adminResult.userId);

  const webBase = process.env.TEST_WEB_BASE_URL?.trim() || 'http://localhost:5173';
  printSummary([customerResult, adminResult, securityResult], webBase.replace(/\/+$/, ''));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[seed-test-accounts] Failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
