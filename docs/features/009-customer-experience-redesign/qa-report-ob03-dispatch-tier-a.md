# OB-03 Tier A — Stage 10 QA Report (Admin-Directed Dispatch, No Location Sharing)

**Role:** `qa-test-strategy` (acting as Stage 10 gate owner)
**Date:** 2026-11-03
**Scope:** OB-03 Tier A only (D1/D2 of ADR-0017). Tier B (D3/D4, location sharing) remains
out of scope and stays blocked per the Stage 8 reviews — not assessed here.
**Inputs:** ADR-0017, `database-design-ob03-location-share-grants.md`,
`api-design-ob03-dispatch-location-grants.md`, `security-review-ob03-dispatch-location-grants.md`
(chair + `security-engineer` SE-1/SE-2 + `compliance-specialist` CO-OB03-1..6), the merged code
(`backend/src/routes/admin-case-dispatch.ts`, `security-cases.ts`, `recovery.ts`,
`repositories/recovery-cases.ts`, `lib/recovery-notification-service.ts`,
`lib/recovery-case-notifications.ts`, `lib/dispatch-flag-flip-migration.ts`,
`lib/dispatch-migration-guard.ts`) and their test files, plus `src/security/` (web) and
`mobile/src/screens/security/` (mobile) frontend call sites. Test suite independently confirmed
stated-clean (not re-run exhaustively here; coverage *quality* was the object of this review).

## Verdict

**BLOCKED for merge of the full Tier A condition set / flag flip, even in dev-staging.**
Three of the eleven Tier A conditions (A1 through A9, SE-1, SE-2, CO-OB03-1 through 6 — 17 named
items total) have no corresponding test, and one is a real cross-surface breakage that will
manifest the moment `DIRECTED_DISPATCH_ENABLED` is set `true` in any environment, dev or
otherwise, because it breaks the only UI path operators have to act on a case. The backend logic
itself is in good shape — most conditions (A1, A2, A4, A5, A6 [indirectly], A7, A8, A9(i)-(iii),
SE-1, CO-OB03-1, CO-OB03-2, CO-OB03-3, CO-OB03-4) are both implemented and have a test with an
explicit `[TAG]` naming the condition it closes, which is good practice and made this trace fast.
The gaps below are narrow and fixable without redesign.

## Finding 1 (Blocking — cross-surface, highest severity): no frontend accept/decline/release UI exists

Neither the web Security Company Dashboard (`src/security/pages/SecurityCasePages.tsx`,
`src/security/api/cases.ts`) nor the mobile operator app
(`mobile/src/screens/security/SecurityCaseDetailScreen.tsx`) implements the new dispatch-model
verbs. Both still call only `claimSecurityCase()` → `POST /security/cases/:caseId/claim`.

Per `backend/src/routes/security-cases.test.ts:2664` (`'claim is unmounted (404) once the flag is
on'`) and `:2674` (`'reassign is unmounted (404) once the flag is on'`), both routes 404 once
`DIRECTED_DISPATCH_ENABLED=true`. There is no `acceptSecurityCase`/`declineSecurityCase` function
anywhere in `src/security/api/cases.ts` or the mobile equivalent — grep for `accept`/`decline`
across both surfaces returns no case-action call sites, only an unrelated `/messages` route and a
pre-existing "or reassigned" error string.

**Effect:** the moment the flag flips to `true` in *any* environment an operator opens the app in,
the claim button 404s with no fallback, and there is no way to accept/decline/release a case
through either UI. This is exactly the risk flagged going into this review, now confirmed as real,
not hypothetical. **This blocks flipping the flag anywhere a real operator will see it**, including
a demo/dev environment if operators are expected to interact with it.

**Recommendation:** either (a) scope and build the accept/decline/release UI for both surfaces
before flipping the flag anywhere beyond isolated backend integration tests, or (b) if the flag
flip is meant to land backend-only first, make that explicit in the rollout plan and keep the flag
off in every environment an operator-facing build reaches until the frontend work is scheduled.
This is a product/sequencing decision, not purely a QA one — flagging to `cto`/`product-manager`.

## Finding 2 (Gap — CO-OB03-5, audit trail on accept/decline/release): code present, no test

