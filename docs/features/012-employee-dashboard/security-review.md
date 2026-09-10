# Feature 012 — Employee Dashboard (Shared Staff Home) — Security Review (Stage 8)

**Status:** **CONDITIONAL SIGN-OFF — Stage 9 (Development) may begin, bounded by SR-012-1 … SR-012-7**
(and, from §13, **C-012-1 … C-012-4**).
**Date:** 2026-09-09 (chair) · §12 2026-09-10 · §13 2026-09-10
**Lifecycle stage:** 8 — Security Review (hard gate). **Chair / decision owner (A):** `cybersecurity-architect`.
**Joint gate status — ALL THREE SIGNATURES RECORDED; Stage 8 DISCHARGED on a conditional basis:**
`security-engineer` (R) **CONCURRENCE GIVEN**, 2026-09-10 — §12. `compliance-specialist` (C)
**CONCURRENCE GIVEN (conditional)**, 2026-09-10 — §13, adding **C-012-1** (the security-cases count must
emit a `privileged_bulk_access` row — this **supersedes §10.6's "no audit call"** and needs the chair's
SR-012-7 acknowledgement), **C-012-2**, and standing **C-012-3 / C-012-4**. §13.2 also corrects a factual
premise in `compliance-specialist`'s own `api-design.md` §9.7 that §12.6 inherited.
**Stage 9 (Development) may begin. Stage 9 exit is bounded by SR-012-1 … SR-012-6 + C-012-1 + C-012-2;
SR-012-7 and C-012-3/-4 are standing.** `compliance-specialist`'s ruling at `api-design.md` §9 is an
*input* to this gate — §9.8 says so in terms ("**Is not:** a Stage 8 compliance sign-off for Feature
012") — not a limb of it; §13 is the limb. Per `02-feature-lifecycle.md` and root `CLAUDE.md`, Stage 8
discharges only when all three roles sign; all three now have.

**Scope of this gate — exactly what was reviewed:**
- FR-1 (identity greeting), FR-2 (per-role quick links), FR-3 (static announcements), FR-4 (per-role counts) as
  assembled across `business-requirements.md`, `product-plan.md`, `ux-research.md`, `ui-design.md`, `api-design.md`.
- The three new backend routes proposed at `api-design.md` §3/§4/§5:
  `GET /v1/security/cases/count`, `GET /v1/admin/verification-requests/count`, `GET /v1/support-cases/count`.
- The three new web surfaces: the `index` route of `/admin`, `/security`, `/call-centre`.
- `compliance-specialist`'s §9 audit-event ruling as an architectural constraint on those handlers.

**Explicitly out of scope — no sign-off implied:** Option A / a `/staff` shared-session hub · any cross-role
visibility or unified staff activity feed (`business-requirements.md` §3.2) · every §4 per-role backlog idea
(A-1/A-2/A-3, S-1, C-1/C-2) · a backend-authored or role-targeted notices system · the pre-existing waivers on
`web-admin-verification`, `web-security-cases`, `backend-security-cases` and `backend-customer-lookup`, none of
which this review releases · ADR-0006 C-15/C-16(b) partner-org audit trail, which this review re-flags but does
not close.

**Running code read for this review (2026-09-09, not inferred from the design chain):**
`backend/src/routes/security-cases.ts` (full) · `backend/src/routes/admin-verification.ts:1-90` ·
`backend/src/routes/support-cases.ts:60-235` · `backend/src/repositories/recovery-cases.ts:230-300` ·
`backend/src/repositories/audit-log.ts:40-235` · `backend/src/lib/policy.ts:80-130` ·
`backend/src/index.ts` (helmet) · `docs/organization/gates/stage8-manifest.json` (full) ·
`scripts/verify-stage8-manifest.mjs` · `src/dashboard/auth/roleRouting.ts` and the three `*Routes.tsx` trees
(re-confirmed from my own Stage 5 pass, `business-requirements.md` §10.1).

---

## 0. Verdict

**CONDITIONAL SIGN-OFF.** This is a small feature that got an unusually good design chain, and the honest
summary is that the chain worked: `ux-researcher` cut a count nobody needed, `solution-architect` re-derived the
placement question from the account model rather than agreeing with it, `backend-architect` refused to bolt a
`countOnly` flag onto three already-signed-off routes, and `compliance-specialist` corrected two of
`backend-architect`'s own conclusions (§9.5's precedent correction, §9.6's consequential correction to §5.1)
rather than ratifying them. My Stage 5 §10 flags F-012-1 and F-012-2 are both genuinely resolved — F-012-2 by
construction, F-012-1 by an endpoint that structurally cannot emit a subject row.

The conditions below are not manufactured to justify this gate. Four of them come from reading the six documents
*against each other* and against the running code, which no single upstream author did:

- **SR-012-1** — `api-design.md` §5's optional `accountId` filter on the support-agent count is a
  **subject-keyed count**, which `compliance-specialist`'s own §9.5 durable rule (written two sections later, in
  the same file) classifies as a **disclosure about that subject** requiring `privileged_data_access`. The
  document contradicts itself across §5 and §9.5, and §9.6 only corrected §5.1's audit conclusion, not §5's query
  schema. §1.
- **SR-012-2** — `GET /v1/security/cases/count` and `GET /v1/support-cases/count` are **shadowed by existing
  `:caseId` routes** registered earlier in the same routers. As specified they will 400, not 200. §2.
- **SR-012-5** — CI-1 (`scripts/verify-stage8-manifest.mjs:121`) **skips `<Route index>` by construction**. This
  entire feature mounts on `<Route index>`. Three new privileged web surfaces would ship with CI-1 green and no
  record of review — INC-001's root cause, in a sub-case nobody has filed before. §5.
- **SR-012-6** — F-012-2's fix makes **AC-5 false as literally written**. `api-design.md` §6 asserts AC-5 "holds
  structurally"; it holds under a different reading of AC-5 than the one Stage 10 will test. §6.

**C-012-A1 is not yet satisfied in `ui-design.md`** — not contradicted, but not designed in either. §4.

Three things are right and should be said plainly: there is **no new authentication or session surface** (my
Stage 5 §10.1 finding stands, re-confirmed); the three count routes copy their sibling's auth chain **verbatim**,
so partner-org and agent scoping stay token-derived with no widening parameter; and FR-3 is plain text with no
markdown, no HTML and no links, which keeps the injection surface at zero rather than at "sanitised."

---

## 1. SR-012-1 (Required, blocks Stage 9 exit) — the support-agent count carries a subject-keyed filter that compliance's own ruling prohibits

`api-design.md` §5 specifies the query schema for `GET /v1/support-cases/count` as:

> Optional `status`/`category`/`accountId` filters, same as `listMine`'s filter shape … leaving the others
> available costs nothing

Confirmed against `support-cases.ts:79-86`: the list route's `listQuerySchema` does carry
`accountId: z.string().uuid().optional()`, and it is passed through to `listMine` at `:206`. So the proposal is a
faithful mirror of the list route. That is exactly the problem.

`compliance-specialist`'s §9.5 durable rule, in the same document:

> | Count **keyed to an identified subject** (`countByAccount(accountId)`, "how many assets does customer X
> have") | a **disclosure** about X → `privileged_data_access` with `accountId: X` |
>
> A count is not exempt because it is a count. It is exempt from the *disclosure* record because it names
> nobody — and the moment a filter names somebody, it is a disclosure again.

`GET /v1/support-cases/count?scope=mine&accountId=<uuid>` names somebody. It returns, to an agent, a truthful
real-time answer to "does customer X have cases assigned to me, and how many" — with **no**
`privileged_data_access` row, because §9.6 ruled this route emits one subject-less `privileged_bulk_access`
(`resultCount: 0`) and nothing else. §9.6 corrected §5.1's *conclusion*; it did not read §5's *schema*, and §9.4(e)
explicitly reserved the point ("an `accountId`-style filter may not be recorded at all without my review"). The
two halves of one document disagree.

This is not a large exposure — the caller is a `support_agent` who can already read any case by id
(RR-010-1, accepted) — but it is a **silent, unaudited, subject-keyed oracle**, which is the precise class
§9.5 was written to close, delivered by the feature that prompted §9.5.

**Required:** v1's count query schema is `scope: z.literal('mine')` (required, no default, `all` rejected before
any repository call — mirroring `support-cases.ts:175-187` verbatim) **plus** optional `status` only.
`accountId` and `category` are **removed** from the count route's schema and from `countMine`'s filter argument.
If a subject-keyed count is ever wanted, it is a new endpoint under §9.5's second row (a disclosure about X,
`privileged_data_access` with `accountId: X`) and needs a fresh compliance ruling and a fresh pass by this role —
it is not reachable by relaxing a Zod schema.

Same rule applied forward: `GET /v1/admin/verification-requests/count` takes **no query parameters in v1**, as
§4 already specifies. Keep it that way. `GET /v1/security/cases/count` keeps only `status` (enum), which names
no subject.

---

## 2. SR-012-2 (Required) — two of the three routes are shadowed and will not work as specified

Express matches in registration order. Verified:

- `security-cases.ts:73` registers `GET '/security/cases/:caseId'` with
  `caseIdParamsSchema = z.string().regex(/^[0-9a-f]{24}$/i)` (`:20-22`). A request to
  `/v1/security/cases/count` appended after it matches `:caseId = "count"`, fails the 24-hex regex, and returns
  **400 VALIDATION_ERROR**. The count handler never runs.
- `support-cases.ts:235` registers `GET '/support-cases/:caseId'` before any appended route. Same outcome.
- `admin-verification.ts` has only `'/admin/verification-requests'` (grepped) — no `:id` sibling on that path,
  so `/admin/verification-requests/count` is unshadowed. This one is fine.

This is a five-minute fix and a mundane one, which is exactly why it is worth naming at the gate rather than
discovering in Stage 10: the failure mode is a Home screen whose count silently shows the AC-9 "—" placeholder
forever, i.e. a **broken control that looks like a working degraded state**.

