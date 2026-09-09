# Feature 012 — Employee Dashboard (Shared Staff Home) — Security Review (Stage 8)

**Status:** **CONDITIONAL SIGN-OFF — Stage 9 (Development) may begin, bounded by SR-012-1 … SR-012-7.**
**Date:** 2026-09-09
**Lifecycle stage:** 8 — Security Review (hard gate). **Chair / decision owner (A):** `cybersecurity-architect`.
**Joint gate status — INCOMPLETE:** `security-engineer` (R) and `compliance-specialist` (C) concurrence not yet
recorded (**SR-012-8**). `compliance-specialist`'s ruling at `api-design.md` §9 is an *input* to this gate — §9.8
says so in terms ("**Is not:** a Stage 8 compliance sign-off for Feature 012") — not a limb of it. Per
`02-feature-lifecycle.md` and root `CLAUDE.md`, **Stage 8 discharges only when all three roles sign.**

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

_Not yet recorded._

## 13. `compliance-specialist` concurrence under SR-012-8

_Not yet recorded. `api-design.md` §9 is an input to this gate and does not discharge it (§9.8)._
