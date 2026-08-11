-- Feature 001 — Stage 9 schema addendum implementing security-review.md required changes
-- Author: authentication-engineer (Stage 9 implementation)
-- Status: PAPER DESIGN, same posture as database-design.md / database-addendum-001.md.
-- No live Supabase project exists; this SQL has not been executed anywhere.
-- Requires database-architect + security-engineer review before being applied to any
-- live project (same review requirement the baseline and addendum-001 documents carry).
--
-- Implements, by security-review.md ID:
--   SR-1  — app.enrollment_tickets (server-issued, single-use, account-bound artifact
--           closing the client-supplied-accountId MFA-enrollment takeover path).
--   SR-6  — app.reset_mfa_verification_tokens (bounds/binds the privileged
--           password-reset MFA-verify step to a specific reset attempt and account).
--   SR-8  — 'rotated' added to app.session_revoked_reason; 'refresh_token_reuse_detected'
--           added to app.audit_event_type.
--   SR-9  — user_type / partner_organization_id added to app.account_status_cache
--           (and to the sync trigger), so the internal status surface can expose the
--           authorization attributes that matter most without a wide app.accounts read.
--   SR-10 — 'privileged_data_access' added to app.audit_event_type.
--   SR-11 — app.sessions gains family_id (rotation-chain anchor) and
--           absolute_expires_at (the cap rotation must carry forward, never extend),
--           plus mfa_verified_at for the invitation-issuance step-up requirement.
--
-- Continues the migration numbering from database-addendum-001.md §6 (which ends at 29).

-- =====================================================================================
-- SR-8: rotation semantics — a normal rotation needs a real revoked_reason value, and
-- reuse detection needs its own audit-event type.
-- =====================================================================================

alter type app.session_revoked_reason add value if not exists 'rotated';
alter type app.session_revoked_reason add value if not exists 'device_mismatch';
-- 'device_mismatch': api-design.md's contract does not yet carry deviceId on
-- /session/refresh; docs/features/003-mobile-app-foundation/architecture.md §3.2
-- (M-01) proposes adding it so a same-generation refresh from an unexpected device is
-- detectable before rotation, not only after (which 'rotation_reuse_detected' already
-- covers). Added here so the refresh endpoint can act on that proposal now rather than
-- needing a second schema change once M-01 is formally ratified by backend-architect.

