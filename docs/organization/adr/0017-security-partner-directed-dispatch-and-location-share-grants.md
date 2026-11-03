# ADR-0017: Security-Partner Dispatch Model (Directed Dispatch) and Location Share-Grant Attachment (OB-03)

Status: **Accepted** — ratified by `cto` 2026-10-29, with conditions (see "`cto` ratification" at end).
Authorises Stage 6/7 design and flagged build only; **both D5 flags stay OFF**, and
`PARTNER_LOCATION_SHARING_ENABLED` may not turn on until CR-3 and OB-spec §6 P-1 to P-7 are met. Client G-7
/ OQ-3 still open.
~~Status: **Proposed.** Not Accepted. Paper only. This ADR authorises no code (`08-roadmap.md` §F item 6).~~
*(Superseded 2026-10-29 by `cto` ratification; original text retained for audit.)*
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

---

## `cybersecurity-architect` sign-off (2026-10-29)

**Verdict: D1 to D4 APPROVED WITH CONDITIONS (CS-1 to CS-9 below). D2 recorded: SR-INC002B-S3 is
CLOSED.** This satisfies ratification trigger item 1. It does not stand in for the compliance-specialist,
backend-architect or database-architect items, or for any Stage 8 of the build that comes later. It does
not authorise turning on `PARTNER_LOCATION_SHARING_ENABLED`.

### 1. D2: SR-INC002B-S3 disposition, recorded

I re-verified C-2 in code today. I did not rely on the review I wrote earlier.
- `OFFER_TIER_FIELD_EXCLUSION_PROJECTION` excludes `lastLocation` and `lastLocationAt`.
  `CLAIMED_TIER_FIELD_EXCLUSION_PROJECTION` excludes `lastLocation` (`recovery-cases.ts:252-273`).
- Every partner `find`/`findOneAndUpdate` uses one of those two projections: list, detail, claim, status,
  release and reassign (`recovery-cases.ts:663, 675, 743, 766, 779, 886, 918, 963`).
- The only reader of `lastLocation` is `getLocationForCase` (`:973`), and it is customer-scoped.
- The partner routes serialise only through the two tier serialisers (`security-cases.ts:84-85, 303, 392,
  463, 567`).

The concrete exposure named in S3 does not exist. **Disposition: CLOSED, discharged by construction. This
is not a risk acceptance.** I accept the ADR's argument that the de-identified pool property is tracked
under S2 and PDM-6, not under S3, and that D1 retires it.

`gates/stage8-manifest.json` (`backend-security-cases`) has been edited. The S3 condition now reads CLOSED
and gives the evidence and the keeps-closed rule. The old BLOCKING text is kept inline, marked void.
Roadmap §E item 2 has an appended correction. D2(a) is adopted as written, with one widening: a
**derived or coarsened** coordinate also reopens S3. That includes a suburb, a geohash, "distance from
X", or a reverse-geocoded string in any partner field, push body or message template. Rounding a
coordinate does not make it safe to show partners.

Unchanged on the same entry: SR-INC002B-S1 and S2 stay **BLOCKING**,
`EXPO_PUBLIC_FEATURE_SECURITY_OPERATOR` stays `"false"`, and R-INC002B-1 stands.

### 2. D1: does directed dispatch close what it claims to close?

Mostly, yes. Directed dispatch reduces the set of orgs that can see a case from "every active org" to
"one org that an admin chose and that has an executed agreement". It removes partner-chosen recipients
(C-4). It also makes SG-3 consent specific. I agree with the reasons in D1 and with the rejection of the
pool fallback. A fallback that turns on under urgency is the worst version of the pool.

**My ruling on the step-up question: dispatch and re-dispatch REQUIRE ADR-0012 step-up.** The same goes
for any registry transition to `executed`. Each of these discloses a customer's case to a third party,
and that matches ADR-0012's privileged-action criteria. Accepting the latency cost (Consequences) does
not change this. A step-up window that covers a run of dispatches in one session is acceptable.
Skipping step-up per action is not.

What the ADR does **not** close, in order of severity:

- **G-1. Insider-plus-partner path through pre-authorisation. This is the main gap.** With Path A in
  place, one admin dispatch plus one partner accept gives that partner live location with **no customer
  interaction at that moment**. A malicious or compromised admin working with a partner operator (the
  role spec assumes this) can route any pre-authorised case to an org of their choice. The registry check
  limits the choice to executed orgs, but not to the right one. The audit trail catches this after the
  fact. Nothing stops it beforehand. → CS-1, CS-2.
- **G-2. A thief holding the stolen phone can cancel recovery.** The stolen device is often the
  customer's own phone (D3.1 says this). The thief then holds a live customer session. "One-tap revoke"
  (SG-3) and withdrawing Feature 008 consent (D3.4) both end the grant. A thief can therefore turn off
  partner location from the device being tracked. Once the stolen device is known, it should not count as
  the customer's channel. → CS-3. This conflicts with POPIA's rule that withdrawal must be easy. That
  trade-off is `compliance-specialist`'s to rule on. I am not asking for revocation to be blocked, only
  for it to need fresh authentication from a session that is not on the reported device.
- **G-3. The migration at flag-on carries holders over without checks.** D5 turns every currently held
  case into `accepted`. Those claims were made under the pool, and the pool never checked for an
  agreement (C-4). Carrying them over unchecked skips D1's eligibility check for exactly the cases that
  existed before it. → CS-4.
- **G-4. Live tracking by polling.** D3.3 checks each request, but it does not limit how often a partner
  can read. A partner able to poll the location route continuously is doing live surveillance. That may
  be the purpose during an active recovery, but it should be limited, attributed to one operator, and
  watched for anomalies. → CS-5.
- **G-5. Any operator in the org can read.** Grants are org-scoped (SG-1). Every operator in org X can
  read location. This is acceptable for v1 with SG-7 rows keyed to each operator. Assigning cases to
  named operators within an org is a revisit item, not a blocker. → CS-5(c).
- **G-6. Free-text side channels.** Tier 1 `notes` (written by the customer) and any partner message
  template can carry place text that bypasses the grant route. This was already present under PDM-2 and
  does not reopen S3, which is about the platform's coordinates. It should still be covered by the CS-6
  template rule.

### 3. Conditions

- **CS-1 (dispatch integrity).** Dispatch requires step-up (above). Each dispatch writes its Trail B row
  before the mutation, and the row names the admin and the target org. `backend-architect` designs
  **a second-admin approval for any re-dispatch to a different org** of a case that has an active or
  consumed pre-authorisation. A first dispatch needs one admin. A change of recipient needs two.
- **CS-2 (detective control on Path A).** Activating a grant from a pre-authorisation must always produce
  an ops alert and a customer notification attempt. **On OQ-1, my security input to
  `compliance-specialist`:** I agree that activation should not be held back, because recovery
  availability matters more here. Three conditions apply: (i) a permanent failure of both channels
  raises an ops alert and writes an audit row, (ii) the grant appears on every customer surface at next
  sign-in, and (iii) a weekly report lists admin/org pairs whose dispatches consumed pre-authorisations.
  This is the only way to detect G-1. If compliance rules that activation must be held back, that is
  stricter and acceptable to me.
- **CS-3 (stolen-device session).** When a theft is reported, sessions on the reported device are handled
  in one of two ways, and `authentication-engineer` designs which. Either they are revoked, or they are
  marked untrusted, meaning they cannot revoke a grant, withdraw location consent or change account
  recovery details without fresh step-up from another device or channel. In both cases the customer can
  still revoke from any trusted session. Compliance rules on the POPIA withdrawal tension before
  Stage 8 of the location build.
- **CS-4 (no grandfathering).** When `DIRECTED_DISPATCH_ENABLED` turns on, every currently held case has
  its holder re-checked against the PDM-6 registry (or the documented single-org equivalent). Any holder
  that is not eligible goes back to the dispatch queue and does not become `accepted`. Each carry-over or
  return writes a Trail B row with `actor.type: 'system'`.
- **CS-5 (read discipline).** On the location route: (a) a rate limit per operator and per case (value
  set by `security-engineer`), (b) an anomaly alert on read volume, and on reads after the case status
  changes but before the end record is written, and (c) the SG-7 row records the individual operator
  `accountId`, not only the org.
- **CS-6 (no location outside D3).** Partner push bodies (PDM-5/SG-10), the decline/hand-back reason
  vocabulary, message templates and OB-04 `metadata` carry no coordinate, place name or derived
  location. This is enforced with exact-key-set tests in the same style as C-2. A breach reopens S3
  (§1 above).
- **CS-7 (flags fail closed).** Both flags turn on only for the literal `'true'`. If
  `PARTNER_LOCATION_SHARING_ENABLED` is on without `DIRECTED_DISPATCH_ENABLED`, the server refuses to
  start. It does not quietly degrade. While `DIRECTED_DISPATCH_ENABLED` is off, the location route is not
  mounted. Returning a 404 is not enough.
- **CS-8 (oracle uniformity).** For an org other than the holder, the location route, `accept`,
  `decline` and detail return the same not-found response whether the case is undispatched, dispatched
  elsewhere or does not exist. Contract tests cover all three states (`qa-architect`).
- **CS-9 (manifest coverage).** Each new admin route (queue, dispatch, re-dispatch, registry), each
  customer grant route and the partner location route gets its own `stage8-manifest.json` entry under
  the SR-012-5 precedent before it is merged. The partner location route is a **mandated threat-model
  workshop** item before its Stage 8 (authority: role spec, "GPS/security-company data sharing").

### 4. Checklist

- [x] Threat model: the partner location share surface has been added (G-1 to G-6). The STRIDE write-up
  goes in the location-build Stage 8.
- [x] Trust boundaries are zero-trust: per-request four-part check, no session caching, fail closed (D3.3).
- [x] Data classification: location is the highest class. The SG register (compliance) covers it.
- [ ] Encryption at rest: the two new collections inherit the Atlas baseline. `database-architect`
  confirms this in Stage 6.
- [x] Third-party least privilege and audit: one org, executed agreement, Trail B for every read, plus
  CS-1 and CS-5.
- [x] Account takeover considered: G-2/CS-3 (stolen-device session). A takeover from another device can
  grant or revoke location for the vetted partner only and gains the attacker no coordinates.
- [x] No silent risk acceptance: S3 is closed on evidence. Residual G-5 is accepted for v1 by
  `cybersecurity-architect`, with review at the second-partner revisit trigger.
- [ ] Joint gate: `security-engineer` and `compliance-specialist` concurrences are still outstanding for
  the build's Stage 8. This sign-off covers ADR ratification item 1 only.

---

## `database-architect` review (2026-10-29)

**Verdict: D3.5 and D4 are workable. APPROVED WITH CONDITIONS (DB-1 to DB-6).** This satisfies
ratification trigger item 3 (database-architect half; `backend-architect` still owes their half). I
reviewed this against the real schema, not the ADR's description of it: `RecoveryCaseDocument` and
`RecoveryCaseDbRow` in `backend/src/repositories/recovery-cases.ts:95-137`, and
`PartnerOrganizationDocument`/`Row` in `backend/src/repositories/partner-organizations.ts:28-45`. Neither
file defines a `createIndex`/`IndexDescription` array today — unlike the newer collections
(`backend/src/db/location-events-collections.ts`, `claims-collections.ts`,
`retention-job-runs-collections.ts`), which do follow that pattern. So this is genuinely new index design,
not a retrofit of something already indexed.

