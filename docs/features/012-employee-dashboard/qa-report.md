# Feature 012 — Employee Dashboard Shared Home Screen — QA Report

**Stage:** 10 (QA Testing, hard gate)
**Scope of this section:** `manual-qa-engineer` exploratory/manual pass — code-trace based (no
live browser available in this environment). Complements `automation-qa-engineer`'s AC-by-AC
automated verification, which is tracked separately/in parallel.

**Build under test:** main @ 860a4ae (frontend), 012658d (backend) — Feature 012 shared Home
screen (`src/dashboard/components/HomeScreen.tsx`) as mounted by `AdminHomePage`,
`SecurityHomePage`, `CallCentreHomePage`.

**Method:** Static code trace of the actual shipped component/hook/route/auth code (not a
re-read of the automated test suite, and not a live device/browser session). Findings below are
reasoned from the exact Tailwind classes, conditional-rendering branches, and auth state
machine in the repo as of this session.

---

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