CO-OB03-5 requires a Trail B (`admin_access_log`) row on every offer/accept/decline/lapse/
re-dispatch recipient-history change. `security-cases.ts` does call
`ctx.adminAccessLog.recordStateChange(...)` at the accept (`:361`), decline (`:440`?), and release
(repurposed hand-back) call sites inside the `dispatch model` describe block (lines 2634-2970 of
`security-cases.test.ts`) — but unlike the pool-mode PDM-8 tests (lines 1070-1259, which explicitly
assert `recordStateChange`/`recordCaseBulkDisclosure` call shape for claim/PATCH), **no test in the
`dispatch model (DIRECTED_DISPATCH_ENABLED=true)` block asserts that accept/decline/release
actually write an audit row**, nor its `fromStatus`/`dispatchStatus` content. The fail-closed
behavior (`SR-009S-4`, "audit write throws → mutation never runs") is likewise only tested for
`claim`/`PATCH` (pool mode), not for `accept`/`decline`/`release` (dispatch mode).

**Recommendation:** add the PDM-8/SR-009S-4-style assertions to the dispatch-model describe block:
one test per accept/decline/release confirming exactly one `recordStateChange` call with the
correct `fromStatus`/`dispatchStatus`, and one fail-closed test confirming an audit-write throw
blocks the mutation, mirroring the existing pool-mode pattern.

## Finding 3 (Gap — SE-2, rate limiter wiring not directly tested)

SE-2's fix (named per-route `createRateLimiter` calls on list/count/detail of
`admin-case-dispatch.ts`) is present in code (`admin-case-dispatch.ts:152,194,228`, all keyed
`DEFAULT_AUTHENTICATED_LIMIT`), satisfying the letter of the condition. However, no test in
`admin-case-dispatch.test.ts` exercises the limiter itself (e.g. asserts a 429 after exceeding
the configured window), unlike some other routes in this codebase that do test limiter triggering.
This is a lower-severity gap than Findings 1-2 since the code is demonstrably present and named
correctly per SE-2's literal text, but "wired, untested" is still a real gap for a condition whose
entire point was abuse-at-scale protection.

**Recommendation:** add one limiter-triggers test per route (or a shared parametrized test) for
`admin-case-dispatch.ts`'s list/count/detail routes, consistent with however this repo already
tests `createRateLimiter` elsewhere (check `rate-limit.test.ts` pattern if one exists and reuse it
rather than inventing a new harness).

## Finding 4 (Exploratory — state-machine gap found, not previously tested)

The existing re-dispatch tests cover null-then-dispatch, decline-then-re-dispatch, and
lapse-then-re-dispatch sequences (`admin-case-dispatch.test.ts:771,798,838`) — good adversarial
coverage of the A4 two-admin gate across multi-step sequences, better than most Tier A code gets.
However, I could not find a test for **a full accept → release → re-offer → accept cycle through
`security-cases.ts`'s own accept/release endpoints** (as opposed to the admin's dispatch/
re-dispatch endpoints) — i.e. does the partner-side `release` (repurposed hand-back) correctly
clear `dispatchStatus` back to a state the *admin* dispatch queue will re-surface, and does a
second `accept` by a different org after that release pass the same CO-OB03-6 "customer sees
returned to queue" check attributed in code comments at `security-cases.ts:534,649,723`? No test
asserts the customer-facing status *after* a partner-initiated release, only after
admin-initiated re-dispatch-to-null (`admin-case-dispatch.test.ts:710`). Given CO-OB03-6 is a
compliance condition specifically about customer-facing accuracy, this is worth closing before
calling CO-OB03-6 test-verified, not just code-verified.

I did not find a race-condition gap beyond what's already tested (concurrent dispatch is tested;
concurrent accept+decline and dispatch+hand-back were not found as dedicated tests, but given
`updateStatusForPartnerOrg`'s compare-and-set on `expectedStatus` is already proven at the
repository layer — `recovery-cases.test.ts:1189-1221` — and the route layer's claim/PATCH races are
tested at `security-cases.test.ts:1228,1298`, I assess this as **low residual risk**, not a
blocking gap, since the same compare-and-set primitive underlies the dispatch-mode accept/decline
paths. Confirming a dispatch-mode-specific concurrent accept/decline test exists would upgrade
this from "low residual risk, defer" to "closed," but I would not block on it alone.