### 1. Does `recovery_cases` need new fields, or is this a new collection?

**Both, and they split cleanly.**

- **`recovery_cases` needs new fields for dispatch state**, not a new collection, because dispatch state
  is a property of the case itself — one case has at most one current dispatch, and every existing
  partner-visibility query (`buildPartnerOrgQuery`, `claimedCaseVisiblePredicate`,
  `unclaimedCaseVisiblePredicate`, `recovery-cases.ts:457-494`) already filters on
  `partnerOrganizationId` + `status`. D1's model needs one more axis on top of those two:
  `dispatchStatus: 'pending' | 'accepted'` (distinguishing "dispatched, not yet accepted" from
  "accepted" — D1's table). I recommend:
  - `partnerOrganizationId: string | null` (unchanged — now means "current dispatch target or holder",
    not "claimant")
  - `dispatchStatus: 'pending' | 'accepted' | null` (null when `partnerOrganizationId` is null)
  - `dispatchedAt: Date | null`, `dispatchedBy: string | null` (admin accountId — audits who dispatched,
    cheap denormalization alongside the Trail B row CS-1 requires elsewhere)
  - `acceptedAt: Date | null`
  - `dispatchHistory` is **not** embedded on the case document. D1 already requires an append-only trail
    of dispatch/accept/decline/hand-back events, and OB-04 (`recovery_case_events`) is the designated home
    for that per D3.6. Embedding a growing array on the hot case document fights the same unbounded-growth
    problem GPS pings have, for no read benefit — nothing in the partner or admin surfaces queries "all
    past dispatches of this case" from the case document itself.
  - This is a **breaking schema addition in spirit** even though it's additive in shape: the meaning of
    `partnerOrganizationId` non-null changes from "claimed" to "dispatched (pending-or-accepted)". CS-4's
    migration (re-check every current holder against the registry) is also the natural point to backfill
    `dispatchStatus: 'accepted', acceptedAt: <migration timestamp>` on every case that passes the
    eligibility re-check, and to null out `partnerOrganizationId` on every case that fails it. Write this
    migration as a single idempotent script keyed off the `DIRECTED_DISPATCH_ENABLED` flag flip, not a
    lazy on-read migration — a dispatch-queue list query needs the field populated correctly for every row
    on day one, not eventually.

- **Grants and pre-authorizations are two new collections**, per D3.5, and I agree with that placement —
  not fields on `recovery_cases`. Reasons:
  1. **Cardinality and lifecycle mismatch.** A case has zero-or-one *current* dispatch but can accumulate
     multiple grants over its life (hand-back → re-dispatch → fresh grant, D3.4's `case_reassigned`
     path). SG-1 requires grants to be append-only with write-once end fields. Modeling that as an
     embedded array on the case document means every grant-lifecycle write (revoke, expiry record,
     consent-withdrawal cascade) becomes a positional/array-filtered update on a document that is also
     being read and written by unrelated status-transition and messaging code — higher contention, and a
     document that grows for the life of the case.
  2. **Access pattern mismatch.** D3.3's four-part check reads `(caseId, assetId, partnerOrgId)` on
     **every** partner location request — a narrow, hot, latency-sensitive lookup. A separate
     `location_share_grants` collection with a tight compound index serves that directly. Folding it into
     `recovery_cases` means every one of those hot reads also pulls (or at least touches, if projected)
     an unrelated case document, and any index supporting the grant check would have to be defined
     on fields nested inside an array on that document — materially worse for selectivity.
  3. **Different retention mechanics.** D3.5 says grants follow the case's retention, but they are
     still separately queried for SG-8 customer access history ("list active/past grants") independent
     of case detail. A dedicated collection serves that list without a `$unwind` / array-projection
     against every case the customer ever had.

  **Suggested shapes** (field-naming is `backend-architect`'s call per D4, this is the data-model
  minimum):
  - `partner_location_preauthorizations`: `_id`, `caseId`, `assetId`, `accountId`, `noticeVersion`,
    `grantChannel`, `createdAt`, `consumedAt: Date | null`, `withdrawnAt: Date | null`. Write-once on
    `consumedAt`/`withdrawnAt` — whichever is set first wins, enforced at the application layer with a
    conditional update (`$set` guarded by both fields being currently null), the same compare-and-set
    idiom already used for `claim`/`release` in `recovery-cases.ts:878-917`.
  - `partner_location_share_grants`: `_id`, `caseId`, `assetId`, `partnerOrganizationId`, `accountId`,
    `grantedBy`, `preauthorizationId: ObjectId | null`, `activatedAt`, `expiresAt`, `requestedDurationHours`,
    `endedAt: Date | null`, `endReason: enum | null`, `endedBy`. Append-only: a renewal (D3.2) is a new
    document, never an update to `expiresAt` on an existing one — this is what SG-1's "append-only" and
    D3.4's "write-once end fields" actually require at the document level, and it's also what makes SG-8
    access-history reconstruction a plain time-ordered query instead of a diff against mutated rows.

### 2. Indexes for the "checked on every read, not a background job" pattern

This is the ADR's most latency-sensitive requirement (D3.3: four conditions evaluated per request, no
caching). Each condition needs its own cheap index; none should be speculative beyond what D3.3 actually
checks.

- **`partner_location_share_grants`**: compound index
  `{ caseId: 1, partnerOrganizationId: 1, endedAt: 1, expiresAt: 1 }`. This lets the handler do a single
  indexed point lookup for "active grant for this case + this org" (`endedAt: null` is the selective
  prefix after the equality fields; `expiresAt > now` is a cheap range check mongo can still use off the
  same index as the trailing field once `endedAt` is pinned to `null`). Add a **partial index** with
  filter `{ endedAt: null }` — the "still active" grants are the only ones the hot path ever reads by
  this shape, and partializing keeps the index small as the collection grows (it is append-only and will
  outlive most individual grants being active). A second index, `{ accountId: 1, activatedAt: -1 }`,
  serves SG-8's "list my grants" without touching the partial index.
- **`partner_location_preauthorizations`**: `{ caseId: 1, consumedAt: 1, withdrawnAt: 1 }`, also with a
  partial filter (`{ consumedAt: null, withdrawnAt: null }`) for the "is there a live pre-auth to consume
  on accept" check, which is the only read this collection needs to serve under latency pressure (it is
  read once, on accept, not per-poll).
- **`recovery_cases`**: the dispatch-queue list ("admin: show me undispatched cases") needs
  `{ partnerOrganizationId: 1, status: 1, createdAt: 1 }` or equivalent — check whether an index on this
  shape already exists before adding one; I did not find a `recovery-cases` index-definition file, so
  this is net-new and should be added in the same PR that adds the dispatch fields, not left to whoever
  notices the query is slow. The existing `buildPartnerOrgQuery` compound-OR shape (claimed branch +
  unclaimed branch) will become a dispatched-to-caller-pending branch + accepted-by-caller branch under
  D1 — same index needs, re-point rather than redesign.
- **Registry check** (`partner_organizations`/PDM-6 extension, condition 3 of D3.3): index on `_id`
  (already the natural lookup) plus `{ agreementStatus: 1 }` if the dispatch-queue eligibility filter
  ("show only `executed`, not-terminated orgs") is ever queried directly rather than checked one-row-at-a-
  time; low priority, add only if `backend-architect`'s dispatch-queue query needs it.
- **Explicitly do not add**: a TTL index on `location_share_grants` to auto-expire documents at
  `expiresAt`. D3.3/D3.4 are explicit that expiry is a server-time check at read, not a background job,
  and TTL indexes in MongoDB delete the document outright on a best-effort background sweep (not
  immediate, and typically lagged by up to 60 seconds) — using one here would both violate "no background
  job dependency" in spirit (if the sweep lags, the document is still present and must still be correctly
  evaluated as expired by condition 2, which it will be — `expiresAt > now` works fine without TTL) and
  risk silently destroying SG-1's append-only audit record the moment it expires, which breaches SG-8
  access-history requirements outright. Do not delete grant documents on expiry. Let them age out under
  the case's SG-11 retention schedule instead, deleted (or archived) only alongside the case record.

### 3. Encryption-at-rest (the item the cybersecurity-architect checklist deferred to Stage 6, now)

Confirming the checklist item flagged "pending — database-architect confirms in Stage 6" above:

- **Cluster-level encryption at rest is already the Atlas baseline per ADR-0001/ADR-0002** — both new
  collections inherit it automatically, no action needed to get that floor.
- **Field-level consideration specific to these two collections:** neither collection stores a raw
  coordinate, government ID, or payment reference, so this role's own "never store raw payment data /
  encrypt ID documents" checklist item does not independently trigger here. `grantedBy`/`accountId`/
  `partnerOrganizationId` are identifiers, not location values. The location **value itself** (per D3.3)
  is never persisted in these two collections at all — it is read live off the Feature 008 location
  store at request time and returned, not stored alongside the grant. So the sensitive payload these
  collections hold is "who may see location, when, and why," not location itself. That is still PII
  (accountId↔case↔org linkage) and worth access-control discipline but not a field-level-encryption
  case under the usual bar (payment/ID-document grade secrets).