alter type app.audit_event_type add value if not exists 'refresh_token_reuse_detected';
alter type app.audit_event_type add value if not exists 'privileged_data_access'; -- SR-10
alter type app.audit_event_type add value if not exists 'mfa_enrollment_ticket_issued';
alter type app.audit_event_type add value if not exists 'mfa_enrollment_ticket_rejected';
alter type app.audit_event_type add value if not exists 'account_locked';
alter type app.audit_event_type add value if not exists 'session_family_revoked';
-- 'session_family_revoked': distinct from the single-session 'session_revoked' value
-- already in the baseline enum — fires once per reuse-detection/theft-response event
-- (SR-8's "revoke the entire rotation chain and every active session"), not once per
-- row, so an admin/audit reader sees one event for the incident, not N.

-- =====================================================================================
-- SR-9: account_status_cache must carry the authorization attributes that matter most
-- for the future security-company-operator surface, not just account_state/mfa_required.
-- =====================================================================================

alter table app.account_status_cache
  add column if not exists user_type app.user_type,
  add column if not exists partner_organization_id uuid;

-- Backfill is a no-op on a greenfield project (no existing rows); kept for honesty about
-- what a real migration against a live table would need to do.
update app.account_status_cache c
set user_type = a.user_type,
    partner_organization_id = a.partner_organization_id
from app.accounts a
where a.id = c.id
  and (c.user_type is distinct from a.user_type
       or c.partner_organization_id is distinct from a.partner_organization_id);

alter table app.account_status_cache
  alter column user_type set not null;

create or replace function app.sync_account_status_cache()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into app.account_status_cache
    (id, account_state, mfa_required, user_type, partner_organization_id, suspended_at, deactivated_at, updated_at)
  values
    (new.id, new.account_state, new.mfa_required, new.user_type, new.partner_organization_id, new.suspended_at, new.deactivated_at, now())
  on conflict (id) do update
    set account_state           = excluded.account_state,
        mfa_required            = excluded.mfa_required,
        user_type               = excluded.user_type,
        partner_organization_id = excluded.partner_organization_id,
        suspended_at            = excluded.suspended_at,
        deactivated_at          = excluded.deactivated_at,
        updated_at              = now();
  return new;
end;
$$;

drop trigger if exists accounts_sync_status_cache on app.accounts;
create trigger accounts_sync_status_cache
  after insert or update of account_state, mfa_required, user_type, partner_organization_id, suspended_at, deactivated_at
  on app.accounts
  for each row
  execute function app.sync_account_status_cache();

comment on column app.account_status_cache.user_type is
  'SR-9: added so /internal/accounts/{id}/status and any future operator-facing '
  'authorization check can re-derive role/org scope cheaply, per D-2(d) (never trust '
  'the JWT claim alone), without reading the wide app.accounts row.';

comment on column app.account_status_cache.partner_organization_id is
  'SR-9: security-company-operator org scope, re-derivable at the same cost as '
  'account_state/mfa_required. Binding forward constraint for the first operator-facing '
  'endpoint (security-review.md §5.3): every partner-org-scoped query must read this '
  'column server-side, never trust a client-presented claim or parameter.';

-- =====================================================================================
-- SR-11: absolute session-lifetime cap that rotation cannot extend, plus the
-- mfa_verified_at column the POST /v1/invitations step-up requirement needs.
-- =====================================================================================

alter table app.sessions
  add column if not exists family_id uuid,
  add column if not exists absolute_expires_at timestamptz,
  add column if not exists mfa_verified_at timestamptz;

update app.sessions set family_id = id where family_id is null;
update app.sessions set absolute_expires_at = expires_at where absolute_expires_at is null;

alter table app.sessions
  alter column family_id set not null,
  alter column absolute_expires_at set not null;

alter table app.sessions
  add constraint sessions_absolute_expires_at_not_before_expires_at
    check (absolute_expires_at >= expires_at);

comment on column app.sessions.family_id is
  'SR-11: anchors a refresh-token rotation chain to the timestamp of the FIRST session '
  'in the chain. Every rotation copies the prior row''s family_id and absolute_expires_at '
  'verbatim — application code must never set absolute_expires_at to anything later than '
  'the value it inherited from replaced_by/previous row, which is what makes the cap '
  'absolute rather than a per-rotation ceiling that resets on every refresh.';

comment on column app.sessions.absolute_expires_at is
  'SR-11: hard ceiling on the whole rotation chain — privileged web sessions: created_at '
  '+ 8 hours; customer mobile sessions: created_at + 90 days (security-review.md §6). '
  '/session/refresh must refuse to mint a new access+refresh pair once now() exceeds this '
  'value, regardless of how recently the presented refresh token was itself issued.';

comment on column app.sessions.mfa_verified_at is
  'SR-11: set at login/MFA-challenge success. POST /v1/invitations requires this to be '
  'no older than 15 minutes (step-up re-verification) before allowing an admin to mint '
  'another privileged account — security-review.md §6, MFA re-prompt cadence row.';

create index if not exists sessions_family_id on app.sessions (family_id);

-- =====================================================================================
-- SR-1: server-issued, single-use, account-bound enrollment ticket. Closes the
-- client-supplied-accountId privileged-account-takeover path on the pre-session
-- /mfa/enroll and /mfa/enroll/verify path. This is the scoped-hold fix — no
-- implementation of /invitations/{token}/accept, /mfa/enroll or /mfa/enroll/verify may
-- ship without this table.
-- =====================================================================================

create table if not exists app.enrollment_tickets (
  id           uuid primary key default gen_random_uuid(),
  token_hash   text not null,
  account_id   uuid not null references app.accounts (id) on delete cascade,
  expires_at   timestamptz not null,
  used_at      timestamptz,
  created_at   timestamptz not null default now(),

  constraint enrollment_tickets_used_before_expiry
    check (used_at is null or used_at <= expires_at + interval '1 minute')
);

comment on table app.enrollment_tickets is
  'SR-1. Issued exactly once by POST /invitations/{token}/accept, immediately after the '
  'account row is created and before any session exists. Single-use (used_at set the '
  'moment /mfa/enroll/verify succeeds against it), 10-minute TTL, cryptographically bound '
  'to the account it was issued for. /mfa/enroll and /mfa/enroll/verify accept ONLY this '
  'ticket on the pre-session path and derive the account from it — they never accept a '
  'client-supplied accountId. Never exposed via PostgREST (same posture as '
  'app.account_status_cache, §5.6 of the baseline) — service-role/direct-app-role access '
  'only, since a client never queries this table, it only presents the opaque token value '
  'it was handed in the accept response.';

create unique index if not exists enrollment_tickets_token_hash_unique
  on app.enrollment_tickets (token_hash);

create index if not exists enrollment_tickets_account_id_live
  on app.enrollment_tickets (account_id)
  where used_at is null;

alter table app.enrollment_tickets enable row level security;
-- No policies, no grants, for `authenticated` or `anon` — identical reasoning to
-- app.sessions / app.idempotency_keys (database-addendum-001.md §5): this table has no
-- client-facing use case even in principle, the client only ever holds the opaque token
-- value handed to it in a response body, never a row from this table directly.

-- =====================================================================================
-- SR-6: rate-limit-able, single-use, account+reset-bound token for the privileged-role
-- password-reset MFA-verification step.
-- =====================================================================================

create table if not exists app.reset_mfa_verification_tokens (
  id               uuid primary key default gen_random_uuid(),
  token_hash       text not null,
  account_id       uuid not null references app.accounts (id) on delete cascade,
  reset_token_hash text not null,
  expires_at       timestamptz not null,
  used_at          timestamptz,
  created_at       timestamptz not null default now()
);

comment on table app.reset_mfa_verification_tokens is
  'SR-6. Issued by POST /auth/reset-password/confirm when the target account is a '
  'privileged role (BR-4). reset_token_hash binds this token to the specific Supabase '
  'recovery token that produced it, so a token cannot be replayed against a different '
  'reset attempt. 5-minute TTL, single-use. The password is NOT changed until '
  'POST /auth/reset-password/mfa-verify succeeds against this token (security-review.md '
  'SR-6''s explicit rider) — a reset token alone can never lock out or take over a '
  'privileged account.';

create unique index if not exists reset_mfa_verification_tokens_token_hash_unique
  on app.reset_mfa_verification_tokens (token_hash);

alter table app.reset_mfa_verification_tokens enable row level security;
-- No policies, no grants — same posture as app.enrollment_tickets above.

-- =====================================================================================
-- Retention note (honesty, not a decision): app.enrollment_tickets and
-- app.reset_mfa_verification_tokens are both short-lived (10 min / 5 min TTL) and small.
-- No purge job is defined here. Recommend folding both into the same retention docket as
-- app.sessions (database-addendum-001.md §1.3, still open with compliance-specialist)
-- rather than inventing a third ungoverned retention policy.
-- =====================================================================================
