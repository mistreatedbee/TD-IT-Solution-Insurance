-- Human-readable account reference number — business-owner top-priority request
-- (2026-10-23). Follows the spirit of `generateReferenceNumber()` in
-- `repositories/recovery-cases.ts` / `support-cases.ts` (RC-/SC- prefixed, random
-- suffix), adapted for an account: no date-scoping (an account isn't a daily-volume
-- event like a case), format `TD-` + 6 chars from a 31-char charset that deliberately
-- excludes `0`/`O` and `1`/`I`/`L` (ambiguous read aloud or handwritten) — see
-- `ACCOUNT_NUMBER_CHARSET` in `repositories/accounts.ts`.
-- Author: backend-engineer.
-- Status: WRITTEN, NOT YET APPLIED to any project, live or otherwise — whoever applies
-- this must correct this header per the precedent migrations/032/033/035's headers
-- document (029/030/031 were left stale after application).
--
-- Nullable, not NOT NULL: existing accounts have no value until
-- `backend/scripts/backfill-account-numbers.ts` is run (deliberately a separate,
-- manually-triggered step — see that script's header). New accounts get one at
-- creation (`createCustomerAccount` / `createPrivilegedAccountFromInvitation` in
-- `repositories/accounts.ts`). A future migration MAY add `NOT NULL` once the backfill
-- has been confirmed to have run against every live environment — not done here.
--
-- Multiple NULLs do not violate a unique index in Postgres, so the partial-backfill
-- period (some rows null, some populated) is safe under this index from day one.

alter table app.accounts
  add column if not exists account_number text null;

comment on column app.accounts.account_number is
  'Human-readable customer-facing account reference, format TD-XXXXXX (6 chars from '
  'charset ABCDEFGHJKMNPQRSTUVWXYZ23456789 — excludes 0/O and 1/I/L). Generated at '
  'account creation; backfilled for pre-existing accounts via '
  'backend/scripts/backfill-account-numbers.ts. Exposed on GET /account/me and the '
  'admin account list/detail endpoints. Not an identity/authorization key — app.accounts.id '
  'remains that; this is display/support-reference only.';

create unique index if not exists accounts_account_number_unique
  on app.accounts (account_number)
  where account_number is not null;
