# Feature 012 — Employee Dashboard (Shared Staff Home) — Stage 10 QA Sign-off

**Stage:** 10 — QA Testing (hard gate, per `docs/organization/02-feature-lifecycle.md`)
**Reviewer:** `automation-qa-engineer`
**Date:** 2026-09-10
**Scope:** independent verification of `business-requirements.md` AC-1–AC-9 and
`security-review.md` §10 (Stage 9 non-deviation spec) against the code actually merged to `main`
(`012658d` backend, `860a4ae` frontend) — not a re-read of the engineers' own test names.

**Verdict: PASS WITH FINDINGS.** Every acceptance criterion is genuinely satisfied by the shipped
code, independently re-derived rather than taken on report. One real, outstanding process gap was
found (missing `web_route` manifest entries required by SR-012-5) and is recorded as a finding
that should be closed before this feature is treated as fully discharged, not as a blocker to this
verdict re-running. One cosmetic doc-inaccuracy in a source comment is also noted. Nothing found
here required or produced a code change other than the AC-5 wording correction this document was
explicitly tasked with authoring.

---

## 1. Test suites — run fresh, not trusted from prior reports

| Suite | Command | Result |
|---|---|---|
| Backend unit/integration | `cd backend && npm test` | **367/367 passed**, 55 files |
| Backend, full re-run (regression check) | `cd backend && npx vitest run` | **367/367 passed** (re-run independently, same result) |
| Backend types | `cd backend && npx tsc --noEmit` | clean, 0 errors |
| Web unit/component | `npx vitest run` (repo root) | **29/29 passed**, 9 files (this is genuinely the entire web test suite — `find src -name "*.test.ts*"` returns exactly these 9 files; not a truncated run) |
| Web types | `npx tsc --noEmit` (repo root) | clean, 0 errors |
| Web lint (dashboard/admin/security/call-centre) | `npx eslint src/dashboard src/admin src/security src/call-centre` | **0 errors**, 12 pre-existing warnings (non-null assertions, one fast-refresh, one exhaustive-deps — all pre-dating this feature or explicitly commented as intentional, e.g. `useHomeCount`'s documented `eslint-disable` for SR-012-3.3) |
| Manifest coverage (CI-1) | `node scripts/verify-stage8-manifest.mjs` | PASS — 75 backend routes / 50 mobile screens / 39 web dashboard routes discovered, 82 manifest entries (see §5, SH-2 caveat) |

Nothing here was stale — all six commands were executed in this session, today, against the
current `main` tree.

---

## 2. AC-1 through AC-9 — checked one at a time against code

**AC-1 (Home screen replaces immediate redirect):** **Satisfied.** All three route trees —
`src/admin/AdminRoutes.tsx:54`, `src/security/SecurityRoutes.tsx:29`,
`src/call-centre/CallCentreRoutes.tsx:36` — now mount `<Route index element={<XHomePage />} />`
where each previously had `<Navigate to="..." replace />` (confirmed by reading the current file
content, not the diff summary). No redirect remains on any of the three index routes.

**AC-2 (email + role label from already-hydrated state):** **Satisfied.** Each per-role Home page
reads `const { account } = useDashboardAuth()` and passes `account?.email` straight into
`HomeScreen` — no new fetch. The three `roleLabel` literals are `"Admin"`,
`"Security Partner Operator"`, `"Call Centre Agent"` (`AdminHomePage.tsx:44`,
`SecurityHomePage.tsx:38`, `CallCentreHomePage.tsx:43`) — an exact match to FR-1's canonical
strings, not a re-derivation. `HomeScreen.test.tsx`'s AC-2 test asserts the rendered text directly.

**AC-3 (quick links point at real, existing routes):** **Satisfied.** Verified every `to`/`href`
used by the three Home pages against each router's actual registered `path` list:
`/admin/verification`, `/admin/analytics` (both registered in `AdminRoutes.tsx`), `/security/cases`
(registered in `SecurityRoutes.tsx`), `/call-centre/lookup`, `/call-centre/cases` (both registered
in `CallCentreRoutes.tsx`). No dead links, no placeholder targets.

**AC-4 (empty announcements render nothing, not an empty box):** **Satisfied.**
`HOME_ANNOUNCEMENTS` is `[]` by default (`homeAnnouncements.ts:28`); `HomeScreen.tsx:164` guards
the entire announcements block behind `announcements.length > 0 ? ... : null` — no wrapper element
renders when empty. `HomeScreen.test.tsx`'s AC-4 test explicitly asserts `container.querySelector('[role="alert"]')` is `null` in the empty case, which is the right assertion (checks for absence of *any* rendered artifact, not just visible text).

**AC-5 (count accuracy) — WAS NOT SATISFIABLE AS WRITTEN; corrected and re-verified.** This is the
finding SR-012-6 flagged and this Stage 10 pass was tasked with resolving. The original wording
("verifiably matching what the operator sees by navigating to the corresponding existing list page
and counting/reading its own total") is unsatisfiable once a filtered population exceeds the list
route's page `limit` (confirmed: `AdminVerificationPages.tsx` calls
`listVerificationRequests({ limit: 50 })`). I independently confirmed the *code* does the right
thing regardless of the old wording's defect: all three repository count methods —
`customer-profiles.ts:274` (`countByVerificationStatus`), `recovery-cases.ts:293`
(`countForPartnerOrg`, sharing `buildPartnerOrgQuery` with the sibling list per C-012-3),
`support-cases.ts:255` (`countMine`) — call `countDocuments()` against the identical filter the
sibling list route builds, with no `limit`/cursor/page-size ceiling anywhere in the count path.
`admin-verification.test.ts`'s `AC-5/SR-012-6` test seeds 61 pending-review accounts (one more than
the list's `limit: 50`) and asserts the count endpoint returns `61` while the list page's own
`data.length` is strictly less than that — the actual behaviour is correct and the *old AC-5 text*
was the defect, not the implementation. **`business-requirements.md` §5 AC-5 has been amended in
this commit** to state the corrected, testable criterion (true `countDocuments()` total, not a
page-derived count; explicit note that the list page's row count is *expected* to read lower once
paginated, not a discrepancy) — see that file for the full text and citation of SR-012-6.

**AC-6 (zero cross-role data, network-level):** **Satisfied, and verified structurally, not just by
running the existing test.** Read `HomeScreen.tsx`'s import list directly: `react-router-dom`,
`lucide-react`, `../../components`, `./ui`, and a local content type — no `src/admin/**`,
`src/security/**`, or `src/call-centre/**` import anywhere in the file (`grep -n "import"
src/dashboard/components/HomeScreen.tsx` — only 5 import lines, all confirmed role-agnostic). Each
per-role Home page imports exactly one role's own API client (`AdminHomePage.tsx` →
`../api/admin-verification`; `SecurityHomePage.tsx` → `../api/cases`; `CallCentreHomePage.tsx` →
`../api/support-cases`) and no other role's. I additionally **independently re-ran the SR-012-4
adversarial plant test** rather than trusting the engineer's report of having done so: appended an
`import { getPendingVerificationCount } from '../../admin/api/admin-verification';` to
`HomeScreen.tsx` and ran `eslint` — it failed with the expected `no-restricted-imports` error citing
C-012-A1/SR-012-4, then reverted cleanly. The `HomeScreen.crossRole.test.tsx` suite
(`AdminHomePage calls only the admin count client`, etc.) mocks all three role API clients and
asserts each Home page calls exactly one and none of the other two — a genuine network-level
negative test, matching what AC-6 explicitly asks for (not merely a UI-visibility check).

