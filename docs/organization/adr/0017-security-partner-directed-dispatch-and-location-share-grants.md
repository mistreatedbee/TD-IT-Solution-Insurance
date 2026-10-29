# ADR-0017: Security-Partner Dispatch Model (Directed Dispatch) and Location Share-Grant Attachment (OB-03)

Status: **Proposed.** Not Accepted. Paper only. This ADR authorises no code (`08-roadmap.md` §F item 6).
Date: 2026-10-29
Author: `solution-architect`
Deciders: `solution-architect` (author). Ratification by `cto`, with sign-off from `cybersecurity-architect`
(security, and chair of the SR-INC002B-S3 disposition in §D2), `compliance-specialist` (that the SG register is
satisfied) and `product-manager` (sponsor; carries G-7 to the Client). `backend-architect`,
`database-architect`, `frontend-architect` and `mobile-architect` review their domains before ratification.
Inputs:
- [`compliance-review-ob-03-partner-location-sharing.md`](../../features/009-customer-experience-redesign/compliance-review-ob-03-partner-location-sharing.md). The SG register; called "the OB-03 spec" below.
- [`compliance-review-security-partner-data-minimisation.md`](../../features/009-customer-experience-redesign/compliance-review-security-partner-data-minimisation.md). The PDM register and the tier table; called "the PDM ruling" below.
- [`security-review-security-operations.md`](../../features/009-customer-experience-redesign/security-review-security-operations.md). The chair's conditional sign-off for the partner surface.
- [`08-roadmap.md`](../08-roadmap.md): OB-03 row, §D, §E item 2 and §F item 6.
- [`11-documented-client-instructions.md`](../11-documented-client-instructions.md): G-7, and G-7 (extended) in §11.
- [`backend-architecture-event-model.md`](../../features/019-case-history-timeline/backend-architecture-event-model.md) (OB-04).

## Context

OB-03 is the "security-company hand-off". It covers how a recovery case reaches one specific partner
organisation, and how that partner may see the asset's location once the case is assigned. The roadmap
(§D) lists "Partner registry / dispatch model (PDM-6, G-7)" as an open decision owned by this role. §F item 6
says this ADR must also settle SR-INC002B-S3.

**What the two references are:**
- **PDM-6** (PDM ruling §4) is the partner registry. Each partner org needs a record with its legal name,
  PSIRA number, agreement reference, agreement status and effective and termination dates. Invitation, the
  dispatch panel and the partner push fan-out are restricted to orgs whose agreement is `executed` and not
  terminated. Termination revokes operator sessions.
- **G-7** (doc 11) is the missing Client instruction on partner data sharing. It covers what may be
  disclosed, on what trigger, for how long, and who contracts with the partner. The §11 extension adds two
  questions: whether *any* location may be disclosed, and which dispatch model (admin-assigned or pool).
  The model is the Client's to instruct. This ADR sets the architecture we recommend to the Client and will
  build if they agree (see §D1 and the revisit triggers).

**Verified in code on 2026-10-29. This is not taken from the documents:**

| # | Fact | Source |
|---|---|---|
| C-1 | The current model is a shared pool. `buildPartnerOrgQuery` ORs the caller's claimed cases with `unclaimedCaseVisiblePredicate()` (`partnerOrganizationId: null, status: 'open'`), so every partner org sees every unclaimed open case | `backend/src/repositories/recovery-cases.ts:457-494` |
| C-2 | The pool is already de-identified. `OFFER_TIER_FIELD_EXCLUSION_PROJECTION` excludes `notes`, `assetId`, `lastLocation`, `lastLocationAt` and `callCentreNotes`. `CLAIMED_TIER_FIELD_EXCLUSION_PROJECTION` excludes `lastLocation`. Exact-key-set regression tests cover both tiers | `recovery-cases.ts:252-273`; `recovery-cases.test.ts:530-541, 930-954, 1124` |
| C-3 | Partner routes: list, count, detail, `claim`, `PATCH` status, `release`, `reassign` and `messages` | `backend/src/routes/security-cases.ts:102-580` |
| C-4 | `reassign` lets a partner pass a case straight to another org. It checks only that the target exists and has `status === 'active'`. It does not check whether an agreement exists | `security-cases.ts:475-572`; `recovery-cases.ts:944-966` |
| C-5 | **A partner directory exists, but it is not a PDM-6 registry.** `partner_organizations` (Mongo) holds `id, name, status ('active'/'suspended'), contactEmail, notes`. It has no PSIRA number, agreement reference, agreement status or dates. The OB-03 spec's L-6 ("no partner-organisation registry exists in code") is out of date on the directory. It is still correct that no PDM-6 registry exists | `backend/src/repositories/partner-organizations.ts`; `routes/admin-partner-organizations.ts` |
| C-6 | No admin route assigns a case to a partner org | No non-test route outside the partner and invitation paths writes `recovery_cases.partnerOrganizationId` |
| C-7 | `getLocationForCase` is scoped to the customer only. No partner location route exists | `recovery-cases.ts:968-974` |
| C-8 | Location ingestion is kill-switched (INC-001, `LOCATION_INGESTION_ENABLED`) | OB-03 spec L-5 |
| C-9 | No `recovery_case_events` collection exists yet. OB-04 is at the design stage, with no location fields | `docs/features/019-case-history-timeline/backend-architecture-event-model.md` |

