#!/usr/bin/env node
/**
 * One-off backfill — generates and sets `app.accounts.account_number` for every
 * existing account that doesn't have one yet (migrations/040).
 *
 * Business-owner top-priority request (2026-10-23): new accounts get a `TD-XXXXXX`
 * reference number at creation (`repositories/accounts.ts` `createCustomerAccount` /
 * `createPrivilegedAccountFromInvitation`); this script closes the gap for every
 * account created before that change shipped.
 *
 * Idempotent / safe to re-run: only ever touches rows where `account_number is null`
 * (`WHERE account_number IS NULL ... FOR UPDATE SKIP LOCKED`-free single-row loop —
 * see below for why a loop, not a bulk UPDATE). Never modifies a row that already has
 * a value, so re-running after a partial run (or after new accounts have been created
 * in the meantime) is safe and only ever fills in the remaining gaps.
 *
 * Why a per-row loop instead of one bulk `UPDATE ... SET account_number = ...`:
 * each row needs its OWN random 6-char suffix (reusing `generateAccountNumber()` from
 * `repositories/accounts.ts`, the exact function real account creation uses, so
 * backfilled numbers are indistinguishable from freshly-minted ones) and a collision
 * against another row (pre-existing or concurrently backfilled) must be retried with a
 * fresh suffix — not expressible as a single SQL statement against this schema.
 *
 * Run from repo root (requires a Postgres connection string in `.env`/`.env.local` —
 * see backend/.env.example for the variable name; this script accepts DATABASE_URL or
 * PG_CONNECTION_STRING, matching inc-001-location-inventory.ts's convention):
 *
 *   npx tsx backend/scripts/backfill-account-numbers.ts          # dry run (default)
 *   npx tsx backend/scripts/backfill-account-numbers.ts --apply  # actually writes
 *
 * Do NOT run with --apply against a production/live database as part of this change —
 * run it (dry run first, then --apply) against a local/dev database to confirm it
 * behaves as documented here, and leave the production run as a separate, deliberate
 * step for whoever owns that environment.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { Pool } from 'pg';

import { generateAccountNumber } from '../src/repositories/accounts.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');
dotenv.config({ path: path.join(repoRoot, '.env') });
dotenv.config({ path: path.join(repoRoot, '.env.local'), override: true });

const PG_UNIQUE_VIOLATION = '23505';
const MAX_ATTEMPTS_PER_ROW = 5;

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const pgConnString = process.env.DATABASE_URL?.trim() ?? process.env.PG_CONNECTION_STRING?.trim();
  if (!pgConnString) {
    throw new Error(
      'Missing Postgres connection string. Set DATABASE_URL (or PG_CONNECTION_STRING) in .env/.env.local.',
    );
  }

  const pool = new Pool({ connectionString: pgConnString });

  try {
    const { rows: pending } = await pool.query<{ id: string; email: string }>(
      `select id, email from app.accounts where account_number is null order by created_at asc`,
    );

    // eslint-disable-next-line no-console
    console.log(
      `[backfill-account-numbers] mode=${apply ? 'APPLY' : 'DRY RUN'} pendingAccounts=${pending.length}`,
    );

    if (pending.length === 0) {
      // eslint-disable-next-line no-console
      console.log('[backfill-account-numbers] Nothing to do — every account already has an account_number.');
      return;
    }

    if (!apply) {
      // eslint-disable-next-line no-console
      console.log(
        '[backfill-account-numbers] Dry run — no writes performed. Re-run with --apply to actually set ' +
          `account_number on these ${pending.length} account(s). First 10 affected ids: ` +
          `${pending.slice(0, 10).map((r) => r.id).join(', ')}`,
      );
      return;
    }

    let updated = 0;
    let failed = 0;

    for (const row of pending) {
      let attempt = 0;
      let done = false;
      while (!done && attempt < MAX_ATTEMPTS_PER_ROW) {
        attempt++;
        const candidate = generateAccountNumber();
        try {
          // `and account_number is null` — defends against a concurrent writer (e.g. a
          // fresh account-creation insert cannot land here since this only ever targets
          // pre-existing rows, but a second concurrent run of this same script could)
          // ever double-setting a row this process already believes is still pending.
          const result = await pool.query(
            `update app.accounts set account_number = $1, updated_at = now()
             where id = $2 and account_number is null`,
            [candidate, row.id],
          );
          if (result.rowCount && result.rowCount > 0) {
            updated++;
            done = true;
          } else {
            // Row was already filled in (by a concurrent run) between our SELECT and
            // this UPDATE — not an error, just nothing left to do for this row.
            done = true;
          }
        } catch (err) {
          const code = (err as { code?: string } | null)?.code;
          if (code === PG_UNIQUE_VIOLATION && attempt < MAX_ATTEMPTS_PER_ROW) {
            continue; // account_number collision — retry with a fresh candidate
          }
          failed++;
          done = true;
          // eslint-disable-next-line no-console
          console.error(
            `[backfill-account-numbers] Failed to set account_number for account ${row.id} (${row.email}): ` +
              (err instanceof Error ? err.message : String(err)),
          );
        }
      }
    }

    // eslint-disable-next-line no-console
    console.log(`[backfill-account-numbers] Done. updated=${updated} failed=${failed} totalPending=${pending.length}`);
    if (failed > 0) {
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[backfill-account-numbers] Failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