## Finding 5 (Manifest/traceability — confirmed accurate, no issue)

`docs/organization/gates/stage8-manifest.json`'s `admin-case-dispatch` (line ~809) and the
`security-cases` amendment (line ~231) entries are honest about scope: both explicitly state "no
dedicated code-level Stage 8 review ... has been performed," only a design-level review. This
matches reality — the Stage 8 docs reviewed the design, and this Stage 10 pass is the first
code-level look. No overclaiming found in the manifest. The `recovery-case-reported-stolen push
suppression + broadcast shutoff (CO-OB03-1/CO-OB03-2)` entry correctly attributes implementation to
"OB-03 Tier A sub-task 4," consistent with the commit range cited in the task brief. No
manifest/code drift found.

## Condition traceability summary

| Condition | Code found | Test found | Status |
|---|---|---|---|
| A1 (shared predicate incl. wrap-up) | yes | yes (`security-cases.test.ts:152` mirror + recovery-cases predicate tests) | OK |
| A2 (dispatch eligibility source) | yes | yes (`admin-case-dispatch.test.ts:589,606`) | OK |
| A3 (status PATCH, dispatch model) | yes (`recovery-cases.ts:1309`) | yes, via dispatch-model PATCH test (`security-cases.test.ts:2835`) | OK |
| A4 (two-admin approve + pendingApproval) | yes | yes, extensive (`admin-case-dispatch.test.ts:650-891`) | OK |
| A5 (migration audit/coverage incl. wrap-up window) | yes | yes (`dispatch-flag-flip-migration.test.ts`, `dispatch-migration-guard.test.ts:59`) | OK |
| A6 (OB-04 / Trail B on every transition) | Trail B via `admin_access_log`, not a distinct OB-04 collection | partially — see Finding 2 for accept/decline/release | Gap (Finding 2) |
| A7 (dispatch-queue index) | yes (`db/recovery-collections.ts:139`) | yes, dedicated (`db/recovery-collections.test.ts`) | OK |
| A8 (minimise lastLocation in list) | yes | yes (`admin-case-dispatch.test.ts:417,510`) | OK |
| A9(i)-(iii) (oracle uniformity, no-op target) | yes | yes (`admin-case-dispatch.test.ts:693`, `security-cases.test.ts:2936-2966`) | OK |
| SE-1 (input validation on new routes) | yes | yes (`admin-case-dispatch.test.ts:434,446,472,636`, `security-cases.test.ts:2752,2807`) | OK |
| SE-2 (bulk-read rate limiting, named limiters) | yes | **no limiter-trigger test found** | Gap (Finding 3) |
| CO-OB03-1 (device suppression on push) | yes | yes (`recovery-notification-service.test.ts:276-450`) | OK |
| CO-OB03-2 (remove broadcast push, no assetId) | yes | yes (`recovery-notification-service.test.ts:451+`, `recovery.test.ts:436,465`, `admin-case-dispatch.test.ts:563`) | OK |
| CO-OB03-3 (terminated org loses access in window) | yes | yes (`dispatch-flag-flip-migration.test.ts:90`, `security-cases.test.ts:2882`) | OK |
| CO-OB03-4 (eligibility source = executed agreement) | yes (`repositories/partner-organizations.ts`) | yes (`partner-organizations.test.ts:83`) | OK |
| CO-OB03-5 (recipient/offer history audit trail) | yes (`recordStateChange` calls present) | **no dedicated assertion in dispatch-model block** | Gap (Finding 2) |
| CO-OB03-6 (customer-facing status accuracy) | yes (code comments at 3 sites in `security-cases.ts`) | partial — admin-initiated path tested, partner-initiated release path not confirmed (Finding 4) | Gap (Finding 4) |

## Recommendation to `cto`

