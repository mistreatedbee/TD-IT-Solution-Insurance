-- Feature 001 — actor-vs-subject fix for `app.account_audit_log`'s `privileged_data_access`
-- event (SR-10).
-- Author: authentication-engineer
-- Status: PAPER DESIGN, same posture as database-design.md / database-addendum-001.md /
-- migrations/030. No live Supabase project exists; this SQL has not been executed anywhere.
-- Requires database-architect + security-engineer review before being applied to any
-- live project, same review requirement every prior migration in this feature carries.
--
-- Continues the migration numbering from migrations/030 (which ends at 30).
--
-- Finding this closes: api-design.md §11 Amendment E flagged (as a real, pre-existing
-- schema limitation, not invented here) that `app.account_audit_log` has exactly one
-- account column, and `routes/invitations.ts` (actor) and `routes/internal.ts` (subject)
-- disagreed about what it means for the same `privileged_data_access` event type.
-- `account_id` was, and remains, the event's SUBJECT (whose data/state the event is
-- about) — consistent with every other event type already writing to this column
-- (login_success/failure, mfa_enrolled, etc., all naturally subject-only, no actor
-- concept). This migration adds a separate ACTOR column so a `privileged_data_access`
-- event (the only event type in this table with a meaningful actor/subject split) can
-- record both when they differ, instead of one call site overloading `account_id` to
-- mean "actor" and silently losing the subject.
--
-- Same pattern `app.account_state_transitions` already established (database-design.md
-- §2.4: `account_id` = subject, `actor_account_id` = who performed the transition,
-- nullable, `on delete set null`) — this migration extends that existing, reviewed
-- pattern to `app.account_audit_log` rather than inventing a new one.

alter table app.account_audit_log
  add column if not exists actor_account_id uuid references app.accounts (id) on delete set null;

comment on column app.account_audit_log.actor_account_id is
  'Populated only for event types with a meaningful actor/subject split — currently just '
  'privileged_data_access (SR-10). NULL when there is no acting account (a '
  'service-to-service internal call, e.g. GET /internal/accounts/{id}/status) or when '
  'actor and subject are the same account. account_id remains the event''s SUBJECT in '
  'every case, exactly as for every other event type in this table (login_success/failure, '
  'mfa_enrolled, etc.) — this column is additive, not a redefinition of account_id''s '
  'existing meaning. on delete set null, mirroring account_id and '
  'app.account_state_transitions.actor_account_id: an actor account being later '
  'removed/anonymized must never delete the historical fact that the actor performed this '
  'access, only lose the identity of who it was.';

-- "What did this admin look at" — actor-side audit reconstruction, mirroring
-- account_state_transitions_actor_account_id (database-design.md §3). Partial: only rows
-- that actually have an actor recorded (today, that's every privileged_data_access row
-- with an admin caller — the internal-service-caller rows correctly have no actor at all).
create index if not exists account_audit_log_actor_account_id
  on app.account_audit_log (actor_account_id)
  where actor_account_id is not null;
