#!/usr/bin/env node
/**
 * SR-14(b) MFA-factor reconciliation, extended per INC-003 A-19 (interim
 * control for C-10, GoTrue-direct TOTP enrolment with the published anon
 * key). Logic: `src/lib/mfa-factor-reconciliation.ts` (see its header).
 *
 * STRICTLY READ-ONLY. Reads `app.accounts` and `app.account_audit_log`
 * (`mfa_enrolled` events) through the backend's Postgres pool, and each
 * account's factors through the GoTrue Admin API (service-role, the same
 * mediation layer the backend uses — never the anon key, SR-4). Writes
 * nothing, removes no factor: a flagged factor is a suspected account
 * takeover and goes to `security-engineer` for investigation, never to
 * automated remediation (deleting it could destroy evidence or lock out a
 * legitimate user whose enrolment pre-dates audit logging).
 *
 * NOT DONE HERE: scheduling and alert routing. Both are
 * `site-reliability-engineer`'s (SR-14 owner pairing). The exit code is
 * designed for a scheduler: 0 = clean, 2 = findings, 1 = the run failed.
 *
 * Known false-positive source: factors enrolled before `mfa_enrolled` audit
 * events existed, or whose event has been purged by the 12-month audit
 * retention job. Each finding carries `factorCreatedAt` for triage.
 *
 * USAGE (run from repo root with the backend's production env loaded):
 *
 *   npx tsx backend/scripts/sr14b-mfa-factor-reconciliation.ts
 *
 * OUTPUT: JSON summary on stdout `{ runAt, accountsChecked, findings[] }`.
 * Contains account ids and factor ids only — no email, no secret.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

import { loadEnv } from '../src/config/env.js';
import { getPgPool } from '../src/db/pg.js';
import { getSupabaseAdmin } from '../src/db/supabase.js';
import {
  reconcileMfaFactors,
  type ReconciliationAccount,
  type ReconciliationFactor,
} from '../src/lib/mfa-factor-reconciliation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');
dotenv.config({ path: path.join(repoRoot, '.env') });
dotenv.config({ path: path.join(repoRoot, '.env.local'), override: true });

async function main(): Promise<number> {
  const env = loadEnv();
  const pool = getPgPool(env);
  const supabase = getSupabaseAdmin(env);

  try {
    const accountRows = await pool.query<{ id: string; mfa_required: boolean; user_type: string }>(
      `select id, mfa_required, user_type from app.accounts
        where account_state <> 'deactivated'`,
    );
    const eventRows = await pool.query<{ account_id: string; created_at: Date }>(
      `select account_id, created_at from app.account_audit_log
        where event_type = 'mfa_enrolled' and account_id is not null`,
    );

    const accounts: ReconciliationAccount[] = accountRows.rows.map((r) => ({
      accountId: r.id,
      mfaRequired: r.mfa_required,
      userType: r.user_type,
    }));

    const enrolmentEventsByAccount = new Map<string, Date[]>();
    for (const row of eventRows.rows) {
      const list = enrolmentEventsByAccount.get(row.account_id) ?? [];
      list.push(new Date(row.created_at));
      enrolmentEventsByAccount.set(row.account_id, list);
    }

    const factorsByAccount = new Map<string, ReconciliationFactor[]>();
    for (const account of accounts) {
      const { data, error } = await supabase.raw.auth.admin.mfa.listFactors({ userId: account.accountId });
      if (error) {
        throw new Error(`listFactors failed for account ${account.accountId}: ${error.name}`);
      }
      factorsByAccount.set(
        account.accountId,
        (data?.factors ?? []).map((f) => ({
          factorId: f.id,
          factorType: f.factor_type,
          status: f.status,
          createdAt: new Date(f.created_at),
        })),
      );
    }

    const findings = reconcileMfaFactors({ accounts, factorsByAccount, enrolmentEventsByAccount });
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({ runAt: new Date().toISOString(), accountsChecked: accounts.length, findings }, null, 2),
    );
    return findings.length > 0 ? 2 : 0;
  } finally {
    await pool.end();
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(`[sr14b-mfa-factor-reconciliation] run failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  });
