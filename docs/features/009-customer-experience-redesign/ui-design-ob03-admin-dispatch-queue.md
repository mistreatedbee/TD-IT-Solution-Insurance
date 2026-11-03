# OB-03 Track B — Admin Dispatch-Queue UI Design
## Stage 6/7 overlap — UI Design (B2)

**Lifecycle stage:** adjacent to 6/7 (design), per `02-feature-lifecycle.md`. Feeds `frontend-engineer`
B3.
**Author:** `ui-designer`
**Date:** 2026-11-03
**Status:** Design spec. Not built. Authorized by the `cto` disposition appended to
`qa-report-ob03-dispatch-tier-a.md` ("`cto` disposition (2026-11-03)" §Q3, Track B, items B1/B2).
**Scope:** B2 only — layouts for the new admin surface fronting `backend/src/routes/admin-case-dispatch.ts`.
Does not cover Track A (operator accept/decline/hand-back UI on `src/security/`), which is a separate,
already-existing surface being extended, not designed from scratch.
**Inputs read:**
- `qa-report-ob03-dispatch-tier-a.md` — `cto` disposition §Q3 (Track B definition, gates F1/F2).
- `api-design-ob03-dispatch-location-grants.md` §2 (admin router routes 2.1–2.6) and §7 was not present
  in this revision of the document (no §7 section exists in the file as read; the route list and response
  shapes actually used below are drawn from §2.1–§2.6, which is where the complete contract for this
  router lives in the current document).
- ADR-0017 `frontend-architect` Stage 6 note, "B1 (admin dispatch-queue UI, Track B, new surface)"
  (2026-11-03) — the architectural input this design builds against; its six numbered points are
  satisfied by the five screens below, cross-referenced inline.
- `src/admin/pages/PartnerOrganizationPages.tsx` and `AdminClaimsPages.tsx` — the two existing admin
  patterns reused throughout (read-only list/`DataTable`, `StatusBadge`, `DetailGrid`, `useStepUpRetry` +
  `StepUpDialog`, inline `InlineAlert`/`LoadingState`, cursor pagination with a "Load more" button).

**Gate reminder (not a design concern, repeated so it is not lost in handoff):** per the `cto` disposition,
this surface's Stage 8 delta (B4) and Stage 10 (B5) must both pass before Gate F2, and F2 — not this
document — is what permits `DIRECTED_DISPATCH_ENABLED` anywhere real theft reports land. This design may
proceed to B3 build now; it does not itself unlock any flag.

---

## 0. Component inventory — what's reused vs. new

| Need | Component | Source | Status |
|---|---|---|---|
| Queue list table | `DataTable` | `src/dashboard/components/ui.tsx` | reuse, unchanged |
| List/detail status chips | `StatusBadge` | `src/dashboard/components/ui.tsx` | reuse, **extend value map** (see §0.1 — not a new component) |
| Detail key/value grid | `DetailGrid` | `src/dashboard/components/ui.tsx` | reuse, unchanged |
| Page chrome, headings | `Card`, `SectionHeading`, `Button`, `Input`, `Badge` | `src/components` | reuse, unchanged |
| Loading / error states | `LoadingState`, `InlineAlert` | `src/dashboard/components/ui.tsx` | reuse, unchanged |
| Org/case nav links | `AdminNavLink` | `src/admin/layout/AdminLayout` | reuse, unchanged |
| Step-up gated mutation | `useStepUpRetry` + `StepUpDialog` | `src/admin/hooks/useStepUpRetry`, `src/admin/components/StepUpDialog` | reuse, unchanged — this is the B1 note's named pattern |
| Target-org picker (dispatch action) | `<select>` bound to partner-org list, same raw-`<select>` idiom as `AdminClaimsPages.tsx`'s ground-code/close-ground pickers | n/a | reuse pattern, no new component |
| Reason picker (re-dispatch) | same raw-`<select>` idiom, options = `RedispatchReason` enum | n/a | reuse pattern, no new component |
| Pending-approval banner (202 state) | `InlineAlert tone="info"` with a bold lead line | `src/dashboard/components/ui.tsx` | reuse, unchanged |
| Snapshot-mismatch banner (409 state) | `InlineAlert tone="danger"` | `src/dashboard/components/ui.tsx` | reuse, unchanged |
| Same-admin rejection banner (403 state) | `InlineAlert tone="warning"` | `src/dashboard/components/ui.tsx` | reuse, unchanged |
| Location field on detail only | plain `DetailGrid` row, no map | n/a | reuse — **no map/geo component exists or is requested**; A8 and the B1 note both treat this as a coordinate pair in a detail row, not a map widget |