**AC-7 (idle-timeout/expired-session behaviour unchanged):** **Satisfied, and true by construction,
not by a runtime check.** In all three trees the `index` route sits inside
`<Route element={<XAuthGate />}> <Route element={<XLayout />}> <Route index .../> `
— unchanged gate/layout nesting, confirmed by reading `AdminRoutes.tsx`, `SecurityRoutes.tsx`,
`CallCentreRoutes.tsx` directly. `AdminRoutes.test.tsx` / `SecurityRoutes.test.tsx` /
`CallCentreRoutes.test.tsx` each carry an explicit AC-7 test asserting that with no session the
index route redirects to login exactly as every other route does — ran these (`npx vitest run`
picked them up as part of the 29/29 web suite) and confirmed pass.

**AC-8 (renders correctly at existing breakpoints; mobile-drawer nav unchanged):** **Partially
verifiable from code; not independently visually verified.** `DashboardShell`
(`src/dashboard/components/PrivilegedLoginPage.tsx`) — the component that owns the
sidebar/mobile-drawer/sign-out chrome all three dashboards render inside — is untouched by either
Feature 012 commit (`git log` shows no Feature 012 commit touching this file). `HomeScreen.tsx`
itself uses the design system's existing `Card`/`Badge`/`SectionHeading` components and Tailwind
grid classes, consistent with the rest of each dashboard, but there is no automated visual
regression tooling in this repo to confirm rendered layout at each breakpoint — this criterion is
**not independently verifiable without a running environment/browser**, consistent with the
constraint given for this pass. Structural risk is low (no shell changes, no new CSS framework
usage) but this is a statement of risk, not a substitute for the check.

