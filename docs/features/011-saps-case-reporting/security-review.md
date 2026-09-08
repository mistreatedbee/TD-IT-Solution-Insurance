# Feature 011 (Idea 1) — Security Review (Stage 8)

**Status:** **CONDITIONAL SIGN-OFF — APPROVED WITH REQUIRED CHANGES (SR-011-1 … SR-011-7).**
Development (Stage 9) may begin. **No entry into any environment holding real customer data** until
SR-011-1, SR-011-4 and SR-011-6 are closed and re-verified.
**Date:** 2026-09-03
**Lifecycle stage:** 8 — Security Review (hard gate). **Chair / decision owner (A):** `cybersecurity-architect`.
**Joint gate status — INCOMPLETE:** `security-engineer` (R) concurrence **CONCURRENCE WITHHELD IN PART** — see
§10, 2026-09-08 (SR-011-1 confirmed satisfied in shipped code; SR-011-4/C-011-11 confirmed **not** implemented;
SR-011-6 confirmed only half-done — backend manifest entry present, mobile entry missing) · `compliance-specialist`
(C) **CONCURRENCE WITHHELD IN PART** on B-1/B-2/B-3 — see §9
([`compliance-review-saps-case-data.md`](./compliance-review-saps-case-data.md)) which is explicit at §10 that it
does **not** discharge Stage 8 on its own. Per `02-feature-lifecycle.md` and root `CLAUDE.md`, **Stage 8 is
discharged only when all three roles sign.** Two of three signatures are now recorded, both withheld in part.
**Stage 8 is not discharged.**

**Scope of this gate — exactly what was reviewed:**
- `PATCH /v1/recovery/cases/:caseId/police-report` (new, customer-only)
- The `policeReport` sub-object addendum to `GET /v1/recovery/cases` and `GET /v1/recovery/cases/:caseId`
- New fields on `RecoveryCaseDocument`: `sapsCaseNumber`, `reportingStation`, `reportedToPoliceAt`,
  `policeReportHistory[]`, `policeReportReminderSentAt`, `closedAt`
- The C-011-9 exclusion mechanism (`serializeSecurityRecoveryCase`, `GET /v1/customer-lookup`)
- `backend/scripts/police-report-retention-purge.ts` (C-011-10) as designed

**Explicitly out of scope — no sign-off implied:** Idea 2 (station locator / report-assistant, blocked on
OQ-011-02) · the location field in the report-assistant summary (**D-011-01 — remains BLOCKED**, INC-001 §8/
compliance §8 unchanged; this review releases nothing) · the 48-hour reminder job (D-011-04, undesigned) ·
any agent write path to these fields (D-011-07 / Feature 010 FR-18–21).

**Running code read (2026-09-03, not inferred from the design docs):**
`backend/src/repositories/recovery-cases.ts` · `backend/src/routes/security-cases.ts` ·
`backend/src/routes/support-lookup.ts` · `backend/src/routes/recovery.ts` (via grep of serializer call sites) ·
`docs/organization/gates/stage8-manifest.json` · `scripts/verify-stage8-manifest.mjs` · `package.json` ·
`.github/workflows/ci.yml`.

---

## 0. Verdict

**CONDITIONAL SIGN-OFF.** This is the strongest design chain this project has produced. Stages 5, 6 and 7 each
read the running code, each named their own gaps rather than closing them by assertion, and each explicitly
refused to discharge this gate. That is the behaviour INC-001 was written to produce, and it is why this is a
conditional approval rather than a block.

Three things are genuinely right and should be said plainly:

- The endpoint is customer-only, `accountId` is token-derived, ownership 404s uniformly, and there is **no
  agent, admin or partner write path** — the account-takeover blast radius of this feature is one customer's
  own case record.
- No location data is added to any surface. `serializeRecoveryCase` today emits `lastLocationAt` (a timestamp)
  and never a coordinate; `serializeRecoveryCaseForCustomer` spreads it unchanged. D-011-01 holds.
- Retention is designed as field-level clearing on a surviving document, correctly rejecting the TTL-index
  pattern, and the design named its own missing `closedAt` field rather than assuming one existed.

**Seven required changes.** Four matter enough to name here:

- **SR-011-1 — "exclusion by construction" is not, today, construction.** The mechanism is an explicit-allowlist
  serializer, which is good practice but is not a structural guarantee. §1 below.
- **SR-011-4 — C-011-10 is not implementable as designed, and its failure mode is indefinite retention.**
  Nothing in the codebase sets `closedAt`, and the purge filter requires it to be non-null. §4.
- **SR-011-3 — `policeReportHistory[]` is a customer-writable, unbounded, append-only array on a document the
  security-company surface reads.** No `maxItems`, no per-case cap, `DEFAULT_AUTHENTICATED_LIMIT` (100/min). §3.
- **SR-011-6 — the new route lands inside an existing *waived* manifest entry** (`/recovery/*`) and the new
  mobile screen lands inside a catch-all (`(app)*`). CI-1 will stay green while a surface reaches a client
  build with no review of its own. That is INC-001's root cause, reproduced. §6.

---

## 1. SR-011-1 (Required, blocks real customer data) — C-011-9 enforcement is a convention, not a construction

**Claim under review:** `architecture-review.md` §4 — "the design instead makes the omission structural."

**Traced against the code as it exists today.** `backend/src/repositories/recovery-cases.ts:90-109`:

```ts
export function serializeRecoveryCase(doc: RecoveryCaseDocument) { /* explicit field list */ }

export function serializeSecurityRecoveryCase(doc: RecoveryCaseDocument) {
  return { ...serializeRecoveryCase(doc), accountId: doc.accountId, partnerOrganizationId: doc.partnerOrganizationId, updatedAt: doc.updatedAt.toISOString() };
}
```

**What is true:** both serializers are explicit allowlists. Neither spreads `doc`. Adding
`sapsCaseNumber` to `RecoveryCaseDocument` does **not** automatically surface it on the partner path. That is a
real and meaningful property, and it is materially better than the alternative design.

**What is not true:** this is not exclusion *by construction*. `serializeSecurityRecoveryCase` receives the full
`RecoveryCaseDocument` and has `doc.sapsCaseNumber` in lexical scope and in the type. A single added line leaks
it, the compiler is satisfied, and no test fails. The architecture review reaches this same conclusion mid-
sentence and does not revise the surrounding claim — §4 reads "There is no code path in `security-cases.ts` that
can reach `doc.sapsCaseNumber` even by mistake … — wait, it receives `doc` directly …". The retraction is
correct; the section heading is not. I am ruling on the retraction.

The specific failure mode the task asks about is real and is not hypothetical here: after this feature lands,
`recovery-cases.ts` will export **three** functions whose names differ only by suffix —
`serializeRecoveryCase`, `serializeRecoveryCaseForCustomer`, `serializePoliceReport`. An editor in
`security-cases.ts` reaching for a case serializer by autocomplete has a one-in-three chance of picking the one
that carries police-report data, and nothing in the type system, the linter, or the test suite objects.

**Required (all three, none optional):**

1. **SR-011-1a — repository-level projection.** `listForPartnerOrg` and `findByIdForPartnerOrg` must
   `.project()` the four police-report fields out of the query, so the partner read path never *loads* them. A
   field that was never fetched cannot be serialised, logged, spread, or returned by a future refactor. This is
   the only change that makes "by construction" literally true, and it is the one that survives an author who
   has not read this document.