- **One genuine open item I am flagging, not resolving unilaterally:** `grantChannel` and `noticeVersion`
  on the pre-authorization record, plus the full grant history, together reconstruct a sensitive fact
  pattern ("this customer's phone was stolen and TD IT Solution shared its location with partner X at
  time Y"). That is exactly the kind of inference cybersecurity-architect's G-1/G-5 concerns are about at
  the application layer, not the storage layer — Atlas-baseline encryption at rest plus the existing
  MongoDB Atlas network/access controls (already the baseline for every other domain collection) are
  sufficient for storage; what matters more here is the DB-level access-control scope (which service
  accounts/roles can read `partner_location_share_grants` directly, bypassing the application's D3.3
  check) — that is a `cybersecurity-architect`/`security-engineer` access-control-model question, not an
  encryption one, and I defer it to them rather than resolving it here.
- **Conclusion for the checklist box:** encryption at rest — **confirmed, no gap**. Both new collections
  sit on the same Atlas cluster and inherit the same encryption-at-rest baseline as every other domain
  collection (ADR-0002). No additional field-level encryption is required for the fields these two
  collections actually hold.

### 4. Conditions

- **DB-1 (migration is a script, not lazy).** The `DIRECTED_DISPATCH_ENABLED` flag flip must ship with an
  idempotent, flag-gated backfill script that sets `dispatchStatus`/`acceptedAt` on every currently-held
  case per CS-4's eligibility re-check, run before the flag is flipped to `true` in any environment. No
  on-read lazy migration for this field.
- **DB-2 (append-only enforced at the repository layer).** `partner_location_share_grants` and
  `partner_location_preauthorizations` get no `update`-by-`_id`-with-arbitrary-`$set` method in their
  repositories — only narrowly-scoped conditional updates for the specific write-once transitions D3.4
  lists (end record, consumed, withdrawn), mirroring the compare-and-set pattern already used for
  `claim`/`release` (`recovery-cases.ts:878-917`). This is a repository-API-shape condition, not just a
  convention, because an accidental generic update method is the easiest way to silently violate SG-1's
  append-only requirement.
- **DB-3 (partial indexes, not full).** The grant/pre-auth hot-path indexes above are built as partial
  indexes scoped to the "still live" predicate, re-verified against actual query shape once
  `backend-architect` finalizes the route's exact filter, before the location route's Stage 8.
  Reviewed against real data-volume after the pilot partner, since the "second partner org" revisit
  trigger is also the point this role should re-check index selectivity.
- **DB-4 (no TTL index on grants).** Per §2 above — explicit, since it is the kind of index a well-
  intentioned implementer adds by default for anything with an `expiresAt` field.
- **DB-5 (dispatch-queue index ships with the fields, not after).** The `recovery_cases` index
  supporting the admin dispatch-queue list ships in the same PR as the new dispatch fields, not added
  reactively after the query is observed to be slow in staging.
- **DB-6 (OB-04 and this schema stay in sync).** `recovery_case_events`'s new enum values (D3.6) reference
  `grantId` by the `_id` of `partner_location_share_grants` — confirmed as an `ObjectId` reference, not a
  denormalized copy of grant fields, so a grant's audit trail has exactly one source of truth.

### 5. Checklist (this role's items from the shared pre-approval list)

- [x] Embed-vs-reference reviewed: dispatch state embeds on `recovery_cases` (1:1 current-state fact);
  grants/pre-auths are referenced via a separate collection (1:many, append-only, different access
  pattern). Dispatch history itself is neither embedded nor duplicated — it lives once, in OB-04.
- [x] Indexing validated against the actual D3.3 hot-read shape, not speculative (§2).
- [x] Sensitive-field review completed and handed to `cybersecurity-architect`/`security-engineer` for
  the one open access-control question noted in §3.
- [x] Claim/grant history stays auditable: append-only collections, write-once end fields, no update path
  that can overwrite history (DB-2).
- [ ] Retention alignment with `compliance-specialist`: D3.5 states grants follow case retention (SG-11);
  I have not independently verified the SG-11 retention window against the compliance ruling — that
  confirmation is compliance-specialist's per the ratification trigger, not mine to close.
- [ ] Capacity impact on the Atlas cluster: two new, low-volume (per-case, not per-ping) collections are
  not expected to be a capacity concern, but I have not run this past `cloud-infrastructure-architect`
  formally — recommend a short confirmation before Stage 6, not a blocker to ratification.

---

## `backend-architect` review (2026-10-29)

**Verdict: D1–D4 route/contract shape APPROVED, with new conditions BA-1 to BA-6 below.** This satisfies
ratification trigger item 3 for the backend half (database-architect's half is separate). I re-read
`backend/src/routes/security-cases.ts` and `recovery.ts` before writing this, not the ADR's C-table alone.

### 1. Does the proposed shape fit the existing route structure?

Yes, cleanly. The current partner surface is one router mounted at `/v1/security/cases*`
(`security-cases.ts`), each handler composed from the same four-piece middleware chain
(`authenticate` → `requireUserType('security_company_operator')` → `requirePartnerOrg` →
per-route `createRateLimiter`), the same §18.8 C-B sequence (pre-read → precondition check with no audit
row on failure → write Trail B row before mutation → compare-and-set mutation → tier-scoped serialiser),
and two fixed serialisers (`serializeOfferTierRecoveryCase`/`serializeClaimedTierRecoveryCase`) that are
the sole output path for partner data. Swapping `claim`→`accept`, adding `decline`, and dropping
`reassign` is a same-shape change: each new handler is a drop-in replacement following the identical
five-step pattern already used by `release` and `reassign` (lines 404-572 today). No new middleware
primitive, repository pattern, or serialisation path is required. `accept`/`decline` can reuse
`findByIdForPartnerOrg`'s "does this org hold it, in what tier" precondition shape, just gated on
`assignment === 'pending'` instead of `tier === 'claimed'`.

The admin side (dispatch queue, `dispatch`, `re-dispatch`) is new territory — there is currently no
`/admin/security-cases*` or equivalent router — but it should be a sibling router under the existing
`admin-*.ts` convention (cf. `admin-partner-organizations.ts` already in the tree), not bolted onto
`security-cases.ts`. The customer-side grant/pre-authorisation routes are also new and belong next to
`recovery.ts` (customer-scoped, same auth model as `getLocationForCase`'s caller).

### 2. Gaps the security/compliance focus didn't surface

**BA-1 — Migration path for pool-claimed cases is underspecified at the data-shape level.** D5 says held
cases "become `accepted`" and CS-4 adds the eligibility re-check, but neither states what happens to a
case's `partnerOrganizationId`/`status` tuple during the flag flip for cases that are NOT re-eligible.
"Goes back to the dispatch queue" needs a concrete state: does it clear `partnerOrganizationId` and set
`status: 'open'` with no holder (today's pool-unclaimed shape), or introduce a new `assignment: null`
distinct from "never dispatched"? The distinction matters for the OB-04 event written by CS-4's migration
('`case_unassigned`' vs reusing `case_reassigned`) and for `qa-architect`'s CS-8 oracle-uniformity tests,
which need one canonical "not held" state to assert against for every one of the undispatched / dispatched-
elsewhere / nonexistent trio. This is a one-time backfill script against `recovery_cases`, run once at
flag-on, not a code path that persists — `backend-architect` should own writing that script's spec
alongside `database-architect`, cited as a Stage 6 deliverable, not left implicit in "D5 turns every
currently held case into `accepted`."

**BA-2 — Versioning/back-compat for `claim`/`release`/`reassign` callers.** The ADR says these routes are
"removed," but gives no transition story for the mobile security-operator app and any web security
dashboard that call them today. Per this project's API-versioning norm (never break a shipped contract
silently, `/v1/...`), two options exist and the ADR should pick one explicitly before Stage 6: (a) ship
`accept`/`decline`/dispatch under the same `/v1` path (acceptable only if the mobile/web clients are
deployed in lockstep with the backend flag flip — i.e., the old routes return 410/404 the same release the
new ones appear, with client builds gated on the same flag), or (b) keep `claim`/`reassign` mounted but
have them 410 with a structured error body naming the replacement endpoint, for one release window, so
any stale client build fails loud instead of silently 404ing. Given `EXPO_PUBLIC_FEATURE_SECURITY_OPERATOR`
is already `"false"` (no real partner traffic yet per the cybersecurity sign-off), option (a) is almost
certainly fine in practice — but the ADR should say so, because "removed" read literally implies a breaking
change the house rules otherwise forbid without discussion.

**BA-3 — Queue/alerting mechanism for admin-availability dependency is not yet a real design, just a
named cost.** The Consequences section accepts "admin availability becomes a recovery-latency dependency"
and the failure-modes table says "queue-age alerts go to admins" / "admins are alerted" with no mechanism
named. This repo has no existing job-queue or scheduled-alert infrastructure for backend (`backend/src/`
has no queue/cron primitive I can find beyond the retention-job pattern from `retention_job_runs`
mentioned in recent commits). Feasibility concern: "queue-age alert" and "acceptance-window lapse alert"
both require either (i) a polling sweeper job (same shape as the `expired` grant sweeper D3.4 already
needs) checking `dispatchedAt`/`acceptanceWindowExpiresAt` against now, or (ii) a push-based scheduler.
Given this project already needs a sweeper for grant `expired` events, the cheapest correct design is one
shared periodic sweeper service that evaluates both: grant timeouts (D3.4) and dispatch/acceptance-window
timeouts (D1/failure-modes), rather than two independent polling mechanisms. I recommend the ADR (or the
Stage 6 design that follows) name this explicitly as one sweeper, owned by `backend-architect`, so it
isn't built twice by different engineers. This is a feasibility note, not a blocker to ratification — the
mechanism doesn't need to exist yet, but the ADR currently reads as if "alerts go to admins" is a solved
problem when no alerting transport (push/email/in-app badge to an admin) is named at all. `notification-
engineer` should be pulled in before Stage 6, not just `business-analyst` for the latency target.

**BA-4 — Oracle-uniformity (CS-8) interacts with route count, not just response body.** CS-8 requires the
same not-found response across undispatched/dispatched-elsewhere/nonexistent for detail, `accept`,
`decline`, and location. That's right for response *body*, but the existing `security-cases.ts` list/count
pair (lines 101-192) already has a documented route-ordering hazard (`/count` must be registered before
`/:caseId` — see the comment at line 145). The new admin dispatch-queue routes and the retained partner
list/count will add more path segments under the same `/security/cases` prefix; whoever implements D4
needs to re-verify route-registration order for every new literal-segment route (`/security/cases/count`,
any `/security/cases/:caseId/accept`, `/decline`) against Express's order-dependent matching, the same
class of bug the existing comment already warns about. Flagging this now so it's an explicit Stage 6/7
checklist item, not rediscovered by regression.

**BA-5 — Rate limiting on the location route (CS-5a) needs a repository-level counter, not just the
existing `createRateLimiter`.** The existing `createRateLimiter(ctx.kv, ...)` keys are per-account on a
sliding window via KV (see every route above). CS-5 asks for "per-operator and per-case" limiting plus
anomaly alerting on read volume. Per-operator-per-case is a compound key (`operatorAccountId:caseId`),
which the existing `createRateLimiter` factory already supports mechanically (just a different key
function), so no new rate-limit primitive is needed — but the anomaly-alert half (CS-5b: "reads after
status changes but before end record written") is a correctness check on data, not a rate limit, and
belongs in the handler logic itself (compare read timestamp against the case's `status`-transition
timestamp), not in the KV limiter. Worth stating so `security-engineer`'s CS-5 value-setting and
`backend-architect`'s handler design don't talk past each other at Stage 6.

**BA-6 — D3.5's "two new collections" need a stated relationship to `recovery_cases`, not just
"domain data → MongoDB."** Grants and pre-authorisations reference `caseId`/`assetId`/`accountId` by value
(no foreign keys in Mongo). The location route's D3.3 check #2 reads the grant by `(caseId, assetId, org)`
on every request — this is a hot, per-request read in the money/safety-critical path (location access),
so it needs an index recommendation handed to `database-architect` now rather than discovered under load:
a compound index on `(caseId, partnerOrganizationId, expiresAt)` at minimum, scoped so the "no end record
and expiresAt > now" check in D3.3 can be satisfied by an index scan, not a collection scan. This is
`database-architect`'s call per role boundaries, but I'm flagging it because D3.3's "per-request, not
cached" design is explicitly load-bearing for the security model (D3.3's zero-trust requirement), which
means this read path's latency directly gates how expensive every dispatch-urgency failure mode (BA-3) is.

### 3. Summary verdict

The route/contract shape in D4 is sound and consistent with the existing `security-cases.ts`/`recovery.ts`
conventions — no architectural rework needed, this is additive and subtractive within the established
middleware/serialiser/§18.8 pattern. I am not blocking ratification on BA-1–BA-6; none require reopening
D1–D4's decisions. They are Stage 6/7 design inputs that should be tracked (BA-1, BA-4 as checklist items;
BA-2 as an explicit decision to record, not infer; BA-3 and BA-6 as cross-role flags to `notification-
engineer`/`database-architect` before build starts).

**Conditions added:**
- **BA-1.** The flag-flip migration (D5/CS-4) must specify the concrete post-migration state (cleared
  holder vs. new `assignment: null` state) and the OB-04 event it writes, as a Stage 6 deliverable
  (`backend-architect` + `database-architect`), not left to implementation-time inference.
- **BA-2.** The ADR or its Stage 6 follow-up must state explicitly whether `claim`/`release`/`reassign`
  are deleted outright (acceptable given `EXPO_PUBLIC_FEATURE_SECURITY_OPERATOR="false"`, no real traffic)
  or deprecated with a 410 transition window, so the "remove" language doesn't read as a silent breaking
  change against this project's versioning norm.
- **BA-3.** The failure-mode table's "admins are alerted" / "queue-age alerts" must be backed by one named
  sweeper mechanism (shared with the D3.4 grant-expiry sweeper, not a second parallel one), designed with
  `notification-engineer` before Stage 6, before this is treated as a solved operational dependency.
- **BA-4.** Route-registration order for every new literal-segment path under `/security/cases*` and the
  new admin router must be re-verified against Express's order-dependent matching (same class of issue as
  the existing `/count`-before-`/:caseId` comment) as an explicit Stage 7 checklist item.
- **BA-5.** CS-5(a)'s per-operator-per-case rate limit is a `createRateLimiter` key-function variant (no
  new primitive needed); CS-5(b)'s anomaly/sequencing check is handler-level logic, not a rate limit — note
  this split so `security-engineer`'s CS-5 spec and the handler design agree on where each lives.
- **BA-6.** `database-architect` should confirm a compound index covering the D3.3 per-request grant
  lookup (`caseId`, `partnerOrganizationId`, `expiresAt` at minimum) before the location route is built,
  given D3.3's explicit no-caching requirement makes this read's latency load-bearing for the security
  model itself.

---

## `compliance-specialist` ruling: G-2 / CS-3, OQ-1, OQ-2 (2026-10-29)

**Verdict: CS-3 is LAWFUL and REQUIRED, in its "mark untrusted" form, with conditions CR-1 to CR-9.
OQ-1: do not hold back activation (conditions below). OQ-2: add `case_unassigned`.** This answers the
OQ-1/OQ-2 half of ratification trigger item 2. Regime basis: POPIA (confirmed for SA data subjects).
GDPR is still unconfirmed, so I apply its stricter Art 7(3) bar as the design floor.

I checked code before writing this. `POST /assets/:assetId/location-report` (`assets.ts:106`), the
location-consent routes (`:190`) and `DELETE /assets/:assetId/location` (`:244`) all authenticate with
the ordinary customer session. The phone's location reaches us only through that session. No
location-withdrawal or grant control exists on the web customer surface (`src/`) today.

### 1. The legal question, stated precisely

A correction to G-2's framing first. POPIA s11(2)(b) says the **data subject** may withdraw consent
"at any time". The rule that withdrawal must be "as easy as giving consent" is GDPR Art 7(3), not POPIA
text. I hold us to it anyway, as the design floor.

Both rules belong to the **data subject**. A thief holding the customer's unlocked phone is not the data
subject. A revoke tap from that phone after a theft report is not a withdrawal of consent. It is an
unauthorised person acting on the customer's account. POPIA s19 requires us to take reasonable measures
against unauthorised access to and modification of personal information. Once the customer has told us
the device is stolen, treating that device's session as the customer is a s19 failure. Blocking it does
not breach s11.

So the two duties do not conflict. Easy withdrawal is measured by what the **data subject** can actually
reach, and at that moment the customer by definition does not hold the device. The test is: **can the
customer withdraw promptly, at any time, without disproportionate effort, through a channel they
actually hold?** CS-3 passes if, and only if, CR-3 is in place. Without CR-3 it fails, and I would block.

### 2. Revoke or mark untrusted: ruling

**Mark untrusted. Full revocation is not acceptable as the default.** Today the stolen phone is the only
location source for a phone asset (no GPS vendor, ADR-0009 self-device), and it reports through the
customer session. Revoking that session stops the reporting and defeats the recovery the customer
consented to. That would be a purpose failure, not a privacy win. `authentication-engineer` still owns
the mechanism. This ruling binds the outcome.

### 3. Conditions

- **CR-1 (scope of an untrusted session).** After a theft or loss report names device X, sessions bound
  to device X become a **reporting-only credential**. They may (a) keep calling the location-report
  route under the customer's existing Feature 008 consent, and (b) nothing else. **No reads of customer
  personal information** (profile, policies, other assets, location history, cases, grants, partner
  names, access history). Serving the customer's data to a known-stolen device would itself be a s19
  failure. Requests outside (a) get one fixed response (CR-5).
- **CR-2 (actions blocked from the untrusted session).** These are all data-subject rights or
  safeguards, so all of them are blocked there: grant revoke, grant create or renew, pre-authorisation
  create or withdraw, Feature 008 consent withdrawal (`DELETE /assets/:assetId/location`), asset delete,
  account erasure or s24 request, contact, password, MFA and account-recovery changes, and
  **notification-preference changes** (otherwise a thief can mute the SG-3 notice). A thief also cannot
  *give* consent. A grant from that session would not be the customer's consent under SG-2.
- **CR-3 (easy withdrawal elsewhere: precondition for CS-3 and for the flag).** Before
  `PARTNER_LOCATION_SHARING_ENABLED` can be on, the customer must be able to do each of the following
  without the reported device:
  1. **Web:** sign in on the web customer surface and, in no more than one confirmation after sign-in,
     revoke any grant, withdraw a pre-authorisation and withdraw Feature 008 location consent. **This
     does not exist today. It is new build** (`frontend-engineer`, on the D4 customer routes plus the
     existing withdrawal route).
  2. **Any other trusted mobile session:** the same controls.
  3. **Support:** a customer who has lost their only device can ask support to withdraw. After
     identity verification, support ends the grant or withdraws consent. This is **restriction-direction
     only**, so SG-2's ban on agent-created grants does not apply and it does not wait on OB-02 /
     C-010-4. It is recorded as `revoked_by_customer` / `location_consent_withdrawn`, with `endedBy` =
     the agent's `accountId` and the support reference on the Trail B row. Target: actioned within the
     same working day. Until tooling exists, this is a documented manual runbook (`customer-support-lead`
     + `technical-writer`). A runbook is acceptable for v1. No path at all is not.
- **CR-4 (step-up must not live on the stolen device).** CS-3's "fresh step-up from another device or
  channel" must not be satisfiable by a factor that lives on the reported device. That excludes a
  passkey or authenticator bound to it, SMS to its SIM, and an email magic link opened on it.
  `authentication-engineer` designs this. If the customer has no other factor, the route is CR-3.3
  (support), not a weaker factor.
- **CR-5 (honest response to the untrusted session, never a fake success).** A blocked action gets one
  fixed message: "This device was reported stolen. To change sharing or your account, sign in on another
  device or contact support." **Do not pretend the action worked.** A fake success could deceive the real
  customer if the report was mistaken or the phone is back. The message must not show the partner's name,
  case details or whether a grant exists. Each blocked attempt writes a Trail B row, and the customer is
  told by email (and push to trusted devices only) that an attempt was made from the reported device.
- **CR-6 (getting trust back).** A device is trusted again only when (a) the case reaches `recovered` or
  `closed` through a trusted channel, or (b) the customer re-trusts it from a trusted session or after a
  CR-4-compliant step-up. Signing in again on the device alone is not enough, because saved passwords
  travel with the phone.
- **CR-7 (no collateral lock-out).** CS-3 must never demote the session that filed the report, any web
  session, or any session not positively bound to device X. If the device cannot be reliably bound to a
  session, `authentication-engineer` must say so at Stage 6. A guess is not acceptable, and a wrong guess
  that locks the customer out of their own withdrawal is the failure that would make this unlawful.
- **CR-8 (notification routing: amends how SG-3 is applied).** Customer push about a case, a grant
  activation or an access history **must not be sent to push tokens bound to the reported device**. It
  would tell the thief the partner's name (a safety risk to partner operators) and hand them a revoke
  control. My SG-3 phrase "one-tap revoke" means **one tap after authentication on a trusted channel**.
  It does not mean an unauthenticated revoke link in email. An email link opened on the stolen phone
  would bring G-2 straight back. Email links deep-link to sign-in.
- **CR-9 (notice).** The §4 / PDM-9 copy gains one plain-language line, which I will supply with the
  copy adjustment already owed under Consequences: "If you report this phone stolen, it can't be used
  to change your sharing or account settings. Use another device, the website or support." That line
  turns CR-2 from a surprise into a disclosed term.

### 4. OQ-1: activation when push and email both fail

**Ruling: do not hold back activation.** The s18 notice and the consent were given at pre-authorisation
(SG-3, §4 notice, `noticeVersion` stamped). The activation notice is a specificity and transparency
safeguard (it names the org). It is not the lawful basis, and failing to deliver it does not void the
consent. Holding activation back would defeat the purpose the customer chose Path A for: being
unreachable. Conditions:
- (a) CS-2 (i) to (iii) are adopted as compliance conditions, not just security ones.
- (b) Delivery failure never extends anything. The 24-hour SG-4 default and no-auto-renew stand.
- (c) Email retries continue for the grant's lifetime. "Push failed" includes the case where the only
  token is on the reported device and was correctly suppressed under CR-8. That counts as "no push channel
  available", not as a breach of SG-3.
- (d) The active grant, partner name and revoke control show first on every trusted customer surface
  (web and mobile) at next sign-in, before any other content.
- (e) The pre-authorisation's `noticeVersion` is copied onto the activated grant, so SG-9 holds for the
  grant record itself.

### 5. OQ-2: `endReason` for a hand-back to the queue

**Ruling: add `case_unassigned`. `case_reassigned` does not cover it.** The SG-8 access history and the
s23 answer must be accurate (s16). "Reassigned" tells the customer someone else now holds their case,
which is false when nobody does. Use:
- `case_reassigned`: the case moves to a different org (admin re-dispatch to another org).
- `case_unassigned`: the case returns to the queue with no new holder. That covers a partner hand-back,
  an admin recall and a CS-4/BA-1 migration return. `endedBy` tells them apart.

**This amends SG-1's vocabulary** (`compliance-review-ob-03-partner-location-sharing.md` §3). The D3.4
table row "Hand-back, or admin re-dispatch to a different org" should be split to match when
`solution-architect` next revises D3.4. BA-1's migration event uses `case_unassigned`. Customer-facing
wording: "Sharing ended: [Partner] handed your case back. You'll be asked again before anyone new sees
your location."

### 6. D3 against SG-1 to SG-14 (rest of ratification trigger item 2)

D3 satisfies SG-1 to SG-14 **as designed**, subject to §3 to §5 above. SG-12 (P-4) and SG-13 (P-6,
counsel on s57) are still open. They are correctly gated before the flag, not before ratification.
Owed by me before the location build's Stage 8, but not blocking ratification: the adjusted §4 / PDM-9
copy (including CR-9) and the append-only L-6 correction to the OB-03 spec.

**Ratification trigger item 2: SATISFIED** for ADR ratification. **CR-3 is a hard precondition for
`PARTNER_LOCATION_SHARING_ENABLED`.** I will block the location build's Stage 8 if a non-device
withdrawal channel (web, plus the support runbook) is not live.

- [x] Regime confirmed: POPIA s11(2)(b), s16, s18, s19, s23. GDPR Art 7(3) applied as floor, not confirmed.
- [x] Lawful basis: unchanged (consent at pre-authorisation or grant). CS-3 does not touch it.
- [x] Classification: highest class for location. CR-1 also covers the account PII left on a stolen device.
- [x] Audit: blocked attempts and support-actioned withdrawals write Trail B rows (CR-3.3, CR-5).
- [n/a] PCI-DSS: no payment data.
- [ ] Third-party: SG-12 / P-4 still open (gated).
- [ ] Breach procedure: a theft report alone is not a s22 notification event. If data is served to a
  device after it was reported stolen, that is a s19 incident for the INC runbook. Counsel may
  sharpen this at P-6.
- [ ] Consent copy: CR-9 line still owed.

---

## `cto` ratification (2026-10-29)

**Decision: RATIFIED. Status moves from Proposed to Accepted, with conditions R-1 to R-6 below.** This is
trigger item 4. I checked the other three items against the record, not against the summaries:

| Trigger item | Evidence | Met? |
|---|---|---|
| 1. `cybersecurity-architect` signs off D1 to D4 and records D2 in the manifest | Sign-off section above (CS-1 to CS-9). `docs/organization/gates/stage8-manifest.json` line 228 now reads `S3 (CLOSED ...`, with the old `S3 (BLOCKING ...` text kept inline as void. I grepped for both | Yes |
| 2. `compliance-specialist` confirms SG-1 to SG-14 and answers OQ-1 and OQ-2 | Ruling section above: §6 "Ratification trigger item 2: SATISFIED". OQ-1 = do not hold back activation. OQ-2 = add `case_unassigned` | Yes |
| 3. `backend-architect` and `database-architect` review D3.5 and D4 | Both sections above. Both approve with conditions (BA-1 to BA-6, DB-1 to DB-6). Neither blocks | Yes |

I found nothing that should block ratification. No reviewer asked for any of D1 to D4 to be reopened. Every
open item is either a Stage 6/7 input or a gate on a flag. ADR ratification is the wrong place to gate
those, and the ADR does not try to.

### 1. What ratification authorises

- Stage 6 (design) and Stage 7 (build) for D1 to D4, **behind both D5 flags, OFF by default** and failing
  closed per CS-7.
- The conditions in this file become binding design inputs: CS-1 to CS-9, DB-1 to DB-6, BA-1 to BA-6 and
  CR-1 to CR-9. They are not optional.
- Compliance's amendments to this ADR's text take effect now. I am not waiting for an editorial revision:
  - **OQ-2:** `case_unassigned` is added to the `endReason` vocabulary. The D3.4 row "Hand-back, or admin
    re-dispatch to a different org → `case_reassigned`" is **superseded** by the compliance §5 split.
    `solution-architect` should append the corrected table. Until then, the compliance section governs.
  - **OQ-1:** activation is not held back, under conditions (a) to (e) in compliance §4.
  - **CR-8** changes how SG-3 is applied (no push to tokens on the reported device, and "one-tap revoke"
    means one tap after authentication on a trusted channel).
- D2 / SR-INC002B-S3 closure is already in effect (D2(c)) and does not depend on this ratification.

### 2. What ratification does NOT authorise

- **Turning on `PARTNER_LOCATION_SHARING_ENABLED` in any environment.** It stays OFF until:
  - **CR-3 is built and live.** CR-3 requires three ways to withdraw that do not need the stolen device:
    (1) web customer controls to revoke a grant, withdraw a pre-authorisation and withdraw Feature 008
    consent, (2) the same controls on any other trusted mobile session, and (3) a support withdrawal
    runbook. **None of these exist today.** I checked: there are no grant, pre-authorisation or
    location-consent controls anywhere in `src/`. The grant routes they would call (D4 customer routes)
    are not built, so the mobile controls have nothing to call either. No CR-3.3 runbook exists under
    `docs/organization/runbooks/`. Compliance has said it will block the location build's Stage 8
    without these.
  - CS-3 / CR-1 to CR-7 (marking stolen-device sessions untrusted) are designed by
    `authentication-engineer` and built. CR-7 (no collateral lock-out) is the condition most likely to
    fail if device-to-session binding turns out to be unreliable.
  - Every OB-spec §6 precondition P-1 to P-7 is met. That includes SG-12 / P-4 and SG-13 / P-6 (counsel
    on s57), which are still open.
  - Location ingestion is back on (INC-001 `LOCATION_INGESTION_ENABLED`). Without it, the route serves
    nothing.
  - The build has its own Stage 8 (including the threat-model workshop CS-9 requires) and its own
    Stage 10.
- **Turning on `DIRECTED_DISPATCH_ENABLED` in production.** That needs its own Stage 8 and Stage 10 (D5),
  the PDM-6 registry or its documented single-org equivalent, the DB-1 / CS-4 / BA-1 migration script, and
  the Client's answer on OQ-3 (below).
- **Any real partner data flow.** SR-INC002B-S1 and S2 stay BLOCKING. `EXPO_PUBLIC_FEATURE_SECURITY_OPERATOR`
  stays `"false"`. R-INC002B-1 stands. This ratification changes none of them.
- **A GPS vendor decision.** None is made or implied. The location route serves whatever Feature 008
  self-device data exists (D3.3 last sentence).

### 3. OQ-3 is open and is not mine to rule on

The dispatch model is a **Client instruction** under G-7 (doc 11, including the §11 extension). I am
ratifying directed dispatch as the architecture we **recommend** and will build behind a flag. I am not
ruling on what the Client wants. `product-manager` (the named sponsor) must get the Client's own answer
on both G-7 questions: (a) pool or directed dispatch, and (b) whether *any* partner location disclosure is
allowed. Neither flag turns on in production until that answer is recorded in
`11-documented-client-instructions.md`. If the Client chooses the pool, or forbids location disclosure,
the revisit trigger applies and this ADR is reopened. It is not adapted quietly. Build effort spent before
the answer is at risk, and I accept that. Most of D1 (admin dispatch, the eligibility check, removing
partner-to-partner `reassign`) is worth building under either answer, because it closes C-4.
`product-manager` should still put OQ-3 to the Client **before** Stage 7 starts on D3 (the grant and
location work). D3 is the part that becomes wasted effort if the answer is "no location".

### 4. Conditions of ratification

- **R-1 (BA-2 decided).** `claim`, `release`-to-pool and `reassign` are **removed in lockstep**
  (backend-architect's option (a)). There is no real partner traffic (`EXPO_PUBLIC_FEATURE_SECURITY_OPERATOR="false"`),
  so a 410 deprecation window would protect nobody. The condition is that the operator app and web
  security dashboard builds are gated on the same flag and released alongside the backend change.
  `backend-architect` confirms this in the Stage 6 contract. If real partner traffic exists before this
  ships, the decision flips to option (b).
- **R-2 (domain reviews not yet done).** The header lists `frontend-architect` and `mobile-architect` as
  reviewers before ratification. Trigger item 3 does not require them, and nothing they own changes D1
  to D4. I am therefore not blocking on them. Their reviews become a **Stage 6 entry condition** for
  their surfaces: the CR-3.1 web controls, CR-3.2 / CR-5 / CR-8 mobile behaviour, and accept/decline in
  the operator app.
- **R-3 (one sweeper).** BA-3 is adopted. One shared sweeper handles grant expiry recording, queue age
  and acceptance-window lapse. `backend-architect` owns it, and `notification-engineer` designs the admin
  alert transport before Stage 6.
- **R-4 (direct database access).** `cybersecurity-architect` / `security-engineer` answer the question
  database-architect deferred in §3: which roles and service accounts can read
  `partner_location_share_grants` directly, outside the D3.3 check. This must be answered before the
  location route's Stage 8.
- **R-5 (capacity).** `cloud-infrastructure-architect` gives the short Atlas capacity confirmation
  database-architect asked for before Stage 6. This is not expected to be a concern.
- **R-6 (owed documents).** Before the location build's Stage 8:
  - `compliance-specialist`: the §4 / PDM-9 copy including CR-9, and the L-6 correction.
  - `customer-support-lead` + `technical-writer`: the CR-3.3 runbook.
  - `cybersecurity-architect` / `technical-writer`: the roadmap §E refresh from D2(b), if not already done.

### 5. What still blocks building and shipping

1. **The Client's G-7 / OQ-3 answer.** This blocks any flag going on in production, and should come
   before D3 build starts.
2. **CR-3.** None of the three withdrawal channels that avoid the stolen device exist. This blocks
   `PARTNER_LOCATION_SHARING_ENABLED`.
3. **CS-3 / CR-1 to CR-7** (untrusted stolen-device sessions). Not designed yet. This blocks
   `PARTNER_LOCATION_SHARING_ENABLED`.
4. **OB-spec P-1 to P-7**, including SG-12 / P-4 and SG-13 / P-6 (counsel). This blocks
   `PARTNER_LOCATION_SHARING_ENABLED`.
5. **The PDM-6 registry** or its documented single-org equivalent, plus **SR-INC002B-S2** (an executed
   partner agreement). These block `DIRECTED_DISPATCH_ENABLED` and any real partner data.
6. **INC-001 location ingestion kill switch.** While it is on, the location route has nothing to serve.
7. **Separate Stage 8 and Stage 10 for each flag.** These are hard gates and are not skipped.

Revisit triggers are unchanged. The OQ-3 answer is now the trigger most likely to fire first.

---

## `cloud-infrastructure-architect` capacity confirmation (2026-10-29) — R-5

**Scope: this is the short sanity check R-5 asked for, not a capacity-planning exercise.** It covers
only `partner_location_share_grants` and `partner_location_preauthorizations` as specified in
`database-architect`'s review above.

**What I checked.** I looked for a documented Atlas cluster tier before writing anything else, rather
than assuming one. ADR-0002 (identity/domain split) does not state a tier. ADR-0008 says explicitly, in
its "What is not ratified here" section: *"Not an Atlas tier, cost, or access-control ruling."* I found
no other document in `docs/organization/` or `docs/features/` that records the live Atlas tier/cluster
size. **That is a documentation gap, not a capacity problem** — flagging it so it isn't silently assumed
settled, but it does not block this confirmation, for the reason below.

**Assessment.** The cluster already runs seven collection-spec modules today (`feature004-collections.ts`,
`recovery-collections.ts`, `notification-collections.ts`, `customer-profile-collections.ts`,
`tracking-device-collections.ts`, `location-events-collections.ts`, `alerts-collections.ts`, per
ADR-0008's condition 3), including `recovery_cases` itself, which the two new collections attach to and
are of the same general size class as (one document per case/action, not per GPS ping). `database-architect`'s
review is explicit that volume here is per-case: zero-or-few grants and at most one live pre-authorisation
per case, not a per-ping or per-poll write pattern — their own §2 explicitly rejects a TTL-sweep model in
part because volume doesn't warrant it. The ADR's own framing ("individual security-company recovery
cases, not high-frequency data") matches what's already running on this cluster at comparable or greater
scale (`recovery_cases`, `location_events` for Feature 008 self-device pings, which is the actual
high-frequency collection on this cluster today and already coexists without reported strain).

Two new collections holding low-thousands of modestly-sized documents (a handful of fields each, no
embedded arrays — database-architect's design is explicitly flat, append-only, no location payload stored)
plus the three compound partial indexes specified (`{caseId, partnerOrganizationId, endedAt, expiresAt}`,
`{accountId, activatedAt}`, `{caseId, consumedAt, withdrawnAt}`) add negligible storage and working-set
footprint next to what the cluster already carries for `recovery_cases` and `location_events`. Partial
indexes (scoped to the "still live" predicate) keep index size bounded as the collections age, which is
the right call already made by `database-architect` and reduces rather than adds to this concern.

**Conclusion: no capacity concern.** Whatever tier is currently provisioned for this workload (confirmed
to already run higher-volume collections without issue) comfortably accommodates these two additions
under the stated expected volume. This is not expected to require a tier change, and I am not
recommending one.

**One follow-up, not a blocker:** the live Atlas tier/cluster size should be recorded somewhere
documented (an infra note or an addendum to ADR-0002/ADR-0008) so future capacity sanity checks like this
one don't have to re-derive it from "which collections already coexist." I'll pick that up as routine
documentation hygiene; it does not hold up Stage 6 on this ADR.

R-5 is satisfied.

---

## `cybersecurity-architect` answer to R-4: direct database access to the grant collections (2026-10-29)

**Scope.** This answers the question `database-architect` deferred in their §3 and `cto` bound as R-4:
which database principals may read (and write) `partner_location_share_grants` and
`partner_location_preauthorizations` directly, outside the D3.3 route check. Neither collection exists
yet. This section sets the access model they must be built against. It is not an audit of existing
code. `security-engineer` verifies the result. `database-architect` and
`cloud-infrastructure-architect` provision it, as with FU-A6.

### 1. What exists today (checked in code, not assumed)

- **The platform has one MongoDB principal.** `backend/src/config/env.ts:320` reads one `MONGODB_URI`.
  `render.yaml:21` injects that one value. `backend/src/db/mongo-connection.ts` opens one client. No
  second Mongo credential is configured anywhere in `backend/`. I searched for `MONGODB_*URI`, `PURGE`,
  and purge-credential strings.
- **That one principal does everything:** request-path reads and writes, the startup bootstrap
  (`createCollection`/`createIndex`, ADR-0008), the catalog verify, and every operator script under
  `backend/scripts/`. Several of those scripts tell the operator to put `MONGODB_URI` in the repo-root
  `.env`/`.env.local` (`bootstrap-mongo-collections.ts`, `verify-mongo-catalog.ts`,
  `inc-001-location-inventory.ts`, `police-report-retention-purge.ts`). In practice, then, the
  runtime credential also lives on operator workstations.

---

## `frontend-architect` Stage 6 integration note — R-2, Track A (web operator UI) (2026-11-03)

**Scope.** This answers `cto`'s five required questions from the disposition on
`qa-report-ob03-dispatch-tier-a.md` Finding 1, for the web Security Company Dashboard only
(`src/security/pages/SecurityCasePages.tsx`, `src/security/api/cases.ts`). Mobile
(`mobile/src/screens/security/SecurityCaseDetailScreen.tsx`) needs the equivalent note from
`mobile-architect` — not written here. This is Stage 6 integration review against the code as it
exists today (claim-only), not a new design: D1's `dispatchStatus: 'pending' | 'accepted' | null`
field (absent/`null` = pool mode, per `database-architect`'s review above) is the only new signal
the client needs; everything below is a change to `CaseDetailPage`/`cases.ts`, not a new screen.

**(i) Which actions render for each `dispatchStatus` value, and what renders when absent.**

- `dispatchStatus` **absent/`null`** (pool mode, `partnerOrganizationId: null`): unchanged from
  today — render `Claim case` when `status === 'open' && !partnerOrganizationId`. No accept/decline
  verbs are reachable in pool mode; D1 never offers them for an unassigned case.
- `dispatchStatus: 'pending'` (dispatched to this org, not yet accepted): render exactly two new
  actions, `Accept case` and `Decline case`. Suppress every `STATUS_ACTIONS` button (investigating/
  tracking/recovered/closed) and suppress `Contact customer` — see (v). This is the only state where
  `Claim case` must definitively *not* render even though legacy pool-mode code (`status === 'open'
  && !partnerOrganizationId`) would never match it anyway (a dispatched case has a
  `partnerOrganizationId`), so no extra guard is needed there, but the existing `STATUS_ACTIONS`
  `.filter((a) => a.status !== recoveryCase.status)` and `Contact customer` conditions (lines
  309–339) must each gain an explicit `recoveryCase.dispatchStatus !== 'pending'` guard — today they
  key only off `status`/`partnerOrganizationId`, which a `pending` case can already satisfy (e.g. a
  previously-accepted-then-re-dispatched case can sit at `status: 'investigating'` with a new
  `dispatchStatus: 'pending'`), so without the guard a stale status action would render during the
  pending window.
- `dispatchStatus: 'accepted'` (this org currently holds the case): render exactly what
  claimed-pool-mode renders today — `STATUS_ACTIONS` minus current status, `Release case` (rename
  label unchanged; semantics shift from "hand back to pool" to "hand back for re-dispatch", per (ii)),
  and `Contact customer`. This is the `recoveryCase.partnerOrganizationId &&
  account?.partnerOrganizationId === recoveryCase.partnerOrganizationId` branch already in the code;
  it only needs `dispatchStatus === 'accepted'` added as an extra condition so it doesn't also fire
  during `'pending'`.

**(ii) Navigation/cache invalidation after decline/release.**

Both decline and release end this org's relationship to the case. On success, drop all
claimed-tier client state the same way `releaseCase()` already updates local state today, then
navigate back to the list rather than re-rendering the detail page in a state that no longer has
actions for this operator: call `navigate('/security/cases', { replace: true })` (React Router,
already imported via `react-router-dom`) immediately after `setRecoveryCase(updated)` succeeds, and
do **not** attempt to keep the detail page showing the now-foreign case. There is no query-cache
layer in this codebase to invalidate (no React Query/SWR — `cases.ts` is a plain `apiFetch` wrapper
over `fetch`), so "cache invalidation" here means: the `CasesListPage`'s `rows` state is not shared
with `CaseDetailPage`, so returning to the list must re-trigger `listSecurityCases()` on mount
(already happens — it's a fresh `useEffect` on route re-entry) rather than relying on stale `rows`
from before the decline/release. No additional invalidation plumbing is needed; the existing
list-page `useEffect` already re-fetches every time the route is entered.

**(iii) Retry/idempotency for accept, adapting the claim 404-refetch idiom at
`SecurityCasePages.tsx:224`.**

Add `acceptSecurityCase(caseId)` → `POST /security/cases/:caseId/accept` to `cases.ts`, and an
`acceptCase()` handler mirroring `claimCase()`'s structure exactly, with one change to the 404
branch's refetch test. Today's claim retry logic treats "refetched case is no longer `open`" as
proof the original attempt landed. Accept needs the equivalent precondition restated in
`dispatchStatus` terms: on a 404 (the accept route's `expectedStatus`-style compare-and-set, per
`database-architect`'s review, only matches a case currently `dispatchStatus: 'pending'` for this
org), refetch and treat **`refreshed.dispatchStatus === 'accepted' &&
refreshed.partnerOrganizationId === account?.partnerOrganizationId`** as proof the original attempt
already succeeded (show the refreshed case, no error); any other refetched state (e.g. the pending
offer lapsed, or a different org now holds it) falls through to the existing generic error message.
This is the same idiom, just checked against `dispatchStatus` instead of `status !== 'open'`, because
pool-mode "claimed" and dispatch-mode "accepted" are different fields now per D1.

**(iv) Decline/release reason pickers, fixed enums only (CS-6), reusing the existing terminal-status
`closeReason` pattern.**

Reuse the `pendingTerminalStatus`/`closeReason` radio-picker UI pattern (lines 341–374) verbatim in
shape — a confirm-before-send panel with a fixed radio list and a disabled-until-selected Confirm
button — but as two new, separate enums, not `SecurityCaseCloseReason` reused: `SecurityCaseCloseReason`
is specifically the terminal-status (`recovered`/`closed`) vocabulary and conflates meanings that
don't apply to a mid-dispatch decline or release (e.g. `recovered-intact` makes no sense as a reason
for declining an offer). Introduce `SecurityCaseDeclineReason` and `SecurityCaseReleaseReason` as
new fixed string-literal unions in `cases.ts`, mirrored from whatever backend enum
`security-cases.ts`'s accept/decline/release routes validate against (CS-6 requires fixed enums, no
free text — the picker must offer exactly that enum's values, nothing else, same as
`CLOSE_REASON_OPTIONS` today). Wire them through the same `pendingTerminalStatus`-style local
confirm-state (e.g. `pendingDeclineConfirm: boolean`, `declineReason: SecurityCaseDeclineReason |
null`), not through the existing `pendingTerminalStatus`/`closeReason` state itself, to avoid
conflating decline/release confirmation with the unrelated terminal-status confirmation that can
still apply once a case is accepted.

**(v) Hiding status/message actions while pending.**

Covered concretely in (i): while `dispatchStatus === 'pending'`, `STATUS_ACTIONS` and
`Contact customer` must not render at all (not merely disabled) — an operator who has not yet
accepted a case has no basis to message the customer or move its status, and CO-OB03-6-style
customer-facing accuracy depends on the case not quietly transitioning statuses from an org that
hasn't confirmed it will work it. Implementation is an added `dispatchStatus === 'accepted'` (or, for
pool mode, `!dispatchStatus`) condition on the existing render guards at lines 309 and 327 — no new
component, just tightening the existing conditionals to key off the new field in addition to
`status`/`partnerOrganizationId`.

---

## `frontend-architect` Stage 6 integration note — B1 (admin dispatch-queue UI, Track B, new surface)
(2026-11-03)

**Scope.** Short structural note for the new admin dispatch-queue pages under `src/admin/`, which do
not exist yet (new surface, not a modification of existing admin pages). Pattern source: the admin
step-up flow already used for financially/access-sensitive admin mutations —
`AdminClaimsPages.tsx`'s `useStepUpRetry(patchAdminClaim)` → `{ stepUpOpen, run: runStepUp,
onStepUpVerified, onStepUpCancel }` (claim adjudication, ADR-0012 SU-FU-1) — and the Tier-A step-up
gating convention documented in `PartnerOrganizationPages.tsx`'s header comment ("orgs is Tier-A
step-up gated (`admin-partner-organizations.ts`)"). This is a code pattern, not a new design;
`admin-case-dispatch.ts` is the backend route this surface calls.

**Pages needed (new, under `src/admin/pages/`, e.g. `AdminCaseDispatchPages.tsx`):**

1. **Queue list** — paginated list of undispatched/dispatchable cases, same `DataTable` +
   `listSecurityCases`-style cursor-pagination shape already used by `CasesListPage`. No step-up
   required for a read-only list (same posture as `PartnerOrganizationPages.tsx`'s read-only
   aggregation view, line 123 comment).
2. **Detail with location** — case detail plus whatever location field `admin-case-dispatch.ts`'s
   list/detail routes expose (per A8/Finding-table above, the list route minimises `lastLocation`;
   the detail route may expose more — confirm the exact field against the route's response schema
   before building, do not assume parity with the list projection).
3. **Dispatch action** — `POST` to the dispatch endpoint. Per `admin-case-dispatch.ts:338`, a
   same-org/first-dispatch call can return `201`/`200` directly; a **cross-org re-dispatch while a
   prior dispatch exists returns `202 { data: { pendingApprovalId } }`** (lines 307–338, 499–533) —
   this is the two-admin gate (A4), not an error. The UI must treat `202` as a distinct success-shaped
   response, not retry or show a failure state: render "Dispatch requested — awaiting a second
   admin's approval" and surface the returned `pendingApprovalId` for the approval step.
4. **Re-dispatch** — same action, same `202`-pending-approval branch; UI need not distinguish
   dispatch vs. re-dispatch beyond the button label, since the backend's branching (null-target vs.
   cross-org) determines whether `202` or an immediate result comes back.
5. **Two-admin approve** — a confirmation view that **must show the target org's name and the
   dispatch reason before approval is submitted**, per the task brief and consistent with
   `admin-case-dispatch.ts`'s `requestedTargetOrgId`/reason fields recorded on the `pendingApproval`
   record (lines 97–100, 320). Resolve `requestedTargetOrgId` to a display name via the existing
   partner-organization lookup used elsewhere in `src/admin/` (`PartnerOrganizationPages.tsx`'s data
   source) rather than showing a bare ID — approving "dispatch to `org_8f2a...`" without a resolved
   name defeats the purpose of a second-admin check. The approve submission itself is the
   step-up-gated mutation: wrap it in `useStepUpRetry(approveCaseDispatch)` exactly as
   `AdminClaimsPages.tsx` does for `patchAdminClaim`, rendering the same `stepUpOpen` modal pattern
   (line 558) on demand, since this is a second-admin authorization of a live case assignment —
   the same sensitivity class as claim adjudication, not a routine read.
6. **409 snapshot-mismatch handling** — `admin-case-dispatch.ts:586-593` rejects an approval whose
   `pendingApproval.snapshot` (captured at request time: `partnerOrganizationId`, `dispatchStatus`,
   `status`) no longer matches the case's current state (TOCTOU guard). On a `409` from the approve
   call, do **not** silently retry or resubmit the stale `pendingApprovalId` — show an explicit
   "This case changed since the dispatch was requested — refresh and start the dispatch again"
   message and drop the pending-approval view back to the case detail, re-fetching it fresh. This
   mirrors the decline/release "state changed under you" handling in the Track A note above, not the
   claim-retry idempotency idiom (a `409` here is a real conflict, not a possibly-already-succeeded
   write — the two-admin gate's whole point is that the snapshot must still hold).

No code was written for this surface — it does not exist yet. This note is the structural contract
`frontend-engineer` builds against; it is not a replacement for that implementation's own Stage 6
review once the actual route response shapes are confirmed against `admin-case-dispatch.ts`'s
Zod schemas at build time.
- **The only Mongo least-privilege design on the platform is ADR-0006 AUD-11** (app user `find`+`insert`
  on `admin_access_log`, a separate purge user with `remove`). It has **never been provisioned**
  (FU-A6 open; `database-addendum-001.md` §1.4 says "checked, not enforced"). The comments in
  `demo-security-dashboard-seed.ts` describe that split as if it were live. That is a design statement,
  not a grant anyone has verified. ADR-0008's ratification explicitly excludes access control.
  ADR-0006 C-16(c) (no standing human access to production stores) is still an open `cto` obligation.
- ADR-0015 covers Postgres only (`td_migration_runner` / `td_backend_app`). Its principle carries over
  directly: the runtime credential never holds schema-altering privilege, and a privileged credential
  is never held by an agent. It creates no Mongo roles.

So today the honest answer to "who can read the grant collection outside D3.3" would be "whoever
holds `MONGODB_URI`, which includes every operator machine that has run a script". On top of that,
anyone with an Atlas project role that includes data access could read it through Data Explorer.

### 2. The threat is integrity first, confidentiality second

`database-architect` framed this as a read question. For these two collections the bigger risk is
**write**. D3.3 lets a partner read live location if an active grant document exists. So **anyone who
can `insert` into `partner_location_share_grants` can give a partner live location access**, with no
customer consent, no admin action, and no `recovery_case_events` row. The same is true of anyone who can
`update` an existing grant's `endedAt` back to `null` or push its `expiresAt` later. A direct read of
the grants reveals the consent and theft pattern `database-architect` described (PII, but not
coordinates). A forged grant leads straight to the harm in this platform's top attack tree ("attacker
locates a customer's asset in real time").

A second point: **the grant check only protects location if location cannot be read some other way.**
Any principal that can `find` the Feature 008 location store (`location_events`) gets around grants
entirely. So R-4 cannot be answered for the grant collections alone. The rule below covers both.

### 3. Ruling

**(a) Should the grant collections get a scoped read role separate from the general application user?
No. Not a separate read role inside the API process. Yes to separating the API process from everything
else.** The API process has to read *and* write grants (activate, revoke, end-record). Splitting that
into a read credential and a write credential held by the same Render service buys nothing, because
anyone who compromises the process gets both. The separation that matters is between the **request-path
API identity** and **every other principal** (bootstrap, scripts, purge, investigation, humans,
analytics). The API identity's privilege on these collections must also be narrowed.

**(b) Should access be limited to specific backend service identities? Yes.** The permitted principals
are listed below. Anything not listed gets **no** privilege on `partner_location_share_grants`,
`partner_location_preauthorizations`, or `location_events`. Every role is a MongoDB/Atlas custom role
with collection-level `privileges` (resource `{ db, collection }`). None uses a built-in database role
such as `readWrite`/`readWriteAnyDatabase`, which would grant every collection.

| Principal | Who holds it | Grants on the two grant collections | On `location_events` | Notes |
|---|---|---|---|---|
| **P1 `api-runtime`** | The Render web service only (`render.yaml` env). Never on a workstation, never in CI, never with an agent | `find`, `insert`, `update`, `createIndex`, `createCollection`, `listIndexes`, `listCollections`. **No `remove`, `dropCollection`, `dropIndex`, `collMod`** | `find`, `insert` as Feature 008 needs. No `remove` | `createIndex`/`createCollection` are kept so ADR-0008's startup ensure-path still works without a second runtime credential. `collMod` is withheld because it can loosen a validator (ADR-0008 Decision item 4 already forbids startup tightening, and loosening is worse) |
| **P2 `grant-sweeper`** | Only if R-3's sweeper ships as a separate deployable (Render cron/worker). If it runs inside the API process it uses P1, and no new credential is created | `find`, `update` only. No `insert` | none | Its job is recording expiry and end fields. It must not be able to create a grant |
| **P3 `retention-purge`** | The SG-11 case-retention job, invoked as a job. Not a standing service credential | `find`, `remove` only | `find`, `remove` (Feature 008 retention) | Same shape as AUD-11's purge user (FU-A6). Grants are deleted only alongside their case (DB-4 / SG-11), never on expiry |
| **P4 `investigative-read`** | Extends FU-A11. Issued per investigation as an Atlas **temporary database user** (expiry set at creation), approved by the owner, never held by an agent | `find` only on the two grant collections and `recovery_case_events` | **none** by default. Location reads by an investigator are a separate, case-referenced request (AUD-9 / C-16(b)) | Each issuance is recorded with its case reference. It is not a standing credential |
| **P5 `provisioner`** (optional) | The ADR-0008 CLI path (`bootstrap-mongo-collections.ts`), and `catalog-verify` if run outside the API | `createCollection`, `createIndex`, `collMod` (needed for validator migrations under ADR-0008 condition 2), `listIndexes`, `listCollections`. **No `find`/`insert`/`update`/`remove`** | same, no document actions | Lets an operator provision without holding a credential that can read or forge grants |

**Explicitly excluded, with no privilege at all on these three collections:** operator and ops scripts
in `backend/scripts/` that do not need them (seed, demo, FT-016, INC-001 inventory), which must get
their own scoped users and stop using the runtime `MONGODB_URI`. Also excluded: any reporting,
analytics, or BI connector; the support portal; CI (it has no live DB today, ADR-0015 §Context, and must
stay that way for Mongo); agents; and any future partner-facing integration. Partners get data **only**
through the D3.3 route, never through a database principal.

**Humans and the Atlas UI.** Atlas project roles that include data access (Project Owner, Project Data
Access Admin / Read-Write / Read-Only) can read every collection through Data Explorer. That bypasses
every custom role above. Standing human access to production must be no higher than a role without data
access, apart from the owner's break-glass account. This is the Mongo-side delivery of ADR-0006 C-16(c)
for these collections. It does not replace that `cto` obligation.

### 4. Compensating controls for what Mongo roles cannot express

- **Mongo privileges are per-action, not per-field.** P1's `update` cannot be limited to "set `endedAt`
  only when it is null." Write-once is therefore enforced by DB-2 (no generic update method in the
  repository), and **detected** by the next item.
- **Grant/event reconciliation (detective control).** Every grant document must have exactly one
  matching `recovery_case_events` activation row by `grantId` (DB-6). The R-3 sweeper checks this on
  every run and raises an admin security alert on any grant with no activation event, and on any grant
  whose `endedAt` has gone from set back to null. This catches forged or tampered grants written by any
  principal, P1 included. It does **not** add a fifth D3.3 condition on the hot path, because the hot
  path stays as ratified.
- **Network.** The Atlas IP access list must allow production only from Render's egress for P1/P2, and
  from no general `0.0.0.0/0` entry. I have not verified the current access list. `cloud-infrastructure-architect`
  confirms it.
- **Database auditing.** Atlas database auditing (logging `authCheck` and access by any principal other
  than P1) depends on the cluster tier. The R-5 section above records that the tier is undocumented. If
  auditing is unavailable on the current tier, the lack of DB-level access logging on these collections
  is a **residual risk that `cto` must explicitly accept at the location route's Stage 8**. It is not
  accepted silently here.

### 5. Conditions (binding on the location route's Stage 8; they do not gate `DIRECTED_DISPATCH_ENABLED`)

- **CSA-R4-1.** P1, plus P3 and P5 as needed, are provisioned as collection-scoped Atlas custom roles
  before the location route enters Stage 8. The location route may not pass Stage 8 while
  production runs on a single all-purpose `MONGODB_URI` principal that can read `location_events` and
  insert grants from an operator workstation. FU-A6 (the `admin_access_log` split) should be provisioned
  in the same change, because it uses the same mechanism. Owners: `database-architect` (role
  definitions), `cloud-infrastructure-architect` (Atlas), `devops-engineer` (Render env).
- **CSA-R4-2.** Operator scripts stop using the production runtime credential. Each script that needs
  production access gets its own scoped principal per §3. The runtime credential is rotated once the
  split lands, because it has been on workstations.
- **CSA-R4-3.** An automated, FU-A10-style deploy-time assertion (`connectionStatus` with
  `showPrivileges`) confirms P1 holds **no** `remove`/`dropCollection`/`collMod` on the two grant
  collections or on `location_events`. Until this exists the control is "checked", never "enforced"
  (ADR-0006 §16.5 condition 3 standard). Owner: `security-engineer` + `devops-engineer`.
- **CSA-R4-4.** The §4 reconciliation check ships with the R-3 sweeper and is covered by a negative test
  (a seeded grant with no activation event must raise the alert). `qa-architect` adds it to the Stage 10
  plan.
- **CSA-R4-5.** Human Atlas data-access roles are recorded and reduced per §3, and the Atlas tier and
  audit capability are documented (this merges with the R-5 follow-up). If DB auditing is unavailable,
  §4's residual risk goes to `cto` for written acceptance at Stage 8.

**R-4 status: answered.** The access model is defined. **None of it is provisioned.** The checks that
show the model is actually in force are CSA-R4-1 to CSA-R4-5 at the location route's Stage 8.

**Signed:** `cybersecurity-architect`, 2026-10-29. `security-engineer` concurrence is still required, and
is not given here.

---

## `product-manager` note — OQ-3 answered (2026-10-30)

Append-only; the sections above are unchanged. The Client has answered **OQ-3** (§"Open questions"):
*"I want the sharing to be allowed when the customer or the Admin has reported it missing."* Full
record, verbatim instruction and analysis: `11-documented-client-instructions.md` §13.

**Effect on this ADR, in brief (see doc 11 §13 for the reasoning):**
- **Part (a) of OQ-3 (any partner location disclosure at all) is resolved: yes, conditionally** —
  the condition being the existing case-creation gate this ADR already has (D3.1, D4): a recovery
  case must exist, and a case only exists from a customer report (`recovery.ts`) or, once built, an
  admin/agent on-behalf report (OB-02, G-18, currently NO-GO/not built). No new requirement is
  created; the Client's condition matches the architecture already specified in D1-D4.
- **Part (b) of OQ-3 (pool vs. directed dispatch) is not addressed by the Client's answer** — it is
  silent on dispatch routing, which is a different question from *when* sharing is allowed. **The
  revisit trigger is not hit** (the Client did not choose the pool and did not forbid disclosure),
  so **D1 (directed dispatch, ratified 2026-10-29) stands, unchanged.**
- **One item flagged for `solution-architect`/`compliance-specialist`, not a design change:**
  D3.4's end-condition table does not name "report withdrawn by customer / found to be a false
  alarm" as its own trigger, distinct from `case_terminal` or `revoked_by_customer`. This is very
  likely already covered through those two paths in practice, but is not stated explicitly. Confirm
  explicitly, or add a named trigger, before Stage 8 of the location build.
- **Ratification trigger item 4's condition on OQ-3 is satisfied.** This does not by itself turn on
  `PARTNER_LOCATION_SHARING_ENABLED` — the OB-spec §6 preconditions (P-1 to P-7), the location
  route's own Stage 8/Stage 10, and CS-1 to CS-9 remain the applicable gates.

Filed by `product-manager`.

## `solution-architect` note: D3.4 and a false-alarm or withdrawn report (2026-10-30)

Append-only; nothing above is changed. This answers the item `product-manager` flagged above. I checked
it against `backend/src/repositories/recovery-cases.ts` and `backend/src/routes/`.

**Finding: D3.4 needs no new trigger and no new `endReason`.**
- The code has no "withdrawn" or "false alarm" **status**. `RecoveryCaseStatus` is `open | investigating
  | tracking | recovered | closed`. Withdrawal is a **close reason**, not a status:
  `RECOVERY_CASE_CLOSE_REASONS` already contains `customer-withdrew`. A withdrawn or false-alarm report is
  therefore a transition to `closed` with a close reason. That is D3.4's existing `case_terminal` row,
  which applies whatever the close reason is.
- Access stops at once, before any end record is written. D3.3 condition 1 requires status
  `investigating` or `tracking` on every read, so the location route goes dark on the same request that
  closes the case.
- Before the case is closed, the customer can end the grant at any time with `revoked_by_customer`, or
  withdraw an unused pre-authorisation (D3.1). Under CR-3 that can be done from web, another trusted
  session, or support. A closed case cannot be accepted, so an unused pre-authorisation left on it can
  never be consumed.

**Not a D3.4 gap, but a dependency for the location build to record.** Today the only code path into
`closed` is `updateStatusForPartnerOrg`, through `security-cases.ts`. In other words, only the operator
of the partner that holds the case can close it. There is no customer "withdraw report" route in
`recovery.ts`, and no admin route that closes a recovery case. `open` has no outgoing transitions. So if
an admin decides a report was a false alarm, and neither the customer nor the partner acts, the grant
lasts until it expires: 24 hours by default, 72 hours at most. That is bounded, but later than it
should be. If a customer or admin close-case route is built, it is a "status transition" under D3.4's
`case_terminal` row and must write the end record synchronously, as D3.4 already requires. No new rule
is needed. `backend-architect` should list this as a known limitation in the Stage 8 package for the
location route, not as a blocker.

Item closed. No change to D3.4.

Filed by `solution-architect`.

## `mobile-architect` Stage 6 integration note — R-2 condition, mobile operator app (2026-11-03)

Append-only; nothing above is changed. This answers `cto`'s five required questions for the
`qa-report-ob03-dispatch-tier-a.md` disposition (§3.8: `dispatchStatus: 'pending' | 'accepted'`,
absent = pool mode, is the client's **server-authoritative** mode signal — not a client build flag,
precisely because mobile's `featureEnabled()` fails open in local dev
(`mobile/src/config/features.ts:33`), which would otherwise default a dev build into dispatch mode
against a pool-mode backend). Scope is mobile only; `frontend-architect` files the web-side
equivalent separately. Checked against the current code, not assumed: `mobile/src/api/
security-cases.ts` (claim-only today — no `acceptSecurityCase`/`declineSecurityCase`/
`releaseSecurityCase` exist, confirming Finding 1 of the QA report) and
`mobile/src/screens/security/SecurityCaseDetailScreen.tsx`.

**(i) Actions rendered per `dispatchStatus`, and when absent (pool mode).** The case object gains
`dispatchStatus?: 'pending' | 'accepted' | null` in `SecurityRecoveryCase` (mirroring the backend
field 1:1; no derived client state). Render rule, keyed off the value actually returned by the API
on each fetch/refresh — never cached across the claim/accept/decline/release boundary:
- **Absent / `null`** (pool mode — field not present on this case, which is also the only shape a
  build running against a pre-R-2 backend will ever see): render exactly what exists today —
  `Claim case` when `status === 'open' && !partnerOrganizationId`, plus the existing
  `STATUS_ACTIONS` set once claimed. This is the fail-closed path: a build that doesn't know about
  `dispatchStatus` yet (or a backend that hasn't shipped it) behaves exactly as it does now, not as
  dispatch mode.
- **`'pending'`** (this org has been offered the case, not yet acted on): render `Accept` and
  `Decline` only. No `STATUS_ACTIONS`, no claim button — see (v).
- **`'accepted'`** (this org holds the case): render the existing `STATUS_ACTIONS` set
  (investigating/tracking/recovered/closed) plus a new `Release` action, and no `Claim`/`Accept`/
  `Decline`. `canClaim`'s current boolean expression is replaced by a small `resolveCaseMode(case)`
  helper returning `'pool' | 'offered' | 'held'`, computed once per fetched case object so the three
  branches above can't desync from each other inside one render.

**(ii) Navigation/cache invalidation after decline/release.** Both decline and release remove the
case from this operator's visibility — the backend's dispatch model does not keep a declined/
released case assigned to the org that just acted. On success: clear any component state that
implies this org still holds the case (`pendingTerminalStatus`, `closeReason`, and the fetched
`recoveryCase` itself — set to `null` rather than leaving the stale `'accepted'`-shaped object
mounted, which matters because this screen's terminal-status picker and `STATUS_ACTIONS` render
straight off that object), then `router.back()` to the case list rather than re-fetching this case
by ID (a re-fetch would 403/404 the moment the backend unassigns it, which is a worse failure mode
than just navigating away). The case list screen's own fetch (unchanged — it already re-queries on
focus) picks the case back up in pool mode on the next load for whichever org it's now visible to;
this screen does not try to push an update into the list's cache directly, consistent with there
being no shared cache layer between these two screens today.

**(iii) Retry/idempotency for accept, extending the claim-retry pattern.** `handleClaim` already
establishes the pattern this file's inline comment documents for the rest of Stage 6 (lines 109-118
above `handleClaim` in `SecurityCaseDetailScreen.tsx`): claim is not naturally idempotent server-side
(the backend's write only matches an unclaimed case), so an ambiguous network failure on retry must
not be read as "it failed." `accept` has the identical shape — the backend's accept write matches
only a case in `dispatchStatus: 'pending'` offered to this org — so `handleAccept` reuses the same
three-part handling verbatim rather than inventing a second pattern: (a) offline check before the
call, same copy style ("You're offline. This case has not been accepted — reconnect and try
again."); (b) on `NetworkUnavailableError`, tell the operator we couldn't confirm delivery and to
refresh before retrying, exactly as claim does, rather than auto-retrying; (c) on a 404/409 from a
direct retry, re-fetch the case before reporting failure — if `dispatchStatus` has already moved to
`'accepted'` for this org, the original attempt landed; show that state instead of an error. Decline
and release are PATCH-shaped status/field writes under a precondition (`dispatchStatus === 'pending'`
for decline, `=== 'accepted'` and this org for release) rather than an unclaimed-match write, closer
in idempotency shape to `updateSecurityCaseStatus` than to `claimSecurityCase` — a retry after an
ambiguous failure either no-ops against the already-moved state or 404s if the case left this org's
visibility entirely (handled by (ii)'s navigate-away-on-success already covering the success case;
the retry-after-ambiguous-failure case re-fetches once, same as (c), and if the case is simply gone
from this org's visibility, that absence *is* confirmation the original attempt succeeded, so the
UI navigates to the list rather than showing an error).

**(iv) Decline/release reason pickers reuse the existing `SelectChipGroup` pattern, fixed enums,
no free text (CS-6).** This screen already has the exact shape needed, used today for the terminal-
status close reason (`CLOSE_REASON_OPTIONS`, `SelectChipGroup` at
`SecurityCaseDetailScreen.tsx:272`, gated behind `pendingTerminalStatus`/`closeReason` state). Decline
and release each get their own fixed `SelectChipOption<T>[]` array (new enum types owned by
`backend-architect`'s Stage 6 API contract for this ADR — not invented client-side, same discipline
as `SecurityCaseCloseReason` mirroring `backend/src/repositories/recovery-cases.ts`), each gated
behind its own `pendingDeclineReason`/`pendingReleaseReason` state following the same
request-then-confirm two-step the terminal-status flow already uses (`Decline` button reveals the
chip group + a `Confirm decline`/`Cancel` pair, confirm disabled until a reason is chosen — mirroring
`disabled={!closeReason}` at line 282). No `TextInput` is introduced for either reason; CS-6's
fixed-enum-only requirement is structural here, not a validation-layer afterthought, because the
confirm button's `disabled` prop is wired directly to "a chip is selected," not to any freeform field
existing at all.

**(v) Hiding status/message actions while pending.** While `dispatchStatus === 'pending'`, the
screen renders only `Accept`/`Decline` — no `STATUS_ACTIONS` block, and the existing
`MapPlaceholder`/tracking-status block (gated on `recoveryCase.status === 'tracking'`) stays as-is
since a pending offer can't yet be in `'tracking'` status server-side, but is listed here because
`cto`'s concern (acting on a case not yet accepted) extends to any message/communication surface:
this screen has no messaging UI today, so there is nothing to additionally hide on that front, but
if OB-04's case-history/messaging surface (`docs/features/019-case-history-timeline/`) lands a
message composer into this screen before dispatch mode ships, it must be added to the same
`resolveCaseMode(case) !== 'held'` gate used for `STATUS_ACTIONS` rather than gated independently, so
the two can't drift.

**Not addressed here, deferred to backend-architect's Stage 6 contract:** the exact field name/enum
values for decline/release reasons, and whether `acceptSecurityCase`/`declineSecurityCase`/
`releaseSecurityCase` are POST-to-subresource (matching today's `.../claim`) or PATCH-shaped. This
note is written to be correct under either, since (i)-(v) key off `dispatchStatus` returned in the
response body, not off which HTTP verb produced it.

Filed by `mobile-architect`.
