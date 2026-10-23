# DEFECT-001 — Customer verification integrity: verify-then-swap and approval race

**Status:** Design complete, ready for Stage 8 (Security Review) and Stage 9 (Development).
**Track:** Standalone defect-fix track, independent of Feature 016's own timeline, per
`cto`'s ruling (Ruling 2) in
[`docs/features/016-kyc-identity-verification/03d-cto-ruling-stage5.md`](../../features/016-kyc-identity-verification/03d-cto-ruling-stage5.md).
**Filed under:** `docs/organization/defect-fixes/` — this is a new location. No `docs/defects/`
or standalone defect-record convention existed in this repo before now (checked: no prior
`DEFECT-*` files, and `docs/organization/incidents/INC-*` is reserved for operational
incidents/post-mortems on live production events, which this is not — these are two
pre-existing design defects, caught by review, never yet exploited as far as is known). This
sits under `docs/organization/` rather than under a single `docs/features/*/` directory because
the ruling is explicit that this is *not* Feature 016-scoped — it fixes a system that predates
Feature 016 and was already live. Future standalone defects should use
`docs/organization/defect-fixes/DEFECT-NNN-<slug>.md`, sequential, until/unless a different
convention is ratified.
**Original finding:** `docs/features/016-kyc-identity-verification/03c-security-review-stage5.md`
§1.4 (TA-1 verify-then-swap, TA-2 review TOCTOU), filed by `cybersecurity-architect`.
**Ruling:** `cto`, 2026-10-23, `03d-cto-ruling-stage5.md` §"Ruling 2".
**Owners (per ruling):** `backend-architect` (this doc, design) → backend engineer
(implementation) → `database-architect` (schema/field changes, confirms or amends §3/§5 below) →
`security-engineer` (Stage 8) → QA (Stage 10). This document is design only; it is not a Stage 8
sign-off and does not substitute for one.
**Scope boundary:** this fixes exactly the two defects below and guarantees the CTO's four
properties (a)-(d). It deliberately does **not** implement Feature 016's TA-3/TA-4/TA-6/TA-7/
TA-8/M-1…M-5 — those remain Feature 016 Stage 7/8 scope and are cited, not duplicated, where they
overlap (see §6).

---

## 1. The two defects (as they exist today)

Both live in `backend/src/repositories/customer-profiles.ts`.

**Defect 1 — verify-then-swap (`updateForAccount`, lines ~188-225).** The `$set` in the
`findOneAndUpdate` call applies the incoming patch unconditionally, regardless of current
`verificationStatus`. The re-derive step (`deriveVerificationStatus()` + the guard at line 216)
is skipped whenever status is `pending_review`, `verified`, `rejected`, or `action_required` —
i.e. it never fires for any status an admin has already touched. Net effect: `PATCH
/account/profile` (`backend/src/routes/customer-profile.ts:84-143`) lets a customer change
`firstName`, `lastName`, `dateOfBirth`, `idNumberLast4`, or `residentialAddress` at any time,
including while `verified`, with `verified` staying set across the change.

**Defect 2 — approval race (`reviewVerification`, lines ~277-303).** The write filters only on
`{ accountId, verificationStatus: 'pending_review' }`. There is no check that the data being
approved is the data an admin actually looked at. Combined with Defect 1 (fields are not locked
during `pending_review` either), this has two failure shapes:
- **Simple TOCTOU:** admin opens the review page, customer edits a field, admin approves — the
  approval applies to data the admin never saw.
- **ABA race:** `pending_review → action_required (admin decision) → customer edits → customer
  resubmits → pending_review` again. A second admin page, opened against the *first*
  `pending_review` instance and left open, can still fire its stale "Approve" button against the
  *second* instance's data, which that admin never reviewed.

Call sites verified: `backend/src/routes/customer-profile.ts` (`PATCH /account/profile`, `POST
/account/profile/verification/submit`), `backend/src/routes/admin-verification.ts` (`GET
/admin/verification-requests`, `GET /admin/verification-requests/count`, `GET
/admin/accounts/:id/profile`, `PATCH /admin/accounts/:id/profile/verification`).