2. **SR-011-1b — merge-blocking regression test** (this converts `api-design.md` SAPS-API-01 from a
   recommendation into a gate). Assert on a case document with all four fields populated that
   `Object.keys(serializeSecurityRecoveryCase(doc))` contains none of `sapsCaseNumber`, `reportingStation`,
   `reportedToPoliceAt`, `policeReport`, `policeReportHistory`; and the same assertion against the live JSON body
   of `GET /v1/security/cases`, `GET /v1/security/cases/:caseId`, `POST /v1/security/cases/:caseId/claim`,
   `PATCH /v1/security/cases/:caseId` (all four partner responses, not just the serializer unit) and against
   `GET /v1/customer-lookup`. Route-level, because SR-011-1a's projection is what those tests actually prove.
3. **SR-011-1c — put the customer-only readers behind a boundary a mistake has to cross.** Either move
   `serializePoliceReport` / `serializeRecoveryCaseForCustomer` into a separate module (e.g.
   `backend/src/lib/police-report-serializers.ts`) with a file-header prohibition, or add an ESLint
   `no-restricted-imports` rule forbidding those two symbols in `backend/src/routes/security-cases.ts` and
   `backend/src/routes/support-lookup.ts`. A wrong import should be a build error, not a code-review catch.

**Ruling on the `GET /v1/customer-lookup` exclusion (`architecture-review.md` §4):** upheld. Verified against
`support-lookup.ts:146-152` — that handler builds its own literal with a five-field allowlist and calls no
`recovery_cases` serializer. Police-report fields stay off it. This is not merely "for now": it stands until
C-010-1 lands **and** a specific operational need is documented. Recorded as **SR-011-7** (standing).

---

## 2. SR-011-2 (Required) — the post-purge edit path silently destroys the data it just accepted

Found by reading `api-design.md` §2.3 against `database-design.md` §5.3, which no single document does.

`api-design.md` §2.3 rules that a PATCH is accepted at any status including `closed`, and §2.3's closing note
accepts that a PATCH after the retention purge "simply starts a fresh `policeReportHistory` from
`previousValue: null`." But the purge filter (`database-design.md` §5.3) keys on `closedAt <= now - 5y`. A case
that has already been purged has, by definition, a `closedAt` more than five years old — and it stays that way.
So a customer who re-enters a case number on that case gets a `200`, sees their data on screen, and the next
scheduled run of the purge job silently deletes it, with no user-visible signal and no error.

That is not a compliance defect (the deletion is correct). It is an **integrity and honesty defect** — the API
acknowledges a write it is structurally going to discard, on evidentiary data the customer may be relying on for
a claim. POPIA s16 (information quality) is engaged in the other direction from usual.

**Required:** `PATCH /v1/recovery/cases/:caseId/police-report` must reject when the case's retention window has
already expired (`status === 'closed' && closedAt <= cutoff && legalHold !== true`), with a defined error rather
than an accept-then-purge. `backend-architect` owns the code choice (`409 CONFLICT` reuses the existing
catalogue; a new code would need `errors.ts` review per SR-19). **Do not** resolve this by resetting the
retention clock on edit — `database-design.md` §5.2 already ruled that direction out for good reason.

**SAPS-API-02 is answered:** no time bound on post-closure editing. The permissive reading is correct and I
concur with §2.3's reasoning. The only bound is the retention-expiry bound above, which is a consequence of the
retention ruling, not a new restriction.

---

## 3. SR-011-3 (Required) — unbounded customer-controlled growth on a partner-readable document

`database-design.md` §3's validator for `policeReportHistory` sets `bsonType: 'array'` with per-item
constraints and **no `maxItems`**. `api-design.md` §4 sets the rate limit to `DEFAULT_AUTHENTICATED_LIMIT`. The
no-op suppression required by §2.5 (skip the entry when `previousValue === newValue`) does not bound anything —
a client alternating `"A"` / `"B"` on `sapsCaseNumber` appends an entry every request, forever.

Consequences, in order of severity:
1. The array lives on the same document `listForPartnerOrg` fetches for **every** partner-dashboard page load.
   A single customer can degrade a third party's dashboard.
2. The 16 MB BSON document ceiling is reachable, at which point every write to that case — including a
   security operator's `PATCH /security/cases/:caseId` status change during an active recovery — starts failing.
3. `GET /v1/recovery/cases` returns the full history per item, per `api-design.md` §2.1/§8, with no pagination
   on the array.

