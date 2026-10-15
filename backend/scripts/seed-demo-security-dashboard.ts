#!/usr/bin/env node
/**
 * ADR-0013 — Security Company Dashboard Client Demo seed/teardown.
 *
 * ================================================================================
 * STOP: ADR-0013 is Proposed — NOT YET AUTHORIZED, as of 2026-10-15
 * (docs/organization/adr/0013-security-dashboard-client-demo-exception.md). Do NOT
 * run this script against any environment — local, staging, or production — until
 * the business owner has given an explicit, present go/no-go per that ADR's
 * "Required actions before this can run", item 3. No prior instruction, from any
 * agent or left while the owner was away, satisfies that requirement.
 * ================================================================================
 *
 * Creates (idempotently) exactly:
 *   - one `security_company_operator` account, against a distinct, unmistakably-fake
 *     partner org ("DEMO – Fictional Security Partner (not a live integration)",
 *     id `DEMO_PARTNER_ORG_ID` — NOT `TEST_PARTNER_ORG_ID` from seed-test-accounts.ts).
 *   - one `customer` account.
 *   - 3-5 fake recovery/theft cases linking them (`DEMO_CASE_PLAN`).
 *
 * This script CANNOT create an `admin` or `support_agent` account — there is no flag,
 * argument, or code path that reaches account creation with either type (see
 * `src/lib/demo-security-dashboard-seed.ts`'s `assertDemoAllowedUserType`).
 *
 * Passwords are generated fresh with `crypto.randomInt` on every run that creates an
 * account, printed to stdout exactly once, and never written to disk or logged
 * elsewhere. The operator account is created WITHOUT MFA pre-enrolled — ADR-0013
 * requires the business owner to enroll their own MFA by logging in at the printed URL,
 * the same real in-browser enrollment flow a genuinely invited staff member goes
 * through (see `seed-test-accounts.ts`'s header comment for how that flow works).
 *
 * Usage (never without the owner's present go-ahead):
 *   npx tsx backend/scripts/seed-demo-security-dashboard.ts
 *   npx tsx backend/scripts/seed-demo-security-dashboard.ts --teardown --confirm
 *
 * `--teardown` without `--confirm` prints what WOULD be deleted and exits without
 * changing anything, mirroring `seed-test-accounts.ts --teardown`'s dry-run default.
 *
 * Requires repo-root `.env`/`.env.local` with Supabase + Postgres + MongoDB credentials
 * — same env files `seed-test-accounts.ts` and `bootstrap-mongo-collections.ts` use.
 */
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { MongoClient, type Db } from 'mongodb';

import { loadEnv, type Env } from '../src/config/env.js';
import { getPgPool } from '../src/db/pg.js';
import { getSupabaseAdmin } from '../src/db/supabase.js';
import { openMongoDatabase } from '../src/db/mongo-connection.js';
import { createAccountsRepo } from '../src/repositories/accounts.js';
import { createRecoveryCasesRepo, isForwardStatusTransition } from '../src/repositories/recovery-cases.js';
import {
  createDemoFixtures,
  teardownDemoFixtures,
  DEMO_PARTNER_ORG_ID,
  DEMO_PARTNER_ORG_NAME,
  demoAccountEmails,
  type DemoSeedDeps,
  type DemoCaseStatus,
} from '../src/lib/demo-security-dashboard-seed.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');
dotenv.config({ path: path.join(repoRoot, '.env') });
dotenv.config({ path: path.join(repoRoot, '.env.local'), override: true });

function loadSeedEnv(): Env {
  return loadEnv();
}

async function connectMongoForScript(env: Env): Promise<{ db: Db; client: MongoClient }> {
  const client = new MongoClient(env.mongodbUri, { serverSelectionTimeoutMS: 10_000 });
  await client.connect();
  const db = openMongoDatabase(client, env.mongodbDbName);
  await db.command({ ping: 1 });
  return { db, client };
}

