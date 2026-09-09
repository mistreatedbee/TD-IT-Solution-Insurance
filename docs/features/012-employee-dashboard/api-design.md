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

**Next lifecycle step:** this document → `compliance-specialist` resolves §4.1 → Stage 8
(`cybersecurity-architect`/`security-engineer`) reviews all three new routes as new API surface (per Stage 5
confirmation's own condition (b): "any new endpoint created for FR-4 ... needs its own authZ review at Stage
7/8, even though the data is already-authorized") → Stage 9 implementation, gated on both.