**Required:** (a) `maxItems` on the validator and a matching application-level cap with a defined error when
exceeded; (b) a dedicated rate limiter for this route, tighter than `DEFAULT_AUTHENTICATED_LIMIT` — this is a
low-frequency human action by the design's own account (`architecture-review.md` §5), so the platform default is
two orders of magnitude too generous; (c) `database-architect` to confirm the list-response history exposure in
§8 is bounded (cap the array in the list projection, or omit `history` from list items and return it only on
detail — the latter matches Feature 004's own list/detail asymmetry).

**SAPS-API-03 is answered:** the idempotency omission is **accepted**, conditional on the §2.5 no-op suppression
being implemented and on (a)–(c) above. Without the cap, the "worst case is a cosmetic duplicate" argument does
not hold.

---

## 4. SR-011-4 (Required, blocks real customer data) — C-011-10 cannot run as designed

`database-design.md` §5.2 correctly identifies that `RecoveryCaseDocument` has no `closedAt` and adds it.
Verified: `backend/src/repositories/recovery-cases.ts:27-42` has no such field. What §5.2 flags and
`api-design.md` SAPS-API-04 restates — but neither closes — is that **nothing writes it.**

Traced: the only path to `status: 'closed'` on a recovery case is
`updateStatusForPartnerOrg` (`recovery-cases.ts:209-230`), invoked from `PATCH /v1/security/cases/:caseId`. It
does `$set: { status, updatedAt }` and nothing else. There is no customer-side and no admin-side close path.

Therefore, as designed and as the code stands:
- Every case closed by a partner operator gets `closedAt: null`.
- The purge filter is `closedAt: { $ne: null, $lte: cutoff }`.
- **The retention job matches nothing, ever. The police-report triple is retained indefinitely** — a direct
  breach of the POPIA s14(1) ceiling that compliance §5 set as a hard limit, delivered by a job that reports
  `cleared: 0` and looks healthy.

This is the same shape as INC-001 §2.2's `location_events` TTL finding: a retention control that exists on paper
and operates on nothing.

**Required, all of:**
1. `updateStatusForPartnerOrg` (and any future close path) must set `closedAt` on, and only on, the transition
   into `closed`. This is a change to an **already-shipped partner-facing route's** behaviour — it is inside
   Feature 011's Stage 9 diff and must be tested as such, not left to whoever builds a close endpoint later.
2. A backfill decision for pre-migration closed rows (they will have `closedAt: null` and are otherwise
   unpurgeable). `database-architect` owns the mechanism; a `closedAt: updatedAt` backfill at migration time is
   the obvious candidate and is defensible because no police-report fields exist on those rows yet.
3. **`recovered`-vs-`closed` (`database-design.md` §5.2, open) must be closed by `compliance-specialist` before
   Stage 9 implements the job, not after.** As it stands a `recovered` case that is never administratively
   `closed` never starts its clock — the identical indefinite-retention outcome by a second route. I support the
   `$in: ['closed', 'recovered']` reading but the ruling is not mine.
4. **The evidencing gap named in `database-design.md` §5.3 is not waivable by silence.** Stdout-only evidencing
   against ephemeral Render log retention cannot answer "prove this ran." Either build the
   `retention_job_runs` collection whose shape that document already specifies, or `cto` records an explicit,
   dated risk acceptance of stdout-only evidencing. Silent acceptance is not available (see §7).

---

## 5. Confirmed, no change required

- **C-011-8 (change history).** Append-only, one entry per changed field, actor from the token. Correct, and the
  reasoning in `database-design.md` §2 for preferring it over last-write-wins is sound. `actorAccountId` is
  correctly omitted from the wire shape (`api-design.md` §7) — it is always the caller today, and exposing it
  would pre-announce a multi-actor history that does not exist.
- **BR-011-02 / no format validation.** Concur. A regex here would reject real case numbers and buys no security
  property — the value is an opaque reference the platform never parses, dereferences, or uses in a query
  construction. Confirmed that §5's Zod shape applies length bounds and `.trim()`, which is the only input
  handling this field needs.
- **`accountId` never client-supplied** on this route. Verified against the convention in `recovery.ts`.
  Feature 011 introduces no exception to the platform rule (Feature 010 does — see that review).
- **D-011-01.** No location field is added anywhere by this feature. `serializeRecoveryCaseForCustomer` spreads
  the base serializer's `lastLocationAt` timestamp only. The block stays in force; this review releases nothing
  and does not touch C-008-1/-5/-6/-12.
- **C-011-1 (third-party suspect data).** The shipped guidance in
  `mobile/src/screens/recovery/ReportTheftConfirmScreen.tsx:87` ("Please don't include personal details about
  other people (e.g. names of suspects)") is live and correctly worded. It is a **mitigation of the free-text
  risk, not a control** — it is advisory copy on an unbounded field. Adequate for this feature's purposes;
  C-011-1 stays open with `ui-designer`/`technical-writer`.

---

## 6. SR-011-6 (Required) — Stage 8 manifest coverage, and a CI-1 defect this feature exposes

Checked against `docs/organization/gates/stage8-manifest.json` and `scripts/verify-stage8-manifest.mjs`
(wired into CI at `.github/workflows/ci.yml:82`).

**Stage 9 of this feature will not fail CI-1 — and that is the problem.**

- The new backend route `/recovery/cases/:caseId/police-report` is absorbed by the existing manifest entry
  `backend-recovery`, pattern `/recovery/*`, which is a **`waived: true`** entry citing "Feature 009 Stage 8
  pending A-1". A brand-new personal-data category would enter the codebase under a waiver granted for a
  different feature, for a different reason, and CI would report PASS.
- The new mobile "add police details" screen (unnamed in the design chain, but required by BR-011-03's
  follow-up placement) will land under `mobile/app/(app)/…` and be absorbed by the `mobile-app-shell` entry,
  pattern `(app)*` — which points at Feature 004's sign-off. Verified against `patternCovers()`: a trailing-`*`
  pattern without braces is evaluated as a bare `startsWith` prefix, so **every** current and future screen
  under `(app)` is auto-covered by one Feature 004 record.

Both are the INC-001 root cause in its exact original form: a surface reaching a client build with no record of
its own review, and a mechanical check that says everything is fine.

**Required:** Stage 9's diff must add explicit manifest entries — `backend_route` for
`PATCH /recovery/cases/:caseId/police-report` and `mobile_route`/`mobile_route_group` for the police-report
capture screen(s) — pointing at **this** document, before or in the same commit as the route/screen. The
manifest entry is part of the feature, not follow-up work.

**Filed as a platform finding, not a Feature 011 blocker (shared with Feature 010's review as SH-1):**

- **SH-1a — CI-1 does not scan web surfaces at all.** INC-001 §6 CI-1 specifies "every route in
  `src/*/Routes.tsx`". `verify-stage8-manifest.mjs` discovers `backend/src/routes/` and `mobile/app/` only. The
  Admin, Security Company and Call Centre dashboards are entirely outside the control. Owner
  `devops-engineer` + this role.
- **SH-1b — catch-all and waived patterns silently absorb new surfaces.** A manifest whose broadest entries
  win by prefix match cannot detect a new surface inside an old scope. CI-1 should report newly-discovered
  surfaces matched *only* by a `waived` or catch-all entry as a warning-with-diff against a checked-in
  baseline, so absorption is visible in a PR.
- **SH-1c — CI-1 is a route-existence check, not a data-exposure check.** Nothing about it would notice a new
  personal-data field added to an already-manifested route's response. SR-011-1b's route-level golden-response
  tests are the compensating control for this feature; the general problem is unowned.
- **SH-1d — hygiene:** the manifest tags `/events` and `/dau` with `"feature": "011"`, which now collides with
  this feature. Two different 011s in one governance artefact. `analytics-specialist` /
  `reporting-engineer` to re-tag.

---

## 7. Residual risk, explicitly accepted

Per this role's standing obligation that no risk is accepted silently:

| # | Residual risk | Accepted by | Basis |
|---|---|---|---|
| RR-011-1 | Free-text `notes` and the new fields remain an unmanaged store of third-party suspect data (C-011-1). Advisory copy only; no technical control is possible on an unbounded field. | `compliance-specialist` (C-011-1 open) | Input-time guidance is the correct control per compliance §5; masking is not |
| RR-011-2 | Police-report fields are stored unencrypted at field level, protected only by Atlas at-rest encryption. | `cybersecurity-architect` (this document) | Consistent with the `notes` field precedent; the sensitivity is in the *assertion*, and field-level encryption does not defend against the disclosure paths that matter here (over-broad serialisation, over-broad role). SR-011-1 addresses those directly. Revisit if SD-FU-02 / AUD-12's field-encryption evaluation reaches a different platform-wide conclusion |
| RR-011-3 | Retention evidencing may be stdout-only (`database-design.md` §5.3). | **NOT YET ACCEPTED** — requires `cto` sign or the `retention_job_runs` collection (SR-011-4.4) | Recorded here so it cannot be accepted by omission |

---

## 8. Conditions register — Feature 011 Stage 8

| ID | Condition | Owner | Blocks |
|---|---|---|---|
| **SR-011-1** | C-011-9 hardening: (a) repository projection on both partner reads, (b) merge-blocking route-level golden-response tests, (c) import boundary on the customer-only serializers | `backend-engineer`; verified `security-engineer` | Real customer data; C-011-9 exit |
| **SR-011-2** | Reject PATCH on a case past its retention expiry rather than accept-then-purge | `backend-architect` (contract), `backend-engineer` | Stage 9 exit |
| **SR-011-3** | Bound `policeReportHistory[]`: `maxItems`, app-level cap, dedicated tighter rate limiter, bounded list-response exposure | `database-architect` + `backend-engineer` | Stage 9 exit |
| **SR-011-4** | Make C-011-10 operable: write `closedAt` on close, backfill decision, `recovered`-vs-`closed` ruling from `compliance-specialist`, run-log durability decided not defaulted | `backend-engineer` + `database-architect` + `compliance-specialist` + `cto` | Real customer data |
| **SR-011-5** | `security-engineer` and `compliance-specialist` Stage 8 concurrence recorded in this document | `security-engineer`, `compliance-specialist` | **Gate discharge** — this document alone does not clear Stage 8 |
| **SR-011-6** | Explicit stage8-manifest entries for the new route and the new mobile screen(s), landing with the code | `backend-engineer` + `mobile-engineer` | Merge of the Stage 9 diff |
| **SR-011-7** | **Standing:** police-report fields stay off `GET /v1/customer-lookup` and every security-company surface. Lifting requires a documented operational need, C-008-8 cleared, and a fresh review by this role | all roles | Standing |

**Unchanged and not released by this review:** D-011-01 · C-008-1/-5/-6/-8/-12 · INC-001 Release Gate A
criterion 6 (unsigned — §9.4 of INC-001) · C-011-3/-4/-5/-6 (CT-4, RoPA, s18 notice, licence status) which
independently gate first processing of real customer SAPS data · Stage 10 QA.

**Filed by:** `cybersecurity-architect` (chair), 2026-09-03.

---

## 9. `compliance-specialist` concurrence under SR-011-5 — **WITHHELD IN PART**

**Date:** 2026-09-08. **Role:** `compliance-specialist` (C on this gate).
**Status: CONCURRENCE WITHHELD.** The engineering work on this feature is the best retention and
data-segregation implementation this platform has produced, and §9.1 says so field by field. But the
feature is **live in production, processing a real customer's real SAPS case number**, and three of my
own conditions — C-011-3 (CT-4 documented Client instruction), C-011-4 (RoPA entry) and C-011-5 (s18
notice) — were written as **hard preconditions on exactly that event** and are all unmet. A fourth
(SR-011-4.3, the `recovered`-vs-`closed` retention trigger) was expressly reserved to me *before* Stage 9
and Stage 9 shipped the narrower reading without it. SR-011-5 is therefore **not discharged on my limb**,
and Stage 8 remains incomplete.

**I am not asking for a revert, and I am not asking for the capture UI to be pulled.** The data already
captured is lawfully held — my §4 basis (s11(1)(b) contract + s11(1)(c) legal obligation) does not depend
on any of the blockers below, and the §5 retention floor means deleting it would be the wrong remedy. What
is withheld is the **gate**, and with it any representation that this surface was cleared before it began
processing. The blockers in §9.4 are, with one exception, copy and register artefacts — not code.

**Code read for this section (2026-09-08, running code, not the design chain):**
`backend/src/repositories/recovery-cases.ts` · `backend/src/lib/police-report-serializers.ts` ·
`backend/src/lib/police-report-retention.ts` + `.test.ts` ·
`backend/scripts/police-report-retention-purge.ts` · `backend/src/db/recovery-collections.ts` ·
`backend/src/routes/recovery.ts` · `backend/src/routes/security-cases.ts` + `.test.ts` ·
`backend/src/routes/support-lookup.ts` · `backend/.eslintrc.cjs` ·
`mobile/src/screens/recovery/PoliceReportSection.tsx` · `mobile/app/(auth)/privacy.tsx` ·
`src/pages/PrivacyPolicyPage.tsx` · `docs/organization/gates/stage8-manifest.json` · full `docs/` search
for any RoPA artefact.

### 9.1 What I confirm as satisfied — verified in shipped code

**C-011-9 / SR-011-1 (exclusion from every security-company surface): SATISFIED, and it exceeds what I
required.** Three independent layers, all present:

1. **Query-level projection.** `POLICE_REPORT_FIELD_EXCLUSION_PROJECTION`
   (`recovery-cases.ts:120-126`) excludes all five police-report keys and is applied to **four** partner
   paths — `listForPartnerOrg`, `findByIdForPartnerOrg`, `claimForPartnerOrg` **and**
   `updateStatusForPartnerOrg`. SR-011-1a named only the first two; the write-path read-backs were caught
   as well. The fields are never fetched into the row object on any partner path, which is what makes
   "by construction" literally true rather than a naming convention.
2. **Module boundary + lint enforcement.** `police-report-serializers.ts` holds the only two functions
   that put these fields on a wire, and `backend/.eslintrc.cjs:14-41` carries a
   `no-restricted-imports` override on `src/routes/security-cases.ts` and `src/routes/support-lookup.ts`
   covering both the `.js` and extensionless specifiers. A wrong import is a build failure.
3. **Route-level golden-response regression tests.** `security-cases.test.ts:365-393` asserts a
   six-key absence set against a document with **every** police-report field populated including a
   non-empty history array, across the partner routes. This is the merge-blocking test SR-011-1b required.

On the wire, I confirm: `serializeSecurityRecoveryCase` (`recovery-cases.ts:175-182`) emits seven keys,
none of them police-report; `GET /v1/customer-lookup` (`support-lookup.ts:150-156`) builds a five-key
literal and calls no recovery-case serializer. **SR-011-7 holds. C-011-9 is met.**

**Retention job (C-011-10 / SR-011-4 mechanism): CORRECT on all three limbs I ruled.** Verified against
`police-report-retention.ts`, not the design doc:

| My ruling (§5) | Shipped |
|---|---|
| 5-year floor from case closure | `POLICE_REPORT_RETENTION_YEARS = 5` (`recovery-cases.ts:59`), `computeRetentionCutoff` subtracts it from an injectable `now`; test asserts `2026-09-07 → 2021-09-07` |
| Field-level clearing, **not** whole-document deletion | `buildClearUpdate` is a `$set` of five fields to `null`/`[]` (`:88-95`). There is **no `deleteOne`/`deleteMany`/TTL index anywhere in this feature** — I checked. `updatedAt` is bumped, which is itself evidentiary and is the right call |
| Legal-hold exclusion | `legalHold: { $ne: true }` in `buildRetentionPurgeFilter` (`:58`), with a dedicated test asserting an otherwise-eligible held case is not matched (`police-report-retention.test.ts:186-196`) |

Also confirmed and creditable: the filter is idempotent (matches only documents that still *have* a field
set, via `$type` — the `$ne`-in-partial-index defect that broke production startup is fixed consistently in
**both** the index and the job filter, `recovery-collections.ts:109-125`); `--dry-run` is a true no-write
path with a test proving it; the script prints the resolved database name to stderr before any query so a
run against the wrong database can never be mistaken for "nothing to clear."

**SR-011-2 (accept-then-silently-purge): SATISFIED.** `setPoliceReportFields` returns
`retention_expired` (`recovery-cases.ts:396-403`) and `recovery.ts:232-240` maps it to a `CONFLICT` with
plain-language customer copy. The API no longer acknowledges a write it is going to discard. This is the
s16 information-quality point and it was implemented as ruled.

**C-011-8 (change history): SATISFIED.** Append-only, one entry per field that *actually* changed,
actor from the token, no-op resubmission suppressed (`:412-459`). `actorAccountId` is correctly held back
from the wire shape in `serializePoliceReport`.

**C-011-1 (third-party suspect data): mitigation still live** at
`mobile/src/screens/recovery/ReportTheftConfirmScreen.tsx`. Unchanged, still advisory-only, still open.

**PCI-DSS scope: nil, unchanged.** This feature introduces no payment flow and no cardholder data. The
one PCI-adjacent risk on this data model is the free-text `notes` field, which is Feature 010's C-010-3
and is tracked there.

### 9.2 Ruling now issued — SR-011-4.3, `recovered` vs `closed`

SR-011-4.3 reserved this to me and required it be closed **before Stage 9 implemented the job**. It was
not, and Stage 9 shipped the narrower reading: `updateStatusForPartnerOrg` sets `closedAt` **only** on the
transition into `'closed'` (`recovery-cases.ts:320-322`), the purge filter requires `status: 'closed'`
(`police-report-retention.ts:53`), and `police-report-retention.test.ts:198-209` now *locks that in* with
a test asserting a `recovered` case is deliberately not matched.

**Ruling: the retention clock starts on entry to any terminal state, and `recovered` is a terminal
state.** A case whose asset has been recovered is finished; there is no basis in POPIA s14(1) or in the
insurance-recordkeeping floor for treating it as perpetually live merely because no operator later
pressed "closed." As shipped, a `recovered`-and-never-`closed` case retains the police-report triple
**indefinitely** — the identical failure mode SR-011-4 was raised to prevent, arriving by the second route
the chair predicted. The `$in: ['closed', 'recovered']` reading the chair supported is correct and I adopt
it.

**Required:** `closedAt` set on transition into `'closed'` **or** `'recovered'`; purge filter
`status: { $in: ['closed', 'recovered'] }`; the retention floor runs from that timestamp; and the test at
`:198-209` inverted rather than deleted, so the intent stays visible. Owner `backend-engineer` +
`database-architect`. This is **C-011-11**.

**SR-011-4.2 (backfill of pre-migration closed rows): ruled satisfied by analysis, no work required.**
Those rows have `closedAt: null` and therefore never match the filter — but they also have no
police-report field set, so the `$or` limb never matches them either. There is nothing to purge and no
retention exposure. The gap is real but empty. If any close path is ever added that does not set
`closedAt`, this reverts to a live gap.

### 9.3 Drift between what I ruled and what shipped — stated explicitly

Four items. Two are blockers (§9.4), two are noted-and-accepted.

| # | Ruled | Shipped | Disposition |
|---|---|---|---|
| D-1 | C-011-3/-4/-5 are **hard preconditions on the first processing of real customer SAPS data** (§3, §10 of my ruling) | Real customer SAPS data is in production; none of the three exists | **Blocker B-1.** The gate was crossed in the wrong order |
| D-2 | C-011-5 s18 notice must state five specific things **before first capture** (§4) | `PoliceReportSection.tsx:138-141` says only "add the case number here so it's on record." `mobile/app/(auth)/privacy.tsx` and `src/pages/PrivacyPolicyPage.tsx` contain **no occurrence** of "police", "SAPS" or "case number" | **Blocker B-2** |
| D-3 | SR-011-4.3 ruling reserved to me before Stage 9 | Shipped without it, narrower reading locked in by a test | **Blocker B-3**, ruled in §9.2 as C-011-11 |
| D-4 | SR-011-3(c) — bounded history exposure in the **list** response (cap the array, or return history only on detail) | `GET /v1/recovery/cases` maps every row through `serializeRecoveryCaseForCustomer`, which emits the full history array per item (`recovery.ts:144`) | **Noted, not a blocker on my limb.** This is a data subject reading their own record — no disclosure to a third party, so no POPIA limb is engaged. It remains an unmet *engineering* condition (payload weight, list/detail asymmetry) and I hand it back to `cybersecurity-architect` / `database-architect` rather than clearing it |

**One further observation, accepted, not a condition.** The support-agent paths
`ctx.recoveryCases.listByAccount` (`support-lookup.ts:115`) and `appendCallCentreNote` (`:200`) use the
**unprojected** repository methods, so police-report fields *are* loaded into process memory on an agent
request even though the handler's five-key literal keeps them off the wire. That is allowlist-by-
convention, which is the exact posture SR-011-1 rejected for the partner path. I accept it here because
(a) my C-011-9 read-access ruling permits internal `support_agent` access to these fields under the
`privileged_data_access` audit event, which is recorded on both paths (`:126-134`, `:214-222`), so this
is a permitted-reader path, not a prohibited one; and (b) nothing is exposed. If a support-agent *read*
surface for these fields is ever built, it needs its own review — it is not authorised by silence here.

### 9.4 Blockers — what is withheld and what lifts it

| # | Blocker | Lifts when |
|---|---|---|
| **B-1** | **The feature is processing real customer SAPS data with C-011-3 (CT-4 documented Client instruction), C-011-4 (RoPA entry) and C-011-5 (s18 notice) all unmet.** All three were written as preconditions on this precise event. C-011-4 is mine to produce and is addressed in §9.5. C-011-3 is mine jointly with `cto`. As an Operator we are processing a new information category for a new purpose with no documented instruction authorising it (POPIA s20/s21, TDIT-2026-09 §19(a)) | RoPA entry + CT-4 entry naming police-report capture exist (both due 2026-09-15 — see §9.5), **and** B-2 is closed |
| **B-2** | **No s18 notice content anywhere.** Neither privacy surface mentions this data at all, and the in-app helper copy is capture-encouraging and silent on every limb §4 required: who sees it, that it is **not** shared with security-company partners, that the platform files nothing with SAPS, the retention period stated as a period, and the erasure limit | Copy below rendered on the capture screen **and** added to both privacy notices. Copy is supplied — this is not blocked on a further compliance cycle |
| **B-3** | **C-011-11** (§9.2) — `recovered` cases never start the retention clock; indefinite retention of the triple by a second route | `closedAt` set on `closed` **or** `recovered`; purge filter widened; test inverted |

**s18 copy, given now, for the capture screen (replaces the `PoliceReportSection.tsx:138-141` helper):**

> Optional. If you've opened a case with SAPS, add the case number, the station and the date here so it's
> on record to support a future claim and to help us coordinate recovery.
>
> **We don't send this to SAPS.** Adding it here does not report anything to the police, and does not
> update your police case — you still deal with SAPS directly.
>
> **Who sees it:** only you and TD IT Solution staff handling your policy or claim. It is **not** shared
> with the security company that responds to your recovery.
>
> **How long we keep it:** five years after your case is closed, because we're required to keep
> claim-supporting records for that long. During that period this specific information can't be deleted on
> request, even if you ask us to delete other data.

The same content, in the platform's own voice, must appear in `mobile/app/(auth)/privacy.tsx` and
`src/pages/PrivacyPolicyPage.tsx`. Owner `technical-writer` + `ui-designer` + `mobile-engineer` /
`frontend-engineer`; copy above is mine and is approved as written.

### 9.5 RoPA — the time-sensitive item, stated plainly

**INC-001-C-10 (platform RoPA, `compliance-specialist`, deadline 2026-09-15) has NOT passed. Seven days
remain as of today, 2026-09-08.** I re-verified today: **no RoPA artefact of any kind exists anywhere in
this repository** — a full `docs/` search for `ropa` returns zero files; the term appears only as a forward
obligation in C-006-4, C-007-4, C-008-12, C-010-5, C-011-4 and INC-001-C-10. **CT-4 (documented Client
instructions) carries the same 2026-09-15 date** and doc 10 §195 directs that the two be produced together
off the same evidence base. Both are mine.

**Does the feature going live change my posture? Yes, in one specific and material way.** My §3 ruling
deliberately declined to block Stage 2/6/7 on the RoPA, on the reasoning that design work processes
nobody's information and that blocking a low-risk feature behind four-features-old platform debt would be
enforcement theatre. I stand by that reasoning for the design stages. **But the same paragraph made the
RoPA a hard precondition on the first processing of real customer SAPS data, and that event has now
happened.** So the deadline is not "still comfortably pending" — it is **now retrospectively late relative
to the event it was gating**. The 2026-09-15 date has not expired on the calendar; it expired in substance
the moment a real case number was written to production. That is the honest characterisation and I will
not soften it: this is a condition of mine that was overtaken, and the platform cannot today answer an
Information Regulator enquiry about what it holds on that customer, on what basis, for how long.

**My commitment, on the record:** the Feature 011 processing activity — categories (SAPS case number,
reporting station, date reported), purpose (claim substantiation and recovery coordination), basis
(s11(1)(b) + s11(1)(c), §4), recipients (internal only; **explicitly not** security-company partners,
§6), retention (5 years from terminal state per §5 as amended by C-011-11), transborder position
(Render Frankfurt / EU Supabase region per doc 10 §2) — is drafted **inside** the INC-001-C-10 register by
2026-09-15, together with the CT-4 entry. Not as a Feature-011 mini-register. If 2026-09-15 slips, that
slip is escalated to `cto` on the day, not discovered later.

**C-011-6 (insurance licence status) remains unreturned by `cto`.** The 5-year floor in §5 and in
`POLICE_REPORT_RETENTION_YEARS` is therefore still **provisional**. It is very unlikely to move down; it
may move up. `POLICE_REPORT_RETENTION_YEARS` is a single exported constant, which is the right shape for
that uncertainty, and I credit that.

### 9.6 Register additions

| ID | Condition | Owner | Blocks |
|---|---|---|---|
| **C-011-11** | **Retention clock starts on entry to any terminal state.** `closedAt` set on transition into `'closed'` **or** `'recovered'`; purge filter `status: { $in: ['closed','recovered'] }`; the `recovered`-is-not-matched test inverted, not deleted (§9.2). Discharges the SR-011-4.3 ruling reserved to me | `backend-engineer` + `database-architect` | My SR-011-5 concurrence (B-3) |
| **C-011-12** | **The purge job is a manual script, not a scheduled job.** C-011-10 requires "automated, evidenced," and `backend/scripts/police-report-retention-purge.ts` says in terms that scheduling is a separate unmade `devops-engineer`/`cto` decision. The first expiry is ~5 years out so this is not urgent, but "we'll schedule it later" is precisely how `location_events`' missing TTL happened (INC-001 §2.2). Schedule it, or `cto` records a dated acceptance with a review date | `devops-engineer` + `cto` | Not this gate. Before the first case reaches its expiry, and re-checked at every quarterly review |

**RR-011-3 (stdout-only retention evidencing) is still NOT accepted.** The chair recorded it as requiring
a `cto` signature or the `retention_job_runs` collection. Neither exists. The shipped source comments
describe stdout-only as "the accepted interim control" — it is *named*, which is far better than silence,
but it is not *accepted*, and the comment should not be read as the acceptance. On my limb this does not
block: with no data yet at expiry there is nothing to evidence. It must be resolved before it does.

### 9.7 Regime scope — reconfirmed for this feature, 2026-09-08

**POPIA applies** (SA data subjects; SA responsible party under TDIT-2026-09; a SAPS docket reference is
SA-domestic by definition). **GDPR is not triggered** — I have again found no EU data-subject footprint in
code or in any product artefact; the Frankfurt/EU processing location is not an Art. 3(1) establishment
trigger for a non-EU controller serving only SA subjects. This is a determination, not a default, and
**C-011-7 stands**: it reverts to an open question the moment an EU-resident customer is onboarded, and
the §5 retention position re-opens with it. **PCI-DSS scope: nil**, unchanged by this feature.
**Insurance-sector recordkeeping remains the dominant retention driver and remains provisional on
C-011-6.**

**Verdict: CONCURRENCE WITHHELD IN PART (B-1, B-2, B-3).** B-2 and B-3 are a copy change and a
two-line filter/setter change; I will re-issue concurrence on a diff confirmation without a fresh review
cycle. B-1 is mine to clear and is dated 2026-09-15.

**Filed by:** `compliance-specialist`, 2026-09-08.
**Does not discharge:** Stage 8 (SR-011-5 remains open on my limb, and `security-engineer`'s concurrence
is still not recorded anywhere in this document) · Stage 10 QA · C-011-1/-2/-3/-4/-5/-6/-7 ·
C-011-11/-12 · CT-1 · CT-3 (breach runbook, 2026-09-12) · CT-4 · INC-001-C-10 ·
C-008-1/-5/-6/-8/-12 · D-011-01, which this section releases nothing on.

---

## 10. `security-engineer` concurrence under SR-011-5 — **CONCURRENCE WITHHELD IN PART**

**Date:** 2026-09-08. **Role:** `security-engineer` (R on this gate).

**Scope of this section:** hands-on verification of SR-011-1 (C-011-9 enforcement), SR-011-4 / C-011-11
(retention operability), and SR-011-6 (Stage 8 manifest coverage) against the code as it runs today —
not the design chain, not `compliance-specialist`'s §9 (though I independently re-checked its citations
where they overlap mine). I do not re-litigate compliance's B-1/B-2 (RoPA, CT-4, s18 copy) — those are
her limb, not mine. Where our findings overlap (B-3/C-011-11) I confirm hers independently below.

**Commands run and code read for this section (2026-09-08):** `cd backend && npm test` (full suite,
345/345 passing, see below) · `npx eslint src/routes/security-cases.ts src/routes/support-lookup.ts`
(clean pass) · a temporary planted import of `police-report-serializers.js` into
`security-cases.ts` followed by `npx eslint`, confirmed to fail, then reverted and diffed clean against
the original · `backend/src/repositories/recovery-cases.ts` (full file) ·
`backend/src/lib/police-report-retention.ts` (full file) + `.test.ts` (relevant cases) ·
`backend/src/routes/security-cases.test.ts:361-393` · `backend/src/routes/support-lookup.ts` (full
file) · `backend/src/routes/recovery.ts:180-200` · `backend/.eslintrc.cjs` ·
`docs/organization/gates/stage8-manifest.json` (full-text grep for "011", "recovery", "live-tracking",
"claims") · `scripts/verify-stage8-manifest.mjs` (executed, not just read) ·
`.github/workflows/ci.yml:1-115` · `mobile/src/screens/recovery/LiveTrackingScreen.tsx` ·
`mobile/app/(app)/live-tracking/[caseId].tsx`.

### 10.1 SR-011-1 (C-011-9 enforcement) — **SATISFIED, independently verified**

I do not take `compliance-specialist`'s §9.1 characterisation on trust; I re-derived each claim.

1. **Repository projection, all four partner-facing sites.** `POLICE_REPORT_FIELD_EXCLUSION_PROJECTION`
   (`recovery-cases.ts:120-126`) is a literal `{ field: 0, ... }` exclusion of all five police-report
   keys. I traced every exported partner-scoped method on the repo and confirmed the projection (or an
   equivalent `.project()` call) is present at all four:
   - `listForPartnerOrg` — `.find(query).project<RecoveryCaseDbRow>(POLICE_REPORT_FIELD_EXCLUSION_PROJECTION)` (`:257-259`)
   - `findByIdForPartnerOrg` — `findOne(..., { projection: POLICE_REPORT_FIELD_EXCLUSION_PROJECTION })` (`:288-293`)
   - `claimForPartnerOrg` — `findOneAndUpdate(..., { projection: POLICE_REPORT_FIELD_EXCLUSION_PROJECTION })` (`:274-278`)
   - `updateStatusForPartnerOrg` — same, on the write-path read-back (`:323-329`)

   There is no fifth partner-scoped read method in the file. This is genuinely structural: the fields
   are absent from the row object (`RecoveryCaseDbRow`'s police-report fields are typed optional
   specifically because the partner path never populates them, per the comment at `:104-105`), not
   merely omitted from a serializer. I concur with compliance's §9.1 characterisation: this is "by
   construction" in the literal sense the original chair review (§1) said was still missing.

2. **Module boundary + lint enforcement — I did not just read this, I tried to break it.** I planted
   `import { serializePoliceReport } from '../lib/police-report-serializers.js';` at the top of
   `backend/src/routes/security-cases.ts` and ran `npx eslint src/routes/security-cases.ts`:

   ```
   1:1  error  '../lib/police-report-serializers.js' import is restricted from being used.
   Police-report fields (sapsCaseNumber/reportingStation/reportedToPoliceAt/policeReportHistory)
   are customer-only per C-011-9 / SR-011-1. Do not import police-report-serializers.ts into a
   security-company or support-agent-facing route  no-restricted-imports
   ✖ 14 problems (1 error, 13 warnings)
   ```

   Non-zero exit, `error` severity (not `warning`). I then reverted the plant and diffed the file
   clean against the pre-plant copy — no residue. Confirmed the same rule is scoped to
   `support-lookup.ts` in `backend/.eslintrc.cjs:19` (`files: ['src/routes/security-cases.ts',
   'src/routes/support-lookup.ts']`), covering both the `.js`-suffixed and extensionless import
   specifiers (`:29-30, :33-34`).

   **I additionally verified this actually gates CI, which neither prior review confirmed by
   execution.** `backend/package.json:14`: `"lint": "eslint . --ext .ts"`. `.github/workflows/ci.yml`
   backend job (`working-directory: backend`, lines 42-72) runs `npm run lint` at line 62-63, before
   `Test`/`Build`, with no `continue-on-error`. A regression of this import would fail the `backend`
   CI job and block merge, not just fail a local lint someone forgets to run. This is a build error,
   as SR-011-1c required, not a code-review catch.

3. **Route-level golden-response tests — confirmed present and confirmed they cover the fields SR-011-1b
   named.** `security-cases.test.ts:361-393` (`describe('Feature 011 — police-report fields never reach
   a security-company operator'`) builds a case with **every** police-report field populated including a
   non-empty `policeReportHistory[]`, and asserts a six-key absence set (`sapsCaseNumber`,
   `reportingStation`, `reportedToPoliceAt`, `policeReport`, `policeReportHistory`,
   `policeReportReminderSentAt`) against the actual JSON response body — not the serializer function in
   isolation. I ran the suite: `cd backend && npm test` → **55 test files, 345 tests, all passing.** The
   police-report exclusion tests are inside that run, not skipped or `.todo`.

**`GET /v1/customer-lookup` (SR-011-7, standing):** re-verified against `support-lookup.ts:150-156` —
a five-key object literal (`accountId`, `email`, `accountState`, `policyCount`, `assetCount`, plus the
recovery-case sub-objects built from an explicit per-field map at `:148-153`, not a spread). No call to
`serializeSecurityRecoveryCase`, `serializePoliceReport`, or any function that could carry the police-
report triple. **Confirmed. SR-011-7 holds.**

**One thing I checked that neither prior review stated explicitly:** the support-agent read path
(`ctx.recoveryCases.listByAccount`, `support-lookup.ts:115`) uses the **unprojected** repository method
— `listByAccount` has no `.project()` call and is not one of the four partner-scoped methods listed
above. I confirm compliance's §9.3 observation: police-report fields *are* loaded into process memory
on a support-agent request (`GET /v1/customer-lookup`), even though the five-key literal keeps them off
the wire. I agree this is allowlist-by-convention on that one path, not projection-by-construction, and
I agree with compliance's disposition — it is a permitted-reader path (`support_agent` is not
`security-company`), the audit event is present (see §10.4 below), and nothing reaches the wire. I do
not treat this as a SR-011-1 gap because SR-011-1's required scope was explicitly the **partner**
(security-company) surface, not the support-agent surface — but I flag, as compliance did, that if a
support-agent-facing read surface for these fields is ever built directly, it needs the same
projection-level treatment as the partner path, not the allowlist-only treatment it has today by
accident of scope.

**Verdict on SR-011-1: fully satisfied. I concur with `compliance-specialist`'s §9.1 finding and add
independent verification by execution (test run, adversarial lint plant, CI wiring check) rather than
static reading.**

### 10.2 SR-011-4 / C-011-11 (retention operability, `recovered` vs `closed`) — **NOT SATISFIED, confirmed by code and by test**

The original chair review's SR-011-4 concern (nothing set `closedAt`, so the purge job matched nothing)
**is fixed**: `updateStatusForPartnerOrg` sets `closedAt: new Date()` when `status === 'closed'`
(`recovery-cases.ts:320-322`), and this is the sole status-transition write path in the codebase — I
grepped for every write to `status` on `recovery_cases` and found no second path.

**But `compliance-specialist`'s §9.2 ruling (C-011-11 — the retention clock must also start on entry to
`'recovered'`, not just `'closed'`) is not implemented, and I traced this myself rather than trusting
her line citations:**

