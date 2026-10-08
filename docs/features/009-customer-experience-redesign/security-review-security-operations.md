# Feature 009 — Security Operations slice (Security Company Dashboard, pilot readiness) — Security Review (Stage 8)

**Status:** **CONDITIONAL SIGN-OFF (chair). APPROVED WITH REQUIRED CHANGES SR-009S-1 … SR-009S-7.**
**This slice is not pilot-ready.** No pilot partner operator may reach real customer data until SR-009S-1 … SR-009S-5
and SR-009S-7 are closed and re-verified, **and** the compliance-owned preconditions in §8 are closed.
**Date:** 2026-10-08
**Lifecycle stage:** 8 — Security Review (hard gate). **Chair / decision owner (A):** `cybersecurity-architect`.
**Joint gate status — INCOMPLETE:** `security-engineer` (R) concurrence **not yet recorded** · `compliance-specialist`
(C) concurrence **not yet recorded**. `compliance-review-security-partner-data-minimisation.md` is an *input* to this
gate. Its own §6 says compliance will not sign for a pilot with real data until every [PILOT] condition, CT-1, G-7 and
an executed agreement are in place. Per `02-feature-lifecycle.md` and root `CLAUDE.md`, **Stage 8 is discharged only
when all three roles sign. It is not discharged by this section.**

**Scope of this gate — exactly what was reviewed.** This is the Feature 009 "Security Operations" slice that `cto`
ruled on 2026-10-08 (action A-1) can be delivered separately from the rest of Feature 009's Stage 8 backlog,
provided every other Feature 009 surface stays flag-gated off (A-12). The code is merged to `main` in 4fc4119,
123d9e0, e8aea77 and 655f388:
- `GET /v1/security/cases`, `GET /v1/security/cases/:caseId`, `POST /v1/security/cases/:caseId/claim`,
  `PATCH /v1/security/cases/:caseId`. `GET /v1/security/cases/count` is in scope only to check that its population
  still matches the list (C-012-3). Its own gate stays Feature 012 §13/§14.
- The partner read/write repository paths in `recovery-cases.ts`, and the Trail B extension in `admin-access-log.ts`.
- Web `src/security/` case pages and client. Mobile security-case client and detail screen, as code only (see
  §7 on the mobile flag).
- PDM-5 (partner push), PDM-7 and PDM-9 (customer theft-report copy).

**Explicitly out of scope — no sign-off implied:** every other Feature 009 surface (home, alerts, map, live tracking,
hardware, KYC, report-theft *as a flag-enable decision*). Partner location access (08-qa §1, AUD-9 block unchanged).
Any lift of `EXPO_PUBLIC_FEATURE_SECURITY_OPERATOR` (§7). The `backend-security-cases` manifest waiver, which stays
in force until the joint gate completes. The dispatch-model choice (G-7). Retention of the new Trail B rows (ADR-0006
§18.6, `compliance-specialist`).

**Running code read for this review (2026-10-08, from the code itself, not the design docs):**
`backend/src/repositories/recovery-cases.ts` (full) · `backend/src/routes/security-cases.ts` (full) ·
`backend/src/repositories/admin-access-log.ts` (full) · `backend/src/db/feature004-collections.ts:227-502` ·
`backend/src/db/feature004-collections.test.ts` · `backend/src/db/recovery-collections.ts` (indexes) ·
`backend/src/lib/mongo-pagination.ts:70-78` · `backend/src/lib/recovery-notification-service.ts:18-165` ·
`backend/src/lib/notification-brand.ts:80-215` · `backend/src/lib/push-notification-service.ts` (variables path) ·
`backend/src/lib/recovery-case-notifications.ts` (fields consumed) · `backend/src/routes/security-cases.test.ts`
(test inventory + race test) · `backend/src/repositories/recovery-cases.test.ts` (fake-DB semantics, test inventory) ·
`src/security/api/cases.ts` · `src/security/pages/SecurityCasePages.tsx` · `mobile/src/api/security-cases.ts` ·
`mobile/src/screens/security/SecurityCaseDetailScreen.tsx` · `mobile/src/screens/recovery/ReportTheftConfirmScreen.tsx`
· `docs/organization/gates/stage8-manifest.json` (`backend-security-cases` entry) · ADR-0006 §18/§18.8.
**Not done:** I did not run the test suites or touch any live database. Every finding is from reading the code.
SR-009S-1 in particular is inferred from the declared validator and the bootstrap path. It was not seen failing
against Atlas. `security-engineer` should confirm it against the live catalog (`catalog-verify.ts`).