/**
 * Builds the `DemoSeedDeps` ports (`src/lib/demo-security-dashboard-seed.ts`) from the
 * real Supabase/Postgres/MongoDB connections. This is the ONLY place in this script
 * that touches a live credential — everything else goes through the injectable,
 * unit-tested orchestration functions in the lib module.
 */
function buildDeps(env: Env, db: Db): DemoSeedDeps {
  const supabase = getSupabaseAdmin(env);
  const pool = getPgPool(env);
  const accounts = createAccountsRepo(pool);
  const recoveryCases = createRecoveryCasesRepo(db);

  return {
    auth: {
      async getUserByEmail(email) {
        return supabase.getUserByEmail(email);
      },
      async createUser(email, password, emailConfirm) {
        return supabase.createUser(email, password, emailConfirm);
      },
      async deleteUser(userId) {
        await supabase.deleteUser(userId);
      },
    },
    accounts: {
      async findByEmail(email) {
        const row = await accounts.findByEmail(email);
        return row ? { id: row.id, userType: row.userType } : null;
      },
      async createCustomerAccount(id, email) {
        await accounts.createCustomerAccount(id, email);
      },
      async markEmailVerified(id) {
        await accounts.markEmailVerified(id);
      },
      async createPrivilegedAccountFromInvitation(input) {
        await accounts.createPrivilegedAccountFromInvitation(input);
      },
      // Mirrors seed-test-accounts.ts's deleteSeedUser — see that file's doc comment
      // for why app-schema rows (account_audit_log, account_status_cache, accounts)
      // must be removed BEFORE the Supabase Admin API delete, not after.
      async deleteAccountRow(id) {
        await pool.query('delete from app.account_audit_log where account_id = $1 or actor_account_id = $1', [id]);
        await pool.query('delete from app.account_status_cache where id = $1', [id]);
        await pool.query('delete from app.accounts where id = $1', [id]);
      },
    },
    partnerOrg: {
      async ensure(id, name) {
        await pool.query(
          `insert into app.partner_organizations (id, name, status)
           values ($1, $2, 'active')
           on conflict (id) do update set name = excluded.name`,
          [id, name],
        );
      },
      async delete(id) {
        await pool.query('delete from app.partner_organizations where id = $1', [id]);
      },
    },
    cases: {
      async createForAccount(accountId, assetId, notes, partnerOrganizationId) {
        const doc = await recoveryCases.createForAccount(accountId, assetId, notes, partnerOrganizationId);
        return { id: doc.id, status: doc.status as DemoCaseStatus };
      },
      async claimForPartnerOrg(partnerOrganizationId, caseId) {
        const doc = await recoveryCases.claimForPartnerOrg(partnerOrganizationId, caseId);
        return doc ? { id: doc.id } : null;
      },
      async updateStatusForPartnerOrg(partnerOrganizationId, caseId, status, expectedStatus) {
        if (!isForwardStatusTransition(expectedStatus, status)) {
          throw new Error(
            `[seed-demo-security-dashboard] Refusing non-forward demo transition ${expectedStatus} -> ${status}`,
          );
        }
        const doc = await recoveryCases.updateStatusForPartnerOrg(
          partnerOrganizationId,
          caseId,
          status,
          expectedStatus,
        );
        return doc ? { id: doc.id } : null;
      },
      // Demo-teardown-only helper — not part of any production route. Scoped to the
      // exact accountIds passed in (the two fixed demo account ids), never broader.
      async deleteAllForAccounts(accountIds) {
        if (accountIds.length === 0) return 0;
        const result = await db.collection('recovery_cases').deleteMany({ accountId: { $in: accountIds } });
        return result.deletedCount ?? 0;
      },
      async countForAccounts(accountIds) {
        if (accountIds.length === 0) return 0;
        return db.collection('recovery_cases').countDocuments({ accountId: { $in: accountIds } });
      },
    },
    auditLog: {
      async countMatching(accountIds) {
        if (accountIds.length === 0) return 0;
        return db
          .collection('admin_access_log')
          .countDocuments({ $or: [{ actorAccountId: { $in: accountIds } }, { targetAccountId: { $in: accountIds } }] });
      },
      // AUD-11 (ADR-0006) / FU-A6: the application's MONGODB_URI role has find+insert
      // ONLY on admin_access_log — remove is reserved for a separate, cluster-level
      // "purge user" role. This attempts the delete with the SAME credential the rest
      // of this script uses (never requests/assumes a more privileged one) and expects
      // it to fail with a permission error whenever matching rows exist. That failure is
      // caught and reported plainly — see src/lib/demo-security-dashboard-seed.ts's
      // "AUD-11 CONCERN" doc comment. This is flagged for database-architect per
      // ADR-0013 requirement 6, not resolved here.
      async deleteMatching(accountIds) {
        if (accountIds.length === 0) return { attempted: 0, deleted: 0, permissionDenied: false };
        const filter = { $or: [{ actorAccountId: { $in: accountIds } }, { targetAccountId: { $in: accountIds } }] };
        const attempted = await db.collection('admin_access_log').countDocuments(filter);
        if (attempted === 0) return { attempted: 0, deleted: 0, permissionDenied: false };
        try {
          const result = await db.collection('admin_access_log').deleteMany(filter);
          return { attempted, deleted: result.deletedCount ?? 0, permissionDenied: false };
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn(
            '\n[seed-demo-security-dashboard] COULD NOT delete admin_access_log rows naming the demo ' +
              `accounts (${attempted} row(s) found). This is EXPECTED under AUD-11/FU-A6's Mongo role ` +
              'split (ADR-0006) — the app credential cannot remove from this collection by design. ' +
              'Resolving this (purge-user-credential run, legalHold tagging, or accepting the 12-month ' +
              'retention ceiling) requires a database-architect ruling per ADR-0013 requirement 6. Raw ' +
              `error: ${err instanceof Error ? err.message : String(err)}\n`,
          );
          return { attempted, deleted: 0, permissionDenied: true };
        }
      },
    },
  };
}