1. `updateStatusForPartnerOrg` (`recovery-cases.ts:316-322`): the `if (status === 'closed')` guard is
   the *only* condition under which `closedAt` is set. A transition to `'recovered'` falls through with
   no `closedAt` write.
2. `buildRetentionPurgeFilter` (`police-report-retention.ts:51-62`): `status: 'closed'` is a literal
   equality match, not `status: { $in: ['closed', 'recovered'] }`. A `recovered` document — even one
   with `closedAt` somehow set — would never match this filter as written.
3. **The regression test that was supposed to be inverted per compliance's §9.2 ruling has not been
   touched.** `police-report-retention.test.ts:197-207` (`it('does not match a case that is not
   "closed" (e.g. "recovered")'`) constructs a `status: 'recovered'` document with an eligible
   `closedAt` and asserts `candidatesFound: 0` / `cleared: 0` — i.e. it still actively **locks in** the
   behaviour compliance ruled must change. This is not a stale test that happens not to have been
   deleted; it is a passing assertion that the current (wrong, per the ruling) behaviour is correct.

**I confirm compliance's finding independently and add nothing softer: as shipped, a case that
transitions to `recovered` and is never separately, administratively `closed` by an operator retains
the police-report triple (`sapsCaseNumber`, `reportingStation`, `reportedToPoliceAt`,
`policeReportHistory`) indefinitely.** There is no code path that ever clears it. This is not a
theoretical edge case for this product — "recovered" is very plausibly the terminal state most real
cases reach (the asset was found), and "closed" as a distinct, separately-triggered administrative
action may never happen at all for a large share of cases. Compliance's B-3 characterisation — "the
identical failure mode SR-011-4 was raised to prevent, arriving by the second route the chair predicted"
— is accurate, and I verified it does not merely follow from a design-doc reading but from the literal
`if` condition and literal Mongo filter shipped today.

