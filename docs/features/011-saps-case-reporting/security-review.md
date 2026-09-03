# Feature 011 (Idea 1) — Security Review (Stage 8)

**Status:** **CONDITIONAL SIGN-OFF — APPROVED WITH REQUIRED CHANGES (SR-011-1 … SR-011-7).**
Development (Stage 9) may begin. **No entry into any environment holding real customer data** until
SR-011-1, SR-011-4 and SR-011-6 are closed and re-verified.
**Date:** 2026-09-03
**Lifecycle stage:** 8 — Security Review (hard gate). **Chair / decision owner (A):** `cybersecurity-architect`.
**Joint gate status — INCOMPLETE:** `security-engineer` (R) concurrence **not given** (not requested at time of
writing) · `compliance-specialist` (C) has ruled on the data-class limb
([`compliance-review-saps-case-data.md`](./compliance-review-saps-case-data.md)) but that document is explicit at
§10 that it **does not discharge Stage 8**. Per `02-feature-lifecycle.md` and root `CLAUDE.md`, **Stage 8 is
discharged only when all three roles sign.** This document is one of three signatures. It is not, on its own, a
cleared gate.

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
