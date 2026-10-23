# Feature 016 — `cto` ruling on Stage 5 findings (2026-10-23)

Rules on the three questions raised after Stage 5 completed across `03-architecture-review.md`
(backend-architect), `03b-data-model-review.md` (database-architect), and
`03c-security-review-stage5.md` (cybersecurity-architect, the operative findings). Code verified
directly before ruling.

**File-path correction:** the defects below live in `backend/src/repositories/customer-profiles.ts`
(the repository layer), not a `routes/customer-profiles.ts` as `03c` references in places — see
the note appended to `03c` itself for the exact citation fix. `cybersecurity-architect` owns that
file and corrects it in place per house rule; this section only flags it.

## Verification

Both defects `03c` flagged are real, confirmed directly against
`backend/src/repositories/customer-profiles.ts`:

- **Verify-then-swap** (`updateForAccount`, lines 188-225): the `$set` applies unconditionally. The
  re-derive step at line 216 is skipped whenever status is `pending_review`, `verified`, `rejected`
  or `action_required`. A customer can edit name, DOB, ID-last-4, or address after verification,
  and `verified` stays set.
- **Approval race** (`reviewVerification`, lines 277-303): filters only on
  `verificationStatus: 'pending_review'`, with no check that the approved data is the data an admin
  actually looked at. Customers can also edit while `pending_review`. There's a further ABA case:
  `pending → action_required → edit → resubmit → pending` lets an admin with a stale page open
  approve data they never saw.
- **Current blast radius:** nothing in this codebase currently enforces on `verified` — it is shown
  to admin staff as a trust label (`src/admin/pages/AdminVerificationPages.tsx`,
  `AdminDataPages.tsx`) and drives alerts (`backend/src/lib/sync-account-alerts.ts:104`). Feature
  016 would be the first thing to actually *gate* on it.

## Ruling 1 — CT-16: escalate now, folded into the existing CT-4b schedule, not standalone

CT-16 was deliberately folded into the CT-4b instruction schedule
(`docs/organization/10-data-protection-contract-obligations.md:898`). CT-4b itself was due
2026-09-26, is also unanswered, and its G-6 item already blocks re-enabling location ingestion.
Sending CT-16 on its own would undo that fold-in decision and split the Client's attention across
two asks instead of one.

**Action:** one owner escalation covering the whole overdue CT-4b schedule (CT-16 included).
`compliance-specialist` drafts it; `cto`/owner sends it. Name Feature 016 Tier 1 real-customer
activation and all of Track B as newly blocked consequences, alongside G-6. Ask for a firm response
date. **Add one requirement the draft must include:** the Client's answer must result in a new
Register A row (I-10 or later, in `docs/organization/11-documented-client-instructions.md`)
covering the specific data Tier 1 enforcement relies on — a Register B gap getting answered is not
itself an authorization; the authorization is the new Register A row. Record a dated escalation
entry under CT-16/CT-4b in `10-data-protection-contract-obligations.md` as an append, not a rewrite.

## Ruling 2 — fix both defects now, as a standalone defect-fix track, independent of Feature 016's timeline

These are integrity gaps in a system that is already live, they're small, and Feature 016 needs
them closed regardless of its own CT-16 blocker — don't let them wait on that.

- Run as a defect-fix track. Stage 8 (`security-engineer` review) and Stage 10 (QA) apply in full —
  no skipping for either this or Feature 016 later citing it.
- Owners: `backend-architect` sets the design, a backend engineer implements, `database-architect`
  owns any schema/field change.
- The fix must guarantee:
  - **(a)** Changing any identity-bearing field (name, DOB, ID-last-4, residential address) while
    `verified` drops status back to unverified; customer must resubmit. Phone/emergency-contact
    treatment is `backend-architect`'s call, but must be written down explicitly, not left implicit.
  - **(b)** Identity-bearing fields are locked (409) while `pending_review`.
  - **(c)** Approval checks the data, not just the status — submit records a revision
    counter/hash of submitted fields; the admin review page carries it; the approve/reject update
    filters on it, so a stale page gets 409. (b) alone does not close the ABA case.
  - **(d)** The status change is recorded in the audit trail.
- **Read-only check of existing data (no action without a separate ruling):** `database-architect`
  counts `verified` profiles where `updatedAt > verificationReviewedAt`. This is a hint only —
  profile-picture updates also bump `updatedAt` — report the count, take no action on customer
  records from it alone.
- Once this lands, Feature 016 Stage 7 cites it as a dependency rather than re-designing it.

## Ruling 3 — other blockers

- **Track A dark build:** cleared through Stages 6-9 on Register A row I-1, under these
  conditions: no real customer data in any environment; flag defaults OFF in `render.yaml`/
  production; Stage 9 adds an explicit activation precondition — Tier 1 is not switched on against
  real customers until (i) the new Register A row exists, (ii) Ruling 2's fix is merged, and (iii)
  the existing CT-1/15/16 flag conditions are met. The Register A row is a separate, independent
  blocker on top of the flag conditions already designed into the kickoff doc.
- **Track B:** design-only may continue, per the Stage 5 architecture review (`b664135`). No build
  work until a Register A row covers it.
- **Feature 016 Stage 8** is blocked until Ruling 2's fix is merged, per the security review.

**Signed:** `cto`, 2026-10-23. Verified directly against
`backend/src/repositories/customer-profiles.ts` lines 188-225 and 277-303 before ruling.