Do not flip `DIRECTED_DISPATCH_ENABLED=true` anywhere an operator will interact with the app
(Finding 1) until the frontend accept/decline/release surface is built, or until the rollout is
explicitly scoped as backend-only with the flag kept off in every operator-facing build. Findings
2, 3 and 4 are each small, well-scoped test-authoring tasks (no design or code change implied) and
should go back to whichever of `backend-engineer`/`qa-architect` wrote the existing dispatch-model
test block, as a fast follow before Tier A is called fully done. Finding 5 requires no action.

---

## `cto` disposition (2026-11-03)

*Author: `cto`. Appended per the append-only rule for shared lifecycle documents. This records a
decision already made earlier in this session, in response to Finding 1 (operator UI gap) above.
It is written up here, not re-decided.*

### Ruling

**GO. Build now.** No new design pass is needed. One small contract addition goes first, plus two
time-boxed architecture reviews that are **not** waived. `DIRECTED_DISPATCH_ENABLED` stays **OFF**
in every environment an operator build can reach until Gate F1 (below).

### What was checked in the code, beyond the QA report

The gap is wider than "claim 404s." In dispatch mode the existing UIs break in four more ways:

1. **Web claim button goes missing.** A pending offer arrives with `status:'open'` and
   `partnerOrganizationId` already set to the caller's org. The web claim button's condition
   (`SecurityCasePages.tsx:304`, `!recoveryCase.partnerOrganizationId`) therefore hides it. The
   operator sees no action at all, not even a 404.
2. **Web shows status buttons that will 404.** `STATUS_ACTIONS` (`:309`) renders status buttons for
   a pending case. Per §3.1a a pending org gets a 404 from the PATCH route.
3. **Web release will fail.** `releaseSecurityCase()` sends no body. Dispatch mode requires
   `releaseBodySchema {reason}`, so it returns 400. The response shape also changes to
   `{ data: { caseId, status: 'returned_to_queue' } }`, so `setRecoveryCase(updated)` would corrupt
   state.
4. **Mobile has no release/hand-back at all**, only claim (`mobile/src/api/security-cases.ts:63`).
5. **The client can't tell which mode it's in, or pending from accepted.**
   `serializeOfferTierRecoveryCase` / `serializeClaimedTierRecoveryCase`
   (`backend/src/repositories/recovery-cases.ts:483,498`) don't expose `dispatchStatus`, and no
   capability signal exists.

Item 5 is the only real contract gap. It is decided here.

### Q1: Is it buildable now?

**Yes.** §3.1-3.3 / §3.1a are stable and committed. The one addition is a **server-authoritative
signal**: in dispatch mode, partner list and detail rows include
`dispatchStatus: 'pending' | 'accepted'`. In pool mode the field is omitted. The field's
**presence** is the mode signal, and its **value** picks accept/decline versus
hand-back/status/messages.

A client build flag (`VITE_FEATURE_DIRECTED_DISPATCH` / `EXPO_PUBLIC_*`) was **rejected** as the
mode signal, for two reasons:

- Mobile `featureEnabled()` fails open in local dev (`mobile/src/config/features.ts:33`), so a dev
  build would default to dispatch mode against a pool-mode backend.
- It creates client/server skew on long-lived mobile binaries.

Data-minimisation impact is nil. The field only reaches the holder org (the A1 predicates already
gate visibility), so CS-8 oracle uniformity is unaffected.

### Q2: Who builds what, in order (Track A)

**Step 0 (parallel)**

- **0a — `backend-architect`:** adds §3.8 to `api-design-ob03-dispatch-location-grants.md`
  specifying the field (append-only, half a page). It must state that the decline/release response
  is `{caseId, status:'returned_to_queue'}`, so clients navigate back to the list rather than
  re-render.
- **0b — `frontend-architect` (web) and `mobile-architect` (mobile):** do the R-2 Stage 6 reviews,
  scoped narrowly to operator accept/decline/hand-back only, appended to ADR-0017 under the R-2
  item. Each must answer:
  - (i) which actions render for each `dispatchStatus` value, and what renders when the field is
    absent (pool mode);
  - (ii) navigation and cache invalidation after decline/release: the case leaves the caller's
    visibility, so drop the claimed-tier data held client-side and go back to the list;
  - (iii) retry/idempotency for accept, adapting the claim 404-refetch idiom at
    `SecurityCasePages.tsx:224` (CS-8);
  - (iv) decline/release reason pickers reusing the existing close-reason pattern, fixed enums
    only, no free text (CS-6);
  - (v) hiding status/messages actions while pending.

  The Tier B items R-2 also names (CR-3.1, CR-3.2, CR-5, CR-8) stay owed before Tier B and are out
  of scope here.