### 0.1 `StatusBadge` value-map extension (flag, not a new component)

`StatusBadge`'s tone map (`src/dashboard/components/ui.tsx:28-37`) currently resolves any value outside
its five named strings (`active`, `recovered`, `suspended`, `closed`, `deactivated`, `open`,
`pending_verification`, `investigating`) to `neutral`. This surface introduces new values it has never
seen: `dispatchStatus` (`undispatched` / `pending` / `accepted`) and the case `status` enum already
partly covered (`tracking`, `recovered`, `closed` are covered already; `open`/`investigating` are
covered). Of the dispatch-specific values, only `pending` and `accepted` are new to the component.

**Recommendation: extend the existing switch, do not fork a new badge component.** Add two arms:
`value === 'accepted'` → `emerald`; `value === 'pending'` → `gold`; leave `undispatched` to fall through
to the existing `neutral` default (it already reads correctly as "nothing happening yet"). This is a
three-line change to a shared file multiple admin pages already import — flag it to
`design-system-manager` for sign-off before `frontend-engineer` touches `ui.tsx`, per the house rule, even
though it is additive to an existing component rather than a wholly new one. If sign-off is not obtained
before B3 starts, the fallback is a local `DispatchStatusBadge` wrapper in the new page file that maps
`pending`/`accepted`/`undispatched` to the same tones using the existing `Badge` primitive directly — this
avoids touching the shared file without permission, at the cost of the color logic living in two places
until the shared version is approved. **No new visual language, no new badge shape, either way** — same
pill, same tone vocabulary (`emerald`/`gold`/`neutral`) already in use across this admin app.

**Redundant cue requirement (accessibility, per role brief):** every dispatch-status badge in every
screen below is always paired with its text label (`StatusBadge` already renders `{value}` as text, not
color alone) — no change needed here, just confirming the existing component already satisfies this.

---

## 1. Screen 1 — Dispatch queue list

Route: `/admin/dispatch` (new top-level admin nav item, sibling to "Claims" and "Partner organizations").

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Dispatch queue                                   [status ▾] [dispatch▾]│
├─────────────────────────────────────────────────────────────────────────┤
│  Case          Status          Dispatch        Org            Created   │
│  ───────────── ─────────────── ─────────────── ─────────────── ───────  │
│  CASE-0091     ● open          ● undispatched   —              Nov 1    │
│  CASE-0088     ● investigating ● pending         Acme Security  Oct 30   │ → row click → detail
│  CASE-0077     ● investigating ● accepted        Acme Security  Oct 28  │
│  CASE-0065     ● tracking      ● accepted        Beta Secure    Oct 20  │
│  ...                                                                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                           [Load more]    │
└─────────────────────────────────────────────────────────────────────────┘
```

**Composition:** `Card padding="lg"` → `SectionHeading` ("Dispatch queue") + two filter `<select>`s in the
header row (status, dispatchStatus — both optional, mirrors `ClaimsQueuePage`'s filter-bar layout exactly,
including driving filters through `useSearchParams` so a filtered view is linkable/bookmarkable) →
`DataTable` with columns: Case (link to detail), Status (`StatusBadge`), Dispatch (`StatusBadge`, extended
per §0.1), Org (plain text or em-dash if `undispatched`), Created (date). Cursor pagination via
`GET /v1/admin/dispatch/cases` (§2.1), same `hasMore`/`nextCursor` → "Load more" `Button` idiom as
`ClaimsQueuePage`.

**A8 compliance, explicit:** this list view renders **no location field** — the API response for 2.1
never includes `lastLocation`/`lastLocationAt` by design (A8), so there is nothing to withhold here; the
column set above is already the full response shape. No "redacted" placeholder is shown — the field is
simply absent from the table, consistent with the API not minimizing-by-omission-in-the-UI but genuinely
never receiving it.

**States:**
- *Loading* — `LoadingState` in place of the table, filters still interactive.
- *Empty* — `InlineAlert tone="info"`, "No cases match these filters." (mirrors `ClaimsQueuePage`'s empty
  copy, adapted).
- *Error* — `InlineAlert tone="danger"` above the (hidden) table, same `mapUserFacingError` convention.
- *Filtered* — URL-driven, same pattern as claims queue; clearing a filter removes its query param.
- *Row hover/focus* — case id cell is a `Link`, same visual treatment as `PartnerOrganizationsListPage`'s
  name column (`text-primary hover:underline`), full row not clickable (keeps the one obvious tap target
  per WCAG target-size guidance, consistent with how other admin tables here behave — they link via a
  single cell, not the row).
- No step-up on this screen — read-only list, same posture the B1 note and `PartnerOrganizationPages.tsx`
  both document for read-only aggregation views.

---

## 2. Screen 2 — Case detail (admin, includes location)

Route: `/admin/dispatch/cases/:caseId`.

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Case CASE-0088                                    [Back to queue]      │
├─────────────────────────────────────────────────────────────────────────┤
│  Status            ● investigating      Dispatch status   ● pending     │
│  Account            acct_x91f3           Reference         REF-20394    │
│  Asset type          laptop              Reported           Oct 30      │
│  Current org         Acme Security       Dispatched         Oct 30 14:02│
│  First dispatched    Oct 30 14:02        Dispatch count     1           │
│  Last location        -26.2041, 28.0473  Location captured  Oct 30 15:10│
├─────────────────────────────────────────────────────────────────────────┤
│  Dispatch / re-dispatch                                                 │
│  [ Dispatch to org ▾ ] [Dispatch]     [ Re-dispatch to org ▾ (nullable) ]│
│                                         [ reason ▾ ] [Re-dispatch]       │
└─────────────────────────────────────────────────────────────────────────┘
```