## Decision

### D1. Dispatch model: directed dispatch, assigned by an admin. The partner pool is retired.

When OB-03 ships (behind its flag, §D5), a new recovery case goes into an **internal dispatch queue**. Only
admins can see that queue. An admin dispatches the case to **exactly one** partner org. **No partner org
can see an undispatched case in any form.** That includes the de-identified offer tier and the bare count.

The contract-level state model is below. Field names and storage are for `database-architect` and
`backend-architect` to set.

| State | Who can see it | What the partner sees |
|---|---|---|
| **Undispatched** (`open`, no holder) | Admin dispatch queue only | Nothing |
| **Dispatched, pending acceptance** (`open`, holder = org X, assignment `pending`) | Org X only | The offer-tier view (today's Tier 0 field set), so the partner can decide whether to accept. No location |
| **Accepted** (`investigating` or `tracking`, holder = org X, assignment `accepted`) | Org X | Tier 1, unchanged (PDM-2). Location **only** through the grant endpoint (§D3) |
| **Wrap-up** (`recovered` or `closed`, ≤ 90 days) | Org X | Tier 2, unchanged (PDM-4) |

**Partner actions under directed dispatch:**
- **`claim` is removed.** Nothing is left to claim. Its replacements are **`accept`** and **`decline`**,
  which act on a dispatch addressed to the caller's org. Both use the same compare-and-set pattern the
  current `claim` uses.
- **`release` becomes "hand back".** The case goes back to the admin dispatch queue, not to a pool. It
  must carry a reason from a fixed list.
- **Partner-to-partner `reassign` (C-4 / L-4) is removed** (OB-spec §5 item 3). A partner may hand back
  and ask for a different org, but only an admin picks the next recipient. Reasons:
  - Under POPIA, the platform is the party that decides who receives the customer's data. Letting a
    partner choose the recipient puts that decision with an operator.
  - The current route checks only that the target is `active`. It does not check for an executed
    agreement. Closing that gap on one admin path is simpler than closing it on two.
  - SG-4 already ends the grant on reassignment. A new org always needs a fresh grant from the customer
    (§D3.4), so a direct partner-to-partner path gains nothing.
- **Dispatch eligibility is a server check.** At dispatch time the target org must be `executed` and not
  terminated in the PDM-6 registry. Until the registry exists, this is the "manual, documented single-org
  equivalent" that PDM-6 allows for a one-partner pilot, recorded and checked at Stage 8. The `active`
  flag on the current directory (C-5) is not enough.
- **Admin dispatch, hand-back and re-dispatch are privileged state changes.** They write `admin_access_log`
  Trail B rows using the same write-before-mutate pattern as `reassign` today (§18.8 C-B). Whether
  dispatch needs step-up under ADR-0012 is for `cybersecurity-architect` to decide. I recommend it,
  because dispatch discloses a customer's case to a third party.
- **Partner push (PDM-5, SG-10)** goes only to the dispatched org's operators, never to every org. The
  body is limited to asset category and reference.

**Why directed dispatch and not the pool.** I checked this against the OB-03 spec text. I did not assume
it.

1. **The grant model assumes one named recipient.** SG-1 requires exactly one `partnerOrganizationId` on
   every grant. SG-2 and §2 require consent to be "specific": one named org, never "any partner". SG-3
   forbids grants for Tier 0. Under a pool, the customer cannot consent until some org has claimed the
   case, so consent always comes after a claim the customer had no say in. Under directed dispatch, the
   platform chooses the recipient, and the customer is asked about that one named org.
2. **Only directed dispatch makes the SG-3 pre-authorisation work.** SG-3 words it as "share with the
   partner TD IT Solution assigns to this case". That wording only makes sense if TD IT Solution does the
   assigning. Pre-authorisation matters because the stolen device is often the customer's own phone, so
   the customer may not be reachable to grant after assignment. Under a pool, the wording would have to
   become "whichever partner claims it". That comes close to the "any partner" grant §2 prohibits.
3. **It removes Tier 0 entirely.** That disposes of the "pool property" behind SR-INC002B-S3 and the
   PDM ruling's §2.3(4) re-identification reassessment. Neither is just managed.
4. **The s18 notice becomes one sentence and the breach path covers one agreement per case.** Both
   compliance rulings state this preference (PDM ruling §2.4; OB-03 spec §0 item 4). PDM-9's copy and the
   §4 notice must be adjusted accordingly (`compliance-specialist`).
5. **It is cheaper to change now than later.** The PDM ruling's pilot note applies: the pool and directed
   dispatch reach the same recipients with one partner. Changing after partner two is onboarded is the
   expensive option.

**Rejected alternatives:**
- **Keep the pool and attach grants at claim time.** Lawful under PDM ruling §2.3 if PDM-6 holds.
  Rejected for reasons 1 and 2 above: consent always follows a claim the customer did not choose, and
  pre-authorisation cannot be worded specifically. It also keeps Tier 0, the re-identification monitoring,
  and partner-to-partner reassignment.
- **Directed dispatch with a fallback to the pool if no admin acts within N minutes.** Rejected. This
  brings back Tier 0 and the pool's recipient set exactly when cases are most urgent. It also makes the
  customer's notice conditional ("one partner, unless..."). Dispatch latency is handled operationally
  instead (see "Failure modes").
- **Automatic assignment by rules (service area, capacity) from day one.** Not rejected, but deferred.
  No coverage or service-area model exists (the PDM ruling's "coarse service area" is "not yet
  modelled"). The dispatch contract above is written so that a `system` actor can later perform the same
  `dispatch` transition under the same eligibility check (OB-04's `actor.type: 'system'` already
  reserves this). Turning it on is a revisit trigger, not a silent change.
- **Customer chooses the partner.** Rejected for now. Customers have no basis for choosing, it adds a
  step at the moment of theft, and it does not change the grant model. It can be revisited once there are
  several partners with published service areas.

### D2. SR-INC002B-S3: formal disposition is **CLOSED (discharged by construction)**. The residual pool property is superseded by D1.

**What SR-INC002B-S3 says.** It is opened in `INC-002-play-internal-location-reenablement.md` §11.4.3
(lines 813-823) and recorded as BLOCKING in `stage8-manifest.json` (entry owner `cybersecurity-architect`,
line 228): "*`buildPartnerOrgQuery` matches `partnerOrganizationId:null` for EVERY operator org, so an
unclaimed open case's `lastLocation` is visible to any operator of any org before anyone claims it.
Either scope the pool (region/dispatch assignment) or record it as a dated risk acceptance with a named
accountable owner. Silent acceptance is not permitted.*"

**The finding is a location exposure.** The harm it describes is coordinates reaching orgs with no role
in the case.

**Disposition: CLOSED.** Reasons:
1. **The exposure no longer exists in code.** The offer tier never fetches `lastLocation` or
   `lastLocationAt`. The claimed tier never fetches `lastLocation` (C-2). Exact-key-set regression tests
   enforce both. Partners get no coordinates at any tier.
2. **The chair has already found it discharged.** `security-review-security-operations.md` (line 269)
   says: "SR-INC002B-S3 is discharged by construction … That discharge takes effect once SR-009S-1 lets
   the route actually run." SR-009S-1 is recorded as "independently confirmed closed" in that review's
   §9.1 (line 358). The stated condition is therefore met.
3. **The residual "open-pool property" is not carried under S3.** The pool that remains is the
   de-identified offer tier, which compliance ruled lawful (PDM ruling §2.3) on conditions that are tracked
   elsewhere: PDM-6 under its own ID, and SR-INC002B-S2 (executed agreement), which is still BLOCKING on
   the same manifest entry. **D1 retires the pool when OB-03 ships.** Until then, `EXPO_PUBLIC_FEATURE_SECURITY_OPERATOR`
   stays `"false"` and no real partner data flows (S1/S2 hold). Closing S3 is therefore not a silent
   acceptance. No residual location risk remains to accept, and the pool property itself is disposed of
   by a recorded decision with an owner.

**Conditions that keep it closed:**
- **(a) Regression guard.** The tier exclusion projections and their exact-key-set tests may not be
  weakened. Adding any location field to any partner projection or serialiser, at any tier, **reopens
  SR-INC002B-S3 automatically**, in addition to breaching PDM-2, PDM-10 and SG-6. The grant endpoint
  (§D3) is the only lawful route for location.
- **(b) Manifest update.** Named owner: **`cybersecurity-architect`** (the chair and manifest entry owner).
  The chair should update the `stage8-manifest.json` condition text from BLOCKING to discharged by
  construction, citing this ADR and the security review at line 269. **This ADR does not edit the
  manifest.** The chair has not edited it either (that review's line 302). Until the chair edits it, the
  manifest and roadmap §E item 2 ("a live open risk") are stale on this point. `technical-writer` should
  refresh §E's wording once the chair acts.
- **(c) Effective date.** This disposition takes effect when the chair records it. It does not wait for
  OB-03 to be built, because the closure rests on code that already exists (C-2), not on D1.

### D3. How the share-grant model attaches to directed dispatch

This section covers only the mechanics. Every SG constraint applies as ruled and is not reopened here.

**D3.1 Dispatch never creates consent.** No admin action, partner action or system dispatch creates,
renews or extends a grant (SG-2). A grant comes from the customer in one of two ways:

- **Path A: pre-authorisation at report time (SG-3).** When reporting a theft or loss, the customer may
  choose "Share with the partner TD IT Solution assigns to this case". This is a separate step from
  submitting the report. It is not pre-selected, "Not now" carries equal weight, and the report goes
  through either way (§2 Voluntary).
  - It is stored as a **pre-authorisation record**, not a grant. It contains `caseId`, `assetId`,
    `accountId`, `noticeVersion`, `grantChannel`, `createdAt`, and either `consumedAt` or `withdrawnAt`.
    It names no org, because none exists yet, and SG-1 requires exactly one org on a grant.
  - When the **first** dispatched org **accepts**, the server consumes the pre-authorisation and writes a
    full SG-1 grant naming that org. The grant records `grantedBy` = the customer's `accountId`,
    activation = system, and a link to the pre-authorisation.
  - The customer is then notified by push **and** email with the partner's legal name, PSIRA number,
    expiry and a one-tap revoke (SG-3).
  - **A pre-authorisation can be used once.** It activates for the first accepting org only. If the case
    is handed back or re-dispatched, a fresh customer grant is needed (§4 notice: "You'll be asked again
    before anyone new sees it"). Withdrawing it before dispatch is a single tap.
- **Path B: grant after acceptance.** If there is no pre-authorisation, the customer receives an in-app
  prompt, plus push and email, when an org accepts. The prompt names the org and shows the §4 notice. A
  grant exists only if the customer confirms.

**D3.2 A grant activates on acceptance, not on dispatch.** A grant applies to an org that is actually
handling the case. A pending dispatch can still be declined. Activating on acceptance is stricter than
SG-3's "assigned to, or claimed by", and it means a declined dispatch never leaves an active grant
behind. SG-4's 24-hour default runs from activation. The API accepts a requested duration of up to 72
hours (SG-4's ceiling). Clients may offer 24 hours only. A renewal is a new grant record by the customer
(SG-1 append-only).

**D3.3 Server-side, per-request, fail-closed enforcement (SG-6, OB-spec §5 item 4).** There is one
dedicated, case-scoped partner route. Its working name is `GET /v1/security/cases/:caseId/location`, and
`backend-architect` sets the final contract in OpenAPI before any build. On **every** request it
evaluates the conjunction below in the handler. Nothing is cached in the session or JWT, and nothing is
precomputed at acceptance:
1. The case is held by the caller's org, the assignment is `accepted`, and the status is `investigating`
   or `tracking`.
2. An active grant exists matching (`caseId`, the case's `assetId`, the caller's org), with no end record
   and `expiresAt > now`. **`now` is checked at read time**, so a correct expiry never depends on a
   background job.
3. The caller's org is `executed` and not terminated in the registry.
4. The customer's Feature 008 location consent is active and the account is not erased.

If any condition is false, the response is the same not-found response used for an inaccessible case
(no grant oracle). If the grant store, registry or consent store cannot be read, the route **returns no
location** and gives an error that does not reveal whether a grant exists. The SG-7 audit row is written
**before** the response body is built. If that write fails, no data is returned (the same write-before-act
pattern as §18.8 C-B). The SG-5 scope filter (no points older than the case's `createdAt`, nothing from
before the grant beyond the single activation point, no labels or derived data) is applied in the same
handler. **This ADR does not assume a location-history store exists.** If Feature 008 keeps only the last
point, the route serves that one point, subject to SG-5's time rules.

**D3.4 Automatic end: checked at read time and recorded when it happens.** Every SG-4 end condition is
already evaluated on each read (D3.3), so access stops immediately even if no end record has been written
yet. End records (SG-1 `endedAt`, `endReason`, `endedBy`) are also written **synchronously by the
transition that causes them**, so the SG-8 history is accurate:

| Trigger | Where it is written | `endReason` |
|---|---|---|
| Customer revokes | Customer revoke route | `revoked_by_customer` |
| Case moves to `recovered` or `closed` | Status transition | `case_terminal` |
| Hand-back, or admin re-dispatch to a different org | Hand-back or dispatch transition | `case_reassigned` |
| Agreement suspended or terminated (PDM-6) | Registry transition (which also returns the org's open cases to the dispatch queue and revokes operator sessions) | `partner_agreement_ended` |
| Feature 008 location consent withdrawn | Consent route | `location_consent_withdrawn` |
| Account erasure | Erasure path | `account_erased` |
| Timeout | Sweeper, purely to record the event. Access has already stopped under D3.3 | `expired` |

A hand-back that returns the case to the queue with no new holder is recorded as `case_reassigned`. I ask
`compliance-specialist` to confirm this, or to add `case_unassigned` to the SG-1 vocabulary (OQ-2).

**D3.5 Storage and ownership (ADR-0002).**
- Grants and pre-authorisations are domain data, so they go in **MongoDB**. They are two new collections
  owned by `database-architect`. Records are append-only, and end fields are write-once.
- Retention follows the case record (SG-11). Grant records do not extend how long location points are
  kept.
- The registry fields PDM-6 needs are an extension of the existing `partner_organizations` collection
  (C-5), not a new store.

**D3.6 Audit and case history (SG-7, OB-spec §5 item 5).**
- **Audit:** every grant lifecycle event and **every partner location read** writes a subject-keyed
  `admin_access_log` (Trail B) row containing the SG-7 fields (ADR-0006 C-16(b)). This is the source of
  truth for AUD-8 reconstruction and for the customer's SG-8 access history and s23 answers. It builds on
  PDM-8 / RR-012-2 (precondition P-5).
- **Case history (OB-04):** lifecycle events, and only lifecycle events, are added to OB-04's
  `recovery_case_events` enum. The additions are `case_dispatched`, `dispatch_accepted`,
  `dispatch_declined`, `case_handed_back`, `location_share_granted` and `location_share_ended`.
  `metadata` may hold only `grantId`, `expiresAt` and `endReason`. **Location points, point counts and
  per-read events never go into case history**: OB-04 §2.4 and roadmap §F item 5 say "no location
  fields", and per-read volume belongs in the audit trail. This fits OB-04 §2.2's additive enum widening,
  so its shape does not change.
- `case_claimed` and `case_reassigned` stay in the enum for history written before the change.

### D4. Contracts and boundaries

- **Partner routes** (`/v1/security/cases*`) lose `claim` and `reassign` and gain `accept`, `decline` and
  the grant-checked `location` route. List, count and detail keep one shared visibility predicate
  (C-012-3). The unclaimed branch is replaced by a "dispatched to caller, pending" branch.
- **Admin routes** (new): dispatch queue (list and count), `dispatch`, `re-dispatch`, and the PDM-6
  registry fields. These need their own manifest entries under the SR-012-5 precedent, because `/admin/*`
  does not count as coverage.
- **Customer routes** (new): create and withdraw a pre-authorisation, create, renew and revoke a grant,
  list active grants, and the access-history read (SG-8).
- All three sets need OpenAPI contracts before implementation. `backend-architect` owns them.
  `qa-architect` owns the contract tests.

### D5. Rollout and gating

- **Two server flags, both OFF by default:**
  - `DIRECTED_DISPATCH_ENABLED` covers D1 and D4 without the location route.
  - `PARTNER_LOCATION_SHARING_ENABLED` covers D3. It may only be ON if `DIRECTED_DISPATCH_ENABLED` is ON.
- **When the first flag is turned on:** cases that are open and unclaimed move to the dispatch queue.
  Cases already held by an org stay with that org. They become `accepted` and keep no grants, because
  none exist today.
- **Directed dispatch without location can ship on its own.** It goes through its own Stage 8 and
  Stage 10, under G-7's original question.
- **Location sharing needs every OB-spec §6 precondition** (P-1 to P-7) and its own Stage 8 and
  Stage 10. Turning `PARTNER_LOCATION_SHARING_ENABLED` on before then is a gate breach.
- **Neither flag affects claims.** Grant status is never an input to Feature 018 adjudication (OB-spec §2).

## Failure modes (third-party and operational)

| Failure | Behaviour |
|---|---|
| No admin dispatches promptly | Queue-age alerts go to admins. `business-analyst` sets an internal time-to-dispatch target (OB-04, internal only, no contractual target). **No fallback to a pool.** |
| Partner does not accept within the acceptance window | The dispatch lapses back to the queue and admins are alerted. The window length is `business-analyst`'s call. |
| Partner declines or hands back | Back to the queue. Any grant ends (`case_reassigned`). The new org needs a fresh grant. |
| Agreement terminated mid-case | The registry transition ends grants, revokes sessions and returns the org's open cases to the queue. |
| Grant, registry, consent or audit store unavailable | The location route fails closed (D3.3). Case handling without location is unaffected. |
| Push or email fails at pre-authorisation activation | The grant record and in-app state still go through. Notification retries, and permanent failure alerts ops. See OQ-1. |
| Location ingestion off (INC-001) | The route returns no points. Grants can exist but show nothing. The customer UI says so honestly. |

## Consequences

- SR-INC002B-S3 can be closed now (D2) without waiting for OB-03.
- The pool and Tier 0 are removed entirely once D1 ships. So are the re-identification monitoring and the
  partner-chosen-recipient path.
- Customers are only ever asked about one named org.
- **Cost:** every dispatch needs an admin. Admin availability becomes a recovery-latency dependency
  until rules-based assignment is designed. This is the main trade-off, and I accept it deliberately.
- New work owed by others before any build: PDM-6 registry fields (`backend-architect` +
  `database-architect` + `authentication-engineer`), the OpenAPI contracts (D4), the OB-04 enum additions,
  the adjusted PDM-9 and §4 copy (`compliance-specialist`), the step-up ruling (`cybersecurity-architect`),
  and the internal dispatch and acceptance targets (`business-analyst`).
- The OB-03 spec's L-6 needs an append-only correction from `compliance-specialist`: a directory exists
  (C-5), but a PDM-6 registry does not. The substance of L-6 is unchanged.

## Open questions (for ratification)

- **OQ-1 (`compliance-specialist`):** if a pre-authorised grant activates and both push and email fail,
  should activation be held back, or is it enough that the grant shows in-app and can be revoked?
  This ADR proposes the latter, because pre-authorisation exists for the case where the customer cannot
  be reached.
- **OQ-2 (`compliance-specialist`):** add `case_unassigned` to the SG-1 `endReason` vocabulary, or
  confirm that `case_reassigned` covers a hand-back to the queue.
- **OQ-3 (`product-manager` to the Client, G-7):** the Client must instruct the dispatch model. If the
  Client chooses the pool, this ADR is reopened (see the revisit triggers). It is not adapted quietly.

## Ratification trigger

This ADR moves from Proposed to Accepted only when all of the following are true:
1. `cybersecurity-architect` signs off D1 to D4 and has recorded the D2 disposition in
   `stage8-manifest.json`.
2. `compliance-specialist` confirms D3 satisfies SG-1 to SG-14 and answers OQ-1 and OQ-2.
3. `backend-architect` and `database-architect` have reviewed D3.5 and D4.
4. `cto` ratifies.

Ratification authorises Stage 6 and Stage 7 design and then build behind the D5 flags. **It does not
authorise turning on location sharing.** That stays gated by OB-spec §6 P-1 to P-7 and by the Client's
G-7 answer (OQ-3). The D2 disposition does not depend on ratification (see D2(c)).

## Revisit trigger

Reopen this ADR in any of these cases:
- The Client's G-7 instruction picks the pool, or forbids any partner location disclosure. In the second
  case, D3 is withdrawn and D1 stands.
- Rules-based or system auto-dispatch is proposed.
- The customer-chooses-partner option is proposed.
- Measured admin dispatch latency regularly exceeds the internal target.
- A second partner org with an overlapping service area is onboarded.
- Any proposal would put location into a partner serialiser or into OB-04 history.
