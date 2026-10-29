# Feature 018 — Claims Filing and Adjudication — Pre-Launch Blockers Tracker

Opened: 2026-10-29, by `product-manager`, per `cto`'s ruling today that Feature 018 (Claims) is
engineering-complete per Stage 8 (`security-review.md` §12/§13) but cannot launch to real
customers until four non-engineering items and one product decision are closed.

**Source of truth for each item's origin:** `security-review.md` §12 (`compliance-specialist`'s
rulings, 2026-10-28), specifically §12.3, §12.4, and CR-018-4 / CR-018-8 / CR-018-9 in the §12.6
sign-off table. This document does not restate or reinterpret those rulings — it tracks closure of
the business/legal actions they require, which are outside Stage 8's engineering scope.

**This document is append-only per the house rule in the root `CLAUDE.md`** on shared lifecycle
documents once more than one role has contributed a section. Status updates are made by editing
the relevant row's **Status** cell and adding a dated note in the **Notes / history** column below
the table — do not delete or restructure another role's entry. Corrections to your own prior entry
must retain the superseded text marked void, per the pattern already used in
`docs/features/012-employee-dashboard/security-review.md` §10.6/§14.1.

## Status legend

`OPEN` — not started · `IN PROGRESS` — owner engaged · `BLOCKED` — waiting on another item/party ·
`CLOSED` — done, evidence linked.

## Items

| # | Item | Owner | Target date | Status | Ref |
|---|------|-------|--------------|--------|-----|
| 1 | **Real approval-ceiling number.** Confirm or set the actual `MAX_CLAIM_APPROVED_AMOUNT_ZAR` value in `backend/src/lib/claim-rules.ts`, replacing the interim R1,000,000 engineering placeholder, with a stated currency and real business basis (not the original, unjustified R10,000,000 figure). | `product-manager` (decision), ratified by `cto` | 2026-11-05 | OPEN | security-review.md §12.4, CR-018-9 |
| 2 | **Real Ombud/licence configuration values.** Supply production values for the `claimsNotice` block in `backend/src/config/env.ts` — National Financial Ombud Scheme contact, FAIS Ombud contact, and the insurer's FSP/licence numbers — replacing all `TODO_OWNER_MUST_CONFIGURE` placeholders. | `compliance-specialist`, with insurer licensing/legal function | 2026-11-12 | OPEN | security-review.md §12.3, CR-018-8 (N-2(8)) |
| 3 | **Legal review of decision-notice copy.** Insurer's legal/compliance function reviews every decision-notice template against the gazetted Policyholder Protection Rules text and removes the `[PLACEHOLDER COPY — not yet reviewed]` marker. | `compliance-specialist` + insurer legal counsel, drafting support from `technical-writer` | 2026-11-19 | OPEN | security-review.md §12.3, CR-018-8 (N-7) |
| 4 | **Policy-wording disclosure of the eligibility exclusion.** Write the "loss before cover / before registration / within waiting period" exclusion — which `FLAG_INCIDENT_BEFORE_ELIGIBILITY` depends on — into the actual policy wording and pre-contract disclosure. No claim may be rejected on this ground until this is done. | `product-manager` + `technical-writer`, signed off by insurer legal | 2026-11-19 | OPEN | security-review.md §12.2, §12.6 CR-018-4 (R7-4) |
| 5 | *(added by `compliance-specialist`, 2026-10-29)* **Written delivery of adverse-decision notices.** Rejected, partly approved and administratively closed claims must have their decision notice emailed to the customer's verified address, with each attempt recorded in `decisionNotices[].deliveries[]`. Nothing writes to `deliveries[]` today. Depends on the owner's Resend production-email action. | `notification-engineer` / owner (Resend) | not yet set | OPEN | security-review.md §12.3 N-6, CR-018-7; §16.4 |
| 6 | *(added by `compliance-specialist`, 2026-10-29)* **Engineering remainder from compliance re-verification.** CR-018-10: no notice may be issued while a `TODO_OWNER_MUST_CONFIGURE` placeholder remains. CR-018-11: an `OTHER` ground code needs a reason of at least 100 characters. CR-018-12: the mobile `ClaimDetailScreen` shows `decisionNotices[]` as the main content, plus `closeReason` and `quantumReason`. | `backend-engineer` (10, 11); `mobile-engineer` / `ui-designer` (12) | not yet set | OPEN | security-review.md §16.2, §16.5 |

## Decision required: payout path for launch (not yet made)

Per `cto`'s ruling, this is explicitly flagged as a **real product decision**, not something to
leave implicit: approved claims currently stop at `awaiting_payout` because a payment gateway
vendor has not been selected (open decision owned by `integration-architect` /
`cloud-infrastructure-architect` — see root `CLAUDE.md`). Two options:

- **Option A — Launch with a manual/offline payout process.** Approved claims are paid outside
  the platform (EFT run, manual finance process) while `awaiting_payout` stays the terminal
  in-app state. Requires a documented manual process, an owner, and a customer-facing
  expectation-setting notice (how and when payment will reach them) — this is itself a notice
  compliance would need to review, overlapping item 3 above.
- **Option B — Launch waits for the payment-gateway vendor decision.** Claims intake/adjudication
  ships, but the feature is not described to customers as capable of paying out until the
  gateway is selected and integrated.

**Decision owner:** `product-manager`, jointly with `cto` (shared roadmap-sequencing authority
per the `product-manager` role charter) and consulting `integration-architect` on gateway timeline
realism before committing to Option A or B.

**Target date for making this decision:** 2026-11-05 (same date as item 1, since both gate the
"go/no-go to real customers" call).

**Status: OPEN — decision not yet made as of this writing.**

## Notes / history

- 2026-10-29 (`product-manager`): Tracker opened per `cto` ruling. All five lines OPEN. No target
  dates have been confirmed by the named owners yet — dates above are `product-manager`'s proposed
  schedule for discussion, not commitments from `compliance-specialist`, insurer legal, or `cto`.
- 2026-10-29 (`compliance-specialist`): I re-verified this against the code (security-review.md §16).
  Items 1 to 4 and the payout decision are recorded correctly. I have added rows 5 and 6. Row 5 is
  CR-018-7, written delivery, which I had already made flip-blocking in §12.3 N-6 but which was missing
  from this tracker. Row 6 is the code remainder I found on re-verification. **Correction to the opening
  paragraph** (I am noting it here rather than editing `product-manager`'s text): from the compliance side,
  Feature 018 is not yet "engineering-complete". Rows 5 and 6 still need engineering work. If Option A is
  chosen for the payout decision, the payment-expectation notice for full approvals (§12.3 N-8) is a
  compliance-reviewed notice and falls under item 3. My target date for items 2 and 3 depends on when the
  insurer's legal function engages. I have not committed to 2026-11-12 or 2026-11-19.