- **0c — `backend-engineer`:** closes QA Findings 2, 3 and 4 (test-only):
  - Finding 2: accept/decline/release each assert a `recordStateChange` audit row, plus a
    fail-closed test.
  - Finding 3: a test that the rate limiter actually triggers on admin-case-dispatch
    list/count/detail.
  - Finding 4: a partner-initiated accept → release → re-dispatch → accept cycle asserting the
    customer-facing status after release (CO-OB03-6).

**Step 1 — `backend-engineer`:** builds the §3.8 field, with tests for both modes plus a test that
the field is absent in pool mode, and updates the `stage8-manifest.json` security-cases entry.

**Step 2 (parallel; after 0b; merge after Step 1; can start against mocks once 0a is written)**

- **`frontend-engineer` (web: `src/security/api/cases.ts`, `src/security/pages/SecurityCasePages.tsx`):**
  adds `acceptSecurityCase` and `declineSecurityCase(reason)`, changes `releaseSecurityCase` to take
  a reason, gates actions on `dispatchStatus` per 0b, keeps pool-mode behaviour byte-identical when
  the field is absent, and tests both modes.
- **`mobile-engineer` (mobile: `mobile/src/api/security-cases.ts`,
  `mobile/src/screens/security/SecurityCaseDetailScreen.tsx`):** adds accept, decline, and
  release/hand-back, with the same gating, tests, and pool-mode preservation.

**Step 3 — `security-engineer`:** Stage 8 delta review of the Step 1 and Step 2 diffs, checking: no
claimed-tier data kept after decline/release, enum-only reasons, no actions exposed while pending,
manifest entries accurate. Appended to `security-review-ob03-dispatch-location-grants.md`.

**Step 4 — `qa-test-strategy`:** runs Stage 10 again on Findings 1-4, appended to this QA report.
**Passing this is Gate F1.**

### Q3: Admin dispatch-queue UI (Track B)

Not needed to close Finding 1 (Steps 0-4 close it). It **is** needed before flipping the flag
anywhere real theft reports land. With the flag on, CO-OB03-2 shuts off the broadcast push, so with
no admin UI no partner ever hears about a case unless someone hand-calls step-up-gated admin
endpoints. Flipping without it is safe for operators but leaves customers' cases unserviced.

**Rule:** after F1, the flag may flip in a dev/demo environment where dispatch is driven by script.
Any environment with real customer reports also needs **Gate F2**.

Start it now as a parallel Track B, not on Track A's critical path. It is a new surface (queue
list; detail with location per A8 / per-subject Trail B row; dispatch; re-dispatch; two-admin
approve with `CSA_SAME_ADMIN` showing target org name and reason before approval), so it gets the
full treatment:

- **B1 — `frontend-architect`:** short Stage 6 note for `src/admin/` dispatch pages reusing the
  admin step-up pattern in `PartnerOrganizationPages.tsx` / `AdminClaimsPages.tsx`, covering the
  202 pending-approval state and 409 snapshot-mismatch handling.
- **B2 — `ui-designer`:** queue/detail/approval layouts; `design-system-manager` signs off on any
  component not already in the library.
- **B3 — `frontend-engineer`:** builds it.
- **B4 — `security-engineer`:** Stage 8 delta, focused on location display on admin detail and the
  approval flow. Notes that the manifest records no code-level Stage 8 for
  `admin-case-dispatch.ts` yet; fold that in.
- **B5 — `qa-test-strategy`:** Stage 10.

**Passing B4 and B5 is Gate F2.**

### Q4: Other blockers

- **Design system:** none for Track A, provided engineers reuse the existing Button/reason-picker/
  alert patterns from 0b(iv). Any genuinely new component triggers `design-system-manager`
  sign-off under the house rule; flag it, don't build ad hoc. No `ui-designer` pass is needed for
  Track A; Track B needs both (B2).