**I withhold my own concurrence on this point until:**
- `updateStatusForPartnerOrg` sets `closedAt` on transition into `'closed'` **or** `'recovered'`
- `buildRetentionPurgeFilter` widens to `status: { $in: ['closed', 'recovered'] }`
- `police-report-retention.test.ts:197-207` is inverted (asserts a `recovered` case **is** matched and
  cleared once past cutoff), not silently left in place or deleted without a replacement assertion —
  deleting it without replacing it would remove the compensating control for a regression back to the
  current bug
- the full backend suite is re-run green after the change (I will re-verify this by execution, not by
  reading the diff)

This is `C-011-11`, already registered by `compliance-specialist` at §9.6, owner `backend-engineer` +
`database-architect`. I add nothing new to the requirement; I add independent confirmation that it is
real, exploitable-by-omission (not merely theoretical), and unfixed as of this review.

**RR-011-3 (stdout-only retention evidencing):** I confirm compliance's read — still not accepted,
still just named in a comment (`police-report-retention.ts:23-29`) as "the accepted interim control"
without an actual `cto`/`security-engineer`/`devops-engineer` sign-off or a `retention_job_runs`
collection. I do not block on this today (nothing has reached expiry yet — first candidates are ~5
years out per `POLICE_REPORT_RETENTION_YEARS = 5`), consistent with §7's original framing, but I record
that I have not accepted it either. It must be resolved before the first purge run, not discovered then.