---

## 0. Verdict

**CONDITIONAL SIGN-OFF.** The minimisation design is sound and was implemented faithfully. Three things are
right and should be said plainly:

- **The offer tier is de-identified by construction, not by convention.** Unclaimed rows are fetched with
  `OFFER_TIER_FIELD_EXCLUSION_PROJECTION` (`recovery-cases.ts:217-224`), mapped field by field (no spread) into a
  type that has none of the withheld fields (`:259-266`, `:282-291`), and serialised by an explicit allowlist
  (`:325-334`). This also closes **SR-INC002B-S3**'s concrete exposure. Before this change, an unclaimed case's
  `lastLocation` was fetched for every org. It is now never fetched on the offer path (§6).
- **List, count and detail now share one visibility predicate** (`claimedCaseVisiblePredicate` /
  `unclaimedCaseVisiblePredicate`, `:371-389`), and the claim match clause uses the same unclaimed predicate
  (`:599`). F-4's detail-route drift is closed, and C-012-3 now covers the detail route as well.
- **`backend-engineer` found and fixed a real cross-tenant bug that no review had caught.** On page 2 and later,
  `{ ...predicate, ...mongoCursorFilter(cursor) }` let the cursor's `$or` overwrite the partner-visibility `$or`.
  Every paginated request after page 1 therefore dropped tenant scoping completely. `andFilters()` (`:438-443`) is
  the right fix. Its only weakness is that no test pins it (SR-009S-5).

**Seven required changes.** Two matter most:

- **SR-009S-1 — the Trail B validator rejects every row this slice writes.** `admin_access_log` is created and
  `collMod`-updated with `validationLevel: 'strict', validationAction: 'error'`. Its `$jsonSchema` still permits only
  `resourceType: ['policy','asset']` and `eventType: ['privileged_data_access','privileged_bulk_access']`
  (`feature004-collections.ts:240-241, 265, 301-340`). A unit test pins the old enum
  (`feature004-collections.test.ts:59-62`). Wherever bootstrap has run, every list, detail, claim and PATCH call will
  fail closed with a 5xx. Fail-closed means this is not a confidentiality defect, but the slice cannot run. Route tests
  use fake repositories, which is why the suite is green. §2.
- **SR-009S-3 — PDM-2 is met on the read paths but not on the write-path read-backs.** `claimForPartnerOrg` and
  `updateStatusForPartnerOrg` read back the case with only the police-report exclusion. That loads `lastLocation`
  (precise coordinates) and `callCentreNotes` into memory on a partner-operator request. The internal `closedAt`
  pre-read has **no projection at all** (`:699-702`). Nothing reaches the response today, but PDM-2 requires claimed
  rows to be excluded *structurally*. §3.

**The explicit ruling the CTO asked for — `accountId` kept in the fetch — is in §1. It is ACCEPTED as a recorded
deviation (DEV-009S-1), conditional on SR-009S-2 and on `compliance-specialist` concurrence.**

---

## 1. Ruling — `accountId` is fetched but not excluded in the tier projections (PDM-1 + PDM-2 together)