- **R-1 lockstep:** the web build ships in the same release as the backend on Render. The operator
  app is `EXPO_PUBLIC_FEATURE_SECURITY_OPERATOR=false` in EAS preview/production today, so there is
  no skew exposure yet. The §3.8 server signal is what makes this safe once that flips.
- **Non-engineering conditions on a non-dev flip (unchanged):** CO-OB03-4 allowlist
  `agreementReference` / `effectiveFrom` filled in (needs the SR-INC002B-S2 executed agreement, an
  owner/compliance action), and the §1 migration script run to exit 0 before the env var is
  applied.

### Dispatch order (short form)

1. **In parallel:** `backend-architect` (0a), `frontend-architect` (0b web, plus B1),
   `mobile-architect` (0b), `backend-engineer` (0c), `ui-designer` (B2).
2. `backend-engineer` builds the §3.8 field.
3. **In parallel:** `frontend-engineer` (web operator) and `mobile-engineer` (mobile operator); then
   `frontend-engineer` on the admin dispatch UI (B3, after B1/B2).
4. `security-engineer` Stage 8 delta on Track A, then Track B.
5. `qa-test-strategy` Stage 10. **F1 permits a dev/demo flip; F2 permits a flip where real reports
   land.**

---

## `qa-test-strategy` Stage 10 re-run — Step 4, Gate F1 (2026-11-03)

*Author: `qa-test-strategy`. Appended per the append-only rule. This is the Step 4 re-run directed
by `cto`'s disposition above, against Findings 1-4 (Finding 5 was already "no issue").*

### Finding 1 — re-verified CLOSED

Both operator UIs now implement the §3.8 contract, not just claim/PATCH:

- **Web** (`src/security/pages/SecurityCasePages.tsx`, `src/security/api/cases.ts`):
  `acceptSecurityCase`, `declineSecurityCase(reason)`, and a `releaseSecurityCase(caseId, reason)`
  that now sends a reason are all present and wired to real buttons. Gating matches cto's 0b(i)
  spec exactly: pool mode is `!recoveryCase.dispatchStatus` (claim button and status actions,
  unchanged code path), `dispatchStatus === 'pending'` renders accept/decline only, and
  `dispatchStatus === 'accepted'` renders status/messages/release. Accept uses the claim button's
  404-refetch idempotency idiom, restated in `dispatchStatus === 'accepted'` terms (0b(iii)).
  Decline/release reasons are fixed-enum pickers (`SecurityCaseDeclineReason` /
  `SecurityCaseReleaseReason`), not free text (CS-6, 0b(iv)).
- **Mobile** (`mobile/src/screens/security/SecurityCaseDetailScreen.tsx`,
  `mobile/src/api/security-cases.ts`): same three verbs, same `dispatchStatus`-keyed gating, same
  reason-picker pattern (`declinePickerOpen`/`releasePickerOpen`), same refetch-and-check idiom on
  accept/decline/release (`refreshed.dispatchStatus === ...`). This closes the item the original
  review called out as missing entirely ("mobile has no release/hand-back at all").
- **Pool-mode regression check**: not just "left alone" — `backend/src/routes/security-cases.test.ts`
  and `admin-case-dispatch.test.ts` both pass in full (132/132 across the two files, see test run
  below), including the pre-existing pool-mode PDM-8/claim/PATCH blocks, run in the same pass as
  the new dispatch-mode tests. The §3.8 field is confirmed absent in pool-mode responses by
  dedicated test (`security-cases.test.ts` §3.8 block), matching the "presence is the mode signal"
  design and ADR point that pool-mode behaviour stays byte-identical when the field is absent.

Finding 1 is closed on both surfaces. No further gap found.

### Findings 2-4 — re-verified CLOSED (read test bodies, not just names)