**AC-9 (graceful degrade on a failed count):** **Satisfied.** `useHomeCount.ts` implements
`loading` → `loaded`/`error` with **no** auto-retry, no polling, no interval (SR-012-3.3) — matches
the `once per mount, single-shot user-initiated retry` requirement in §10 item 11 exactly.
`HomeScreen.tsx`'s `CountBadge` renders a neutral `—` badge + optional `Retry` button on `error`
status, with `event.preventDefault()`/`stopPropagation()` so the retry click does not also trigger
the enclosing card's navigation `<Link>` — a real, non-trivial UI-correctness detail I confirmed by
reading the handler, not just the test name. `HomeScreen.test.tsx`'s AC-9 test asserts the `—`
badge, the `Count unavailable` sr-only text, that the card's `href` is still present (nav not
blocked), and that clicking Retry calls the injected `onRetry` exactly once. A single failed count
cannot blank the rest of the screen because each card's count state is isolated per-card
(`CountBadge` receives only that card's own `count` prop) — confirmed by the component's prop
shape, not inferred.

---

## 3. SR-012-6 (AC-5 wording defect) — resolved

Independently re-derived the defect rather than accepting the security-review's framing at face
value: `AdminVerificationPages.tsx` genuinely calls `listVerificationRequests({ limit: 50 })` with
no headline total rendered elsewhere on that page, and all three count repository methods genuinely
use unbounded `countDocuments()` — so the *old* AC-5 text ("matching what the operator sees by
navigating to the list page and counting/reading its own total") would have failed a
correctly-implemented system the moment a filtered population exceeded 50 rows, and the "obvious"
wrong fix (cap the count at the page limit) would have reintroduced F-012-2.

**`business-requirements.md` §5 AC-5 has been amended** (this commit) to require the count equal
the backend's true `countDocuments()` total for the filtered population, explicitly stating that
the list page's own row count is *expected* to read lower once the population exceeds the page
`limit` — not a discrepancy to reconcile. The corrected test is already implemented and passing:
`admin-verification.test.ts`'s `AC-5/SR-012-6 — count is a true total, not capped at the list
route's page limit` test seeds 61 rows against a `limit: 50` list and asserts `count === 61` while
the list page's own `data.length` is strictly smaller.

---

## 4. SR-012-2 (route-shadowing regression tests) — re-run and read, not trusted

Ran the specific tests, not the whole file blindly:

```
npx vitest run backend/src/routes/security-cases.test.ts backend/src/routes/support-cases.test.ts \
  backend/src/routes/admin-verification.test.ts
→ 3 files, 52 tests, all passed
```

Read both `SR-012-2 regression` tests directly (`security-cases.test.ts:670`,
`support-cases.test.ts:827`): each asserts `res.status).not.toBe(400)` **and**
`res.status).toBe(200)` **and** `typeof body.data.count === 'number'` — a genuine assertion of the
bug's absence, not a tautological pass. Independently confirmed via `grep` that both routers
register `/count` **before** their `:caseId`/`:caseId`-shaped routes in source
(`security-cases.ts:78` before `:117`; `support-cases.ts:260` before `:314`), which is the actual
mechanism that makes the regression test pass — the test and the fix are consistent with each
other, not just each individually plausible.

`admin-verification.ts`'s `/count` route was independently confirmed as never at risk (its only
other `GET` route, `/admin/accounts/:id/profile`, is a disjoint path prefix) — correctly not carrying
its own shadowing regression test, since there is no shadowing scenario to regress against.

---

## 5. Findings

### F-QA-012-1 (process, non-blocking to functional PASS, should be closed) — missing `web_route` manifest entries required by SR-012-5

`security-review.md` §11's conditions register requires, under **SR-012-5**: *"Three
`backend_route` + three `web_route` manifest entries pointing at this document, not absorbed into
`/admin/*` or the waived `/security/cases*` / `web-admin-verification` entries."* Owner:
`backend-engineer` + `frontend-engineer`. Blocks: *"Merge of the Stage 9 diff."*

I confirmed the three `backend_route` entries exist (`backend-security-cases-count`,
`backend-admin-verification-requests-count`, `backend-support-cases-count`, all added in `012658d`,
each citing this feature and SR-012-5 by name). I then searched `stage8-manifest.json` for any
`web_route` entry referencing Feature 012 or the new Home screens and found **none** — confirmed
by `git show 860a4ae -- docs/organization/gates/stage8-manifest.json` returning no diff at all: the
frontend commit did not touch the manifest file.

This is consistent with, but not excused by, SH-2 (`security-review.md` §12.3, independently
re-confirmed here by reading `verify-stage8-manifest.mjs`'s `discoverWebRoutes()`): the scanner
cannot discover `<Route index>` elements at all (React Router's own API forbids an `index` route
from also carrying a `path` attribute, so there is no way for the current regex-based scanner to
name them), so `verify-stage8-manifest.mjs` still reports **PASS** today even with these entries
absent — CI will not catch this gap. But SR-012-5's condition is a manual documentation
requirement, independent of what CI can detect, and it was not fulfilled: **three `web_route`
entries are missing.**

This does not change the PASS verdict on functional/security grounds — the underlying Home screens
are correctly built, gated, and tested regardless of whether their manifest entries exist — but it
is an open condition in the Stage 8 register that the register itself says blocks "merge of the
Stage 9 diff," and that diff has already merged to `main`. Recommend: `frontend-engineer` adds three
`web_route` entries (one per role's Home mount) to `stage8-manifest.json`, each pointing at
`security-review.md` and noting the SH-2 scanner-blind-spot caveat, before this feature is
considered fully closed out. This is a small, mechanical follow-up, not a design or security gap.

### F-QA-012-2 (cosmetic, non-blocking) — stale doc comment in `HomeScreen.tsx`

`HomeScreen.tsx`'s file-level comment (lines 20–23) states: *"`HomeScreen.eslint.test.ts`
(co-located) asserts this file contains no import of any `src/admin/**`, `src/security/**`, or
`src/call-centre/**` module."* No file named `HomeScreen.eslint.test.ts` exists anywhere in the
repo (confirmed by `grep -rn` across the tree). The actual enforcement mechanism is the
`no-restricted-imports` ESLint override scoped to this exact file in `.eslintrc.cjs` (verified
working, §2/AC-6 above) — a real, functioning, equally strong control, just not the one the comment
names. This is a one-line doc-comment correction, not a functional gap; the guarantee it describes
does exist, under a different name/mechanism than the comment claims.

---

## 6. Regression check

Full backend (`npx vitest run`, 367/367) and full web (`npx vitest run` at repo root, 29/29) suites
were both re-run in full, not filtered to Feature 012's own files, and both are green. `npx tsc
--noEmit` is clean in both `backend/` and the repo root. No adjacent test (e.g. the pre-existing
`admin-verification.ts` list-route tests, `security-cases.ts` list/claim/patch tests,
`support-cases.ts` create/list/note/status tests, `roleRouting.test.ts`) regressed. Lint across the
touched directories is 0 errors, 12 pre-existing/explicitly-justified warnings.

---

## 7. Verdict

**PASS WITH FINDINGS.**

- AC-1, AC-2, AC-3, AC-4, AC-6, AC-7, AC-9: genuinely satisfied, independently verified against
  running code and (for AC-6) an independently re-executed adversarial lint-fence plant test, not
  just the existing test suite's say-so.
- AC-5: was unsatisfiable as originally worded (SR-012-6); the underlying implementation was
  already correct; **wording corrected in `business-requirements.md` §5 by this Stage 10 pass**,
  citing SR-012-6 and this report.
- AC-8: not independently verifiable without a running browser/visual-regression environment;
  structural risk is low (shared `DashboardShell` untouched by this feature) but this is not a
  substitute for a visual check.
- SR-012-2 regression tests: re-run specifically, read in full, confirmed to assert the real
  absence of the 400-shadowing bug, not a tautology.
- Full backend + web regression suites: green, re-run fresh in this session, no adjacent breakage.
- **F-QA-012-1:** SR-012-5's required `web_route` manifest entries were not added by the frontend
  Stage 9 commit — an open condition against the Stage 8 register, not caught by CI (SH-2), that
  should be closed as a small follow-up before this feature is considered fully discharged.
- **F-QA-012-2:** one stale doc-comment reference to a test file that doesn't exist; the control it
  describes is real, under the ESLint-override mechanism instead.

Neither finding is a functional, security, or compliance defect in the shipped feature — both are
documentation/governance completeness gaps. This is the basis for PASS WITH FINDINGS rather than
FAIL: the product, as built, satisfies its acceptance criteria (as corrected) and its Stage 8
security spec faithfully, and the findings are closeable without touching application code.

**Does not discharge:** SR-012-8's own "does not discharge" list in `security-review.md` §11/§13/§14
(RR-012-1/RR-012-2/RR-012-3/RR-012-4, the pre-existing waivers, ADR-0006 C-15/C-16(b), Feature 009
A-1, SH-2 itself) — none of those are Stage 10's to close and none are reopened by this report.

**Filed by:** `automation-qa-engineer`, 2026-09-10.

---

## 8. `manual-qa-engineer` — exploratory/manual portion of Stage 10

> **Editorial note:** this section was recovered from a separate commit (`45a6757`) after the
> `automation-qa-engineer` pass above overwrote this file via a full rewrite rather than an
> in-place append, losing this content from the working tree. The findings below are genuine,
> independently-run work — including a real, verified accessibility finding (§4 below) — and are
> restored here rather than left dropped. Going forward, agents appending to a shared review
> document must use targeted edits, not a full rewrite, precisely to prevent this.

**Scope of this section:** `manual-qa-engineer` exploratory/manual pass — code-trace based (no
live browser available in this environment). Complements `automation-qa-engineer`'s AC-by-AC
automated verification in §1–§7 above.

**Build under test:** main @ 860a4ae (frontend), 012658d (backend) — Feature 012 shared Home
screen (`src/dashboard/components/HomeScreen.tsx`) as mounted by `AdminHomePage`,
`SecurityHomePage`, `CallCentreHomePage`.

**Method:** Static code trace of the actual shipped component/hook/route/auth code (not a
re-read of the automated test suite, and not a live device/browser session). Findings below are
reasoned from the exact Tailwind classes, conditional-rendering branches, and auth state
machine in the repo as of this session.

## 1. AC-8 — desktop-first, mobile-drawer nav (viewport-breakpoint risk)

Traced `src/dashboard/components/HomeScreen.tsx`, the three Home wrapper pages
(`AdminHomePage.tsx`, `SecurityHomePage.tsx`, `CallCentreHomePage.tsx`), and the shared shell
(`DashboardShell` in `src/dashboard/components/PrivilegedLoginPage.tsx`).

- `DashboardShell`'s nav is the standard pattern already used by every other route in these
  three dashboards (login gates, list pages, case pages) — sidebar `fixed`/slide-in drawer below
  `md`, docked `md:static` above. Home does not touch this shell at all beyond passing
  `children`; there is no new nav code introduced by this feature. Not a risk.
- Home's own new content is mobile-first correctly for all three roles:
  - Admin: `grid grid-cols-1 gap-4 lg:grid-cols-3` with `cardSpanClassName={{ verification:
    'lg:col-span-2' }}` — below `lg` this collapses to a single stacked column (the
    `lg:col-span-2` never applies), which is the correct/safe fallback.
  - Security: `grid grid-cols-1 gap-4 max-w-md lg:max-w-lg` — single column at all sizes, just a
    max-width cap at desktop; no risk at mobile widths since the cap only ever *reduces* max
    width, never expands.
  - Call-centre: `grid grid-cols-1 gap-4 sm:grid-cols-2` — 2 columns only from `sm` (640px) up;
    single column below that, i.e. on virtually every phone in portrait.
  - This mirrors the exact pattern already used elsewhere in the same dashboards, e.g.
    `AdminAnalyticsPage.tsx`'s `grid gap-6 sm:grid-cols-3` and `DetailGrid`'s `grid gap-3
    sm:grid-cols-2` in `src/dashboard/components/ui.tsx` — mobile-first base class, columns
    added only at a breakpoint, never removed. Home does not deviate from this convention.
- `Card padding="lg"` (→ `p-8`, non-responsive) is used by every `QuickLinkCard`. This is not a
  new pattern — `padding="lg"` is the dashboard-wide standard, used identically in
  `AdminVerificationPages.tsx`, `AdminDataPages.tsx`, `AdminPlansPages.tsx`,
  `SecurityCasePages.tsx`, `SupportCasesPages.tsx`, and the login card itself. Home is
  consistent with, not an outlier from, the rest of the product on this axis. (Note: `p-8` is
  fixed rather than responsive dashboard-wide, e.g. `p-4 sm:p-8`, so if this is ever flagged as
  cramped on a narrow device it is a pre-existing, dashboard-wide characteristic, not something
  introduced by Feature 012 — out of scope to fix here.)
- The greeting line (`Signed in as {email} · {roleLabel}`) is a plain `<p>` with no
  `whitespace-nowrap`/`truncate` — it wraps normally on narrow viewports rather than overflowing
  or clipping a long email address. Correct.

**Verdict on AC-8:** code trace shows Home's responsive layout is structurally identical in
pattern to already-shipped, presumably-verified pages in the same dashboards. No overflow/crush
risk distinct from the rest of the product was found. Recommend a real-device/browser
spot-check still happen once available (this trace cannot substitute for seeing the drawer
open over the card grid at 320–375px), but nothing in the code suggests it will fail.

---

## 2. Cross-role RBAC boundary walkthrough (admin token rendering inside another role's Home)

Traced `src/dashboard/auth/DashboardAuthProvider.tsx` end-to-end plus all three
`*AuthGate`/`*Layout` pairs (`AdminLayout.tsx`, `SecurityLayout.tsx`, `CallCentreLayout.tsx`)
and `AdminRoutes.tsx`.

Each of `/admin`, `/security`, `/call-centre` mounts its **own** `DashboardAuthProvider`
instance with a distinct `config.storageKey` and `config.allowedUserType`
(`admin` / `security_company_operator` / `support_agent` respectively, via
`PRIVILEGED_DASHBOARD_CONFIG` in `roleRouting.ts`). Session hydration and login both funnel
through `validateAccount(token)`:

```
if (me.userType !== config.allowedUserType) {
  clearRefreshToken(config.storageKey);   // wrong role's token is not left resumable
  setStatus('wrong-role');
  setAccount(me);
  return false;
}
```

Walking the scenario literally — an admin's access/refresh token somehow ends up used against
`/security/*`:

1. `SecurityRoutes` mounts its own `DashboardAuthProvider` with `allowedUserType:
   'security_company_operator'`.
2. On hydration (or a `signInWithTokens` call), `validateAccount` calls `GET /account/me` with
   that token, gets back `userType: 'admin'`, compares against `'security_company_operator'` —
   mismatch.
3. Status is set to `'wrong-role'` and the refresh token is actively cleared from the
   `security`-scoped storage slot (not just left stale) — so a reload doesn't silently resume it.
4. `SecurityAuthGate` (`src/security/layout/SecurityLayout.tsx`) checks `status === 'wrong-role'`
   *before* the `Outlet` render and returns the "Unauthorized" `Card` — `SecurityHomePage` (and
   by extension `HomeScreen`) is never mounted, never reached, never given the admin's account
   object to render anything from.
5. `signInWithTokens` additionally fails closed on *any* error from step 2 (network failure,
   dropped request) — it never leaves `status: 'signed-in'` optimistically per the SR-LU-3/C-LU-2
   comment in the code, so there's no timing window where Home could flash the wrong role's
   shell before the check resolves.

All three `*AuthGate` components (`AdminAuthGate`, `SecurityAuthGate`, `CallCentreAuthGate`) are
structurally identical in this handling — same `hydrating` → `wrong-role` → `signed-out` →
`signed-in` state ordering, same "clear the token, don't render `Outlet`" behavior. This is
pre-existing Feature 001/SR-LU auth-unification behavior, unmodified by Feature 012 — Feature
012 only adds `HomeScreen` behind the *existing* gate, it does not touch the gate itself. Traced
and confirmed working as intended; no boundary violation found.

**Verdict on item 2:** PASS — no cross-role rendering path found.

---

## 3. FR-3 announcements empty-state (AC-4)

Traced `src/dashboard/content/homeAnnouncements.ts` and the rendering branch in
`HomeScreen.tsx`:

```ts
export const HOME_ANNOUNCEMENTS: HomeAnnouncement[] = [];   // empty by default
```

```tsx
{announcements.length > 0 ? (
  <div className="space-y-3">
    {announcements.map((a) => (
      <InlineAlert key={a.id} tone="info">{a.text}</InlineAlert>
    ))}
  </div>
) : null}
```

With the array empty (current shipped state), `announcements.length > 0` is `false`, so the
entire branch evaluates to `null` — literally nothing is rendered: no wrapper `<div>`, no bordered
placeholder box, no "No announcements" text node anywhere in the DOM. Confirmed by reading the
conditional itself, not inferred from naming. This matches AC-4's requirement precisely.

**Verdict on item 3:** PASS.

---

## 4. FR-4 error/loading states (AC-9) — real-user state-transition walkthrough

Traced `src/dashboard/hooks/useHomeCount.ts` and `CountBadge` in `HomeScreen.tsx`, applied to
each Home page's actual usage (Admin's "Verification queue" card, Security's "Case queue" card,
Call-centre's "My cases" card).

Walking each transition as a first-time, non-technical staff user would experience it:

- **Initial load → success:** Badge shows "Loading…" (neutral grey) for the duration of the
  fetch, then swaps to either a green "Queue clear"/"No open cases" badge (count = 0) or a gold
  "`N` pending"/"`N` open" badge. Clean, no layout jump beyond the badge text itself (badge
  component doesn't reserve fixed width, so there's a minor width reflow between "Loading…" and
  the final label — cosmetic only, consistent with how badges behave everywhere else in these
  dashboards, e.g. `StatusBadge` in `ui.tsx`).
- **Initial load → error → retry → success:** Badge becomes a grey badge containing only "—"
  (visually) with `sr-only` text "Count unavailable", plus an inline "Retry" link-styled button.
  Clicking Retry re-triggers loading → success/error as above. This is a legible, low-drama error
  state — it does not use alarming red/danger styling for what is a soft, non-blocking failure
  (the card's own navigation still works even if the count never loads), which is appropriate:
  a support agent or admin is not blocked from doing their job by a failed count fetch.
- **Initial load → error → retry → error again:** Same "—" / "Count unavailable" badge
  reappears, Retry remains available indefinitely (no retry-limit lockout, no "please contact
  support" dead end). No infinite spinner, no silent failure — a user who keeps hitting Retry on
  a genuinely broken backend endpoint gets a clear, stable, repeatable "count unavailable, retry"
  state rather than something that looks hung or crashed.

**One real finding, accessibility/HTML-validity (Low-Medium):** the error-state Retry `<button>`
is rendered *nested inside* the `<Link>` (`<a>`) that wraps the whole `QuickLinkCard` (see
`HomeScreen.tsx` lines ~130–144, `CountBadge`'s `onRetry` branch at lines ~79–93). A `<button>`
inside an `<a>` is invalid per the HTML5 content model (interactive content must not be nested
inside other interactive content). Because React constructs these via the DOM API rather than
parsing an HTML string, it renders without the browser silently reparenting/breaking the markup,
and `event.preventDefault()`/`stopPropagation()` on the button's `onClick` does correctly stop
the outer `Link`'s navigation — so it is **functionally reachable and clickable for a mouse/touch
user**. The real risk is with **screen readers**: nested interactive controls are a known
VoiceOver/TalkBack footgun — some screen readers announce only the outer link's accessible name
and swallow or misannounce the nested button, or make it unreachable via swipe/rotor navigation,
depending on browser/AT combination. The code comment at `HomeScreen.tsx` (around the
`onRetry` handler) shows this was a deliberate, reviewed tradeoff — it explicitly references the
"one-focus-stop rule" being intentionally relaxed only in the error state — so this isn't an
oversight, but it should be verified with an actual screen reader (VoiceOver/NVDA) before
sign-off, since the failure mode if it doesn't work is that a screen-reader user who hits an
error state has **no way to retry the count fetch at all**, silently. This is exactly the kind
of state that's cheap to get wrong and expensive for a non-technical staff member to be stuck in.

**Verdict on item 4:** PASS WITH FINDINGS — recommend a real assistive-technology check of the
error-state Retry control before/shortly after this ships; not blocking on its own since the
underlying count value going stale is a soft failure, not a data-integrity or security issue,
and the card's primary navigation is unaffected either way.

---

## 5. General first-look UX pass (admin, security operator, support agent)

Code-trace-based walkthrough of first login post-deploy for each role:

- **Admin:** lands on `/admin` → `AdminHomePage`. Sees "Welcome back" / "Signed in as
  `{email}` · Admin", then (today) no announcements (empty array, renders nothing — see §3),
  then a 3-column-at-desktop grid: a large "Verification queue" card (emphasis `primary`,
  `lg:col-span-2`, live pending count) sitting beside a lightweight "View analytics" text link
  (emphasis `link`, no card chrome, no count). This size/weight asymmetry reads intentionally —
  verification is clearly the primary action, analytics a secondary link — and matches
  `ui-design.md` §3.3's documented intent. No usability concerns.
- **Security operator:** lands on `/security` → `SecurityHomePage`. Sees the same greeting
  pattern, then a single, capped-width "Case queue" card with a live open-case count. Simplest
  of the three Home screens by design (one role, one job). No usability concerns — nothing to be
  confused by.
- **Support agent (call-centre):** lands on `/call-centre` → `CallCentreHomePage`. Two
  equal-weight cards: "Look up a customer" (no count — correctly, since a lookup entry point has
  no natural "pending count") and "My cases" (live open-count). Consistent visual weight between
  the two is appropriate since both are core, equally-frequent actions for this role.
- **Consistency across all three:** greeting copy format (`Signed in as {email} · {roleLabel}`),
  badge tone semantics (grey = loading/unavailable, green = zero/clear, gold = nonzero pending),
  and card chrome (`Card padding="lg" interactive`) are identical across all three roles' Home
  screens — a staff member who has seen one of these roles' Home page (e.g. during training)
  will find the others immediately familiar. No inconsistency found between Home and the rest of
  each dashboard's existing pages (verified against `AdminAnalyticsPage.tsx`,
  `SecurityCasePages.tsx`, `SupportCasesPages.tsx`, `AdminVerificationPages.tsx` for typography,
  spacing, and `Card`/`Badge` usage).
- **Nothing found that would read as unpolished** to a non-technical staff member — copy is
  plain-language ("Queue clear", "No open cases", "Look up a customer"), no raw enum values,
  stack traces, or technical jargon are surfaced anywhere in the traced render paths (including
  the error state, which shows "Count unavailable" + "Retry", never a raw error message).

**Verdict on item 5:** PASS.

---

## Overall verdict for this section (manual-qa-engineer / exploratory portion of Stage 10)

**PASS WITH FINDINGS.**

- No blocking defects found. RBAC boundary (item 2) is sound and unchanged from already-shipped
  Feature 001/SR-LU behavior; FR-3 empty state (item 3) is exactly correct; AC-8 responsive
  layout (item 1) follows the same mobile-first convention used everywhere else in these
  dashboards with no distinguishing overflow risk found in the code.
- One non-blocking finding to track: **nested `<button>` inside `<a>` for the FR-4 error-state
  Retry control** (`src/dashboard/components/HomeScreen.tsx`, `CountBadge`) — functionally works
  for pointer users via `stopPropagation`, but is invalid HTML and a plausible screen-reader
  accessibility gap. Recommend: (a) a real screen-reader smoke check before/shortly after
  release, and (b) if flagged as a genuine issue, file a fast-follow to restructure (e.g. move
  Retry outside the `<Link>`, or make the whole card non-interactive-wrapping with a `<Link>`
  only on the title, common patterns used elsewhere for "card with an inner action button").
  Not blocking Stage 10 sign-off on its own — the underlying failure mode is a stale/unavailable
  count badge, not data loss, unauthorized access, or a broken primary action.
- Recommend a live-device pass on AC-8 (mobile drawer + Home card grid together, at ~320–375px)
  once a real browser/device is available, since this section's AC-8 conclusion is code-trace
  only and could not observe actual rendered layout.

No RBAC violations, no incorrect data exposure, and no critical/high-severity findings in this
pass. Reports to `qa-architect` for combined Stage 10 Definition-of-Done sign-off alongside
`automation-qa-engineer`'s AC-by-AC results.

— `manual-qa-engineer`, 2026-09-10