function printCreateSummary(
  result: Awaited<ReturnType<typeof createDemoFixtures>>,
  webBase: string,
): void {
  // eslint-disable-next-line no-console
  console.log('\n[seed-demo-security-dashboard] Done. DEMO fixtures (ADR-0013):\n');
  // eslint-disable-next-line no-console
  console.log(`Partner org: ${DEMO_PARTNER_ORG_NAME} (${DEMO_PARTNER_ORG_ID})\n`);

  for (const [label, account] of [
    ['SECURITY OPERATOR', result.operator],
    ['CUSTOMER', result.customer],
  ] as const) {
    // eslint-disable-next-line no-console
    console.log(`--- ${label} ---`);
    // eslint-disable-next-line no-console
    console.log(`  Email:    ${account.email}`);
    if (account.password) {
      // eslint-disable-next-line no-console
      console.log(`  Password: ${account.password}  (printed once — not stored anywhere by this script)`);
    } else {
      // eslint-disable-next-line no-console
      console.log('  Password: (account already existed — re-run with --teardown first for a fresh password)');
    }
    // eslint-disable-next-line no-console
    console.log(`  Status:   ${account.created ? 'created' : 'already existed'}\n`);
  }

  // eslint-disable-next-line no-console
  console.log(
    `Login (operator): ${webBase}/security/login\n` +
      'MFA is NOT pre-enrolled on the operator account, by design — log in with the email/password ' +
      'above and follow the in-browser QR-code/manual-key enrollment screen yourself (ADR-0013 requires ' +
      'the business owner to do this personally).\n',
  );

  // eslint-disable-next-line no-console
  console.log(`Fake cases created: ${Object.keys(result.caseIds).length}\n`);

  // eslint-disable-next-line no-console
  console.log(
    'Reminder: this exception expires same calendar day per ADR-0013. Run with --teardown --confirm ' +
      'before the day ends, and remove VITE_FEATURE_SECURITY_OPERATOR from Vercel Production.\n',
  );
}