### 10.3 SR-011-6 (Stage 8 manifest coverage / CI-1) — **PARTIALLY SATISFIED — backend done, mobile not done**

`node scripts/verify-stage8-manifest.mjs` (executed, not assumed): `PASS — all discovered surfaces are
manifest-covered` (72 backend routes, 50 mobile screens, 39 web dashboard routes; 77 manifest entries).
CI-1 is green. That green is only partially earned, and I traced why.

**Backend — genuinely fixed, matches the SR-011-6 requirement exactly.**
`docs/organization/gates/stage8-manifest.json:151-160` now carries a dedicated entry:
```
"id": "backend-recovery-police-report",
"pattern": "/recovery/cases/:caseId/police-report",
"feature": "011",
"doc": "docs/features/011-saps-case-reporting/security-review.md",
```
This is a new, specific entry pointing at *this* document, not absorbed into the pre-existing
`backend-recovery` (`/recovery/*`, waived, Feature 009 reason) entry the original review flagged as
the problem. **Confirmed fixed.**

**Mobile — not fixed. The exact failure mode the original review predicted is what happened.** I
traced where the police-report capture UI actually lives:
- `mobile/src/screens/recovery/PoliceReportSection.tsx` is the capture component, imported and rendered
  by `mobile/src/screens/recovery/LiveTrackingScreen.tsx:13,90`.