**Required:** register each `/count` route **above** the `:caseId` route in its router, and add a route-level
test per endpoint asserting a 200 with `{ data: { count: <number> } }` — not merely a unit test on the new
repository method. The test is the regression guard against a future editor re-ordering the file.

---

## 3. Threat model — three authenticated `GET .../count` endpoints

This section is the chair's own work, not a re-statement of §10.1's "no new auth surface" finding.

### 3.1 What is actually new

Nothing about identity, session, or role resolution changes (Stage 5 §10.1, re-confirmed). What is new is a
**third response archetype**: today every privileged read returns either subject rows or a single subject's
detail. A count returns an *aggregate over a population the caller cannot enumerate through this endpoint*. The
security properties that matter are therefore not authZ properties (those are inherited verbatim) but
**inference, amplification and telemetry** properties.

### 3.2 Enumeration and inference — endpoint by endpoint

**`GET /v1/admin/verification-requests/count`** — no parameters, global aggregate over
`{ verificationStatus: 'pending_review' }`. There is nothing to enumerate: the response space is one integer and
the caller cannot vary the query. Differencing it against the sibling list adds nothing, because the sibling list
returns the same population with full PII to the same caller at 60/min. **No new inference channel.** The one
real change is telemetry volume (§3.4).

**`GET /v1/support-cases/count`** — with SR-012-1 applied (`scope` + `status` only), the response space is one
integer per status over the caller's own cases. An agent enumerating their own case counts by status learns
nothing they do not already own. **No new inference channel, conditional on SR-012-1.** Without SR-012-1 it is a
per-customer oracle — see §1.

**`GET /v1/security/cases/count`** — this is the only one that deserves real attention, and no upstream document
looked at the query it actually runs. `recovery-cases.ts:246-254`:

```ts
const query = {
  $or: [
    { partnerOrganizationId },
    { partnerOrganizationId: null, status: 'open' as RecoveryCaseStatus },
  ],
  ...statusFilter,
  ...
};
```

The partner-visible population is **not** partner-scoped. It is (this org's cases) **∪** (every unassigned `open`
case on the platform, regardless of which customer or which partner eventually takes it). That is deliberate and
correct — it is the claim-a-case queue — but it means `?status=open` returns a **cross-tenant aggregate** to an
external organisation, and `ui-design.md` §3.3's copy ("Assigned and unassigned recovery cases") is the only
place in the chain that even hints at it.

I checked whether the `status` passthrough widens this: it does not. With `status: 'recovered'` (or any
non-`open` value) the top-level `status` clause and the second `$or` limb's `status: 'open'` are mutually
exclusive, so the unassigned pool drops out and the result is strictly this org's own cases. Only `status=open`
and the no-filter case touch the shared pool. **Confirmed safe as designed.**

The residual concern is not disclosure — it is that a partner operator can now poll a cheap, quiet integer that
increments when *any* customer anywhere on the platform reports a theft, at 100/min, **with no audit trail of any
kind** (`compliance-specialist` §9.7: `recovery_cases` reads are entirely unlogged, and `admin_access_log`'s
validator has no row shape for this access class). The marginal capability over today is small — the list route
gives a strictly richer signal at the same tier — but the *cost* of exercising it drops, and the design invites
the UI to call it automatically on every landing. This is recorded as **RR-012-1** and constrained by SR-012-3,
not blocked.

### 3.3 Timing side-channels — considered, and I am not manufacturing one

`countDocuments()` latency varies with the size of the matched set. For all three endpoints the matched-set size
**is the response body**. There is no secret for a timing channel to leak that the returned integer does not
already state. The interesting timing case would be a subject-keyed count where the number is withheld or
bucketed — SR-012-1 removes the only subject-keyed variant, and none of the three withholds or buckets its
result. **No timing finding. No mitigation required.** I record this so a later reader can see it was tested and
rejected, not skipped.

### 3.4 Audit-write amplification — a GET that writes

Two of the three handlers now perform a **write** (one `privileged_bulk_access` row) on a `GET`, per §9.4, and
that write is fail-closed (AUD-10, `audit-log.ts:203-230` throws and the caller must let it 5xx). Consequences
the chain did not state:

1. **Volume.** Today an `admin`'s disclosure footprint corresponds to deliberately opening a queue. After this
   feature, every landing, every browser refresh, and every navigation back to Home emits an audit row. At the
   proposed 100/min tier a single admin account can write 100 rows/min indefinitely. That does not leak anything,
   but it **dilutes AUD-8's actor-keyed reconstruction query** — the very query §9.3 invoked to justify the row.
   The control is worth having; it is worth having *bounded*.
2. **CSRF is not a concern here, and the reason must not silently change.** A state-changing GET is normally a
   CSRF flag. It is not one on this platform because authentication is a bearer access token in a header, not a
   cookie (`createAuthenticateMiddleware`), so a cross-site page cannot induce the call. **If cookie-based auth
   is ever introduced for the dashboards, these GET-writes-audit endpoints become a cross-site log-pollution
   vector and must be re-reviewed.** Recorded as part of SR-012-7.
3. **Caching would silently suppress the mandated row.** Helmet sets no `Cache-Control` and the sibling list
   routes set none either (`customer-profile.ts:257` is the only route in the backend that sets one). The count
   routes must not add `private, max-age=…` or any equivalent. A cached count is a count served without its audit
   row.

### 3.5 Response shape and error handling

`{ "data": { "count": number } }` is the right shape and must be built as an explicit object literal — never
`res.json(n)` (a bare JSON scalar), and never a spread of a repository result. The count value must never be
written into the audit trail's `result_count` (compliance §9.4(b), binding — `result_count` means *distinct
subjects disclosed* across the whole trail, and `audit-log.ts:161-167`'s invariant would happily accept the wrong
number).

Error semantics inherit unchanged from the sibling routes and must not diverge: `401` unauthenticated, `403`
wrong role (`requireUserType` reads the verified token claim, `require-role.ts:18-30`), `403` for a
security-operator account with no `partnerOrganizationId`, `400 VALIDATION_ERROR` on a bad `status`/`scope`,
`429` on the limiter, `5xx` on an audit-write failure. **No new error code, no new error shape.** A count route
has no not-found case and must never return `404` — a `404` here would be a distinguishable response the sibling
routes do not produce.

---

## 4. SR-012-4 (Required) — C-012-A1 is intended but not designed

The task asks whether `solution-architect`'s C-012-A1 is followed in `ui-design.md` **as actually designed**. It
is not — and this is a sequencing artefact, not a disagreement: C-012-A1 was filed at Stage 5
(`business-requirements.md` §9.2) *after* `ui-design.md` was signed at Stage 4. Both are dated 2026-09-09.

What `ui-design.md` actually specifies: "composed once as a role-parameterized component and mounted as the
`index` route inside each of the three existing dashboard trees" (§ scope), per-role card sets (§3.3), a shared
config module at `src/dashboard/content/homeAnnouncements.ts` (§3.2), and a component composition map (§4). It is
**silent on where the FR-4 fetch lives and where the per-role card set is resolved**. "Role-parameterized" reads
equally well as props-injection or as `switch (role)` inside the shared component. C-012-A1's entire value is
that it forbids the second reading, and nothing in the Stage 4 artefact records that.

I am not sending Stage 4 back for this — the design is compatible with C-012-A1, it simply predates it. But
C-012-A1's own stated benefit ("AC-6 becomes a structural property enforced by the import graph rather than a
runtime conditional a future edit could regress past a test") is only real if it is enforced, and a condition
carried in prose across three documents is exactly the drift pattern SR-011-1c was written about.

**Required:**
1. The shared Home component takes its quick-link set and its FR-4 count source **as props**, supplied by the
   route file in `src/admin/`, `src/security/`, `src/call-centre/`. No `switch (role)` selecting an API client.
2. The shared Home module **may not import any role's API client, directly or transitively.** Enforce it the way
   SR-011-1c was enforced and `security-engineer` verified by adversarial plant: an ESLint
   `no-restricted-imports` override scoped to the shared Home module. A wrong import must be a build error, not
   a code-review catch. This is cheap now and materially harder to retrofit.
3. **Permitted role-branching inside the shared component, explicitly:** the FR-1 `PrivilegedUserType` → label
   lookup, and FR-3's `HOME_ANNOUNCEMENTS.filter(a => !a.roles || a.roles.includes(role))`. Neither touches a
   network client or another role's data; forbidding them would be cargo-cult. C-012-A1's boundary is the
   **import graph for data access**, not the existence of a role variable.
4. FR-3 stays plain text with no markdown, no HTML, no links, rendered as `InlineAlert` children — as designed
   (`ui-design.md` §3.2). This is the reason FR-3 needs no sanitisation review at all, and it is a property, not
   a default.

---

## 5. SR-012-5 (Required, blocks merge of the Stage 9 diff) — CI-1 cannot see this feature at all

Checked `docs/organization/gates/stage8-manifest.json` and executed-path-read
`scripts/verify-stage8-manifest.mjs`.

**Backend — three new routes, all absorbed into pre-existing coverage, two of them into a *waiver*:**

| New route | Absorbed by | Why that is wrong |
|---|---|---|
| `GET /v1/admin/verification-requests/count` | `backend-admin`, pattern `/admin/*`, Feature 004 admin-surface doc | Points a reader at a Feature 004 policy/asset registry review for a Feature 012 verification-queue aggregate |
| `GET /v1/security/cases/count` | `backend-security-cases`, pattern `/security/cases*`, **`waived: true`**, reason "Feature 009 operator surface — mobile security-app gated via FEATURE_SECURITY_OPERATOR" | A new cross-tenant aggregate endpoint enters under a waiver granted for a different feature, for an unrelated reason (a mobile feature flag) |
| `GET /v1/support-cases/count` | `/support-cases` entries are exact-pattern, so this one is likely **undiscovered-and-uncovered** rather than absorbed | Either way it has no record of its own |

**Web — worse, and this is a new platform defect.** `verify-stage8-manifest.mjs:118-124`:

```js
const pathMatch = attrs.match(/\bpath=["']([^"']+)["']/);
if (!pathMatch) continue; // index/catch-all-less routes carry no distinct screen
```

`<Route index element={…} />` carries no `path` attribute, so **CI-1 structurally cannot discover an index
route.** That comment was true when every index route was a `<Navigate>` redirect. Feature 012 makes it false:
this feature's entire UI is three `<Route index>` elements. Three privileged operator screens would reach a
production build with CI-1 reporting PASS and no manifest entry anywhere. There is no bare `/admin`, `/security`
or `/call-centre` entry in the manifest today — I grepped.

This is INC-001's root cause reproduced in a sub-case neither SH-1a nor SH-1b covers (SH-1a was "web routes
aren't scanned at all" — since fixed; SH-1b was "catch-all/waived patterns absorb new surfaces"). This one is
"a whole *kind* of route is invisible to the scanner."

**Required, in or before the Stage 9 diff that adds the code:**
1. Three `backend_route` entries — `/admin/verification-requests/count`, `/security/cases/count`,
   `/support-cases/count` — `"feature": "012"`, `"doc"` pointing at **this** document, each carrying a `note`
   recording the §9.4 audit obligation (and, for the security route, RR-012-1's unlogged status). They must be
   distinct entries, not amendments to the `/admin/*` or waived `/security/cases*` entries.
2. Three `web_route` entries for `/admin`, `/security`, `/call-centre`, `"feature": "012"`, pointing at this
   document. These must **not** be folded into `web-admin-verification` (itself `waived`, and whose reason states
   real identity-verification data must not reach that surface until Feature 009 A-1 closes) or into
   `web-security-cases` (also `waived`).
3. **Platform finding SH-2, filed here, owner `devops-engineer` + this role:** `discoverWebRoutes()` must
   discover `<Route index>` elements as the route at the parent's mount prefix, or CI-1 must fail loudly when it
   encounters an `index` route it cannot name. Feature 012 must not be the reason this is fixed and must not be
   blocked on it — condition 2 above covers this feature by hand — but the general defect is now known and
   silence on it is not available.

---

## 6. SR-012-6 (Required) — AC-5 is false as written once F-012-2 is fixed correctly

AC-1–AC-9 were written at Stage 1 assuming counts would come from a list response's pagination metadata. AC-5:

> each number verifiably matching what the operator sees by navigating to the corresponding existing list page
> and **counting/reading its own total**

`api-design.md` §6 asserts AC-5 "holds structurally." Under `countDocuments()` it holds for the *filter*, and
fails for the *literal test*: with 60 pending verifications, the count says **60** and the list page — which
requests `limit: 50` (`src/admin/pages/AdminVerificationPages.tsx:21`, cursor-paginated, no headline total of its
own) — shows **50 rows**. A tester executing AC-5 literally records a defect against a correctly-behaving system,
and the plausible "fix" is to re-cap the count, which reintroduces F-012-2.

This is small, and it is exactly what a hard gate is for: the acceptance criterion and the implementation now
mean different things, and neither document noticed because they were written five stages apart.

**Required:**
1. AC-5 is restated for Stage 10 as: *the count equals the true total of the same filtered population the
   sibling list route queries — not the row count of the list's first page. The count and the list filter must
   be built from a single source (a shared query builder where one exists per `api-design.md` §3, a faithful
   mirror where the query is one field per §4/§5).*
2. Stage 10 tests AC-5 with **more rows than one page's `limit`** for at least one role, per `api-design.md` §6's
   own test note. A test seeded with ≤ `limit` rows cannot distinguish the correct implementation from the bug.
3. Stage 10 also asserts `compliance-specialist` §9.8's audit tests on both the admin and support-agent count
   handlers: exactly one audit row; `event_type` = `privileged_bulk_access`; `result_count` = `0`
   **and not the returned count**; and **zero** `privileged_data_access` rows — the last being the negative test
   that keeps §9.2's prohibition from regressing.

---

## 7. SR-012-3 (Required) — rate limiting and client fetch behaviour

`api-design.md` §2(3) reasons that "counts are cheap and safe to call more often … a shared route can be given
its own, more permissive limiter." That reasoning was written before §9 made two of the three routes **write to
the audit trail on every call**. A more permissive tier is now a request to write more audit rows, which is the
wrong direction (§3.4).

Verified tiers: admin verification list is `AUDIT_LOG_READ_LIMIT` 60/min keyed
`admin-verification-list:${accountId}` (`admin-verification.ts:31-35`); security cases routes are
`DEFAULT_AUTHENTICATED_LIMIT` 100/min with a **distinct key per route** (`security-cases.ts:46,78,104,136`);
support-cases uses **one shared limiter instance**, 30/60s, keyed `support-cases:${accountId}:${clientIp}`
(`support-cases.ts:101-105`) across every route in that router.

**Required:**
1. **Admin count keeps `AUDIT_LOG_READ_LIMIT` (60/min), not the proposed `DEFAULT_AUTHENTICATED_LIMIT`
   (100/min).** §4's rationale ("that tier was sized for audit-log reads, which this isn't") was correct on
   2026-09-09 morning and was overtaken by §9 that afternoon: this route now *writes* an audit row per call, so
   an audit-shaped tier is the right one. `security-engineer` may tighten further; may not loosen.
2. **Each count route gets its own limiter key** (`…-count:${accountId}`). For support-cases specifically this
   matters: reusing the shared `rateLimit` instance means a Home screen that re-fetches consumes the agent's
   30/min case-work budget, so a refresh loop degrades the agent's actual job. Same tier, separate bucket.
3. **The client fetches each count once per mount. No polling interval, no auto-refresh, no
   focus/visibility-triggered refetch, no automatic retry-with-backoff.** `ui-design.md` §4.3's inline "Retry"
   is permitted as a **single-shot, user-initiated** action only. Every one of these fetches is an audit row for
   two of three roles, and an unlogged cross-tenant aggregate poll for the third.
4. **No `Cache-Control` header on any count response** (§3.4.3).

---

## 8. Confirmed, no change required

- **No new auth or session surface.** Stage 5 §10.1 re-confirmed. Home is the `index` child of an existing
  `<AuthGate>` in all three trees; `DashboardAuthProvider` is untouched; no new storage slot; C-LU-2 /
  `clearOtherRoleSessions()` is unaffected. AC-7 holds by construction, not by test.
- **AuthZ on all three count routes is inherited verbatim and is token-derived.** `requireUserType` reads the
  verified claim; `requirePartnerOrg` reads `req.auth.partnerOrganizationId`; `countMine` will key on
  `req.auth.accountId`. **There is no request parameter on any of the three that can widen scope** — the
  property that made my Stage 5 confirmation possible survives the move from list-reuse to purpose-built routes.
- **F-012-1 is genuinely resolved, not relocated.** `recordBulkDisclosure({ disclosedAccountIds: [] })` emits
  exactly one `privileged_bulk_access` row with `resultCount: 0` and no subject rows —
  `audit-log.ts:203-230`, invariants at `:140-168`, unit-tested at `audit-log.test.ts:233`. The empty array
  literal is a structural guarantee, and preferring it over a hand-written `record({ eventType: … })` is the
  right call for the same reason §2's route-vs-flag decision was.
- **F-012-2 is resolved by construction.** No `limit` in any count path; no `buildPage`; no ceiling to cap
  against.
- **The sibling-route pattern over a `countOnly` flag is the correct architectural choice** and I endorse
  `api-design.md` §2's reasoning without reservation. Threading a branch through `support-cases.ts`'s list
  handler would have put a new code path inside SR-010-1b/SR-010-2's signed surface. A handler with no code path
  that touches row data cannot regress into returning rows.
- **`scope=all` remains WITHHELD** (SR-010-2). The count route must reproduce the list route's explicit
  pre-schema rejection (`support-cases.ts:175-187`), not merely rely on `z.literal('mine')`.
- **Migration 033's `NOT VALID` promotion (open platform item) does not block this feature.** A `NOT VALID`
  CHECK constraint in Postgres is still enforced on new inserts; it is only unvalidated against pre-existing
  rows. `audit-log.ts:140-168` mirrors all four constraints in application code and throws before the write. The
  new rows this feature emits are constrained today.
- **No new MongoDB index required** on the evidence available; `api-design.md` §7's one-line `EXPLAIN`
  confirmation at Stage 9 with `database-architect` is the proportionate check and I adopt it as written. Not a
  security condition.

---

## 9. Residual risks, explicitly accepted

Per this role's standing obligation that no risk is accepted silently.

| # | Residual risk | Accepted by | Basis |
|---|---|---|---|
| **RR-012-1** | `GET /v1/security/cases/count` gives an external partner organisation a cheap, **unlogged** real-time aggregate that includes the **platform-wide unassigned-open case pool**, not just its own org's cases (`recovery-cases.ts:246-254`). Polled, it signals that *some* customer somewhere reported a theft. | `cybersecurity-architect` (this document) | The marginal capability over `GET /security/cases` (same tier, strictly richer signal, equally unlogged) is small, and the shared pool is the claim-a-case queue working as designed. Accepted **only** with SR-012-3's no-polling and same-tier constraints. It is **not** accepted as a finding that partner-org access is adequately audited — it is not. See RR-012-2. |
| **RR-012-2** | **Partner-organisation reads of `recovery_cases` have no audit trail at all**, and `admin_access_log`'s validator constrains `resourceType` to `policy \| asset` (`backend/src/db/feature004-collections.ts`), so there is no row shape to write into. `compliance-specialist` §9.7 identifies this as the class where **POPIA s23 reaches directly** (a partner is a third party) and where ADR-0006 §14.7 mandates a purpose/case reference. | **NOT ACCEPTED — pre-existing, re-flagged, owner `cybersecurity-architect` + `compliance-specialist` under ADR-0006 C-15/C-16(b)** | Not created by Feature 012 and not this feature's to fix — building a partner audit trail starting from a count endpoint would be building it backwards, and §9.7 is right about that. Recorded here so that this gate cannot later be cited as evidence the class was reviewed and cleared. It was reviewed and found open. |
| **RR-012-3** | Audit-row volume amplification: every admin/support-agent Home landing writes a `privileged_bulk_access` row, diluting AUD-8's actor-keyed reconstruction query with landing noise. | `cybersecurity-architect` (this document) | The row is cheap and §9.3's reasoning for requiring it is sound. Bounded by SR-012-3 (60/min admin tier, separate bucket, no client polling). Revisit if actor-keyed queries become noisy in practice. |
| **RR-012-4** | The admin Home count is derived from the identity-verification population, whose **web surface** carries a `waived` manifest entry stating real identity-verification data must not reach it until Feature 009 A-1's Stage 8 closes. | `cybersecurity-architect` (this document) | **Ruled: the count does not inherit that block.** No identity-verification data reaches the Home screen — the payload is a queue depth with no subject, no name, no ID fragment. The block is on identity-verification *data*, and none is displayed. This ruling covers the count and nothing else; `web-admin-verification`'s waiver is untouched and the queue page itself remains blocked for real customer data. |

---

## 10. What Stage 9 must not deviate from without a fresh review

This is the gate's actual product: a bounded, reviewed spec `backend-engineer` and `frontend-engineer` can build
against without asking. Anything on this list changing means this sign-off is **void for the changed part** and a
fresh pass by this role is required — not a note in a PR description.

**Fixed backend contract:**
1. **Exactly three new routes**, at exactly these paths, with exactly these methods:
   `GET /v1/security/cases/count`, `GET /v1/admin/verification-requests/count`, `GET /v1/support-cases/count`.
   No fourth count endpoint, no combined "dashboard summary" endpoint returning several counts, no aggregation of
   two roles' counts into one route.
2. **Auth chain copied verbatim from the sibling list route**, in the same order:
   `authenticate` → `requireUserType(<single role>)` → (security only) `requirePartnerOrg` → limiter.
   No route may accept more than one `user_type`.
3. **Query schemas, final:** security = `status` enum only; admin = **none**; support = `scope: z.literal('mine')`
   required with the explicit pre-schema `all` rejection, plus optional `status`. **No `accountId`. No
   `category`.** (SR-012-1.)
4. **Response, final:** `{ "data": { "count": number } }`, built as an explicit literal. No rows, no ids, no
   sample, no `hasMore`, no echo of the filter. No `Cache-Control` header. No `404` path.
5. **Repository methods return a number** from `countDocuments()` against the same filter the sibling list
   builds — via the shared `buildPartnerOrgQuery` helper for security-cases (§3), via a faithful one-field
   mirror for the other two. **No `limit`, no cursor, no `buildPage`, anywhere in a count path.**
6. **Audit, final:** admin and support handlers call `recordBulkDisclosure({ disclosedAccountIds: [] })` —
   the empty array literal, never a variable — before serialising the response, and let a throw become a 5xx.
   Security handler: no audit call (RR-012-1/RR-012-2). The returned count is **never** written to
   `result_count`.
7. **Rate limits, final:** admin 60/min; security 100/min; support 30/60s — each with its **own** limiter key
   (SR-012-3). Tightening is permitted at `security-engineer`'s discretion; loosening is not.
8. **Route registration order:** `/count` above `:caseId` in both affected routers, with a route-level test
   (SR-012-2).

**Fixed frontend contract:**
9. Home mounts as the `index` route **inside** each existing tree, under the existing `<AuthGate>`. It does not
   move to `/staff`, does not gain its own provider, does not read or write `sessionStorage`, and does not touch
   `DashboardShell` (Option A remains a future ADR, per §9.1/§9.3 of the requirements doc).
10. Quick-link set and count source are **props injected by each role's own route file**; the shared Home module
    imports **no** role API client and is lint-fenced (SR-012-4).
11. Each count fetches **once per mount**; retry is single-shot and user-initiated; no interval, no auto-refetch,
    no backoff loop (SR-012-3.3).
12. FR-3 announcements stay a **static, plain-text, frontend-shipped constant**. No markdown, no HTML, no links,
    no backend authoring, no read receipts. A single failed count never blocks a quick link or blanks the screen
    (AC-9, satisfied by `ui-design.md` §4.3's per-Badge state isolation).
13. **Zero cross-role data of any kind** is fetched or rendered on any Home screen (AC-6). This includes
    "harmless" aggregates.

**Fixed governance:**
14. Manifest entries land **in or before** the same commit as the code (SR-012-5). Not follow-up work.

**Anything else** — a fourth count, a new query param, a role gaining a second endpoint, cookie-based dashboard
auth (§3.4.2), a notices backend, a count appearing on a role other than its owner's — is out of this
sign-off's scope and needs a fresh review. This supersedes and extends `business-requirements.md` §10.3's
Stage 5 conditions (a)–(d), all four of which remain in force.

---

## 11. Conditions register — Feature 012 Stage 8

| ID | Condition | Owner | Blocks |
|---|---|---|---|
| **SR-012-1** | Remove `accountId` and `category` from `GET /v1/support-cases/count`'s schema and `countMine`'s filter; `scope=mine` (literal, explicit `all` rejection) + optional `status` only | `backend-architect` (contract) + `backend-engineer` | Stage 9 exit |
| **SR-012-2** | Register `/count` above `:caseId` in `security-cases.ts` and `support-cases.ts`; route-level 200-shape test per endpoint | `backend-engineer` | Stage 9 exit |
| **SR-012-3** | Admin count on `AUDIT_LOG_READ_LIMIT` (60/min); per-route limiter keys; client fetches once per mount, single-shot user-initiated retry only; no `Cache-Control` | `backend-engineer` + `frontend-engineer` | Stage 9 exit |
| **SR-012-4** | C-012-A1 made structural: props injection, no role API client importable from the shared Home module, ESLint `no-restricted-imports` fence (SR-011-1c precedent). FR-1 label map and FR-3 role filter explicitly permitted | `frontend-architect` + `frontend-engineer`; verified `security-engineer` | Stage 9 exit |
| **SR-012-5** | Three `backend_route` + three `web_route` manifest entries pointing at this document, not absorbed into `/admin/*` or the waived `/security/cases*` / `web-admin-verification` entries. **SH-2** (CI-1 blind to `<Route index>`) filed to `devops-engineer` + this role as a platform finding | `backend-engineer` + `frontend-engineer`; SH-2: `devops-engineer` | Merge of the Stage 9 diff (SH-2 does not block this feature) |
| **SR-012-6** | AC-5 restated as true-total-not-page-count; Stage 10 seeds > one page's `limit`; Stage 10 asserts compliance §9.8's four audit assertions including the negative `privileged_data_access` test | `qa-architect` + `automation-qa-engineer` | Stage 10 exit |
| **SR-012-7** | **Standing:** §10's non-deviation list. Any departure voids this sign-off for the changed part and requires a fresh pass by this role. Supersedes and extends `business-requirements.md` §10.3(a)–(d), which remain in force | all roles | Standing |
| **SR-012-8** | `security-engineer` and `compliance-specialist` Stage 8 concurrence recorded **in this document**. `api-design.md` §9 is an input, not a limb (its own §9.8 says so) | `security-engineer`, `compliance-specialist` | **Gate discharge** — this document alone does not clear Stage 8 |

**Unchanged and not released by this review:** the `web-admin-verification`, `web-security-cases`,
`backend-security-cases` and `backend-customer-lookup` waivers · Feature 009 A-1 · INC-001 Release Gate A
criterion 6 · ADR-0006 C-15/C-16(b) and the partner-org audit gap (RR-012-2) · SR-010-2's `scope=all`
withholding · Feature 011's open conditions · Stage 10 QA.

**Filed by:** `cybersecurity-architect` (chair), 2026-09-09.

---

## 12. `security-engineer` concurrence under SR-012-8

**Date:** 2026-09-10. **Role:** `security-engineer` (R on this gate).

**Scope of this section:** unlike Feature 011, no code exists for Feature 012 yet (Stage 9 has not started).
This is therefore not an implementation-fidelity review — it is a hands-on verification of the **chair's own
findings against the running code and the design documents**, the same rigor this role would apply to a diff,
applied here to the claims in §1–§11 above. I re-derived each of the chair's load-bearing citations rather than
trusting them, and looked for anything the chair's pass might have missed.

**Commands run and files read for this section (2026-09-10):**
`grep -n "router\.\(get\|post\|patch\|delete\)\|:caseId\|/count" backend/src/routes/security-cases.ts
backend/src/routes/support-cases.ts backend/src/routes/admin-verification.ts` ·
`backend/src/routes/security-cases.ts` (full route table, all four handlers) ·
`backend/src/routes/support-cases.ts:60-320` (full router body) ·
`backend/src/routes/admin-verification.ts:1-90` ·
`node scripts/verify-stage8-manifest.mjs` (executed) ·
`scripts/verify-stage8-manifest.mjs:100-145` (`discoverWebRoutes()`) ·
`grep -rn "Route index" src/admin src/security src/call-centre` ·
`grep -n "limit" src/admin/pages/AdminVerificationPages.tsx` ·
`docs/features/012-employee-dashboard/api-design.md` §3, §5, §6, §9 (full) ·
`docs/features/012-employee-dashboard/ui-design.md` (table of contents + §3.2/3.3/4) ·
`ls src/dashboard/content/ src/dashboard/auth/` (confirms `homeAnnouncements.ts` and the shared Home module do
not exist yet — nothing to regress, consistent with Stage 9 not having started).

### 12.1 SR-012-1 (accountId filter contradiction) — **confirmed, and the required fix is sufficient**

Traced §5 and §9.5/§9.6 independently rather than taking the chair's quotation at face value.

`api-design.md` §5's query line reads, verbatim: *"Optional `status`/`category`/`accountId` filters, same as
`listMine`'s filter shape … leaving the others available costs nothing."* Checked against
`support-cases.ts:79-86` (`listQuerySchema`): `accountId: z.string().uuid().optional()` is present and is
passed through to `ctx.supportCases.listMine(req.auth!.accountId, { status, category, accountId }, ...)` at
the list handler. §5's proposed `countMine` code block mirrors this exactly (`...(filters.accountId ? {
accountId: filters.accountId } : {})`). The schema-level contradiction is real, not a paraphrase.

Checked §9.5's durable rule table independently: the second row is unambiguous — *"Count keyed to an
identified subject (`countByAccount(accountId)`, 'how many assets does customer X have') | a **disclosure**
about X → `privileged_data_access` with `accountId: X`."* `GET /v1/support-cases/count?scope=mine&accountId=X`
is exactly that shape: an agent-scoped filter that additionally names a specific customer. Checked §9.6
directly (not summarized) — it corrects only §5.1's *conclusion* ("emits nothing" → "emits one
`privileged_bulk_access` row"); it does not touch §5's *schema* at all, and §9.4(e) is explicit that "an
`accountId`-style filter may not be recorded at all without my review," which has not happened. The
contradiction is genuine: as written, the route can be called with a subject-keyed filter that compliance's own
rule requires a `privileged_data_access` row for, and no code path in §5/§9 writes one.

**Is the required fix sufficient?** Yes, and I checked for gaps the chair might have left. Removing `accountId`
and `category` from the schema and from `countMine`'s filter argument removes the only two levers that could
turn this endpoint into a subject-keyed or population-partitioning oracle — `status` alone (an enum over a
fixed small set: `open`/`in_progress`/`resolved`/`closed`/`escalated`) cannot identify a subject, and `scope`
is pinned to the literal `'mine'` with the existing SR-010-2 explicit-rejection pattern. I checked whether
`category` alone (without `accountId`) could still create a disclosure risk if left in: it cannot — a category
filter narrows a population, not an individual, and compliance's own rule (§9.5) only fires on subject
identifiers, not narrowing filters generally. The chair's choice to drop `category` too is not strictly
required by §9.5's rule but is the right conservative call given `category` buys FR-4 nothing (only `status`
is needed) and every unused parameter is attack surface for the next feature that reuses this schema without
rereading §9.5. **No gap found. Fix is complete.**

### 12.2 SR-012-2 (route-shadowing 400 bug) — **confirmed as a real bug; fix confirmed sufficient; no additional ordering conflict found**

Independently grepped route registration order rather than trusting the chair's line numbers:

```
security-cases.ts:41   router.get('/security/cases', ...)
security-cases.ts:73-74 router.get('/security/cases/:caseId', ...)   caseIdParamsSchema = /^[0-9a-f]{24}$/i
security-cases.ts:99-100 router.post('/security/cases/:caseId/claim', ...)
security-cases.ts:131-132 router.patch('/security/cases/:caseId', ...)