**Facts, verified in code.** Neither `OFFER_TIER_FIELD_EXCLUSION_PROJECTION` nor `CLAIMED_TIER_FIELD_EXCLUSION_PROJECTION`
excludes `accountId` (`recovery-cases.ts:217-238`), although PDM-2's literal list includes it. `accountId` is
returned *beside* `case` in `PartnerVisibleCaseResult` (`:416-418`), never inside it. It is used for exactly two
things: the Trail B `targetAccountId` (`security-cases.ts:95, 187, 243, 321`) and customer notification dispatch on
claim/PATCH (`recovery-case-notifications.ts:28-50`, which needs the customer's account to notify the customer). The
tier case types have no `accountId` field (`:259-280`). Both are built by explicit field mapping, so `tsc` rejects
any attempt to carry it across. Route regression tests assert it is absent on all five response paths
(`security-cases.test.ts:464-592`).

**Ruling: ACCEPTED as the correct implementation of PDM-1 and PDM-2 read together. Recorded as DEV-009S-1.**

Reasoning:

1. **PDM-2's query-level exclusion exists to stop egress.** Its stated rationale is SR-011-1a's "a field never
   fetched cannot be leaked", and the threat behind it is serializer drift. That reasoning applies to fields the
   server has *no* use for: `callCentreNotes`, `lastLocation`, police-report fields. It does not apply to a field the
   server *must* hold to meet a stronger obligation. `accountId` has two mandatory in-process consumers. One is the
   C-16(b)/§18.3 subject-keyed audit row, which is what lets a customer's POPIA s23 request answer "which partner
   organisations received anything about my case". The other is the customer's own claim/status notification.
2. **The alternatives are not safer.** (a) Excluding it from the fetch and then re-reading it by `_id` for the audit
   leaves the same value in the same process memory. It adds a second read and a TOCTOU window between what was
   disclosed and what was logged. (b) Writing offer-tier disclosure rows with `targetAccountId: null` and resolving
   the subject later through `resourceId` breaks R-1's invariant that every `privileged_data_access` row names a
   subject (`admin-access-log.ts:107-118`, and the validator's `$expr` branch). It also removes those rows from the
   subject-keyed index (`admin_access_log_targetAccountId_createdAt_partial`), so subject reconstruction would depend
   on `recovery_cases` never being deleted, permanently. I made that non-deletability a condition in §18.8(a)(2), but
   it is not something to stake an audit invariant on.
3. **Logging the subject for an offer-tier (de-identified) disclosure is correct, not over-recording.** The partner
   learned nothing that identifies the customer, but it did learn that *this customer's* case exists and was offered
   to it. That is the fact an s23 recipient question needs. Audit rows are internal and never partner-readable.
4. **What makes non-egress structural here:** (i) the type has no such field, (ii) each tier mapper copies named
   fields only, (iii) each serialiser is an allowlist, and (iv) `accountId` lives beside `case`, never in it. The
   remaining weak point is (iv): a future `res.json(result)` or `res.json(page.data)` instead of
   `serializePartnerCase(result)` would leak `accountId` and `createdAt`. Today's tests are *denylist* tests ("does
   not contain `accountId`"). A denylist catches the one field it names and nothing else that arrives the same way.
   **This ruling is conditional on SR-009S-2**, which replaces them with exact-key allowlist tests.

**Division of authority.** Compliance §3 says "cyber/security roles own *how*; I own *whether* it is satisfied". This
ruling is about *how*, and on that I have final say. Whether PDM-2 is satisfied is still a question for
`compliance-specialist`. Because their written field list says otherwise, their concurrence on DEV-009S-1 is required
and is part of the joint-gate signature. My recommendation to them is that PDM-2's outcome (no `accountId` reaches a
partner) is met, and that the list should be read as specifying egress, with this deviation noted.

**Residual risk RR-009S-2** (accepted, §8): on offer-tier requests, `accountId` is held in partner-request process
memory and is not fetched-and-discarded at the query layer. The exposure is limited to server-side code paths and
application logs. There is no evidence any logger serialises these results. A memory or log exposure here would
already be a server compromise, which is a bigger problem than this field.

---

## 2. SR-009S-1 (Required, blocks pilot and any deployment of 655f388) — `admin_access_log` validator rejects every Trail B row this slice writes

`adminAccessLogJsonSchemaValidator` (`feature004-collections.ts:301-328`) is applied with `strict`/`error`
(`:336-340`). Bootstrap applies it to an existing collection with `collMod` (`:463-474`). Measured against the rows
`admin-access-log.ts` now produces:

| Row produced | Validator outcome |
|---|---|
| `recordCaseBulkDisclosure` → `privileged_bulk_access`, `resourceType: 'recovery_case'` | **Rejected** — `resourceType` enum is `['policy','asset']` (`:265`) |
| `recordCaseBulkDisclosure` / `recordDetail` → `privileged_data_access`, `resourceType: 'recovery_case'` | **Rejected** — same enum |
| `recordStateChange` → `privileged_state_change` | **Rejected twice** — `eventType` enum (`:240-241`), and neither `$or` `$expr` branch matches (`:305-325`) |

The list handler writes a bulk row even for an empty page, so **every** partner list call fails. ADR-0006 §18.7 item 5
assigned this amendment to `database-architect`. It was not made, and `feature004-collections.test.ts:59-62` pins the
old enum. A suite of fakes cannot detect this. Only a real `mongod` with the validator applied can.

**Required:**
1. Add `'recovery_case'` to the `resourceType` enum and `'privileged_state_change'` to the `eventType` enum. Declare
   `fromStatus`/`toStatus` as `['string','null']`, using the `RecoveryCaseStatus` values as an enum.
2. Add a third `$expr` branch: `eventType == 'privileged_state_change'` AND `targetAccountId != null` AND
   `resourceId != null` AND `resultCount == null` AND `fromStatus != null` AND `toStatus != null`. Tighten the two
   existing branches to require `fromStatus`/`toStatus` null or absent. This mirrors `assertInvariants()`
   (`admin-access-log.ts:103-149`) exactly, so the database is a second, independent enforcement point and not a
   copy of the app.
3. Update `feature004-collections.test.ts` to match, and add one test that feeds each row shape the repository emits
   through the validator. Use an in-memory `mongod` or the `$jsonSchema` evaluator `security-engineer` prefers. The
   point is that drift between `admin-access-log.ts` and the validator must fail CI.
4. **Not acceptable as a fix:** switching to `validationAction: 'warn'`, lowering `validationLevel`, or removing the
   validator. Any of those turns an availability fault into a loss of R-1 integrity on every trail sharing the
   collection, including the Feature 004 admin reads.
5. Run `catalog-verify` against Atlas after bootstrap and attach the output to the re-verification.

## 3. SR-009S-3 (Required, blocks pilot) — write-path read-backs are not tier-projected (PDM-2, claimed rows)

PDM-2: "Claimed rows use the Tier 1 projection, which also excludes `accountId`, `callCentreNotes` and
`lastLocation`." On the read paths this holds (`:523`, `:624`). On the write paths it does not:

- `claimForPartnerOrg` `findOneAndUpdate` uses `projection: POLICE_REPORT_FIELD_EXCLUSION_PROJECTION` (`:601`).
- `updateStatusForPartnerOrg` `findOneAndUpdate` uses the same (`:715`).
- `updateStatusForPartnerOrg`'s internal `closedAt` pre-read has **no projection** (`:699-702`). It loads the
  police-report triple, `policeReportHistory`, `lastLocation` and `callCentreNotes` into a partner-operator request.
  This is the exact set SR-011-1a says must never be loaded on that path.

Both read-backs flow into `toCase()` and from there to `scheduleCustomerRecoveryCaseChange`. That function reads only
`accountId`, `assetId`, `id`, `referenceNumber` and status (`recovery-case-notifications.ts:28-50`), so the extra
fields are never used. Nothing reaches the response today, because `toClaimedTierView` is an allowlist. Still, this is
"by convention" at precisely the point PDM-2 was written to make "by construction".

**Required:** (a) use `CLAIMED_TIER_FIELD_EXCLUSION_PROJECTION` on both read-backs. `accountId` stays fetched under
DEV-009S-1. (b) Narrow the internal pre-read to `projection: { closedAt: 1 }`. (c) Extend the repository projection
tests so a claim and a terminal-transition PATCH against a fully populated document return rows with no
`lastLocation`, `callCentreNotes` or police-report keys. The fake DB already models projections
(`recovery-cases.test.ts:78-85`).

## 4. ADR-0006 §18.8 conformance — C-A through C-D, and the C-16(b) bulk shape

| Condition | Verified in code | Result |
|---|---|---|
| **C-A** compare-and-set on audited `fromStatus` | `updateStatusForPartnerOrg` gained `expectedStatus` and filters on `status: expectedStatus` (`recovery-cases.ts:659-716`). PATCH passes the pre-read's `existing.case.status` to both `recordStateChange` and the mutation (`security-cases.ts:309, 324, 336`). Claim audits literal `'open'` (`:246`), and `claimForPartnerOrg`'s match clause requires `status: 'open'` through `unclaimedCaseVisiblePredicate()` (`:599`) | **Met** |
| **§18.8(a)(1)** `resourceId` from the DB row, not `:caseId` | `r.case.id` (list `:95`), `result.case.id` (detail `:189`), `existing.case.id` (claim `:245`, PATCH `:323`). With write-before-mutate, the pre-read row *is* the DB row. The mutation's `_id` is the same ObjectId by construction | **Met** |
| **C-B** sequence | Pre-read → precondition (`!existing` or wrong tier → `NOT_FOUND`, no audit row: `:223-226`, `:305-308`) → `await recordStateChange` → CAS mutation → `null` → `NOT_FOUND` (`:256-263`, `:338-343`) → respond. The audit write is awaited inside `try`, so a throw goes to `next(err)` before the mutation line runs | **Met in code. No test proves the fail-closed half** — SR-009S-4 |
| **C-C** AUD-8 runbook entry and chain-check test | The CAS-miss test exists and is good (`security-cases.test.ts:886-933`: 404, case left at the post-race status, one state-change row with the pre-read `fromStatus`). **No runbook entry exists.** `privileged_state_change` appears nowhere in `docs/` outside ADR-0006 | **Partially met** — SR-009S-7 |
| **C-D** transaction triggers | None tripped. (i): the existing customer notification runs *after* a confirmed CAS hit and is not a second stored effect that can diverge from the audit chain, so it does **not** trip C-D(i). I record that interpretation so nobody has to guess. A future effect that must be atomic with the status change (location-share grant, claim link, payout) **does** trip it. (ii): the pilot is single-partner. (iii): no production chain check yet | **Not triggered.** Standing |
| **§18.3 / C-16(b)** per-case, not per-subject | `recordCaseBulkDisclosure` (`admin-access-log.ts:233-271`) maps `disclosedCases` one-to-one into `privileged_data_access` rows. No `Set`, no dedup, `resourceId` set per case, `resultCount = disclosedCases.length`. The route derives `disclosedCases` from `page.data` *after* `buildPage` trims the `limit + 1` look-ahead row (`security-cases.ts:86-96`), so the row that was fetched but not returned is correctly not logged. Test `:698-729` pins two rows for one subject with two cases | **Met** — one row per disclosed case, confirmed |
| **§18.3** detail 404 writes nothing | `security-cases.ts:176-181`; test `:761` | **Met** |
| **§18.2** extend, don't fork | Same collection, same join key, same fail-closed contract | **Met** (my §18.8 confirmation stands) |
| **§18.8(a)(2)** `recovery_cases` not deletable by the request path | No `deleteOne`/`deleteMany` in `recovery-cases.ts` | **Met** — standing |

**FU-A14 (PDM-8's note to me):** already ruled in ADR-0006 §18.8(a). It is closed for case-scoped partner access to
`recovery_cases` only, and the implementation honours all three conditions. Nothing further.

**Residual risk carried from §18.8 (RR-009S-1):** two identical concurrent transitions produce two rows and only one
applies. One new observation: in a **cross-org claim race**, rows can be written in the opposite order from the
mutations. C-C's "next row's `fromStatus`" rule can then attribute the applied claim to the losing org's row, and
`admin_access_log` rows carry no partner-organisation field to resolve that. With one partner this cannot happen.
It is the same exposure C-D(ii) already ends by making transactions mandatory before a second partner onboards.
Advisory A-3 makes it resolvable sooner.

## 5. SR-009S-4, SR-009S-5 (Required, blocks pilot) — two missing tests that protect the two most important properties

- **SR-009S-4 — C-B fail-closed for decisions.** Add one test each for claim and PATCH: `recordStateChange` throws,
  the response is 5xx, the repository mutation is **never called**, and the case document is unchanged. C-B is the
  only thing that makes write-before-mutate acceptable instead of transactions. It needs a test, not just a code
  comment.
- **SR-009S-5 — cross-tenant pagination regression.** Every `listForPartnerOrg` test passes `cursor: null`
  (`recovery-cases.test.ts:214, 519, 624, 657, 677, 697`). The bug 655f388 fixed only shows up when a cursor is
  present. Required: seed org-B's claimed cases and a closed-beyond-window org-A case, all older than an org-A
  cursor. Call with that cursor and assert none come back, for both branches and with and without a `status` filter.
  The fake already implements `$and` (`:68-70`). **Advisory A-6:** `mongoCursorFilter` returns a top-level `$or`
  meant to be spread into other filters, which invites this bug again. The other current spread call sites
  (`alerts.ts:135`, `support-cases.ts:235`, `policies.ts:138/158`, `assets.ts:137/169`, `customer-profiles.ts:261`,
  `recovery-cases.ts:488`) do not collide today. Route all of them through `andFilters` or equivalent so the next one
  cannot collide either.

## 6. SR-009S-6 (Required for PDM-4 discharge — [S8]; pilot-blocking only on PDM-4's own terms) — the wrap-up window can be bypassed by a status regression

`updateStatusSchema` accepts any of `investigating|tracking|recovered|closed` from any claimed status
(`security-cases.ts:40-42`), and no transition map exists. Within 90 days of closure, an operator can PATCH a
`closed`/`recovered` case back to `investigating`. `claimedCaseVisiblePredicate`'s first branch
(`status ∉ {recovered, closed}`, `recovery-cases.ts:375`) then keeps the case visible to that org **indefinitely**.
`closedAt` is not reset (`:703`). The case also leaves the Feature 011 police-report purge, whose filter keys on
`status: 'closed'`, and the customer receives a "case updated" notification for a case they were told was closed.
Both UIs offer the reopen buttons (`SecurityCasePages.tsx:212`, `SecurityCaseDetailScreen.tsx:233`).

**Required (backend-architect chooses, I prefer (a)):** (a) a forward-only transition map, with re-opening a terminal
case reserved to an admin path that does not exist yet. Or (b) key the wrap-up window on `closedAt` regardless of
current status (`closedAt: null OR closedAt > cutoff`). (b) closes the visibility bypass but not the purge or customer
effects, which is why I prefer (a). Hide terminal-regressing actions in both UIs in either case. Tag follows PDM-4: it
blocks the pilot only if the pilot runs past 90 days after its first closure.

## 7. Customer copy, push, clients, and the mobile flag

- **PDM-5 — met.** The partner push body is the asset category enum plus the reference (`notification-brand.ts:188-213`).
  `data` carries only `event`, `brand`, `logoUrl`, `caseId`, `referenceNumber`, `deepLink`. `assetName` is not passed
  (`recovery-notification-service.ts:153-164`). **Advisory A-1:** `assetId` is still passed in `variables` and then
  dropped by the template. Remove it from the call so a future template edit cannot pick it up.
- **PDM-7 — met.** The hint no longer asks for a police case number, keeps the "no other people's details" line, and
  points to the dedicated police-report flow (`ReportTheftConfirmScreen.tsx:157`), with a regression test. No web
  theft form carries the old copy (grep of `src/`).
- **PDM-9 — in-app copy met, verbatim, shown before submit** (`:161-166`). I checked it against what is built: the
  offer tier carries no name or contact details and the claiming partner gets `notes`. The copy is accurate. The
  category-level privacy-notice update is **not verified**. I found no privacy-notice change in `src/`. That is for
  `compliance-specialist`/`technical-writer` to confirm.
- **PDM-1 clients — met.** `accountId` is gone from both client types and both detail UIs, with tests
  (`SecurityCasePages.test.tsx:38-50` uses `@ts-expect-error`, which is the right approach). **Advisory A-5
  (functional, not security):** both client types still declare `assetId: string` as required, but offer-tier rows
  omit it. The web list renders `"undefined…"` (`SecurityCasePages.tsx:83`). Make it optional and render a tier-aware
  placeholder.
- **Mobile operator flag — unchanged by this review.** The `backend-security-cases` manifest conditions stay:
  `EXPO_PUBLIC_FEATURE_SECURITY_OPERATOR` remains `"false"` in every non-development profile, and **SR-INC002B-S1**
  (tester-roster negative) and **SR-INC002B-S2** (executed agreement) remain BLOCKING. **SR-INC002B-S3 is discharged
  by construction:** the offer tier no longer fetches `lastLocation`/`lastLocationAt`, and the open-pool property is
  now a de-identified offer that compliance ruled lawful (§2.3). That discharge takes effect once SR-009S-1 lets the
  route actually run. R-INC002B-1 (operator portal as a separate build identity) stands as the durable recommendation.
  If the pilot runs on Client-provisioned field tablets (I-7), that is the build it should use.

## 8. Conditions register and residual risk

| ID | Condition | Owner | Blocks |
|---|---|---|---|
| **SR-009S-1** | Amend the `admin_access_log` validator and its test for `recovery_case` / `privileged_state_change` (§2). Do not relax `validationAction` | `database-architect` + `backend-engineer`; `security-engineer` verifies on Atlas | **Pilot; any deploy of 655f388** |
| **SR-009S-2** | Exact-key allowlist (golden) response tests for each tier on list, detail, claim, PATCH. Condition of DEV-009S-1 | `backend-engineer` | **Pilot** |
| **SR-009S-3** | Tier-1 projection on the claim/PATCH read-backs; `{closedAt:1}` on the internal pre-read; tests (§3) | `backend-engineer` | **Pilot** |
| **SR-009S-4** | C-B fail-closed tests for claim and PATCH (§5) | `backend-engineer` | **Pilot** |
| **SR-009S-5** | Cross-tenant cursor-pagination regression test (§5) | `backend-engineer` | **Pilot** |
| **SR-009S-6** | No terminal-status regression; UIs hide those actions (§6) | `backend-architect` + `backend-engineer` + web/mobile | [S8], PDM-4 discharge |
| **SR-009S-7** | C-C runbook entry (applied-iff rule, chain-check query) and an index on `{resourceType, resourceId, createdAt}` so the check is not a collection scan | `security-engineer` + `database-architect` | **Pilot** |
| DEV-009S-1 | `accountId` fetched, excluded at type and serialiser boundary (§1) | — | Needs `compliance-specialist` concurrence |
| A-1 … A-6 | Advisories: drop `assetId` from push vars (A-1). Before the pilot, count `status ∈ {recovered,closed} AND closedAt == null` — that population stays visible forever under the `closedAt: null` branch, and the count must be 0 or backfilled (A-2). Add actor `partnerOrganizationId` to state-change rows (A-3). Reject no-op `from == to` PATCHes (A-4). Client `assetId` optional (A-5). Make `mongoCursorFilter` safe to combine (A-6) | various | Non-blocking |

**Compliance-owned preconditions, unchanged by this review and blocking any pilot with real data:** PDM-6 (no
partner registry in code, and no recorded manual single-org equivalent found) · CT-1 in required form · G-7 ·
executed s21 partner agreement · ADR-0006 §18.6 retention ruling for recovery-case disclosure and decision rows.
There is no purge job on `admin_access_log` in code today, so nothing is silently inheriting 12 months yet.

| Residual risk | Disposition |
|---|---|
| **RR-009S-1** Concurrent identical transitions are indistinguishable in the chain. With 2+ partners this extends to cross-org claim-race misattribution (§4) | **Accepted for single-partner pilot only** (carried from §18.8). Ends at C-D(ii) |
| **RR-009S-2** `accountId` in partner-request memory on the offer tier (DEV-009S-1) | **Accepted**, conditional on SR-009S-2 |
| **RR-009S-3** Wrap-up boundary not re-checked inside the CAS filter (seconds-wide window at day 90) | **Accepted** — negligible |
| **RR-009S-4** RR-012-1 cross-tenant pool *count* signal | Unchanged. Governed by Feature 012 §9/§11 |
| **RR-009S-5** Post-claim `notes` is customer free text and may still carry third-party data despite the hint | Compliance-accepted (§3). s57(1)(b) counsel question open |

**Manifest:** I have **not** edited `stage8-manifest.json`. `backend-security-cases` correctly stays `waived` until
the joint gate completes. On completion, replace the waiver with
`{ "doc": "docs/features/009-customer-experience-redesign/security-review-security-operations.md", "verdict": "conditional-sign-off" }`,
carrying SR-INC002B-S1/S2 forward as conditions.

**Re-verification:** when SR-009S-1 … -5 and -7 land, I re-read `admin-access-log.ts`, the validator, the two
read-backs and the new tests. That is a scoped re-verification, not a fresh review, unless the diff touches a tier
type, a serialiser, or a visibility predicate.

**Signed (chair):** `cybersecurity-architect`, 2026-10-08. Awaiting `security-engineer` (R) and `compliance-specialist` (C).