- That screen is mounted at `mobile/app/(app)/live-tracking/[caseId].tsx`.
- The manifest entry covering that path is `mobile-location`
  (`docs/organization/gates/stage8-manifest.json:267-275`): `"pattern":
  "(app)/{map,device-locations,live-tracking}*"`, `"feature": "008"`, `"waived": true`, `"reason":
  "INC-001 A-12 — gated via FEATURE_LOCATION_TRACKING"`, `"owner": "cybersecurity-architect"`.

There is **no** `mobile_route` / `mobile_route_group` entry anywhere in the manifest tagged
`"feature": "011"` (I grepped the full file for `"011"` and found only the backend route entry above
plus the `/events`/`/dau` collision compliance and the original review already flagged as `SH-1d`). The
police-report capture surface reached a shipping mobile build absorbed into a Feature 008 waiver written
for an unrelated reason (a location-tracking feature flag, not SAPS-data governance), exactly as §6 of
the original chair review predicted would happen if this were left undone: **CI-1 reports PASS with no
record anywhere that this specific surface was reviewed.**

I do not accept "it's inside an already-waived route group so it's covered" as satisfying SR-011-6.
The manifest's own `doc`/`reason` fields exist precisely so a reader can tell *why* a surface is
waived; today that reader is told the police-report screen is fine because location tracking is
pending a flag, which is true but is not why this screen needs review, and does not point at this
document at all.

