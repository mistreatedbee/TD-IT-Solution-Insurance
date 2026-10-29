# INC-005 — Claims kill-switch route shadowing took down Support/Analytics routes in production

**Chair:** `site-reliability-engineer` · **Date filed:** 2026-10-29 · **Status:** **RESOLVED** (fix
deployed and verified live in production)
**Severity:** Sev2 (availability — fail-closed, no data exposure). Call Centre / Support Portal
surface and product analytics were unreachable in production for the exposure window below.
**Filed per:** `docs/features/018-claims-filing-and-adjudication/security-review.md` §13.1 item 4 /
§13.3 item 1, which left SR-018-9's "production recovery confirmed + incident filed" requirement
open pending this record.

---

## 1. What happened

The claims and admin-claims kill-switch guards were implemented as **path-less** `router.use(...)`
middleware mounted at the application root in `backend/src/index.ts`. Express evaluates root-mounted
middleware against every subsequent request regardless of path, so once the claims kill switch
short-circuited (fail-closed, per SR-018-2, because `CLAIMS_API_ENABLED` was never set in Render),
it 404'd **every route registered after it in the mount order** — not only `/claims` and
`/admin/claims`.

Affected routes for the duration of the outage:
- `/v1/support-cases*` (all support-case routes)
- `/v1/support/*` (customer-lookup, recovery-case lookup, notification-preferences)
- `/v1/analytics/*`, including `/v1/admin/analytics/*`

Because the failure mode was "return 404" rather than "return data", nothing leaked — this was a
pure availability incident, not a confidentiality one. No claims data was ever exposed (claims
remained correctly gated the whole time; see SR-018-1/SR-018-2 production closure, security-review
§7).

## 2. Root cause

A path-less `router.use()` on a root-mounted router shadows every router mounted after it in the
chain, not just requests under that router's own prefix. The claims kill-switch gate needed to be
scoped (`router.use('/claims', ...)` / `router.use('/admin/claims', ...)`) but was not in the
version deployed at `c2ff720`.

## 3. Detection and fix

Caught during Stage 8 security re-review (SR-018-9, `security-review.md` §11–§13), not by
production alerting — **no SLO/alerting currently exists for this path** (see §6). Fixed in commit
`0dc7ff9` ("URGENT PROD FIX: scope claims kill switch to /claims path (SR-018-9)"), which scopes
both gates to their own prefixes (`claims.ts:83` → `router.use('/claims', …)`;
`admin-claims.ts:82` → `router.use('/admin/claims', …)`), and added a regression test,
`backend/src/routes/root-mount-order.test.ts`, that reproduces the real `index.ts` mount order and
fails if the path-less form returns.

## 4. Outage window

- **Introduced:** commit `c2ff720` (committer timestamp `2026-10-28T12:08:34+02:00`).
- **Fixed:** commit `0dc7ff9` (committer timestamp `2026-10-28T15:36:44+02:00`).
- **Caveat (read before citing these as deploy times):** I was not able to pull Render's deploy
  history/timestamps directly — I have no Render API token or CLI session available in this
  environment, and credential/API exploration for one was denied by policy. The bounds above are
  **git commit timestamps on `main`**, not confirmed Render deploy-completion timestamps. Render's
  `render.yaml` here auto-deploys from `main` on Frankfurt/free-tier infra with no documented build
  queue depth, so actual deploy completion for each commit was very likely within single-digit
  minutes of these commit times, but that gap is not independently confirmed in this record.
  **Action owed:** whoever holds Render dashboard/API access should pull the exact deploy-start/
  deploy-live timestamps for both commits from Render's deploy history and append them here (this
  is an append-only shared document — add a dated subsection, do not edit this section).
- Approximate outage duration on the above bounds: **~3.5 hours**.

## 5. Production recovery verification (evidence)