support-cases.ts:120  router.post('/support-cases', ...)
support-cases.ts:168  router.get('/support-cases', ...)              (scope=mine list)
support-cases.ts:235-236 router.get('/support-cases/:caseId', ...)
support-cases.ts:262-263 router.post('/support-cases/:caseId/notes', ...)
support-cases.ts:310-311 router.patch('/support-cases/:caseId/status', ...)

admin-verification.ts:27  router.get('/admin/verification-requests', ...)
admin-verification.ts:81  router.get('/admin/accounts/:id/profile', ...)   (different path entirely)
```

Express dispatches middleware/route handlers in registration order and, for a `GET` request, tries each
registered `GET` route in turn until one matches; `:caseId` is a single-path-segment wildcard, so
`GET /v1/security/cases/count` and `GET /v1/support-cases/count` — if a `/count` route were appended *after*
these routers' existing route lists, per the design chain's implicit assumption of "add a new handler" — would
both reach the `:caseId` handler first, fail the handler's own param validation (`caseIdParamsSchema`'s 24-hex
regex on `security-cases.ts`; presumably an ObjectId-shaped check on `support-cases.ts`, same pattern), and
return `400 VALIDATION_ERROR` before the count logic ever runs. **This is a real bug, not a hypothetical** — it
is a direct, mechanical consequence of Express's ordered matching plus a single-segment param route, and it is
exactly the kind of defect that would pass a design review reading each document in isolation and only surface
at Stage 9/10 as an inexplicable 400 on a brand-new route.

`admin-verification.ts` is confirmed clean: its only other `GET` route is `/admin/accounts/:id/profile`, a
different path prefix (`/admin/accounts/...` vs `/admin/verification-requests/...`) that cannot match
`/admin/verification-requests/count` under any Express matching rule. The chair's "this one is fine" holds.

**Does the fix (`/count` registered above `:caseId`) resolve it?** Yes — registering the `/count` route earlier
in the same router means Express tries the literal-segment route (`/count`) before the wildcard-segment route
(`:caseId`), and Express has no most-specific-match reordering; registration order is dispositive. This is the
correct and only fix short of changing the `:caseId` param's own regex to explicitly exclude the literal
string `count` (a worse fix — it couples an unrelated route's validation to this one's existence).

**Checked for other ordering conflicts the chair might have missed, beyond the two named:** I looked at every
route in both files for any other single-segment `:param` route that a `/count` suffix could collide with.
`security-cases.ts` has exactly one such route (`:caseId`) and the chair covered it. `support-cases.ts` has one
single-segment param route (`:caseId`) plus two two-segment param routes (`:caseId/notes`, `:caseId/status`)
that cannot match a one-segment `/support-cases/count` request regardless of registration order, so they are
correctly out of scope and the chair did not need to (and did not) mention them. **No additional conflict
found; the chair's fix and its stated scope are both complete.**

### 12.3 SR-012-5 (CI-1 manifest blindness, SH-2) — **confirmed as described; confirmed genuinely unfixable without a scanner change; no smaller fix available**

Ran the verifier rather than reading about it: `node scripts/verify-stage8-manifest.mjs` →
`Discovered 72 backend routes, 50 mobile screens, 39 web dashboard routes; manifest has 79 entries. PASS.`
Confirms CI-1 is green today, before this feature exists — consistent with the chair's framing that the defect
is latent, not yet triggered.

Read `discoverWebRoutes()` directly (`scripts/verify-stage8-manifest.mjs:100-127`, not the chair's excerpt):
the loop matches `<Route\b([^>]*)>` tags, then does `attrs.match(/\bpath=["']([^"']+)["']/)` and `continue`s
(skips) when there is no `path` attribute. Confirmed by grep that all three affected trees currently use
`<Route index>` with **no `path` attribute at all** — that is what makes the regex miss them, not a bug in the
regex's handling of a value:

```
src/admin/AdminRoutes.tsx:54    <Route index element={<Navigate to="accounts" replace />} />
src/security/SecurityRoutes.tsx:29  <Route index element={<Navigate to="cases" replace />} />
src/call-centre/CallCentreRoutes.tsx:36  <Route index element={<Navigate to="lookup" replace />} />
```

These are exactly what the scanner's own comment describes ("index/catch-all-less routes carry no distinct
screen") — today's index routes are pure `<Navigate>` redirects with no rendered content of their own, so the
comment's premise is currently true. Feature 012 replaces each of these three with a real, content-bearing Home
screen mounted at the same `<Route index>` position — the premise the comment relies on stops holding the
moment this feature ships, and nothing in the scanner changes to notice that.

**Is this truly unfixable without touching the scanner, or is there a smaller fix?** I looked specifically for
a synthetic-path-convention alternative, since that is the obvious "small fix" to reach for. It does not work:
`<Route index>` is a React Router API constraint, not a stylistic choice — an `index` route is defined
precisely by the *absence* of a `path` prop (React Router rejects `index` and `path` on the same element), so
there is no JSX-level convention (e.g. `path=""`) that could be adopted in the route files themselves to make
the existing regex pick it up. The only way to make the scanner see these routes is to change what the
scanner looks for: either special-case `<Route index` (a `\bindex\b` attribute-presence check, mapping it to
the parent's mount prefix, exactly as SH-2 proposes) or fail loudly when an `index`-tagged route can't be
named. Both of those are changes to `verify-stage8-manifest.mjs` itself. **Confirmed: there is no fix smaller
than a manifest-scanner change, and the chair's disposition (file as SH-2, fix owned by `devops-engineer` +
this role, not a Feature 012 blocker because condition 2 in §5 covers this feature by hand) is correct as
written.** I would add one implementation note for whoever picks up SH-2 (not a condition on this feature):
the fix is a small, mechanical change — detect `index` via `/\bindex\b/.test(attrs)` before the `path`-attribute
check, and emit `mountPrefix` itself (with no trailing segment) as the discovered route — not a structural
rework of the scanner, so "unfixable without a manifest-scanner change" should not be read as "expensive to
fix." It is a five-line change, gated correctly behind its own review rather than folded into this one.

### 12.4 SR-012-6 (AC-5 wording) — **confirmed real, not overthinking**

Checked the actual list route's pagination limit rather than trusting the citation: `grep -n "limit"
src/admin/pages/AdminVerificationPages.tsx` confirms `listVerificationRequests({ limit: 50 })` at line 21 — a
fixed client-side page size with no headline total rendered elsewhere on that page. The chair's arithmetic
(60 pending, count says 60, list page shows 50 rows) is not manufactured; it is the direct consequence of a
real, currently-shipped `limit: 50` call site plus a `countDocuments()`-backed count that has no equivalent
cap. A QA engineer executing AC-5 exactly as currently worded ("counting/reading its own total") against a
seed of more than 50 pending verifications would file a defect against a correctly-implemented system, and the
"obvious" fix an engineer under schedule pressure might reach for — capping the count at the list's `limit` —
is precisely F-012-2, the bug this whole design chain exists to have resolved. This is a genuine testability
defect with a genuine bad-fix trap behind it, not a stylistic nitpick. The chair's required restatement (count
must equal the *true total of the filtered population*, tested with more rows than one page's `limit`) is the
correct and minimal fix, and directly matches `api-design.md` §6's own Stage 10 test note — so the chair is not
inventing a new requirement, only making an existing one testable as literally written.

### 12.5 §10 (Stage 9 non-deviation spec) — internal consistency check

I checked every cross-reference in §10 against the document it cites, rather than trusting §10's own
parentheticals:

- Item 3's "no `accountId`, no `category`" matches §1's SR-012-1 requirement verbatim. Consistent.
- Item 5's "via the shared `buildPartnerOrgQuery` helper for security-cases (§3)" — checked against
  `api-design.md` §3 directly: `buildPartnerOrgQuery(partnerOrganizationId, filters)` is named there exactly,
  extracted from `listForPartnerOrg`'s existing inline query (lines 246–254) and reused by both the list and
  the new count method. Consistent, not a dangling reference.
- Item 6's "Security handler: no audit call (RR-012-1/RR-012-2)" — checked against §9.7 directly: compliance
  explicitly declines to extend the audit requirement to the security-cases count, for the stated reason that
  `recovery_cases` reads have no audit trail shape to write into today. Consistent — §10 correctly encodes an
  absence as deliberate, not an oversight.
- Item 8 ("Route registration order... with a route-level test") is the SR-012-2 fix stated as a fixed
  contract point, not merely a recommendation buried in §2 — this is good practice: a condition that only lives
  in prose above a numbered register (as C-012-A1 did, per §4) is exactly the drift pattern this document
  itself warns about, and §10 correctly promotes it into the non-deviation list rather than leaving it there.
- **One gap I would flag, not blocking:** §10 item 6 specifies the audit call as
  `recordBulkDisclosure({ disclosedAccountIds: [] })` "before serialising the response, and let a throw become
  a 5xx" for admin and support handlers, but does not explicitly restate AUD-10's fail-closed requirement for
  *when* in the handler this call must occur relative to the count's own `countDocuments()` call — i.e. whether
  the audit write happens before or after the repository read. This is implicit from "before serialising the
  response" and from the sibling routes' own pattern (audit call immediately precedes `res.json(...)` in both
  `admin-verification.ts` and `support-cases.ts` today), so an engineer reading the sibling code alongside §10
  would not go wrong — but §10 itself does not say "audit call after the count is computed, before the response
  is written," and a strict reading of item 6 in isolation (audit before serialising) is technically satisfied
  even by an audit call that races the `countDocuments()` call. I do not consider this ambiguous enough to
  block Stage 9 — the sibling-route precedent closes it in practice — but I record it so a reviewer at Stage 9
  checks the handler orders `count → audit → respond`, not `audit → count → respond` (the latter would let an
  audit-log failure short-circuit before the count is even known, which is harmless here but is the kind of
  small inversion that becomes a real bug on a route that does more work).
- No other gap found. §10 gives `backend-engineer`/`frontend-engineer` a spec that is buildable without
  further clarification on every other point checked.

### 12.6 RR-012-2 (partner-org audit gap) — **position confirmed: correctly scoped as tracked-separately, not a blocker**

I independently re-derived this rather than deferring to the chair's framing. `admin_access_log`'s validator
constrains `resourceType` to `policy | asset` (`backend/src/db/feature004-collections.ts`) — confirmed by the
chair's citation and consistent with what this role already knows of that collection's schema from prior
reviews (Feature 010/011). There is genuinely no row shape to write a `recovery_cases` partner-read event into
today, so **any** fix would require schema work (a new `resourceType` value plus a validator migration) that is
squarely outside Feature 012's scope, which touches zero rows of `admin_access_log`. Feature 012's own
contribution to this gap is exactly one endpoint (`GET /v1/security/cases/count`) that is, on the chair's own
§3.2 analysis (independently re-checked: with `status=open` or no filter the query legitimately spans the
cross-tenant unassigned-open pool; with any other `status` value the two `$or` limbs are mutually exclusive and
the result is strictly the caller's own org's cases — I re-verified this against `recovery-cases.ts:246-254`'s
`$or` shape and it holds), strictly *cheaper* to call than the already-shipped, already-unlogged
`GET /v1/security/cases` list route at the same auth tier. Feature 012 does not create the gap, does not
meaningfully widen it (a poll of an integer is a strictly weaker signal than a poll of the full list, which
already exists and is already unlogged), and closing it correctly requires a `resourceType` schema change that
belongs with the Security Company Dashboard's own Stage 8 (ADR-0006 C-15/C-16(b)) — building it backwards,
starting from a count endpoint, would produce a worse-shaped audit trail than building it from the dashboard's
actual read surface. **My position: this feature's shipping does not need to wait on RR-012-2 being closed.**
It is correctly scoped in §9 as "flagged, tracked separately, not a blocker to this specific conditional
sign-off," bounded by SR-012-3's no-polling / same-tier constraints so the marginal exposure stays small while
the gap remains open. I concur with the chair's disposition and add no new condition.

### 12.7 Verdict

**CONCURRENCE GIVEN.**

Every load-bearing citation in the chair's review that I could independently verify against the running code —
the §5/§9.5/§9.6 contradiction, the route-registration order and the 400 failure mode, the manifest scanner's
literal blind spot for `<Route index>`, the AC-5/`limit: 50` mismatch, and the internal consistency of §10 —
checked out exactly as described, with no material inaccuracy and no gap the chair's own proposed fixes leave
open. I found one non-blocking documentation gap of my own (§12.5's audit-call-ordering point in §10 item 6) and
one implementation note for SH-2's eventual fix (§12.3) — neither changes the conditions register, neither
withholds concurrence, and neither requires a fresh pass by this role before Stage 9 begins.

SR-012-1 through SR-012-7 are, on my independent review, the right conditions, correctly scoped, and
individually sufficient to close the gaps they target. SR-012-8 remains open on the `compliance-specialist`
limb only; my limb is discharged as of this section. **Stage 8 is not yet fully discharged** — it requires
`compliance-specialist`'s concurrence in §13 before Development may treat this gate as closed on all three
required signatures, per `02-feature-lifecycle.md`.

**Filed by:** `security-engineer`, 2026-09-10.
**Does not discharge:** Stage 8 (SR-012-8 remains open on the `compliance-specialist` limb) · Stage 10 QA ·
RR-012-1/RR-012-2/RR-012-3/RR-012-4 · the `web-admin-verification`, `web-security-cases`,
`backend-security-cases` and `backend-customer-lookup` waivers · ADR-0006 C-15/C-16(b) · SH-2 (filed, not
fixed) · Feature 009 A-1.

## 13. `compliance-specialist` concurrence under SR-012-8 — **CONCURRENCE GIVEN (conditional)**

**Date:** 2026-09-10. **Role:** `compliance-specialist` (C on this gate).
**Status: CONCURRENCE GIVEN**, on the same conditional terms as the chair's own sign-off — Stage 9 may
begin; my limb discharges at Stage 9 exit subject to **C-012-1** and **C-012-2** below, alongside
SR-012-1 … SR-012-7. I am not withholding: nothing has shipped, no personal information has been
processed by this feature, and every condition I attach is a change to a design that has not been
written yet — which is the correct place to attach them and is materially different from Feature 011's
posture, where my conditions had already been overtaken by live production data.

**One item on the chair's own non-deviation list changes as a result of this section** — §10.6's
"Security handler: no audit call" — and I flag that explicitly in §13.2 rather than quietly diverging.
Per SR-012-7 the chair's sign-off is void for that item and needs the chair's acknowledgement; the change
adds a control and removes nothing, so I do not expect it to be contentious, but it is not mine to make
silently. **`security-engineer`'s §12 landed concurrently with this section** (CONCURRENCE GIVEN,
2026-09-10) and I read it before filing. I concur with §12 in full on its own scope, with one factual
correction to §12.6 that it inherited from my §9.7 and could not have been expected to catch — §13.2
below.

**Code read for this section (2026-09-10, running code, not the design chain):**
`backend/src/repositories/audit-log.ts` (full) · `backend/src/db/feature004-collections.ts:230-270` ·
`backend/src/repositories/recovery-cases.ts:220-330` · `backend/src/routes/security-cases.ts:40-120` ·
`backend/src/context.ts:100-190` · `backend/migrations/031_account_audit_log_actor_column.sql` ·
`backend/migrations/033_adr0006_audit_correlation_columns.sql` ·
`backend/migrations/030_stage9_security_review_schema_changes.sql:50-110` ·
`docs/features/012-employee-dashboard/business-requirements.md` §3.2/§10 · `api-design.md` §§3-9 ·
`ui-design.md` §§3.2-4.3 (via the chain's own citations, re-checked where load-bearing).

### 13.1 SR-012-1 — agreed, and it fully resolves the disclosure gap. One amendment to my §9 is still needed.

**I concur with SR-012-1 without reservation, and the chair is right that the contradiction was mine to
own.** `api-design.md` §5's schema and my §9.5 durable rule were written into the same file hours apart
and disagree. §9.6 corrected §5.1's *conclusion* and I did not read §5's *schema* — the chair read the
document against itself, which is what a gate is for.

**Does removing `accountId` fully resolve the gap? Yes — on the disclosure limb, completely.** With
`scope: z.literal('mine')` + optional `status`, the route's response space is one integer over a
population defined entirely by the caller's own `req.auth.accountId`. No request parameter can cause the
number to relate to an identified data subject. Under POPIA that means no *personal information* is
returned, so s23 has nothing to answer and my §9.2 prohibition on a `privileged_data_access` row is not
merely permissible but correct. The `privileged_bulk_access` / `resultCount: 0` row required by §9.4 and
§9.6 stands unchanged and needs no adjustment. **My §9 ruling survives the correction intact.**

Two points of precision the chair's §1 does not need but the record does:

**(a) `accountId` removal is compliance-mandatory. `category` removal is not.** `category` names no
subject, so under §9.5 row 1 it is not a disclosure and POPIA does not require its removal. Removing it
is correct data-minimisation discipline (§13.3) and I endorse it, but if a future editor needs to know
which half of SR-012-1 they may not relax without me: **`accountId` is mine, `category` is
`backend-architect`'s and the chair's.** I do not want a later reader treating a `category` filter as a
POPIA question when it is a scope-creep question.

**(b) Amendment to §9.5 — the classification must be decided by the schema, not by the request.** This is
the durable lesson SR-012-1 exposes and my §9.5 table does not state. My table classifies a *call*
("count keyed to an identified subject" → disclosure). Applied to a route whose filter is *optional*, that
gives a handler two audit shapes selected at runtime by whether the caller supplied `accountId` —
i.e. exactly the runtime conditional that `api-design.md` §2 and C-012-A1 rejected for row data, now
reintroduced in the audit path, where a regression is silent by definition (a missing audit row produces
no error, no failed test unless one was written for it, and no user-visible symptom).

> **§9.5 amendment, binding:** a count route's audit shape is a **static property of its Zod schema**, not
> of the request. A route may therefore **not** carry an optional subject-keyed filter. If a subject-keyed
> count is wanted it is a separate route whose schema makes `accountId` **required**, so that
> `privileged_data_access` with `accountId: X` is the only shape that handler can ever emit. Mixed-shape
> count handlers are prohibited.

This converts SR-012-1 from a one-off correction into the rule that makes it unnecessary to catch again,
and it is why SR-012-1's "not reachable by relaxing a Zod schema" is the right framing. Registered as
**C-012-2**.

### 13.2 RR-012-2 — ruling

The chair asks whether the pre-existing partner-org audit gap may stay open while Feature 012 ships, or
whether `/v1/security/cases/count`'s cross-tenant aggregate tips it into a must-close-first. **Neither, as
posed. The question contains a false choice, and my own §9.7 supplied the faulty premise it rests on.**

**Ruling, in two parts:**

**(1) RR-012-2 as a class stays open, and Feature 012 does not block on it.** I confirm the chair's
disposition and my §9.7 reasoning on this limb. Building a partner-organisation audit trail — Trail B,
`admin_access_log`, whose validator constrains `resourceType` to `policy | asset`
(`feature004-collections.ts:265`, re-verified today) and which has no row shape for a recovery-case
access, plus ADR-0006 §14.7's mandated purpose/case reference and §14.4.3's s23 third-party
answerability — is a design task of its own, owned by ADR-0006 C-15/C-16(b). Starting it from a count
endpoint would be building it backwards, and Feature 012 genuinely does not make the class worse: the
`GET /security/cases` *list* route is equally unlogged today and returns a strictly richer signal to the
same caller at the same tier. **Holding a four-hour Home-screen feature hostage to a multi-feature audit
trail would be enforcement theatre, and I decline to do it.** The chair's "reviewed and found open, not
reviewed and cleared" characterisation is exactly right and I adopt it.

**(2) But the count endpoint may not ship trace-free, and I was wrong that no row shape exists for it.**
**This is a correction to my own §9.7, and `security-engineer`'s §12.6 has now independently
re-derived the same wrong premise from it** — §12.6 states "there is genuinely no row shape to write a
`recovery_cases` partner-read event into today, so **any** fix would require schema work (a new
`resourceType` value plus a validator migration)." That is exactly the error, faithfully inherited, and it
is mine: §12.6 verified my citation and my citation was to the wrong table. I do not hold this against
that section — it is the clearest possible demonstration that a wrong premise in a compliance ruling
propagates through roles that are doing their job correctly, which is why I am correcting it here in terms
rather than in a footnote.

My §9.7 declined to extend §9.4 to the security-cases count on the stated ground that "there is no
existing row shape for this access class to write into." That sentence is about **Trail B**
(`admin_access_log`, Mongo, `resourceType: policy | asset`) and it is true of Trail B. **It is false of
Trail A**, and Trail A is where §9.4's row lives. Verified today, line by line:

- `privileged_bulk_access` is a live enum value in `app.account_audit_log`
  (`audit-log.ts:53`, migrations/032).
- Its only structural requirements are an attributable actor
  (`account_audit_log_privileged_has_actor`, mirrored at `audit-log.ts:147-151`), `account_id` **null**,
  and `result_count` set (`account_audit_log_result_count_only_on_bulk`, mirrored at `:161-167`).
  There is **no** `resourceType` column and **no** subject requirement on this event type.
- `actor_account_id` is `uuid references app.accounts (id)`
  (migrations/031:29). A `security_company_operator` **is** a row in `app.accounts` — `user_type` and
  `partner_organization_id` are columns on that table (migrations/030:56-57, 62-63), and
  `security-cases.ts:46` already reads `req.auth!.accountId` for its own rate-limit key. The FK is
  satisfiable.
- `ctx.auditLog` is on the single shared `AppContext` (`context.ts:105`), which `security-cases.ts`
  already receives. **No plumbing, no migration, no new event type, no new writer, no schema change.**

So the choice is not "leave it unlogged or build the partner trail first." The actual cost of giving this
endpoint an actor-keyed trace is **one `await` using a writer the other two count handlers in this same
feature are already required to call.** ADR-0006's repeated cost test — "there is almost nothing to accept
a risk *about*" — cuts decisively here, and my §9.3 reason 1 applies with **more** force to a partner
operator than to an internal admin, not less: a partner organisation is a separate legal entity, an
external third party under POPIA s21/s23 and ADR-0006 §14.4.3, exercising a read capability over a
population that includes cases belonging to customers whose recovery it has not been assigned. Of all the
privileged principals on this platform, this is the last one whose reads should be the ones that leave no
trace at all.

On the chair's specific finding — that `?status=open` returns the platform-wide unassigned-open pool, not
just this partner's cases (`recovery-cases.ts:247-254`, re-verified) — **that is not a POPIA disclosure and
I am not treating it as one.** A bare integer over the unassigned pool relates to no identifiable person;
§9.5 row 1 governs, and the chair's analysis that non-`open` statuses collapse the `$or` and drop the
shared pool is correct as written. The cross-tenant aggregate therefore does **not** tip RR-012-2 into a
must-close-before-Stage-9 blocker. What it does is make the *actor-keyed* gap indefensible at this price
point.

> **C-012-1 (Required, blocks Stage 9 exit):** `GET /v1/security/cases/count` writes **exactly one**
> call-scoped `privileged_bulk_access` row, `resultCount: 0`, via
> `ctx.auditLog.recordBulkDisclosure({ disclosedAccountIds: [], … })` — the empty array literal, never a
> variable — on the identical terms as §9.4(a)-(d): before response serialisation, fail-closed to a 5xx
> per AUD-10, the returned count **never** written to `result_count`, and **zero**
> `privileged_data_access` rows. §9.4(e)/C-17 applies to the `status` filter: it may be recorded as a
> field *used*, never as a value, and today it is recorded not at all. **Handler ordering is
> `count → audit → respond`**, adopting `security-engineer`'s §12.5 point — which was written about §10
> item 6 for the other two handlers and applies identically to this third one. AUD-10 requires the audit
> write to precede *serialisation*, not the query (`audit-log.ts:191-196`).
>
> **This supersedes `api-design.md` §3's "Audit event: none", my own §9.7's non-extension, and the chair's
> §10.6 "Security handler: no audit call."** Owner `backend-engineer`; requires the chair's
> acknowledgement under SR-012-7 as a departure from §10's fixed contract. Stage 10 asserts the same four
> assertions SR-012-6.3 already requires on the other two handlers, extended to this third one.

**What C-012-1 does and does not close.** It closes the *actor-keyed* half of the gap for this one new
endpoint: an investigator can answer "what did this partner operator do in this sitting" for the count
route. It closes **nothing** on the *subject-keyed* half — s23's "who has accessed my information" remains
unanswerable for every partner read of `recovery_cases`, including the list and detail routes and
including this count, because a `resultCount: 0` row names no subject and there is nothing here to name.
**RR-012-2 stays open, unchanged in substance, owned by ADR-0006 C-15/C-16(b).** C-012-1 is not a
down-payment on it, is not to be cited as partial satisfaction of it, and specifically must not be read as
establishing that partner-org access is now audited. One endpoint of four is traceable; the class is not.
I record that explicitly because the chair's reason for filing RR-012-2 as NOT ACCEPTED was that this gate
might later be cited as having cleared it, and a partial fix is the most likely thing to be miscited.

### 13.3 POPIA data-minimisation on FR-4 as it now stands — confirmed, with one standing condition

Post-SR-012-1 and post-§9, I have re-derived what each of the three endpoints puts on a wire to each role:

| Endpoint | Params (final) | Response | Discloses more than a bare number? |
|---|---|---|---|
| `/v1/admin/verification-requests/count` | none | `{data:{count}}` | **No.** Queue depth over `pending_review`. No subject, no name, no ID fragment. This is also the basis of the chair's RR-012-4 ruling, which I independently confirm: no identity-verification *data* reaches the Home screen, so `web-admin-verification`'s waiver is not engaged by the count and is not released by it |
| `/v1/support-cases/count` | `scope=mine` (literal) + `status?` | `{data:{count}}` | **No.** Population is keyed to the caller's own `accountId`. Own-work aggregate |
| `/v1/security/cases/count` | `status?` (enum) | `{data:{count}}` | **No** personal information. Cross-tenant *aggregate* per §13.2, ruled not a disclosure |

**Confirmed minimal.** The properties that make this true, and which are now load-bearing rather than
incidental: the response is an explicit object literal with no filter echo, no `hasMore`, no sample row
and no ids (chair §3.5, §10.4); there is no `404` path, so the response set carries no existence signal
the sibling routes do not already carry; no `Cache-Control`, so no count is served without its row; and
the aggregate value `N` is never written into the audit trail (§9.4(b)).

**One residual I have to name, because nobody in the chain has and it is the only thing that could turn
the security count into a genuine inference channel.** The partner count is defensible *because* the
sibling list route already returns the same union population in full to the same caller — the count's
marginal information is zero. That is a **relative** property, and it is the load-bearing one. If
`GET /security/cases` is ever narrowed (e.g. RR-012-2's eventual fix restricts the unassigned pool, or a
purpose/case-reference gate per ADR-0006 §14.7 limits what a partner may list) while
`countForPartnerOrg`'s `buildPartnerOrgQuery` keeps the wider `$or`, the count silently becomes a
capability with no richer sibling — an un-gated, un-purposed, low-cost oracle over a population the caller
may no longer read. The shared query builder the chair endorsed (§3, §10.5) makes this unlikely by
construction and that is exactly why I want it stated as the reason:

> **C-012-3 (Standing):** a count endpoint's population may **never** be broader than the population the
> same caller can read through its sibling list route. Any narrowing of `GET /security/cases`,
> `GET /admin/verification-requests` or `GET /support-cases` — including one made to close RR-012-2 — must
> narrow the corresponding count in the same change. `buildPartnerOrgQuery` being shared between
> `listForPartnerOrg` and `countForPartnerOrg` is the control that delivers this; it may not be
> un-shared, and a hand-mirrored filter (§4/§5) must be re-checked against its sibling whenever the
> sibling changes. Owner: all roles. Re-checked at every review of the partner surface.

**No k-anonymity or small-number condition is required**, and I considered one rather than skipping it. A
count of `1` on any of the three tells the caller "there is exactly one" — but in every case that same
caller can read the one, in full, through the sibling list route. Bucketing or suppressing small counts
would add no protection and would break AC-5. **No condition.** This changes if C-012-3 is ever breached.

**RoPA position, stated so the asymmetry with Feature 011 is on the record and not an inconsistency.**
Feature 012 introduces **no new personal-information category, no new purpose and no new recipient**. The
audit trail is an existing processing activity; this feature adds call sites to it. **I therefore do not
gate Stage 9 or first production use on INC-001-C-10 (platform RoPA, due 2026-09-15, five days out and
still unstarted — I re-verified today that no RoPA artefact exists in this repository).** Feature 011 was
gated because it captured a *new* category (SAPS case number, station, date) about real customers; nothing
comparable happens here. What I do commit to: the three count routes are listed in the RoPA's
privileged-access-path inventory when it lands, and C-012-1's row is described there alongside §9.4's.
That is a documentation obligation on me, not a condition on `backend-engineer`.

**PCI-DSS scope: nil.** No payment data is touched by any of the three endpoints, by `app.account_audit_log`,
or by any surface in this feature. Unchanged.
**Regime scope, reconfirmed 2026-09-10 rather than inherited:** **POPIA applies** (SA data subjects, SA
responsible party under TDIT-2026-09; ADR-0006 §14.1). **GDPR not triggered** — no EU data-subject
footprint found in code or product artefacts; C-011-7 stands and this reverts to an open question the day
an EU-resident customer is onboarded. **Insurance-sector recordkeeping: no floor attaches to
privileged-access telemetry** — ADR-0006 §14.2.2's ruling that a read is not a record of a financial
service rendered covers the rows this feature emits, and I re-confirm it here rather than assuming it
carried over from §9.1.

### 13.4 §3.2 cross-role exclusion — final check, intact

Confirmed intact through Stages 4-8. This is a verification pass, not a re-derivation; the chain checked
it at each stage (`business-requirements.md` §3.2/§10.1 lines 541-553, `ui-design.md` §3.3/§5,
`api-design.md` §§3-5, chair §10.1/§10.13) and I re-checked the four places it could have been lost:

1. **No endpoint serves two roles.** Three routes, each with `requireUserType(<single role>)` and a
   token-derived scope, and the chair's §10.1/§10.2 fix them at exactly that: no fourth count, **no
   combined "dashboard summary" endpoint**, no route accepting more than one `user_type`. A merged summary
   endpoint was the one realistic way §3.2 could have been lost at Stage 7 and it was refused.
2. **No request parameter can widen scope on any of the three** (chair §8, independently re-derived here
   against `security-cases.ts:44-46,55` and my §13.1 reading of the support schema). Post-SR-012-1 the
   union of all three query schemas is `{status?, scope: 'mine'}` — nothing addressable to another role's
   population.
3. **Frontend: props injection + lint fence (SR-012-4).** This is the condition that keeps AC-6 structural
   rather than prose, and from my side it is the one that matters most — a `switch (role)` inside a shared
   component is one edit away from a shared component that fetches two roles' data. I note for the record
   that SR-012-4.2's ESLint `no-restricted-imports` fence is the *compliance* control here, not merely an
   architecture preference, and that `security-engineer` verified the SR-011-1c precedent by adversarial
   plant rather than by reading — I ask for the same treatment here and will take that verification from
   §12 rather than re-doing it.
4. **FR-3 stays a static, plain-text, frontend-shipped constant** with a role filter over a local array
   (`HOME_ANNOUNCEMENTS.filter(...)`, chair §4.3). No backend authoring, no role-targeted delivery, no read
   receipts — so no announcement can carry another role's operational data and no per-employee engagement
   record is created. The chair's explicit permission for that filter is right and I endorse it: a role
   variable is not cross-role data.

**Why this matters on my limb and not only architecturally:** cross-role visibility is a **new recipient
category**, not a UI change. An admin seeing partner case aggregates, or a partner operator seeing
platform verification depth, creates a data flow that needs its own lawful basis, its own RoPA recipient
entry and — for the partner direction — s23 answerability the platform demonstrably cannot provide today
(§13.2). **§3.2's exclusion is therefore a compliance control and I am recording it as one.** Any revival
of cross-role visibility, including "harmless" aggregates and including a unified staff activity feed,
requires a fresh ruling from me before Stage 2 commits it — restating `business-requirements.md` §7's own
condition, which remains unmet-because-untriggered rather than satisfied. Registered as **C-012-4
(standing)**.

### 13.5 Register additions

| ID | Condition | Owner | Blocks |
|---|---|---|---|
| **C-012-1** | `GET /v1/security/cases/count` emits one `privileged_bulk_access` row, `resultCount: 0`, via `recordBulkDisclosure({ disclosedAccountIds: [] })`, on §9.4(a)-(d) terms. Supersedes `api-design.md` §3, my §9.7's non-extension, and chair §10.6's "no audit call" — needs the chair's SR-012-7 acknowledgement. Stage 10 extends SR-012-6.3's four assertions to this handler | `backend-engineer`; ack `cybersecurity-architect`; tests `automation-qa-engineer` | Stage 9 exit; my SR-012-8 limb |
| **C-012-2** | **§9.5 amended:** a count route's audit shape is a static property of its schema. No optional subject-keyed filter on any count route; a subject-keyed count is a separate route with a **required** `accountId` emitting only `privileged_data_access`. Mixed-shape count handlers prohibited | `backend-architect` + `backend-engineer` | Standing; and SR-012-1 as implemented |
| **C-012-3** | **Standing:** a count's population may never exceed what the same caller can read via its sibling list route. Any narrowing of a list route — including RR-012-2's eventual fix — narrows its count in the same change. `buildPartnerOrgQuery` stays shared | all roles | Standing |
| **C-012-4** | **Standing:** §3.2's cross-role exclusion is a compliance control. Any cross-role visibility or unified staff activity feed is a new recipient category requiring a fresh ruling from me before Stage 2 commits it | `product-manager` + this role | Standing |

**RR-012-2: I concur with the chair's NOT ACCEPTED disposition.** It is a real, open, pre-existing gap; it
does not block Feature 012; and C-012-1 does not close it. **RR-012-1: accepted as written, now with the
audit trace C-012-1 adds** — the chair's basis holds and improves.
**RR-012-3 (audit-row volume): accepted on my limb**, bounded by SR-012-3. Trail dilution is a real cost
and the chair is right that the row is worth having bounded; C-012-1 adds a third writer at the same
per-call cost and the 100/min partner tier plus once-per-mount fetch keeps it proportionate. If actor-keyed
queries become noisy in practice this is revisited jointly, not unilaterally.
**RR-012-4: I independently confirm the chair's ruling** — the admin count does not inherit
`web-admin-verification`'s block, because the block is on identity-verification *data* and the payload is
a subject-less queue depth. My concurrence covers the count only; the waiver is untouched.

### 13.6 Verdict

**CONCURRENCE GIVEN (conditional) — Stage 9 may begin.** My limb of SR-012-8 discharges at Stage 9 exit on
confirmation of **C-012-1** (one line, one existing writer) and **C-012-2** (a schema rule the chair's
SR-012-1 already implements for v1). I will re-confirm both on a diff, not a fresh review cycle.

The honest summary of my own contribution to this gate: the chair caught a contradiction inside my §9 that
I should have caught, and re-reading §9.7 against the running code today shows it declined a control on a
premise about the wrong audit trail. Both corrections make the feature better and neither is expensive.
The design chain on Feature 012 held up under adversarial reading, which is the outcome INC-001 was meant
to produce.

**Effect on the gate:** with the chair's §0-§11 (CONDITIONAL SIGN-OFF), `security-engineer`'s §12
(CONCURRENCE GIVEN, 2026-09-10) and this section, **all three SR-012-8 signatures are now recorded and
Stage 8 is discharged on a conditional basis.** Development may proceed. Stage 9 **exit** is gated on
SR-012-1 … SR-012-6 plus C-012-1 and C-012-2; SR-012-5's manifest entries gate merge of the Stage 9 diff;
SR-012-7, C-012-3 and C-012-4 are standing. The chair should record the SR-012-7 acknowledgement of
C-012-1's departure from §10.6, and `security-engineer` may wish to note the §12.6 correction — neither
requires a fresh review cycle and neither reopens this gate.

**Filed by:** `compliance-specialist`, 2026-09-10.
**Does not discharge:** Stage 10 QA · RR-012-2 / ADR-0006 C-15/C-16(b) and the
partner-org audit gap · the `web-admin-verification`, `web-security-cases`, `backend-security-cases`,
`backend-customer-lookup` waivers · Feature 009 A-1 · INC-001-C-10 (RoPA, 2026-09-15) · CT-3 (breach
runbook) · CT-4 · Feature 011's C-011-1 … C-011-12 · SR-010-2's `scope=all` withholding · SH-2.