**Required to close SR-011-6 on my limb:** an explicit `mobile_route` or `mobile_route_group` entry
(or a documented amendment to `mobile-location`'s reason/doc fields naming Feature 011 alongside
Feature 008) for the `(app)/live-tracking/[caseId]` screen, pointing at this document, before or in the
same commit as any further change to that screen. Owner `mobile-engineer` per the original register
(§8, SR-011-6).

**SH-1a/b/c/d (platform findings, not this feature's blocker):** re-confirmed as filed. `SH-1d`
specifically re-verified: `docs/organization/gates/stage8-manifest.json` lines 505 and 516 still tag
`/events` and `/dau` (Feature 004/analytics routes) with `"feature": "011"`, unrelated to and colliding
with this feature's own numbering. Still unfixed, still not a blocker on this gate, still owned by
`analytics-specialist`/`reporting-engineer`.

### 10.4 Audit-logging cross-check (§9.3's `privileged_data_access` citation)

I independently re-derived compliance's citation rather than trusting it. `support-lookup.ts` contains
exactly two `await ctx.auditLog.record({...})` calls, at **line 126** (the `GET /v1/customer-lookup`
handler, immediately before the `res.json(...)` that returns `recoveryCases` built from the
unprojected `listByAccount` result) and **line 214** (the `appendCallCentreNote` handler, immediately
before its `res.status(201).json(...)`). Both blocks set `eventType: 'privileged_data_access'` and
populate `accountId`, `actorAccountId`, `actorSessionId`, `auditRequestId`, `ipAddress`, `userAgent`.
Both run unconditionally on the success path (no branch skips the record call), and both run *before*
the response is written, so an audit-log failure that throws would (per this codebase's existing
`asyncHandler`/error-middleware convention, consistent with the rest of this route file) surface as a
5xx rather than a silent gap. **Confirmed: compliance's §9.1/§9.3 citation is accurate — the line
numbers, the event type, and the "recorded on both read paths" claim all check out against the running
code.**

### 10.5 What I confirm as satisfied vs what I withhold on

**Confirmed satisfied (independently verified by reading, execution, and one adversarial test):**
- SR-011-1a/b/c in full — repository projection at all four partner sites, merge-blocking golden-
  response tests present and passing, ESLint import boundary present, CI-wired, and confirmed to
  actually fail on a planted violation.
- SR-011-7 (customer-lookup exclusion) — standing, reconfirmed.
- SR-011-2 (accept-then-purge) — `retention_expired` rejection path present and exercised by tests
  (I did not re-derive this from scratch since compliance's §9.1 citation matched the code on
  inspection, and it is out of my three assigned scope items, but I did not find anything to contradict
  it while reading the surrounding file).
- SR-011-3's rate limiter — `POLICE_REPORT_PATCH_LIMIT` applied via `createRateLimiter` scoped per-
  account, distinct from `DEFAULT_AUTHENTICATED_LIMIT` (`recovery.ts:189-193`), consistent with what
  was required.
- Audit logging on both support-agent read paths to this data (§10.4).
- SR-011-6, backend half only.

**Withheld — real, unfixed gaps as of 2026-09-08:**
- **SR-011-4 / C-011-11 (retention clock on `recovered`)** — not implemented. Confirmed by code (the
  `if (status === 'closed')` guard, the `status: 'closed'` literal filter) and by an existing test that
  actively locks in the wrong behaviour. This is a real, unbounded-retention exposure on production
  data, not a documentation gap. I independently corroborate `compliance-specialist`'s B-3.
- **SR-011-6, mobile half** — no dedicated manifest entry for the police-report capture screen; it is
  silently absorbed by an unrelated Feature 008 waiver. CI-1 passes without ever having reviewed this
  specific surface, which is the exact governance gap this condition exists to close.
- **RR-011-3 (stdout-only retention evidencing)** — still not formally accepted by anyone with the
  authority the chair specified (`cto`) nor superseded by a `retention_job_runs` collection. Not
  blocking today; must be resolved before first purge run.

### 10.6 Verdict

**CONCURRENCE WITHHELD IN PART (C-011-11 / SR-011-4 unfixed; SR-011-6 mobile-side unfixed).**

SR-011-1 is fully and independently verified as satisfied, to a higher bar than a document read — I
broke it on purpose and watched it fail correctly. That is not in dispute and does not need a re-review
once the two items below close; I will re-confirm on a diff, as `compliance-specialist` proposed for
her own withheld items, not require a fresh full review cycle.

What is outstanding is narrow and concrete, not a design concern:
1. `closedAt` set on `'closed'` **or** `'recovered'`; purge filter widened to
   `status: { $in: ['closed', 'recovered'] }`; the locking test at
   `police-report-retention.test.ts:197-207` inverted; full suite re-run green. (`C-011-11`)
2. A `mobile_route`/`mobile_route_group` manifest entry (or an amended `mobile-location` entry naming
   Feature 011 and this document) for `(app)/live-tracking/[caseId]`, the screen that actually hosts
   `PoliceReportSection`. (`SR-011-6`, mobile limb)

Both are small, mechanical, and independent of the RoPA/CT-4/s18-notice items `compliance-specialist`
is separately carrying on her limb (B-1/B-2) — I take no position on those; they are not mine to rule
on. My concurrence and hers are both required for Stage 8 discharge and both remain withheld today, on
different grounds. **This gate is not discharged.**

**Filed by:** `security-engineer`, 2026-09-08.
**Does not discharge:** Stage 8 (SR-011-5 is now recorded but withheld on both the `compliance-specialist`
and `security-engineer` limbs) · Stage 10 QA · C-011-1 through C-011-12 · CT-1/CT-3/CT-4 · INC-001-C-10 ·
C-008-1/-5/-6/-8/-12 · D-011-01, which this section releases nothing on.