**Composition:** `SectionHeading` ("Case {caseId}") + `AdminNavLink` back to `/admin/dispatch` (same
header shape as `ClaimDetailPage`) → `Card padding="lg"` with a `DetailGrid` carrying every field
`GET /v1/admin/dispatch/cases/:caseId` (§2.5) returns: `status`, `dispatchStatus` (via the extended
`StatusBadge`), `accountId` (as a link to `/admin/accounts/:accountId`, consistent with
`ClaimDetailPage`'s account link), reference number, `createdAt`, `dispatchedAt`, `firstDispatchedAt`,
`dispatchCount`, current `partnerOrganizationId` (resolved to org name via the same partner-org lookup
`PartnerOrganizationPages.tsx` uses, linked to its scorecard page per that existing pattern) — and, **only
on this screen, never the list**, `lastLocation`/`lastLocationAt` per A8. Below the detail card, a second
`Card` holds the dispatch/re-dispatch action area (§3/§4 below).

**A8 / per-subject audit, explicit:** the location row's mere presence on this screen is itself the
privileged read A8 permits and the per-call Trail B row (named in §2.5 of the API doc) covers; no
additional UI confirmation step is designed for *viewing* it (the API doc does not ask for one — the
Trail B write is server-side and silent to the admin), but the row is visually set apart with a small
muted caption under the coordinate ("Viewing this location is logged against your admin account.") so the
audit obligation is not invisible to the person triggering it. This caption is plain text, no new
component.

**States:**
- *Loading* — `LoadingState` for the whole page.
- *Error / not found* — `InlineAlert tone="danger"`, same as `ClaimDetailPage`'s `error || !claim` guard.
- *No location present* (e.g. Feature 008 ingestion off, or never reported) — the two location rows show
  `—` via `DetailGrid`'s existing plain-value rendering, no special empty state needed.
- *Undispatched case* (`dispatchStatus` absent/`undispatched`) — "Current org" row shows `—`; only the
  **Dispatch** action (§3) is shown, **Re-dispatch** is hidden (there is nothing to re-dispatch yet — this
  mirrors the B1 note's point 4, "UI need not distinguish beyond button label," by simply not rendering
  the re-dispatch form when there is no current holder to move).
- *Dispatched (`pending` or `accepted`)* — both Dispatch and Re-dispatch forms render; Dispatch's org
  picker excludes the current holder (defensive UX only — the server's A9(iii) `NO_OP_TARGET` check is the
  actual guard; the picker omission just avoids inviting a doomed submission).
- *Pending second-admin approval exists for this case* — a banner above the action card:
  `InlineAlert tone="info"`, "A re-dispatch to **{target org name}** is awaiting a second admin's
  approval." with a `Button` "Review and approve" linking to Screen 3. (Whether the detail GET surfaces an
  in-flight `pendingApproval` is not specified in the API doc as read — flagged as an open question for
  `backend-engineer`/`frontend-engineer` at build time: if the field isn't returned, this banner is simply
  omitted and the approving admin reaches Screen 3 only via whatever navigation the requesting admin's
  "awaiting approval" response (§3 below) pointed them to. Documented here so it isn't silently assumed.)

---

## 3. Screen 3 — Dispatch action (on the detail page, inline — not a separate route)

```
Dispatch / re-dispatch
┌───────────────────────────────────────────────────────────────────┐
│ Dispatch to:  [ Select partner org ▾ ]                [ Dispatch ] │
│ (only eligible orgs — executed agreement, not terminated — listed) │
└───────────────────────────────────────────────────────────────────┘
```

**Composition:** a `<select>` populated from the same partner-org list `PartnerOrganizationPages.tsx`
sources, **filtered client-side to eligible orgs only** (`agreementStatus === 'executed' && terminatedAt
== null`, per A2/§2.3) — this mirrors the B1 note's requirement that the target-org picker only offer
eligible orgs, and matches the API doc's own eligibility source (§2.3(a)/(b)). If the partner-org list API
does not already expose `agreementStatus`/`terminatedAt` to the admin UI, that is a contract gap for
`backend-engineer`/`frontend-engineer` to confirm before build — flagged, not assumed. A `Button`
("Dispatch") submits `POST /v1/admin/dispatch/cases/:caseId/dispatch` wrapped in
`useStepUpRetry(dispatchCase)`, rendering `StepUpDialog` on demand — identical mechanical pattern to
`AdminClaimsPages.tsx`'s `patchAdminClaim` wrapping, per the B1 note's explicit instruction to reuse that
hook rather than build a new step-up flow.

**States:**
- *Idle* — picker + button, button disabled until an org is selected.
- *Submitting* — `Button loading` state (existing `Button` prop, used throughout `AdminClaimsPages.tsx`).
- *Step-up required* — `StepUpDialog` opens; on verify, retries the same request via `onStepUpVerified()`.
- *200 success (first-ever dispatch, no second-admin gate)* — `InlineAlert tone="info"`, "Dispatched to
  {org name}.", detail card refreshes in place (re-fetch, not optimistic patch — consistent with
  `ClaimActions`' `onUpdated(updated)` pattern of trusting the server response body).
- *422 ineligible target* — `InlineAlert tone="danger"`, "This organization cannot receive a dispatch
  (agreement not active)." — generic per the API's own `422` semantics, no org-internal detail leaked.
- *409 already dispatched* — `InlineAlert tone="warning"`, "This case was already dispatched by another
  admin — refresh to see the current state.", detail re-fetched automatically.
- *404* — `InlineAlert tone="danger"`, "This case could not be found."

---

## 4. Screen 3b — Re-dispatch action (same card, second form; the 202-pending-approval state)

```
┌───────────────────────────────────────────────────────────────────┐
│ Re-dispatch to:  [ Return to queue (no org) ▾ ]                     │
│                   or  [ Select a different org ▾ ]                  │
│ Reason:          [ partner_declined ▾ ]                             │
│                                             [ Re-dispatch ]          │
└───────────────────────────────────────────────────────────────────┘
```

On submit of `POST /v1/admin/dispatch/cases/:caseId/re-dispatch` (§2.4), per B1 note point 3, the response
is handled by status code, not treated uniformly:

**States:**
- *Idle* — target picker (first option "Return to queue (no org)" mapping to `null`; remaining options
  are eligible orgs excluding the current holder and excluding whichever org the picker already shows as
  held) + reason `<select>` (fixed enum: `partner_declined`, `partner_handed_back`, `agreement_ended`,
  `admin_recall`, `other` — same raw-`<select>` idiom as the claim rejection/close ground pickers, no
  free-text fallback for `other` beyond what the enum itself allows, consistent with CS-6's "no free text"
  posture already applied elsewhere in this router family).
- *Submitting* — `Button loading`.
- *Step-up required* — same `StepUpDialog` pattern.
- *200 (null-target or first-ever-equivalent single-admin path)* — same success banner treatment as
  Screen 3, detail refetches, "Current org" row clears to `—`.
- *202 pending-approval — rendered as a distinct success-shaped state, not a spinner or an error, per the
  B1 note's explicit instruction:*
  ```
  ┌───────────────────────────────────────────────────────────────┐
  │  ℹ Dispatch requested — awaiting a second admin's approval.    │
  │     Target: Beta Secure        Reason: partner_declined        │
  │     [ Copy approval link ]                                     │
  └───────────────────────────────────────────────────────────────┘
  ```
  `InlineAlert tone="info"` with the bold lead line plus the resolved target org name and reason already
  known client-side (the admin just chose them), and a `pendingApprovalId`-bearing link to Screen 5
  (`/admin/dispatch/cases/:caseId/approve/:pendingApprovalId`) so the requesting admin can hand that link
  to a second admin (e.g. via whatever out-of-band channel — Slack, in person — this org already uses for
  such handoffs; no new messaging feature is in scope here). The form resets to idle once this banner is
  shown; the Dispatch/Re-dispatch card remains visible below it so the admin can see the case is still
  mid-flight on return visits (persisted by Screen 2's banner, §2 above).
- *422 same-holder target (`NO_OP_TARGET`)* — `InlineAlert tone="danger"`, "This organization already
  holds this case — choose a different target or return it to the queue."
- *409 someone else moved the case first* — same "refresh" messaging as Screen 3's 409.

---

## 5. Screen 5 — Two-admin approval

Route: `/admin/dispatch/cases/:caseId/approve/:pendingApprovalId` (a direct, shareable link — not a modal,
since the approving admin may be a different person opening it fresh, with no prior page state).

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Approve re-dispatch — Case CASE-0088                                   │
├─────────────────────────────────────────────────────────────────────────┤
│  Requested by     admin_1829            Requested at    Nov 2 09:14      │
│  Target org       Beta Secure           Reason          partner_declined │
├─────────────────────────────────────────────────────────────────────────┤
│  ⚠ You cannot approve a re-dispatch you requested yourself.              │  ← only if CSA_SAME_ADMIN
├─────────────────────────────────────────────────────────────────────────┤
│                                          [ Reject/Cancel ]  [ Approve ]  │
└─────────────────────────────────────────────────────────────────────────┘
```

**Composition:** `Card padding="lg"` → `DetailGrid` with `requestedBy` (admin account id — a name/email
lookup is a nice-to-have, not required by the API doc, which only names `requestedBy` as an account id;
flagged as an enhancement, not a blocker), `requestedAt`, **target org resolved to its display name** (per
the B1 note's explicit requirement — never a bare id) via the same partner-org lookup used elsewhere, and
`reason`. This data must come from wherever the pending-approval's detail is fetched — the API doc names
the fields recorded on the `pendingApproval` record (`requestedBy`, `requestedTargetOrgId`, `requestedAt`,
`reason`) but does not specify a dedicated `GET` route to fetch a single pending approval by id; the
likely source is the case detail route (§2.5) if it surfaces the in-flight `pendingApproval` object
(flagged as the same open question raised in Screen 2's states above) — **this is a contract gap
`frontend-engineer` must confirm with `backend-engineer` before building this screen**, not a UI design
decision. Below the detail, an `Approve` `Button` wrapped in `useStepUpRetry(approveCaseDispatch)` per the
B1 note (approve requires step-up, same as dispatch/re-dispatch), and a lower-emphasis `Reject/Cancel`
action (the API doc does not name an explicit "reject" route for the second admin — cancelling is
documented as "the requester calls `re-dispatch` again before expiry, overwriting the pending record,"
not a second-admin-initiated cancel; so this button, if offered to the *approving* admin, simply navigates
back to the case detail without calling anything, and is labeled "Back" rather than implying a server-side
reject exists. Flagged — do not build a reject endpoint call that isn't in the API doc.).

**States (this screen's whole reason for existing, per the task brief):**
- *Normal, approvable* — form above, `Approve` enabled.
- *Loading* — `LoadingState` while fetching the pending-approval detail.
- *Not found / already resolved* — `InlineAlert tone="info"`, "This approval request is no longer
  pending — it may have been approved, cancelled, or expired." with a link back to the case detail. (No
  distinct API error is named for "already consumed" beyond the general `404`/`409` vocabulary; treat any
  fetch failure for the pending-approval as this state rather than a generic error, since the most likely
  cause is exactly this.)
- ***CSA_SAME_ADMIN (403)*** — not rendered as a generic error. A dedicated `InlineAlert tone="warning"`
  rendered **before** the approving admin can even attempt the submit, if the client can determine the
  current admin's account id matches `requestedBy` (compare client-side first, to avoid a pointless
  round-trip): "You requested this re-dispatch yourself — a different admin must approve it." with the
  `Approve` button **disabled**, not hidden (so it's clear *why* nothing is actionable, not that the page
  is broken). If the client-side check is bypassed somehow and the server still returns `403
  CSA_SAME_ADMIN`, the same message renders from the error response instead, with the same disabled-button
  treatment — this is the exact "clear messaging, not a generic error" requirement from the task brief.
- ***409 snapshot-mismatch*** — also not generic. On a `409` from the approve submission (the case's
  current state no longer matches `pendingApproval.snapshot`, per §2.4's TOCTOU guard), per the B1 note's
  point 6: `InlineAlert tone="danger"`, "This case changed since the dispatch was requested — refresh and
  start the dispatch again." with a single `Button` "Back to case detail" that navigates to Screen 2 and
  forces a fresh fetch there (no silent retry, no resubmission of the stale `pendingApprovalId` — the B1
  note is explicit this is a real conflict, not an idempotent-retry case).
- *Step-up required* — `StepUpDialog`, same mechanical pattern.
- *Success (200)* — `InlineAlert tone="info"`, "Re-dispatched to {org name}.", then navigate to the case
  detail (Screen 2), which now reflects the new holder.

---

## 6. State-coverage matrix (cross-screen summary)

| State | Screen(s) | Component | Distinct messaging required? |
|---|---|---|---|
| Loading | all | `LoadingState` | no — generic |
| List/detail fetch error | 1, 2 | `InlineAlert tone="danger"` | no — generic |
| Empty queue | 1 | `InlineAlert tone="info"` | no — generic |
| 404 case not found | 2, 3, 4 | `InlineAlert tone="danger"` | no — generic |
| 422 ineligible target (dispatch) | 3 | `InlineAlert tone="danger"` | yes — names the condition |
| 422 `NO_OP_TARGET` (re-dispatch) | 4 | `InlineAlert tone="danger"` | yes — names the condition |
| 409 compare-and-set loser (dispatch/re-dispatch) | 3, 4 | `InlineAlert tone="warning"` | yes — "refresh" framing |
| **202 pending-approval** | 4 | `InlineAlert tone="info"` | **yes — success-shaped, not generic** |
| **403 `CSA_SAME_ADMIN`** | 5 | `InlineAlert tone="warning"`, button disabled pre-submit | **yes — named, pre-emptive where possible** |
| **409 snapshot-mismatch (approve)** | 5 | `InlineAlert tone="danger"` | **yes — distinct from the dispatch 409, explicit "refresh and restart" copy** |
| Step-up required | 3, 4, 5 | `StepUpDialog` via `useStepUpRetry` | no — existing pattern |
| Approval already resolved/expired | 5 | `InlineAlert tone="info"` | yes — distinct from "not found" |
| No location available | 2 | plain `—` in `DetailGrid` | no |

---

## 7. New-component flags (summary, for `design-system-manager`)

1. **`StatusBadge` tone-map extension** (§0.1) — additive: two new value arms (`pending`→gold,
   `accepted`→emerald) on an existing shared component. **Requires sign-off** per house rule even though
   it is not a new component, since it's a shared file multiple pages import. Fallback given (local
   wrapper) if sign-off isn't obtained before B3 starts.
2. **No other new component is requested.** Every control used above (`DataTable`, `DetailGrid`, `Card`,
   `SectionHeading`, `Button`, `Input`, `Badge`, `InlineAlert`, `LoadingState`, `StepUpDialog`,
   `useStepUpRetry`, raw `<select>` pickers) already exists and is already used by `PartnerOrganizationPages.tsx`
   and/or `AdminClaimsPages.tsx`. No map/geo widget is introduced for the location field (A8 scopes it to
   a single coordinate pair on one detail route; a plain text row is sufficient and avoids building a
   mapping surface for one field).

## 8. Open contract questions flagged to `backend-engineer`/`frontend-engineer` (not design decisions)

- Does `GET /v1/admin/dispatch/cases/:caseId` (§2.5) surface an in-flight `pendingApproval` object, so
  Screen 2 can show the "awaiting approval" banner and Screen 5 can source its detail? Not stated either
  way in the API doc as read. If not, a dedicated fetch for a single pending approval by id needs a route
  that doesn't yet exist in §2 — raise before B3.
- Does the partner-organization list API already expose `agreementStatus`/`terminatedAt` to the admin
  client for the eligibility filter in Screens 3/4, or does that filtering have to happen server-side in
  a new list endpoint? Flagged, not assumed either way.
- Is there a human-readable name/email behind `requestedBy`/an approving admin's `accountId`, or does
  Screen 5 show a raw account id for "requested by"? Cosmetic, not blocking, but worth confirming before
  build so the copy above isn't silently wrong.

---

**File path:** `docs/features/009-customer-experience-redesign/ui-design-ob03-admin-dispatch-queue.md`
