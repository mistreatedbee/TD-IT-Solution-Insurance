# Feature 009 — Security Dashboard (Web) Offline-Tolerance Spec

**Owner:** `frontend-architect`
**Implementer:** `frontend-engineer`
**Consistency reviewer:** `mobile-architect` (per `cto` ruling below — web must match the
already-shipped mobile behavior for the same backend actions, not invent a parallel policy)
**Scope:** `src/security/pages/SecurityCasePages.tsx` — `CaseDetailPage`'s `setStatus` and
`claimCase` functions only. No other mutation on the web dashboard is in scope. This is **not**
a general offline-queue proposal — see the "does not license" clause quoted below.
**Gate:** Must land and be reviewed **before** this slice's Stage 8 Security Review, so the
review covers the finished behavior once rather than twice.
**Policy source:** [`docs/organization/05-development-standards.md`](../../organization/05-development-standards.md),
"Offline behaviour for mutations that need confirmed delivery" (`cto` ruling, 2026-10-06).
**Reference implementation (already shipped, mobile):**
`mobile/src/screens/security/SecurityCaseDetailScreen.tsx` `setStatus` / `handleClaim`,
commit `4a4e599`. This spec is the web port of that exact behavior against the same two backend
endpoints (`PATCH /v1/security/cases/:id`, `POST /v1/security/cases/:id/claim`) — copy is mirrored
unless a web-specific reason is called out below.

---

## 1. Why this exists

The web Security Company Dashboard (`CaseDetailPage`) currently has **zero** offline handling for
its two mutations — a plain `try/catch` that routes every failure, including a dropped connection,
through `mapUserFacingError`. That function already has a network-failure branch
(`mapNetworkLike` in `src/lib/user-facing-errors.ts`) that says "Could not reach the server. Check
your internet connection and try again" — but that copy is **wrong for these two mutations
specifically**: it implies nothing happened, which is not knowable for a request that may have
reached the server before the connection dropped. For `claimCase` in particular, a naive retry
after that message is actively dangerous: the backend's claim write only matches a case that is
still `status: 'open'` with no `partnerOrganizationId`
(`backend/src/routes/security-cases.ts` `claimForPartnerOrg`), so if the original request actually
landed, a retry gets a `404 NOT_FOUND` that looks like "you don't have a case to claim" when the
operator in fact already claimed it.

Per the ratified policy, every mutation needing confirmed delivery must implement (a) definite
failure before sending when known offline, and (b) non-committal "couldn't confirm" messaging
after an ambiguous network failure. Non-naturally-idempotent mutations additionally need (c)/(d) —
reused idempotency key per submission intent, and treating a resulting conflict/duplicate as
success. The policy doc already classifies these two endpoints for us (mirrored from the mobile
comment, confirmed against the backend route in §4 below):

- **`setStatus`** (`PATCH /v1/security/cases/:id` with a target status) — **naturally idempotent**.
  Resending the same target status does not create a second effect. Needs **(a) + (b) only**.
- **`claimCase`** (`POST /v1/security/cases/:id/claim`) — **not naturally idempotent**. The
  backend has no idempotency-key support on this route (confirmed in §4) and matches only an
  unclaimed case, so a bare retry can misreport success as failure. Needs **(a) + (b)**, and in
  place of a generic (c)/(d) idempotency-key mechanism — which the endpoint doesn't support —
  the same **domain-specific equivalent the mobile app already uses**: on an ambiguous failure,
  do not auto-retry; on a `404` specifically, refetch the case and treat "no longer `open`" as
  proof the original claim succeeded.

## 2. What already exists on web vs. what's new

Checked before writing this spec, so the implementation names real primitives:

| Need | Mobile equivalent | Web equivalent today | Verdict |
|---|---|---|---|
| "Am I online" signal | `useIsOnline()` / `NetworkProvider` (`mobile/src/network/NetworkProvider.tsx`, backed by `@react-native-community/netinfo`) | **None.** No `navigator.onLine` usage anywhere in `src/` (confirmed by search). | **Build new** — minimal hook, §3. |
| Distinguish "request never reached server" from a real API error response | `NetworkUnavailableError` (`mobile/src/api/errors.ts`) thrown by the mobile HTTP client | **None.** `src/dashboard/api/client.ts`'s `rawRequest` lets a raw `fetch` rejection (a `TypeError`) propagate uncaught as-is; it is never wrapped into `ApiError`. `src/lib/user-facing-errors.ts` already has to guess at this after the fact via `mapNetworkLike()`'s message-substring check (`'failed to fetch'`, `'networkerror'`, `'load failed'`, `'network request failed'`) — the same heuristic a browser's `fetch` uses for everything from DNS failure to a genuinely mid-flight dropped connection, so it cannot be tightened further than this. | **Build new, thin** — a predicate function, §3, that reuses this exact detection logic (do not duplicate the substring list) rather than inventing a second one. |
| Idempotency key generation | `newIdempotencyKey()` (`mobile/src/api/idempotency.ts`, wraps `expo-crypto`'s `randomUUID`) | No web equivalent exists, and per §4 below, **none is needed for this slice** — `POST /v1/security/cases/:id/claim` takes no body and has no `Idempotency-Key` handling on the backend. Do not add one speculatively. | **Not needed** for this slice. |
| Error/message mapping | `mapUserFacingError` (mobile) | `mapUserFacingError` (`src/lib/user-facing-errors.ts`) — already shared vocabulary/shape with mobile's version, already used by `CaseDetailPage` | **Reuse as-is** for every non-network-ambiguous error path. |
| API client / error types | `ApiError` (mobile, `mobile/src/api/errors.ts`) | `ApiError` / `SessionTerminatedError` (`src/dashboard/api/errors.ts`), used via `apiFetch` in `src/dashboard/api/client.ts` | **Reuse as-is.** `claimSecurityCase`/`updateSecurityCaseStatus` in `src/security/api/cases.ts` already return/throw these. |

## 3. New primitives to build (small, scoped to this slice — not a generic offline framework)

### 3.1 `useIsOnline()` hook

New file: `src/lib/useIsOnline.ts` (or co-locate under `src/dashboard/` if `design-system-manager`
prefers dashboard-scoped utilities to live there — `frontend-engineer`'s call, not architecturally
significant either way).

```
export function useIsOnline(): boolean {
  // Seed from navigator.onLine, then track the browser's 'online'/'offline'
  // window events. No polling, no backend reachability probe — matches the
  // mobile hook's scope (connectivity signal only, not a guarantee the API
  // is reachable).
}
```

Notes:
- `navigator.onLine` is a known-imperfect signal (it reflects network-adapter state, not actual
  internet/API reachability — the same caveat the mobile `NetworkProvider` comment makes about
  `NetInfo`). That imperfection is why (b)'s ambiguous-failure handling still matters even with
  this hook in place — it is the "fail clearly before sending" check for the *definite* offline
  case, not a substitute for handling a failure that happens despite `navigator.onLine` saying
  `true`.
  - SSR/non-browser guard: default to `true` if `navigator` is undefined (this app is client-only
    Vite/SPA, so this is a defensive fallback, not an expected runtime path).
- No global `OfflineBanner` component is in scope for this slice — the mobile one is a nice-to-have
  that can be proposed separately to `design-system-manager`/`ui-designer`; don't block this gate
  on it.

### 3.2 `isNetworkError(err: unknown): boolean` predicate

New file: `src/lib/network-error.ts` (or inline at the top of `user-facing-errors.ts` and exported
— `frontend-engineer`'s call). Must be the **single source of truth** for this detection; refactor
`mapNetworkLike` in `src/lib/user-facing-errors.ts` to call it rather than keeping two copies of the
substring list.

```
export function isNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('load failed') ||
    msg.includes('network request failed')
  );
}
```

This is the web analogue of `err instanceof NetworkUnavailableError` on mobile. It is necessarily
heuristic (string-matching on `fetch`'s own un-typed rejection messages across browsers) rather
than a distinct thrown type, because the web client currently lets raw `fetch` rejections
propagate unwrapped. That is an acceptable, narrow gap to close here — wrapping the web client's
`rawRequest` to throw a typed `NetworkUnavailableError` the way mobile's client does is a cleaner
long-term fix but is **out of scope for this slice** (it would touch every caller of `apiFetch`,
not just these two case-detail mutations); flag it to `frontend-architect`'s backlog as a
follow-up, not a blocker here.

## 4. Backend confirmation (why claim gets the refetch-on-404 treatment, not an idempotency key)

Checked `backend/src/routes/security-cases.ts`:
- `POST /security/cases/:caseId/claim` takes no request body and has no `Idempotency-Key` header
  handling. It calls `ctx.recoveryCases.claimForPartnerOrg(orgId, caseId)`, which (per the route's
  own comment and the `NOT_FOUND` branch) only succeeds against a case that is still unclaimed. A
  retry after the original request actually succeeded hits this same unclaimed-only match and
  returns `404 NOT_FOUND` — indistinguishable, from the response alone, from "this case was never
  yours to claim."
- `PATCH /security/cases/:caseId` (status update) applies the requested status directly; resending
  the same target status is a no-op change, not a second side effect — naturally idempotent, as
  the policy doc already states.

This confirms the mobile commit's approach is correct to mirror exactly: no idempotency-key work
is needed on the backend or the web client for `claimCase`; the refetch-on-404 check **is** this
endpoint's (c)/(d) equivalent.

## 5. Exact behavior — `setStatus`

```
async function setStatus(status: SecurityCaseStatus) {
  if (!caseId) return;
  if (!isOnline) {
    setError("You're offline. This status change has not been saved — reconnect and try again.");
    return;
  }
  setUpdating(true);
  setError(null);
  try {
    const updated = await updateSecurityCaseStatus(caseId, status);
    setRecoveryCase(updated);
  } catch (err) {
    if (isNetworkError(err)) {
      setError("We couldn't confirm this status change was saved. Check your connection and try again.");
    } else {
      setError(mapUserFacingError(err, { context: 'security-case' }));
    }
  } finally {
    setUpdating(false);
  }
}
```

- Copy is verbatim from the mobile implementation — no web-specific UX reason to diverge for
  either message.
- (c)/(d) are correctly **not** implemented here, per the policy's "naturally idempotent" carve-out
  — do not add idempotency-key machinery to this path.
- `isOnline` comes from `useIsOnline()` (§3.1), called once at the top of `CaseDetailPage` the same
  way the mobile screen calls `useIsOnline()` once at the top of `SecurityCaseDetailBody`.

## 6. Exact behavior — `claimCase`

```
async function claimCase() {
  if (!caseId) return;
  if (!isOnline) {
    setError("You're offline. This case has not been claimed — reconnect and try again.");
    return;
  }
  setUpdating(true);
  setError(null);
  try {
    const updated = await claimSecurityCase(caseId);
    setRecoveryCase(updated);
  } catch (err) {
    if (isNetworkError(err)) {
      setError(
        "We couldn't confirm this claim was received. Check your connection, then refresh before retrying — retrying a claim that already succeeded will show as unavailable, not as success."
      );
      return;
    }
    // (d) equivalent: a claim retried after it actually already succeeded
    // hits the backend's open-only match and comes back 404. Re-fetch
    // rather than assume failure — if the case is no longer 'open', the
    // original attempt landed; show its current state instead of an error.
    if (err instanceof ApiError && err.status === 404) {
      try {
        const refreshed = await getSecurityCase(caseId);
        if (refreshed.status !== 'open') {
          setRecoveryCase(refreshed);
          return;
        }
      } catch {
        // Refetch itself failing doesn't change what we tell the user
        // about the claim — fall through to the generic error below.
      }
    }
    setError(mapUserFacingError(err, { context: 'security-case' }));
  } finally {
    setUpdating(false);
  }
}
```

- Copy and control flow mirror `handleClaim` in
  `mobile/src/screens/security/SecurityCaseDetailScreen.tsx` exactly, including the early `return`
  after the ambiguous-network-failure message (the policy's (b): do not fall through to a generic
  error, and do not auto-retry on the user's behalf — "then refresh before retrying" is an explicit
  instruction, not an automatic action).
- `ApiError` import comes from `src/dashboard/api/errors.ts` (already imported transitively via
  `src/security/api/cases.ts`'s `apiFetch`); import it directly in `SecurityCasePages.tsx` for the
  `instanceof` check.

## 7. Out of scope (explicitly, per `cto`'s narrow-scope ruling)

- `CasesListPage`'s `loadMore`/initial list fetch — read-only, not a confirmed-delivery mutation.
- Any other web dashboard mutation (admin plan editor, customer policy/asset forms, support-case
  actions, etc.). Each needs its own classification against the policy doc before anyone copies
  this pattern wholesale — don't treat this spec as a license to bulk-apply `isNetworkError` checks
  everywhere without confirming idempotency characteristics per endpoint first.
- A visible global offline banner/indicator on the web dashboard (mobile has `OfflineBanner`; no
  equivalent is specified here — propose separately if wanted).
- Any backend change. `claimForPartnerOrg`/the claim route's lack of idempotency-key support is
  treated as a given constraint for this slice, not something this spec asks `backend-architect`
  to change.
- Automated test coverage detail (unit/integration test cases for both functions, including a
  mocked `isNetworkError`-triggering rejection and a mocked 404-then-refetch-not-open claim
  sequence) is expected as part of implementation per house testing standards, but specific test
  file/assertion design is left to `frontend-engineer` and `automation-qa-engineer`, not dictated
  here. A manual device/browser QA pass for genuine mid-request connection drops (the same class of
  gap the existing `offline-tolerance-device-qa-checklist.md` calls out for mobile) should be added
  as a web section to that checklist, or a sibling doc, before Stage 10 sign-off — flag to
  `manual-qa-engineer`.

## 8. Review checklist before Stage 8

- [ ] `mobile-architect` has compared `setStatus`/`claimCase` copy and control flow against
      `SecurityCaseDetailScreen.tsx` line-for-line and confirms no unexplained divergence.
- [ ] `useIsOnline()` and `isNetworkError()` exist as the two (and only two) new primitives;
      `mapNetworkLike` in `user-facing-errors.ts` has been refactored to call `isNetworkError`
      rather than keeping a duplicate substring list.
- [ ] No idempotency-key mechanism was added for `claimCase` (confirmed unnecessary per §4).
- [ ] No changes made outside `SecurityCasePages.tsx` plus the two new small utility files (and the
      one-line refactor of `mapNetworkLike`).
- [ ] `design-system-manager` has not been asked to approve new UI components — this slice is
      behavior/state-machine only; the existing `InlineAlert`/`Button` usage is unchanged.