---

## 2. Identity-bearing field classification (CTO's (a), explicit call)

**Identity-bearing** (an edit while `verified` must drop status back to unverified; an edit while
`pending_review` must be refused):
- `firstName`
- `middleName`
- `lastName`
- `dateOfBirth`
- `idNumberLast4`
- `residentialAddress`

**Not identity-bearing, for this purpose** (edits proceed unchanged, no lock, no status reset):
- `phone` — a contact channel, already independently used for MFA/SMS and account contact;
  editing it does not change who the customer is, and `03c`/`03b` do not treat it as part of the
  admin's identity attestation.
- `emergencyContact` — describes a *third party*, not the subject customer; it has never been
  part of what an admin reviews when deciding `verified` (`AdminVerificationPages.tsx` and the
  admin detail payload show name/phone/ID/address — see `admin-verification.ts:51-59` — not
  emergency contact).
- `profilePictureUpdatedAt` — not a profile field the customer edits via `PATCH
  /account/profile` at all (it is written only internally by the picture upload/delete routes);
  excluded from the identity-bearing set so picture changes are never locked or treated as a
  reason to drop `verified`.

This is a judgment call within the discretion the ruling gives `backend-architect`, written down
explicitly per the ruling's instruction, not left implicit. Rationale above is the record of it;
`product-manager`/`compliance-specialist` may revisit if they disagree, but the default design
assumes this split.

---

## 3. Data model changes (owned by `database-architect` to confirm/amend; proposed shape below)

On `CustomerProfileDocument` / `CustomerProfileDbDoc` (MongoDB, `customer_profiles` collection):

```ts
verificationRevision: number; // monotonically increasing; starts at 0 on profile creation
```

- Written with `$inc` (atomic), never read-then-written-back, at the two points where a profile
  enters `pending_review`: `submitVerification()` and nowhere else (edits during
  `action_required`/`rejected` do not bump it — only an actual resubmission does, which is exactly
  the event that must invalidate a stale admin page).
- No backfill needed: `toProfile()` maps `doc.verificationRevision ?? 0` for documents created
  before this change ships, consistent with the existing `profilePictureUpdatedAt ?? null`
  pattern in the same file.
- Exposed read-only in both admin-facing payloads: `serializeCustomerProfile()` (shared by
  customer and admin routes today) gets a `verificationRevision` field, and the hand-built row
  shape in `admin-verification.ts`'s `GET /admin/verification-requests` (`enriched`, lines 47-61)
  gets `verificationRevision: profile.verificationRevision` added alongside the other fields. It
  is harmless to also return it to the customer via the shared serializer (not PII, not secret) —
  simpler than forking the serializer for one field.

On `app.account_audit_log` (Supabase Postgres, ADR-0006's audit trail — this is the identity-side
audit log `audit-log.ts` already writes to): two new `AuditEventType` values and, if
`database-architect` agrees with the shape below, one new nullable column:

- `customer_identity_reset` — written by `updateForAccount()` whenever an identity-bearing edit
  flips a `verified` profile back to `in_progress` (§4.1). Subject = the customer's own
  `accountId`; `actorAccountId` = the same `accountId` (self-service action, not privileged
  access to someone else's data — **not** added to `PRIVILEGED_ACCESS_EVENT_TYPES`).
- `customer_verification_decision` — written by the admin-verification route when
  `reviewVerification()` succeeds. Subject = the customer's `accountId`; `actorAccountId` = the
  reviewing admin. **Added to `PRIVILEGED_ACCESS_EVENT_TYPES`** (this is exactly the privileged
  decision TA-3 in `03c` says is missing an attributable record — see §6 on why this document
  only covers the audit *event*, not TA-3's `verificationReviewedBy` persisted column, which
  remains Feature 016 Stage 6 scope).
  - Proposed new nullable column `decision text`, mirroring the existing `result_count`
    pattern (`migrations/033`'s `account_audit_log_result_count_only_on_bulk`): a new CHECK
    constraint `account_audit_log_decision_only_on_verification_decision` requires `decision` to
    be set if and only if `event_type = 'customer_verification_decision'`, and when set, `decision
    IN ('verified', 'rejected', 'action_required')`.
  - Proposed migration file: `backend/migrations/038_customer_verification_decision_audit.sql`
    (next free number after `037`; `database-architect` confirms numbering at merge time since
    other migrations may land first).
  - `audit-log.ts`'s `COLUMNS`/`COLUMN_COUNT`/`rowValues()`/`assertInvariants()` all need the
    corresponding mechanical update, same shape as the existing `resultCount` handling.

This is the only schema/field change this design requires. `database-architect` owns final sign
off on both the Mongo field and the Postgres migration per the ruling ("`database-architect` owns
any schema/field change").

---

## 4. Repository logic

### 4.1 `updateForAccount` — close Defect 1, implement (a) and (b)

```
IDENTITY_BEARING_FIELDS = {firstName, middleName, lastName, dateOfBirth, idNumberLast4, residentialAddress}

updateForAccount(accountId, patch):
  touchesIdentity = any key of patch in IDENTITY_BEARING_FIELDS

  if not touchesIdentity:
    # unchanged today's behaviour: $set/$setOnInsert upsert, then the existing
    # not_started/in_progress deriveVerificationStatus() pass (untouched — it already
    # leaves pending_review/verified/rejected/action_required alone).
    return existing upsert path

  # Identity-bearing edit: must read current status before deciding lock vs. reset,
  # and must not let a concurrent admin decision race the write (closes a TOCTOU this
  # fix would otherwise reopen) — retry-once CAS, not blind $set.
  for attempt in {0, 1}:
    current = col.findOne({accountId})          # may be null (new profile — never identity-locked)
    currentStatus = current?.verificationStatus ?? 'not_started'

    if currentStatus == 'pending_review':
      throw ProfileVerificationLockedError        # -> route: 409 CONFLICT (b)

    extraSet = {}
    extraInc = {}
    resetHappened = false
    if currentStatus == 'verified':
      extraSet.verificationStatus = 'in_progress'
      extraSet.verificationReviewedAt = null
      extraSet.rejectionReasonCustomerSafe = null
      extraInc.verificationRevision = 1
      resetHappened = true
    # action_required / rejected / in_progress / not_started: no forced status change —
    # the customer is already expected to be editing; sticky action_required/rejected only
    # clear via an explicit resubmit (submitVerification), not via this path.

    filter = current ? {accountId, verificationStatus: currentStatus} : {accountId}
    result = col.findOneAndUpdate(
      filter,
      { $set: {...patch, ...extraSet, updatedAt: now}, $inc: extraInc, $setOnInsert: ... },
      { upsert: not current, returnDocument: 'after' },
    )

    if result is null:
      continue   # lost the CAS race (status changed between read and write) — retry once

    if resetHappened:
      auditLog.record({accountId, actorAccountId: accountId, eventType: 'customer_identity_reset', ...})

    # existing not_started/in_progress derive pass still applies here, unchanged
    return toProfile(result)

  throw Error('Profile update failed — concurrent verification state change')  # after 2 failed attempts
```

Notes:
- The `pending_review` branch must be checked **first**, before the `verified` branch, since they
  are mutually exclusive states anyway — ordering is for readability, not correctness.
- The CAS retry-once loop is not one of the CTO's four named properties, but is necessary to
  actually *guarantee* (a)/(b) under concurrent requests — without it, a customer's identity edit
  and an admin's concurrent approve/reject could interleave between the read and the write and
  silently reintroduce a narrower version of Defect 1/2. Flagging this explicitly so `security-
  engineer` can check it at Stage 8 rather than assume it.
- `phone`-only or `emergencyContact`-only or `profilePictureUpdatedAt`-only patches never enter
  this branch at all (per §2), so they are never locked and never trigger a reset — including
  while `pending_review`, matching Feature 016's own TA-7 fail-safe-scope principle even though
  TA-7 itself is Feature 016 scope.

### 4.2 `submitVerification` — bump the revision

Unchanged except: the `$set` that moves status to `pending_review` also carries `$inc: {
verificationRevision: 1 }`. This is the only other place the counter moves, and it is exactly the
event (a genuine resubmission) that must invalidate any admin page open against the prior
`pending_review` instance.

### 4.3 `reviewVerification` — close Defect 2, implement (c)

```
reviewVerification(accountId, decision, rejectionReasonCustomerSafe, expectedRevision):
  profile = findByAccountId(accountId)
  if !profile: throw PROFILE_NOT_FOUND
  if profile.verificationStatus != 'pending_review': throw INVALID_VERIFICATION_STATE
  if profile.verificationRevision != expectedRevision: throw REVISION_MISMATCH   # cheap pre-check

  result = col.findOneAndUpdate(
    { accountId, verificationStatus: 'pending_review', verificationRevision: expectedRevision },  # authoritative check
    { $set: { verificationStatus: decision, verificationReviewedAt: now,
               rejectionReasonCustomerSafe: ..., updatedAt: now } },
    { returnDocument: 'after' },
  )
  if !result: throw REVISION_MISMATCH   # filter didn't match — stale page, race, or both
  return toProfile(result)
```

The pre-check and the filter say the same thing twice deliberately: the pre-check gives a fast,
clear error path for the common case (admin's page actually is stale), and the filter is what
*actually* closes the race, because it is evaluated atomically against the write, closing exactly
the gap a check-then-write pattern (Defect 2's original shape) leaves open.

**Why this closes the ABA case:** resubmission (`submitVerification`) is the only other writer of
`verificationRevision`, and it always increments it. A stale admin page necessarily holds the
revision value from *before* the resubmission that produced the current `pending_review`
instance, so its `expectedRevision` can never match. The filter's `verificationStatus:
'pending_review'` term alone (`03c`'s "(b) alone does not close the ABA case") cannot distinguish
the first and second `pending_review` instances from each other; the revision term can, because
it changes between them and the stale page cannot possibly know the new value in advance.

---

## 5. Route-level changes

**`backend/src/routes/customer-profile.ts`, `PATCH /account/profile`:** catch
`ProfileVerificationLockedError` and map to `apiError('CONFLICT', { message: 'Your profile is
locked while your identity verification is under review.' })` → 409. No request-shape change.

**`backend/src/routes/admin-verification.ts`:**
- `reviewBodySchema` gains a required field: `expectedRevision: z.number().int().nonnegative()`.
- `PATCH /admin/accounts/:id/profile/verification` passes it through:
  `ctx.customerProfiles.reviewVerification(accountId, decision, reason, bodyParsed.data.expectedRevision)`.
- Catch `REVISION_MISMATCH` and map to `apiError('CONFLICT', { message: 'This verification
  request was updated since you opened it. Refresh and try again.' })` → 409, alongside the
  existing `INVALID_VERIFICATION_STATE` → 409 and `PROFILE_NOT_FOUND` → 404 handling already
  there.
- After a successful decision, write the new `customer_verification_decision` audit event
  (§3) in addition to — not instead of — the existing generic `privileged_data_access` write at
  line 234-242, which records *that the admin accessed the record* and stays as is;
  the new event records *what was decided*. (d) is satisfied by this new event, not by reusing
  the generic one, since the generic one carries no decision value today (`03c` TA-3's point).
- `GET /admin/verification-requests`: add `verificationRevision` to the `enriched` row shape.
- `GET /admin/accounts/:id/profile`: already returns the full `serializeCustomerProfile()` output,
  so it picks up `verificationRevision` automatically once §3's serializer change lands.

**Dependency on other surfaces (not authored in this document, flagged as required coordinated
work):**
- `src/admin/api/admin-verification.ts` and `src/admin/pages/AdminVerificationPages.tsx` (web
  Admin Panel) must read `verificationRevision` from the list/detail fetch and send it back as
  `expectedRevision` in the `PATCH` body. Without this, every admin decision will 409. This is
  `frontend-architect`/the admin panel's engineer's implementation, not this role's — noted here
  so it is not missed, per the ruling's instruction that this fix must actually close the race,
  not just the backend half of it.
- `customer-profile-validation.ts`'s `updateCustomerProfileBodySchema` is unchanged — no new
  client-facing request field is needed for (a)/(b); the lock/reset behavior is entirely
  server-side and keys off current state, not a client-sent flag (consistent with Feature 016's
  own TA-4 principle of never trusting a client-asserted verification signal, even though TA-4
  itself is Feature 016 scope).

---

## 6. Explicit non-goals (so this isn't mistaken for Feature 016 work)

Not designed or implemented here — all remain Feature 016 Stage 6/7/8 scope, cited as
dependencies once this merges, per the ruling ("Once this lands, Feature 016 Stage 7 cites it as
a dependency rather than re-designing it"):
- TA-3's `verificationReviewedBy` **persisted column** (who decided) — this design's audit event
  (§3) already carries `actorAccountId` for the decision, which gives attributability in the audit
  trail per (d); a denormalized reviewer field on the profile document itself is a separate,
  smaller addition `database-architect` can fold into Feature 016 Stage 6 or do opportunistically
  alongside this fix — either is fine, it does not change the guarantees in this document.
- TA-4 (gate must never key on a client-asserted field), TA-6a/b (chokepoint/CI-2 rule for asset
  creation and asset edits), TA-7 (fail-safe scope for the KYC *gate* itself), TA-8 (test that
  `PATCH /account/profile` with `verificationStatus` in the body → 400) — these concern the
  Feature 016 asset-creation gate, not the verification-record integrity fixed here, except that
  TA-8 is good hygiene to add in the same PR if convenient; not required for (a)-(d).
- M-1…M-5 (flag plumbing, CI-2 rules, manifest entries) — Feature 016 Track A/B enforcement
  mechanism, unrelated to this fix.
- The read-only count the ruling asks `database-architect` to run (`verified` profiles where
  `updatedAt > verificationReviewedAt`) is a separate action item for `database-architect`, not
  part of this design, and explicitly "no action without a separate ruling."

---

## 7. Test requirements (for Stage 9/10, not exhaustive of Stage 8's own M-3-equivalent list)

- `verified` profile, `PATCH /account/profile` with any one identity-bearing field → profile
  becomes `in_progress`, `verificationReviewedAt` cleared, `verificationRevision` incremented,
  `customer_identity_reset` audit row written with `accountId` = subject = actor.
- `verified` profile, `PATCH /account/profile` with only `phone` and/or `emergencyContact` →
  status stays `verified`, no revision bump, no audit row.
- `pending_review` profile, `PATCH /account/profile` with any identity-bearing field → 409
  `CONFLICT`, no document mutation.
- `pending_review` profile, `PATCH /account/profile` with only `phone`/`emergencyContact` → 200,
  succeeds, status untouched.
- ABA sequence: submit (rev=1) → admin sets `action_required` → customer edits + resubmits
  (rev=2) → admin approve call carrying `expectedRevision: 1` → 409 `CONFLICT`; same call with
  `expectedRevision: 2` → 200, decision applied, `customer_verification_decision` audit row
  written with `decision: 'verified'`.
- Concurrent-write race: simulate the CAS filter missing on first attempt (status flips between
  read and write) → retried once → succeeds or exhausts to a clean error, never a silent
  unconditional overwrite.
- Pre-existing documents with no `verificationRevision` field read back as revision `0` (no
  backfill migration required).

---

**Filed by:** `backend-architect`, 2026-10-23, design only — Stage 8 (`security-engineer`) and
Stage 10 (QA) still apply in full before this is considered closed, per the ruling.