Performed 2026-10-29 directly against the live backend (confirmed via `render.yaml` as
`https://td-it-solution-insurance.onrender.com`; the service's base path is `/api/v1`, not `/v1` —
confirmed via a passing `/api/health/ready` health check and by the request/response pairs below,
which 401 rather than 404 once the correct prefix is used).

| Request | Response | Interpretation |
|---|---|---|
| `GET /api/health/ready` | `200 OK` | Live service confirmed up on the commit currently deployed. |
| `GET /api/v1/support-cases` | `401 {"error":{"code":"UNAUTHORIZED",...}}` | Past the claims-router shadow, into the route's own auth gate. **Reachable.** |
| `GET /api/v1/support/customer-lookup` | `401 {"error":{"code":"UNAUTHORIZED",...}}` | **Reachable.** |
| `POST /api/v1/analytics/events` | `401 {"error":{"code":"UNAUTHORIZED",...}}` | **Reachable.** |
| `GET /api/v1/admin/analytics/dau` | `401 {"error":{"code":"UNAUTHORIZED",...}}` | **Reachable.** |
| `GET /api/v1/claims` | `404 {"error":{"code":"NOT_FOUND",...}}` | Correctly still gated — kill switch intact, unchanged behavior, `CLAIMS_API_ENABLED` still unset. |
| `GET /api/v1/admin/claims` | `404 {"error":{"code":"NOT_FOUND",...}}` | Correctly still gated. |

All four previously-shadowed route families now return `401 UNAUTHORIZED` (reached their own
auth middleware) instead of `404 NOT_FOUND` (shadowed by the claims gate) — this is the exact
discriminator the security review asked for (§13.1 item 4: "a non-404 after deploy is the
evidence; pushing to main is not"). Claims and admin-claims routes correctly remain `404`, confirming
`CLAIMS_API_ENABLED` was not touched and the still-BLOCKED claims API remains inaccessible in
production.

**I did not set `CLAIMS_API_ENABLED=true` at any point, as a diagnostic or otherwise.**

## 6. Contributing gap / follow-up

- No SLO, dashboard, or alert currently exists for `/v1/support-cases*`, `/v1/support/*`, or
  `/v1/analytics/*` — this outage was caught by a security code review, not by monitoring. This is
  a `site-reliability-engineer` gap, tracked as action INC-005-2 below, not a new finding about the
  routes themselves.
- The regression test (`root-mount-order.test.ts`) is a hand-copied extraction of `index.ts`'s
  mount order per security-review §13.1 C-018-20 — it will drift silently if a router is reordered
  or added after line 183 without updating the test. Durable fix (owned by `backend-architect`,
  not SRE) is exporting the `v1` router assembly as a factory this test calls directly.

## 7. Actions

| # | Action | Owner | Due |
|---|---|---|---|
| INC-005-1 | Append confirmed Render deploy-start/deploy-live timestamps for `c2ff720` and `0dc7ff9` (§4 caveat) | whoever holds Render dashboard access (`devops-engineer`/owner) | open |
| INC-005-2 | Stand up basic availability alerting (burn-rate or simple uptime) on `/v1/support-cases*`, `/v1/support/*`, `/v1/analytics/*` so a future route-shadowing regression pages instead of waiting for a security review | `site-reliability-engineer` | open |
| INC-005-3 | Export `v1` router assembly from `backend/src/index.ts` as a factory and point `root-mount-order.test.ts` at it directly, removing the hand-copy drift risk (C-018-20) | `backend-architect` | open |

## 8. Closure

Root cause fixed and deployed (`0dc7ff9`), production recovery independently confirmed with
request/response evidence in §5. **Closes the production-recovery half of SR-018-9** (security
review §13.1 item 4 / §13.3 item 1). Does not close Stage 8 as a whole — see
`security-review.md` §13.3 for the remaining items (SR-018-8 tests, index read-back, compliance
CR-018-1…9, security-engineer re-concurrence), none of which are SRE's to close.