function printTeardownSummary(report: Awaited<ReturnType<typeof teardownDemoFixtures>>, apply: boolean): void {
  // eslint-disable-next-line no-console
  console.log(
    apply
      ? '\n[seed-demo-security-dashboard] --teardown --confirm: results:\n'
      : '\n[seed-demo-security-dashboard] --teardown (dry run — pass --confirm to actually delete):\n',
  );
  // eslint-disable-next-line no-console
  console.log(`  Accounts removed: ${report.accountsDeleted.length}`);
  // eslint-disable-next-line no-console
  console.log(`  Recovery cases removed: ${report.casesDeleted}`);
  // eslint-disable-next-line no-console
  console.log(`  Partner org removed: ${report.partnerOrgDeleted}`);
  if (report.auditLog.attempted > 0) {
    // eslint-disable-next-line no-console
    console.log(
      `  admin_access_log rows found naming demo accounts: ${report.auditLog.attempted}, ` +
        `deleted: ${report.auditLog.deleted}` +
        (report.auditLog.permissionDenied
          ? ' — PERMISSION DENIED (expected under AUD-11; see warning above). These rows still exist ' +
            'and require a database-architect-approved purge path.'
          : ''),
    );
  } else {
    // eslint-disable-next-line no-console
    console.log('  admin_access_log rows found naming demo accounts: 0');
  }
  console.log('');
}

async function runTeardown(env: Env, db: Db): Promise<void> {
  const apply = process.argv.includes('--confirm');
  const deps = buildDeps(env, db);

  if (apply) {
    // eslint-disable-next-line no-console
    console.log(
      `\nAbout to PERMANENTLY delete the demo accounts (${demoAccountEmails().join(', ')}), the demo ` +
        `partner org (${DEMO_PARTNER_ORG_ID}), and all demo recovery cases. This ONLY ever targets the ` +
        'fixed demo-account emails/org id in src/lib/demo-security-dashboard-seed.ts — no other data is affected.\n',
    );
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question('Type YES to confirm and continue: ');
    rl.close();
    if (answer.trim() !== 'YES') {
      // eslint-disable-next-line no-console
      console.log('[seed-demo-security-dashboard] Confirmation not given ("YES" required). Aborting — nothing deleted.');
      return;
    }
    const report = await teardownDemoFixtures(deps);
    printTeardownSummary(report, true);
    return;
  }

  // Dry run: report what's currently present without deleting anything.
  const accountIds: string[] = [];
  for (const email of demoAccountEmails()) {
    const existing = await deps.accounts.findByEmail(email);
    const authUser = existing ? null : await deps.auth.getUserByEmail(email);
    const userId = existing?.id ?? authUser?.userId ?? null;
    if (userId) accountIds.push(userId);
  }
  const caseCount = await deps.cases.countForAccounts(accountIds);
  const auditCount = await deps.auditLog.countMatching(accountIds);
  printTeardownSummary(
    {
      accountsDeleted: accountIds,
      casesDeleted: caseCount,
      partnerOrgDeleted: true,
      auditLog: { attempted: auditCount, deleted: 0, permissionDenied: false },
    },
    false,
  );
}

async function main(): Promise<void> {
  const env = loadSeedEnv();
  const pool = getPgPool(env);
  await pool.query('select 1');
  // eslint-disable-next-line no-console
  console.log('[seed-demo-security-dashboard] Connected to Postgres (app schema).');

  const { db, client } = await connectMongoForScript(env);
  // eslint-disable-next-line no-console
  console.log(`[seed-demo-security-dashboard] Connected to MongoDB database "${db.databaseName}".`);

  try {
    if (process.argv.includes('--teardown')) {
      await runTeardown(env, db);
      return;
    }

    const deps = buildDeps(env, db);
    const result = await createDemoFixtures(deps);
    const webBase = process.env.TEST_WEB_BASE_URL?.trim() || 'http://localhost:5173';
    printCreateSummary(result, webBase.replace(/\/+$/, ''));
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[seed-demo-security-dashboard] Failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
