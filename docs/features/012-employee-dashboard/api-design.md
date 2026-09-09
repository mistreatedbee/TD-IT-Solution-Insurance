# Feature 012 — Employee Dashboard (FR-4 operational counts)
## API Design — Stage 7 (sizing only — three small additions, not a system redesign)

**Lifecycle stage:** 7 — API Design, per [`02-feature-lifecycle.md`](../../organization/02-feature-lifecycle.md),
triggered early (out of the normal Stage 2→4→5→6→7 sequence) per `business-requirements.md` §9's own
"Stage 6/7 only if FR-4's per-role counts need new backend aggregate endpoints rather than reusing existing list
responses" — they do, per `cybersecurity-architect`'s Stage 5 findings F-012-1/F-012-2 (`business-requirements.md`
§10). This document is the sizing that finding asked for. It does **not** re-open FR-1/FR-2/FR-3, Option A/B, or
any of §6's other flags — scope is FR-4's three counts only.
**Author:** `backend-architect`
**Status:** Draft — sized for Stage 8 (`cybersecurity-architect`/`security-engineer`) review before any Stage 9
implementation. No route file changes exist yet under `backend/src/routes/` for any of the three endpoints below.
**Formalizes:** `business-requirements.md` §10 (F-012-1 — bulk-disclosure audit events fired by reusing list
endpoints purely to get a number; F-012-2 — a page-derived count silently caps at the page limit) and §9's
C-012-A1 (role-specific data injected per tree, not branched inside a shared component — this document's
per-role, per-tree endpoint design is what C-012-A1's injected `count` prop will call).
**Reads on:** `backend/src/routes/security-cases.ts`, `backend/src/routes/admin-verification.ts`,
`backend/src/routes/support-cases.ts`, `backend/src/repositories/recovery-cases.ts`,
`backend/src/repositories/customer-profiles.ts`, `backend/src/repositories/support-cases.ts`,
`backend/src/repositories/policies.ts` (`countByAccount` — existing `countDocuments()` precedent),
`backend/src/repositories/assets.ts` (same), `backend/src/lib/policy.ts` (rate-limit tiers).

---

## 1. Problem restated (F-012-1 / F-012-2)

FR-4 needs three numbers, not three lists:

| Role | Count needed | List endpoint it was assumed to reuse |
|---|---|---|
| `admin` | pending verifications | `GET /v1/admin/verification-requests` |
| `security_company_operator` | open/unassigned cases | `GET /v1/security/cases?status=open` |
| `support_agent` | "my cases" open | `GET /v1/support-cases?scope=mine&status=open` |

All three list endpoints return `CursorPage`-shaped rows, not a total. Two of them
(`admin-verification.ts:62–69`, `support-cases.ts:213–222`) call `ctx.auditLog.recordBulkDisclosure()` per row on
every call — firing that on every dashboard landing/refresh would attach real disclosure records to staff who
never looked at any subject's data (F-012-1), and even ignoring the audit concern, capping a "count" at the
page's `limit` silently understates any backlog bigger than one page (F-012-2, e.g. a 60-item queue rendering
"50" against a `limit: 50` page — `src/admin/pages/AdminVerificationPages.tsx:21`).

**Design principle carried through all three below:** a true `countDocuments()`/aggregate count that returns a
bare number and zero subject rows, scoped by the *identical* filter the sibling list endpoint already uses. This
resolves F-012-2 by construction (no page-size ceiling exists in a `countDocuments()` result) and resolves
F-012-1 wherever the underlying disclosure concern actually applies (details per-endpoint below — it does not
apply identically to all three, and one case needs a flag rather than a unilateral call).

---

## 2. Pattern decision — three sibling `/count` routes, not a generic `?countOnly=` flag

**Decision: one shared *convention* (a sibling `GET .../count` route next to each existing list route, same auth
middleware chain, same filter schema minus pagination params), implemented as three small, independent
additions — not a single generic `?countOnly=true` querystring flag bolted onto the three existing list routes.**

Checked for precedent first, per the task's instruction not to invent a new pattern casually:

- **No existing count-only *route* exists anywhere in `backend/src/routes/`.** This is a genuinely new surface,
  not a documented-and-reused convention being extended.
- **A `countDocuments()`-backed repository method *is* an existing, established pattern** —
  `policies.ts:191–193` (`countByAccount`), `assets.ts:156` (same), `plan-catalog.ts:157` — but in every existing
  case it's a **separate named repository method**, called internally by another route/service
  (`support-lookup.ts:113`, `customer-lifecycle-notifications.ts:23`), never exposed as a flag on the
  corresponding list method or list route. There is no existing `listX(..., { countOnly })` shape to extend.

Given that, a sibling route is the better fit than a flag, for three reasons specific to this codebase:

1. **Each existing list route already carries its own named Stage 8 sign-off tied to its exact current
   behavior** (e.g. `support-cases.ts`'s header comments cite SR-010-1a/b, SR-010-2 line-by-line). Adding a
   conditional branch inside an already-signed-off route (`if (countOnly) {...} else {...}`) reopens that
   route's reviewed surface for a new code path threaded through the same handler. A new, small, separate route
   is a self-contained new surface with its own narrow review — cheaper to review and cheaper to reason about
   later.
2. **It matches C-012-A1's own reasoning** (`business-requirements.md` §9.2): that condition prefers structural
   separation over runtime branching specifically so a future edit can't regress a security property past a
   test. The same logic applies here — a `countOnly` flag is exactly the kind of runtime conditional that could
   one day silently start returning rows again (e.g. someone "fixes" the count to also return a preview list and
   forgets to gate it on the flag); a route that only ever calls a `countDocuments()`-returning repository method
   cannot regress that way, because there is no code path in that handler that touches row data at all.
3. **Rate limiting stays honest.** Each list route has its own tuned rate-limit tier (`AUDIT_LOG_READ_LIMIT` for
   admin verification, `DEFAULT_AUTHENTICATED_LIMIT` for security cases, a bespoke 30/60s for support-cases).
   Counts are cheap and safe to call more often (e.g. on every Home-screen mount) than the list pages they sit
   next to; a shared route can be given its own, more permissive limiter without touching the list route's
   existing tier.

The three additions below are therefore intentionally near-identical in shape (same URL suffix, same response
envelope, same "reuse the list route's own filter/scope logic verbatim" rule) — a *convention*, just not a single
shared code path.

---

## 3. `security_company_operator` — open/unassigned case count

**New route:** `GET /v1/security/cases/count`
**Query:** identical `listFiltersSchema` as the existing list route (`status` optional, same enum) —
`?status=open` for the FR-4 use case, but the endpoint isn't hardcoded to `open` so it stays reusable for S-1
(`business-requirements.md` §4.2's "case queue filters/status breakdown" backlog idea) without a second new
route later.
**Auth:** identical chain to the existing list route — `authenticate` →
`requireUserType('security_company_operator')` → `requirePartnerOrg` — copied verbatim, not reduced, since a
count is still partner-org-scoped data.
**Rate limit:** `DEFAULT_AUTHENTICATED_LIMIT` (100/min), same tier as the list route today — no new tier needed;
counts are cheaper than the list query they mirror (no `.project()`, no serialization of every field), so the
existing tier has headroom, not less.
**Response:** `{ "data": { "count": number } }`.
**Repository change** (`backend/src/repositories/recovery-cases.ts`): extract the query-building logic already
inline in `listForPartnerOrg` (lines 246–254: the `$or` partner/unassigned-open clause + optional `status`
filter) into a shared `buildPartnerOrgQuery(partnerOrganizationId, filters)` helper, used by both
`listForPartnerOrg` (unchanged behavior) and a new `countForPartnerOrg(partnerOrganizationId, filters)`:

```ts
async countForPartnerOrg(
  partnerOrganizationId: string,
  filters: { status?: RecoveryCaseStatus },
): Promise<number> {
  return collection().countDocuments(buildPartnerOrgQuery(partnerOrganizationId, filters));
}
```

Extracting the shared query builder (rather than writing the count's filter by hand a second time) is the actual
fix for AC-5 ("the glance number must match what the operator sees by navigating to the full page") — a
hand-duplicated filter is exactly the kind of thing that drifts out of sync with the list route over one future
edit to either side.

**Audit event:** none. Confirmed against `cybersecurity-architect`'s Stage 5 finding — the existing
`GET /security/cases` list route emits no `recordBulkDisclosure()` call today (recovery-case rows aren't routed
through that audit path the way customer-profile/support-case rows are), so a count derived from the same
collection with no row data returned introduces nothing new to decide here. This is the "cheap case" the Stage 5
review already named.

---

## 4. `admin` — pending verification count

**New route:** `GET /v1/admin/verification-requests/count`
**Query:** none needed for v1 (status is fixed to `pending_review`, matching the only status FR-4 asks for);
if a future need arises to count other statuses, add a `status` query param then, not now.
**Auth:** identical chain to the existing list route — `authenticate` → `requireUserType('admin')` — copied
verbatim.
**Rate limit:** proposing `DEFAULT_AUTHENTICATED_LIMIT` (100/min) rather than reusing the list route's
`AUDIT_LOG_READ_LIMIT` (60/min) — that tier was sized for *audit-log reads*, which this isn't; a bare count has
no PII payload to bound. Open to `security-engineer` overriding this at Stage 8 if there's a reason to keep it
tighter, but the difference is small enough that this is a minor, easily-revised choice, not load-bearing.
**Response:** `{ "data": { "count": number } }`.
**Repository change** (`backend/src/repositories/customer-profiles.ts`): new method alongside
`listByVerificationStatus`:

```ts
async countByVerificationStatus(status: VerificationStatus): Promise<number> {
  return col.countDocuments({ verificationStatus: status });
}
```

Trivial — `listByVerificationStatus`'s query (`{ verificationStatus: status, ...mongoCursorFilter(cursor) }`)
with the cursor clause dropped, same as the security-cases case above but with nothing to extract into a shared
helper since the base filter is a single field.

### 4.1 The audit-event question — flagged, not decided here

`admin-verification.ts:62–69` calls `recordBulkDisclosure()` on the *list* route because it returns real
customer PII per row (email, name, phone, masked ID — lines 46–59). This new count route returns **zero subject
rows and zero subject identifiers** — no `accountId`, no name, no anything about any individual pending-review
customer. On its face, `recordBulkDisclosure()`'s own semantics (a record of *which* subjects' data was
disclosed, to whom) don't apply to a request that discloses no subject's data at all, so the design above assumes
**no audit event is required** for this endpoint — consistent with how the security-cases count in §3 needs
none, and how `countByAccount` (`policies.ts`, `assets.ts`) — the codebase's one existing count-only precedent —
has never itself been wrapped in an audit call anywhere it's used today.

**This is flagged, not finalized, per the task's own instruction.** The one thing that gives me pause is that
this endpoint still tells the caller *something* true and real-time about customer records in aggregate ("N
customers are currently pending review") — not PII, but not nothing either, and this session's own pattern
(Feature 010/011: "small-looking surfaces carrying real compliance weight") is exactly the kind of thing that's
worth a five-minute `compliance-specialist` confirmation rather than an architect's assumption, especially since
POPIA's disclosure concept is `compliance-specialist`'s call to interpret, not `backend-architect`'s. **Recommend:
`compliance-specialist` sanity-check before Stage 9 implementation** — either (a) confirm a bare aggregate count
with no subject identifiers is not a "disclosure" under the platform's POPIA framework and needs no audit event,
or (b) if they'd rather it be logged for completeness, specify a lighter audit shape than
`recordBulkDisclosure()` (e.g. a single `privileged_bulk_access`-style row with no `disclosedAccountIds`, if
`auditLog` already supports emitting that without a subject list — needs checking against
`backend/src/lib/audit-log.ts`/whatever module owns `recordBulkDisclosure` before assuming the shape exists).
This document does not block Stage 7 sign-off on this — the *endpoint contract* (route, auth, response shape) is
final regardless of the answer; only "does the handler also call an audit function" is open.

---

## 5. `support_agent` — "my cases" open count

**New route:** `GET /v1/support-cases/count`
**Query:** same scope-locked schema discipline as the existing list route — `scope` required, `z.literal('mine')`
only, `scope=all` (and everything else) rejected with `VALIDATION_ERROR`, exactly mirroring SR-010-2's existing
enforcement on the list route. Optional `status`/`category`/`accountId` filters, same as `listMine`'s filter
shape, dropped from the query only if unused (`status=open` is what FR-4 needs; leaving the others available
costs nothing and matches C-1's own backlog idea of a fuller "my cases" summary later).
**Auth:** identical chain — `authenticate` → `requireUserType('support_agent')` — copied verbatim.
**Rate limit:** reuse the existing bespoke 30/60s support-cases limiter (`support-cases.ts:101–105`) rather than
inventing a new tier — no reason to diverge here, this route is cheap and the existing tier already has headroom
for one extra call per landing.
**Response:** `{ "data": { "count": number } }`.
**Repository change** (`backend/src/repositories/support-cases.ts`): new method mirroring `listMine`'s query
exactly (lines 224–243), same drop-the-cursor-keep-the-rest treatment as §3/§4:

```ts
async countMine(
  agentAccountId: string,
  filters: { status?: SupportCaseStatus; category?: string; accountId?: string },
): Promise<number> {
  return collection().countDocuments({
    createdByAgentAccountId: agentAccountId,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.accountId ? { accountId: filters.accountId } : {}),
  });
}
```

(If `listMine`'s query object ever grows beyond this, extract a shared query builder the same way §3 does for
`recovery-cases.ts` — not needed yet since the current query is short enough that hand-mirroring is low-risk, but
noted so a future editor keeps the two in sync rather than letting them drift.)

### 5.1 Does F-012-1 apply here? — yes, same as admin, not weaker

The task brief asks whether `scope=mine`'s existing exclusion of "broader PII disclosure concerns" (per its own
scoping design) means F-012-1 doesn't really apply to this endpoint. **It does still apply, at the same
strength as §4, not a lesser one.** `scope=mine` scopes *which agent's* cases are visible (this agent can't see
another agent's cases) — it says nothing about whether the cases returned belong to *customers*, and they do:
`support-cases.ts:213–222`'s `recordBulkDisclosure()` call fires on the subject **customers'** `accountId`s
(`row.accountId`, i.e. the customer the case is about), not the agent's own account. An agent calling
`scope=mine` today still causes `recordBulkDisclosure()` to fire once per distinct customer whose case appears on
that agent's page. So F-012-1's concern — a Home-screen landing silently generating disclosure records for
customers nobody actually looked at — is exactly as present here as in the admin case. **This endpoint needs the
same "count, not rows" treatment as the other two, for the same reason**, and unlike §4 there's no ambiguity to
flag: this count returns no `accountId` of any kind (customer or agent), so `recordBulkDisclosure()` plainly does
not apply, no compliance check needed — the audit event exists on the list route specifically *because* it
returns subject rows, and this route structurally cannot.

---

## 6. F-012-2 — resolved by construction, not by policy

All three designs above use `countDocuments()` (or an aggregate-equivalent) directly against the same filtered
query the sibling list route uses, with **no `limit`/pagination applied anywhere in the count path**. There is no
page-size ceiling for a value derived this way to silently cap against — F-012-2 doesn't need a separate fix
because the whole point of not reusing `buildPage(rows, limit)` is that a `countDocuments()` result is already a
true total. AC-5 ("the glance number must match what the operator sees by navigating to the full page and
counting") holds structurally for the same reason §3's shared-query-builder point does: as long as the count's
filter and the list route's filter are built from the same source (a shared helper where one exists, or a
faithful line-by-line mirror where the query is small enough that a helper is overkill), the two numbers cannot
diverge except by drifting apart in a future edit — which is a code-review/test discipline concern for
Stage 9/10, not an architectural gap in this design.

**Test note for `automation-qa-engineer`/`qa-architect` at Stage 10:** AC-5 should be tested by seeding **more
rows than one page's `limit`** for at least one of the three roles (e.g. 60 pending-verification profiles against
the admin queue's `limit: 50`) and asserting the count endpoint returns the true total, not the capped page
size — this is the specific regression F-012-2 named and a test that only seeds ≤ `limit` rows would not catch
it.

---

## 7. Summary table

| Role | New route | Repo method | New collection field/index? | Audit event | Rate limit |
|---|---|---|---|---|---|
| `security_company_operator` | `GET /v1/security/cases/count` | `countForPartnerOrg()` (new, `recovery-cases.ts`) | No — same fields/index as existing list query | None (list route already emits none) | `DEFAULT_AUTHENTICATED_LIMIT` |
| `admin` | `GET /v1/admin/verification-requests/count` | `countByVerificationStatus()` (new, `customer-profiles.ts`) | No | **Flagged — `compliance-specialist` to confirm none needed before Stage 9** | `DEFAULT_AUTHENTICATED_LIMIT` (proposed) |
| `support_agent` | `GET /v1/support-cases/count` | `countMine()` (new, `support-cases.ts`) | No | None (route returns no subject identifiers) | existing support-cases 30/60s tier |

No new MongoDB indexes are required for any of the three — each `countDocuments()` call reuses the exact filter
shape the sibling list query already runs (and therefore the same index, if any, that query already relies on);
confirm this assumption holds at Stage 9 with `database-architect`/`backend-engineer` by checking `EXPLAIN` on
each new count query against the existing indexes named in `docs/features/010-.../database-design.md` and
`011-.../database-design.md`, rather than assuming no `COLLSCAN` — proportionate at v1 volumes (this session's own
north-star doc notes 0 DAU pre-launch) but worth a one-line confirmation, not a new index migration, unless that
check says otherwise.

---

## 8. What this document does not do

- Does not design FR-1/FR-2/FR-3 (already zero-new-backend per `cybersecurity-architect`'s Stage 5 confirmation).
- Does not revisit Option A vs. Option B (§2/§9 of `business-requirements.md`, both closed).
- Does not decide the §4.1 audit-event question — explicitly left open for `compliance-specialist`.
- Does not size any of the §4 backlog ideas (verification-queue aging, plan-history, case-queue filters/S-1,
  recent-lookups/C-2) — those are each their own future Stage 1 items per `business-requirements.md` §4's own
  framing, not folded into this sizing just because S-1 happens to reuse the same route family as §3 above.

**Next lifecycle step:** this document → `compliance-specialist` resolves §4.1 (**resolved — see §9**) → Stage 8
(`cybersecurity-architect`/`security-engineer`) reviews all three new routes as new API surface (per Stage 5
confirmation's own condition (b): "any new endpoint created for FR-4 ... needs its own authZ review at Stage
7/8, even though the data is already-authorized") → Stage 9 implementation, gated on both.

---

## 9. `compliance-specialist` ruling on §4.1 — the count-only audit-event question

**Author:** `compliance-specialist` · **Date:** 2026-09-09 · **Scope:** §4.1 only — whether
`GET /v1/admin/verification-requests/count` needs an audit event, and if so what shape. This section
does not reopen anything else in this document or in Feature 012, and is not a Stage 8 sign-off.

### 9.0 Ruling, stated up front

**An audit event is required — but not `recordBulkDisclosure()`'s per-subject disclosure rows.**

> `GET /v1/admin/verification-requests/count` writes **exactly one** call-scoped
> `privileged_bulk_access` row with `resultCount: 0` and **zero** `privileged_data_access` rows.

Emitting a `privileged_data_access` row for this endpoint is **prohibited**, for the same reason
backend-architect suspected: it is a disclosure record, and nothing is disclosed. Emitting *nothing*
is also wrong, for a reason that is not about disclosure at all. Both halves are grounded below.

The lighter-weight shape §4.1 asked about **already exists and is already tested** — no new event
type, no new writer, no schema change. See §9.4.

### 9.1 Regulatory regime — confirmed, not inherited

**POPIA is the operative regime for this endpoint**, per the standing platform determination
(`compliance-review-supabase.md` §"Governing framework"; ADR-0006 §14.1, which ratified POPIA for
both audit trails rather than letting it stand as an assumption). **GDPR: not applicable today**
(forward hedge unchanged). **PCI-DSS: out of scope** — no payment data is touched by this endpoint or
by `app.account_audit_log`. **Insurance-regulatory (FAIS / Insurance Act):** no recordkeeping floor
attaches to privileged-access telemetry — ADR-0006 §14.2.2 already ruled a *read* is not a record of a
financial service rendered, and that ruling covers this row too. Nothing about a count changes any of
those four determinations, so no re-scoping is triggered.

### 9.2 Half one — no disclosure event, because nothing is disclosed

POPIA's operative concept is *personal information*: information relating to an **identifiable**
person. A bare integer with no subject identifiers relates to no identifiable person. It follows
that:

- **s23 (subject access, "who has had access to my information")** has nothing to answer for here.
  There is no customer X about whom a truthful answer would include this request. Writing a
  `privileged_data_access` row anyway would put a *false positive* into the one query s23 and
  incident response depend on.
- **s22 (breach notification)** is unaffected. ADR-0006 §14.4.1 rates the bulk-no-subject gap as a
  live s22 *incapacity* — "we cannot determine who was affected, so we cannot notify them." That
  incapacity arises when a call **discloses** subjects and records none. This call discloses none, so
  there is no affected-subject set that the trail fails to capture. F-012-1 is therefore genuinely
  resolved by the count endpoint, not merely relocated.
- **The trail-pollution argument is not cosmetic.** ADR-0006 AUD-8 already documents one live
  false-positive class (`POST /v1/invitations` emitting `privileged_data_access` for a
  privilege-*granting* action) and treats it as a defect serious enough to route to
  `backend-architect` — R-2 subsequently gave it its own `privilege_granted` event type
  (`backend/src/repositories/audit-log.ts:54`, migrations/032). Manufacturing a second false-positive
  class immediately after the platform paid to remove the first would be a regression, not caution.
  **A disclosure record that records no disclosure makes the trail less evidential, not more.**

`recordBulkDisclosure({ disclosedAccountIds: [...] })` with real ids is therefore **not** to be used
here under any circumstances, and no per-subject row may be synthesised.

### 9.3 Half two — a call-scoped event *is* required, and the basis is s19/s8, not disclosure

`06-security-standards.md` line 30 ("audit logging required for … access to another user's data by an
admin/support/security-company operator") does **not**, on its face, reach a count: no user's data is
returned. If disclosure were the only test, "no audit event" would be the answer. It is not the only
test, and ADR-0006 has already ruled on the closest analogue:

> **ADR-0006 §14.5.5** (my own ruling, concurring on AUD-3): *"A filtered list or detail call that
> returns nothing discloses nothing, so it carries no s22 weight and I am not asking for it to be
> treated as a disclosure. But it should still produce a row … with a `resultCount` of zero, so that
> the **attempt** is reconstructible. Naming it so the implementer does not 'optimise away' audit
> rows for empty results."*

A zero-result list call and a count call are the same object under that rule: a privileged request
against the customer base that returns no subject's data. §14.5.5 already ruled that such a call
records the *call* while recording no *disclosure*. **This endpoint inherits that ruling directly.**
I am applying an existing rule, not writing a new one.

Three reinforcing reasons, in descending weight:

1. **AUD-8's actor-keyed query is the one that breaks.** ADR-0006 AUD-8 mandates two reconstruction
   queries: subject-keyed ("every access to customer X") and actor-keyed ("everything admin Y looked
   at"). The subject-keyed query is correctly silent about this endpoint. The actor-keyed query is
   not: with no row at all, `GET .../count` becomes **the only admin-authenticated read path on the
   platform that leaves no trace in either trail**. An investigator reconstructing a suspect admin's
   sitting would see gaps that are indistinguishable from idle time. §14.5.5 declined to blind that
   signal for empty list calls; I decline to blind it here for the same reason.
2. **A count endpoint is a low-cost oracle over the customer base.** It returns real-time aggregate
   information derived from customer records, callable at 100/min, with no page-size ceiling by
   design (§6). Polled over time it yields queue dynamics; differenced against a list call it yields
   more. That is not a disclosure and I am not treating it as one — but "not a disclosure" and "not
   worth a line in the trail" are different claims, and POPIA s19 (security safeguards) plus s8
   (accountability) support recording *that a privileged principal exercised a capability over
   personal information*, independently of whether any personal information came back.
3. **Cost is one row per call.** ADR-0006's repeated cost test — "there is almost nothing to accept a
   risk *about*" — cuts the same way here. Declining a control this cheap would require the exposure
   to be zero, and it is not zero.

### 9.4 The shape — it already exists; do not invent one

`privileged_bulk_access` is exactly the "lighter-weight aggregate access event distinct from
`recordBulkDisclosure`" that §4.1 hypothesised, and it is already live: enum value
(`backend/src/repositories/audit-log.ts:53`, migrations/032), `account_id` nullable for this type,
`account_audit_log_privileged_has_actor` requiring an attributable actor, and
`account_audit_log_result_count_only_on_bulk` requiring `result_count` on this type and only this
type (migrations/033, mirrored as guards at `audit-log.ts:140-168`).

**Mandated call — use the existing writer with an empty subject list:**

```ts
await ctx.auditLog.recordBulkDisclosure({
  disclosedAccountIds: [],            // structurally zero — see 9.4(a)
  actorAccountId: req.auth!.accountId,
  actorSessionId: req.auth!.sessionId,
  auditRequestId: req.auditRequestId ?? null,
  ipAddress: clientIp(req),
  userAgent: req.header('user-agent') ?? null,
});
```

(a) `recordBulkDisclosure([])` emits **one** `privileged_bulk_access` row with `resultCount: 0` and
**no** subject rows — `audit-log.ts:214-221`, already unit-tested at
`backend/src/repositories/audit-log.test.ts:233`. Reusing it rather than hand-writing
`record({ eventType: 'privileged_bulk_access', … })` is preferred precisely because the array
literal `[]` is the same structural guarantee §2's reasoning likes: a handler that passes an empty
literal cannot emit a subject row. The name reads oddly for a call that discloses nothing; that
mismatch is §14.5.5's, not this endpoint's, and consistency with the zero-result list case is worth
more than a better verb.

(b) **`resultCount` is 0 and means "distinct subjects disclosed" — it is NOT the returned count `N`.**
Binding. `result_count` carries one meaning across the whole trail (`audit-log.ts:215`); writing the
aggregate value into it would silently corrupt every actor-keyed query that asks "which sittings
disclosed more than *n* subjects." The value `N` is not to be written into the audit trail at all.

(c) **Losing "which endpoint" is accepted, and it is already handled.** Trail A carries no `endpoint`
column, so this row is indistinguishable from a zero-result list call. That is fine for the
subject-keyed question (both mean "no subject data disclosed") and is recoverable for the actor-keyed
one via `audit_request_id` → the application log line for that request, which is precisely AUD-5's
stated purpose. **No new column is warranted for this.**

(d) **AUD-10 fail-closed applies unchanged.** The audit write precedes response serialisation; if it
throws, the request fails 5xx and the number is not returned. There is no "it's only a count"
exception, and no reason to want one — there is no expensive work to lose.

(e) **C-17 stands.** No query or filter *value* may be written to the trail. §4 specifies no query
params for v1, so this is inert today; if a `status` param is added later it may be recorded as a
*field used*, never as a value, and an `accountId`-style filter may not be recorded at all without my
review.

### 9.5 Precedent correction — `countByAccount` is not the precedent §4.1 cites

§4.1 and §7's table rest partly on the claim that `policies.ts:191` `countByAccount` "has never itself
been wrapped in an audit call anywhere it's used today." I checked both call sites and that reading is
**backwards**:

- **`backend/src/routes/support-lookup.ts:113`** calls `countByAccount(accountId)` — and that handler
  **does** write an audit event, `privileged_data_access` at `:126-134`. It is scoped to one
  *identified* subject and returns that subject's PII alongside the count. So the one privileged call
  site of `countByAccount` **is a precedent that a subject-keyed count is a disclosure about that
  subject**, not a precedent for count-only access going unlogged.
- **`backend/src/lib/customer-lifecycle-notifications.ts:23`** is a system path with no human actor
  and no privileged principal — no precedent either way (`account_audit_log_privileged_has_actor`
  could not even be satisfied there without an `actorService`).
- `plan-catalog.ts:157` counts non-personal catalogue rows — out of scope entirely.

**Conclusion: this platform has no existing count-only privileged endpoint, and therefore no
precedent for not logging one.** §4.1's design assumption was not wrong to flag itself; it was resting
on a precedent that does not exist. This section is the first ruling in the class.

**Durable rule, so this is not misapplied later:**

| Shape | Event |
|---|---|
| Count with **no** subject identifier, over a whole collection or a status filter (this endpoint) | one `privileged_bulk_access`, `resultCount: 0`, no subject rows |
| Count **keyed to an identified subject** (`countByAccount(accountId)`, "how many assets does customer X have") | a **disclosure** about X → `privileged_data_access` with `accountId: X`, as `support-lookup.ts` already does |
| List returning subject rows | `recordBulkDisclosure()` with the real ids, unchanged |

A count is not exempt because it is a count. It is exempt from the *disclosure* record because it
names nobody — and the moment a filter names somebody, it is a disclosure again.

### 9.6 Consequential correction to §5.1 (`GET /v1/support-cases/count`)

§5.1 concludes "no compliance check needed" for the support-agent count. Its *disclosure* reasoning is
correct and I endorse it — no `privileged_data_access` row, for exactly the §9.2 reasons. But its
conclusion that the endpoint therefore emits **nothing** does not follow, and §9.3 applies to it
identically: same trail, same writer, same actor-keyed reconstruction gap, same one-row cost.

**Ruling: `GET /v1/support-cases/count` writes the same single `privileged_bulk_access`,
`resultCount: 0` row, on the same terms as §9.4.** §7's summary table should read "one
`privileged_bulk_access` (`resultCount: 0`); no disclosure rows" for both the `admin` and
`support_agent` rows.

### 9.7 `GET /v1/security/cases/count` (§3) — out of this ruling's reach, and why

I am **not** extending §9.4 to the security-cases count in this ruling. Not because it deserves less,
but because `recovery_cases` reads have **no audit trail at all** today (§3 is correct that the list
route emits nothing), and `admin_access_log`'s validator constrains `resourceType` to `policy | asset`
(`backend/src/db/feature004-collections.ts`), so there is no existing row shape for this access class
to write into. Manufacturing one for a count endpoint would be building the trail backwards, starting
with its least significant caller.

**Flagged, not fixed here, and not created by this endpoint:** partner-organisation operator access to
recovery cases is unlogged, and partner-org access is the class ADR-0006 §14.4.3 identifies as the one
where **POPIA s23 reaches directly** (a partner is a separate legal entity / third party) and §14.7
mandates a **purpose/case reference**. That is a pre-existing gap belonging to the Security Company
Dashboard trigger (ADR-0006 §12, conditions C-15/C-16(b)) and to Stage 8, not to FR-4's sizing. §3's
"introduces nothing new to decide here" is accurate **for the count endpoint** and I concur with it on
that scope only; it should not be read as a finding that the underlying access class is adequately
audited, because it is not.

### 9.8 What this ruling is and is not

- **Is:** a binding determination on §4.1, plus the §5.1 correction and the §9.5 durable rule.
- **Is not:** a Stage 8 compliance sign-off for Feature 012. Stage 8 remains outstanding for all three
  routes as new privileged API surface, and this section is an input to it, not a substitute.
- **Blocks nothing.** The endpoint contract in §4 is unchanged — this adds one `await` to the handler.
- **Test requirement for Stage 10** (`automation-qa-engineer`): assert the count handler emits exactly
  one audit row, that its `event_type` is `privileged_bulk_access`, that its `result_count` is `0`
  **and not the returned count**, and that **no** `privileged_data_access` row is written — the last
  being the negative test that keeps §9.2's prohibition from regressing.

---

