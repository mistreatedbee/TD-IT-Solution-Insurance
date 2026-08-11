-- Feature 001 / ADR-0006 (ratified 2026-08-11, §16) — new `app.audit_event_type` values.
-- Author: cto (ratification rulings R-1, R-2) — DDL formalization remains database-architect's
-- per ADR-0006 §5, which fixed the guarantees and left the shape to that role.
-- Status: APPLIED to the live Supabase project (`TD IT Solutions`, eu-central-1) on
--   2026-08-11. DO NOT RE-APPLY. Verified by `cto` 2026-08-11 against the live catalog:
--   `privileged_bulk_access` and `privilege_granted` are both present in `app.audit_event_type`.
--   The original header read "WRITTEN, NOT YET APPLIED to any project, live or otherwise" and
--   was left stale by whoever applied it — corrected here rather than in a doc, because
--   `.cursor/rules/database.mdc` makes this header, not an external note, the source of truth
--   for application status.
--   Honesty note on the headers of 029/030/031: they say "no live Supabase project exists."
--   That is also stale — a live Supabase project exists and carries the full schema.
--
-- Continues the numbering from migrations/031.
--
-- WHY THIS IS A SEPARATE FILE FROM 033, AND NOT A COSMETIC SPLIT:
--   `alter type ... add value` cannot be followed, in the same transaction, by a statement
--   that uses the new value as a literal. Migration 033 adds CHECK constraints that reference
--   both values added here. Splitting the enum additions into their own file guarantees they
--   are committed before 033 parses them, whatever transaction granularity the runner uses.
--   Apply 032 first, then 033. Do not merge them.

-- =====================================================================================
-- ADR-0006 R-1 (§16.1) — the call-scoped row of the bulk-disclosure shape.
--
-- AUD-3(b) required that a bulk list call record the subjects it actually disclosed, and
-- offered two shapes. R-1 chose one row per disclosed subject (as `privileged_data_access`,
-- indistinguishable from a detail read, which is the point — the existing subject-side index
-- answers the subject-keyed query with no array containment) PLUS one call-scoped row, which
-- is this value.
--
-- A `privileged_bulk_access` row carries NO subject, an actor, and `result_count` — including
-- `result_count = 0`, so a filtered list that disclosed nothing still leaves the attempt
-- reconstructible (compliance-specialist, ADR-0006 §14.5.5). It exists to record the *call*;
-- it must never be treated as a disclosure record and it never appears in a subject-keyed
-- query, because its `account_id` is always null.
-- =====================================================================================

alter type app.audit_event_type add value if not exists 'privileged_bulk_access';

-- =====================================================================================
-- ADR-0006 R-2 (§16.2) — privilege GRANTING is not privileged data ACCESS.
--
-- Closes RR-4 structurally instead of accepting it. `POST /v1/invitations` has been emitting
-- `privileged_data_access` since SR-10, and it reads nobody's data — it mints a privileged
-- account. It therefore diluted every subject-keyed query with rows that are not accesses,
-- and the only available filter was the heuristic "account_id is null and actor_account_id is
-- not null", which works today only because invitation issuance is currently the sole
-- actor-only row type. security-engineer (ADR-0006 §15, AUD-8 finding 3) flagged that the
-- heuristic degrades silently the moment a second such row type appears; R-1's shape would
-- have been a candidate to do exactly that. A real column beats an inferred filter.
--
-- Carries Feature 001 contract amendment api-design.md §11.F (v1.3.0) — this changes the
-- observable event type of a live endpoint, so it is amended, not changed silently.
-- =====================================================================================

alter type app.audit_event_type add value if not exists 'privilege_granted';