- **Finding 2 (CO-OB03-5 audit trail + SR-009S-4 fail-closed)**: read
  `security-cases.test.ts:3017-3149`. Three positive tests assert exactly one `recordStateChange`
  call per verb with the correct `fromStatus`/`toStatus`/`reason` tag (`dispatch_accepted`,
  `dispatch_declined:<reason>`, `case_handed_back:<reason>`) — not just "a call happened." Three
  fail-closed tests simulate the audit write throwing and assert (a) a 5xx response, (b) the
  underlying mutation function was never called (`mutationCalls.accept/decline/handBack === 0`),
  and (c) the case's stored `dispatchStatus`/`status`/`partnerOrganizationId` are unchanged. This
  mirrors the pool-mode PDM-8/SR-009S-4 pattern exactly, as the recommendation asked. Gap closed.
- **Finding 3 (SE-2 rate limiter triggers)**: read `admin-case-dispatch.test.ts:1042-1106`. Tests
  drive each of list/count/detail past `DEFAULT_AUTHENTICATED_LIMIT` (100/60s) and assert
  `statuses[100]` is `429`, plus a dedicated test that list and count limiters are keyed
  independently (exhausting list doesn't 429 count). This is a real trigger assertion, not a
  wiring/name check. Gap closed.
- **Finding 4 (CO-OB03-6 partner-initiated accept -> release -> re-dispatch -> accept)**: read
  `security-cases.test.ts:3159-3233`. The test drives a real accept via org A's harness, asserts
  `dispatchStatus === 'accepted'`/`partnerOrganizationId === orgA` first; then release, and asserts
  the `{data:{caseId,status:'returned_to_queue'}}` response shape *and* that the stored case's
  `partnerOrganizationId`/`dispatchStatus` are `null` **immediately after the partner-initiated
  release**, before any admin action — the exact CO-OB03-6 gap the original finding called out
  (previously only the admin-initiated re-dispatch-to-null path was covered). It then mutates the
  shared case store to simulate an admin re-dispatch to org B and has org B accept using a token
  from a second harness scoped to org B, confirming the case ends up `accepted`/orgB. This is a
  slightly unusual harness pattern (two `createHarness` calls sharing one `cases` array, only one
  server actually started), but it does exercise what it claims: the full org-A-accept → org-A-
  release → org-B-accept cycle through `security-cases.ts`'s own endpoints, with the compliance
  check asserted at the correct point in the sequence. Gap closed.

### Test suites re-run together (not just per-commit in isolation)

- `backend`: `npm test` → **1141/1142 passed, 1 failed** (`admin-accounts.test.ts:675`, a `200`
  vs `401` mismatch unrelated to OB-03 — not touched by any Step 0-3 commit this session, per
  `git log` on that file/route, last touched by the unrelated TD-XXXXXX account-reference-number
  feature). Re-ran `admin-accounts.test.ts` in isolation: 23/23 passed. This is a pre-existing
  flaky/order-dependent test (likely a token-expiry or shared-fixture timing issue), not a
  regression from this plan's changes. `security-cases.test.ts` and `admin-case-dispatch.test.ts`
  — the two files carrying every Finding 1-4 fix — both pass clean together: **132/132**.
- `web` (root `npm test`): **47 files / 247 tests, all passed**, including
  `src/security/demo/*` and the Security Company Dashboard surfaces.
- `mobile` (`npm test`): **60 suites / 303 tests, all passed**, including
  `src/api/__tests__/security-cases.test.ts` and the operator screens.

### Gate F1 verdict: **PASS**

Findings 1-4 are all closed, verified against actual test/code content rather than commit
messages or `[TAG]` naming alone. Finding 5 required no action (unchanged). Per `cto`'s ruling,
this permits `DIRECTED_DISPATCH_ENABLED=true` in a **dev/demo environment where dispatch is
driven by script** — not yet any environment with real customer theft reports, which still needs
Gate F2 (Track B admin dispatch-queue UI, `security-engineer` B4, `qa-test-strategy` B5) and the
non-engineering conditions already on record (CO-OB03-4 allowlist fields, §1 migration script
exit-0).

### Outstanding, not blocking F1

- The one unrelated backend test flake (`admin-accounts.test.ts:675`) should be filed separately
  for `backend-engineer`/`automation-qa-engineer` to root-cause (order-dependence or timing); it
  is not an OB-03 regression and does not affect this gate.
- Track B (Gate F2) has not been started in this session and remains fully open.
