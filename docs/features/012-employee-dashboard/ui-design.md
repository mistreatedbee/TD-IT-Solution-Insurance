# Feature 012 — UI Design (Stage 4): Shared Employee Home Screen

**Lifecycle stage:** 4 — UI Design
**Owner:** `ui-designer`
**Status:** Complete — feeds Stage 5 (Architecture Review) and Stage 9 (Development)
**Input artifacts:** [`business-requirements.md`](./business-requirements.md) (Stage 1, FR-1–FR-4,
AC-1–AC-9), [`product-plan.md`](./product-plan.md) (Stage 2, Option B confirmed),
[`ux-research.md`](./ux-research.md) (Stage 3, quick-link weighting + copy fix + FR-4 count
verdicts)

**Scope of this document:** one screen (Home), composed once as a role-parameterized component and
mounted as the `index` route inside each of the three existing dashboard trees (`/admin`,
`/security`, `/call-centre`). This is proportionate to the feature's actual size — four content
areas, three data variants, zero new screens beyond the one already-planned Home.

---

## 1. What already exists (confirmed by reading the code, not assumed)

- `DashboardShell` (`src/dashboard/components/PrivilegedLoginPage.tsx`) — the actual reusable
  surface. Docked sidebar ≥ `md`, slide-in drawer below `md`, already handles mobile-nav
  open/close and route-change-closes-drawer. **Home does not touch this component at all** — it
  only changes what `AdminLayout`/`SecurityLayout`/`CallCentreLayout` render as the `index` child
  inside `<Outlet />`.
- Each `*Layout.tsx` already renders `{account ? <p>Signed in as {account.email}</p> : null}` above
  `<Outlet />` — this is FR-1's current, unstyled placeholder. Home formalizes and replaces this
  line (see §3).
- Each dashboard's `index` route today is `<Navigate to="accounts|cases|lookup" replace />` — no
  home screen exists to preserve visually; this is greenfield layout work, not a redesign of
  something already shipped.
- Design-system components confirmed available and already used inside these three dashboards:
  `Card`, `Badge`, `SectionHeading`, `Button` (from `src/components`), plus dashboard-local
  presentational wrappers already living in `src/dashboard/components/ui.tsx` — `InlineAlert`,
  `LoadingState`, `StatusBadge`, `DetailGrid`, `DataTable`. That file is itself precedent for
  "small role-agnostic presentational wrappers composed from the design system, living next to the
  dashboards that use them" — Home's one new piece of composition (§4.3) follows that same
  established pattern rather than introducing a new visual language.
- `StatBlock` exists but is a marketing-page primitive (count-up-from-zero-on-scroll-into-view
  animation, large decorative underline bar, built for landing-page stat rows) — **not used here**;
  see §4.3 for why `Badge` is the better fit for FR-4's operational counts.

---

## 2. Layout (desktop-first per NFR-1, one structure for all three roles)

Home renders inside the existing `<main class="p-4 sm:p-6 lg:p-8">` content area of
`DashboardShell` — no new chrome, no new breakpoint behavior. Content stacks in a single column of
sections, each full-width up to a max content width consistent with the other dashboard pages
(these pages don't currently cap width — Home shouldn't introduce a new constraint either).

```
┌──────────────────────────────────────────────────────────────────┐
│  DashboardShell (unchanged: sidebar / mobile drawer)              │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ 1. Identity greeting (FR-1)                                 │  │
│  │    "Welcome back" + "Signed in as {email} · {Role label}"   │  │
│  ├────────────────────────────────────────────────────────────┤  │
│  │ 2. Announcements (FR-3) — 0..n InlineAlert rows.             │  │
│  │    ENTIRE SECTION OMITTED (no heading, no empty box) when    │  │
│  │    zero notices apply to this role. (AC-4)                   │  │
│  ├────────────────────────────────────────────────────────────┤  │
│  │ 3. Quick links + paired counts (FR-2 + FR-4)                 │  │
│  │    Responsive grid, role-specific card set (see §3.3)        │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

Section order rationale: greeting first (orientation), announcements second (time-sensitive
operational info a returning user should see before acting — same precedence InlineAlert already
gets at the top of `PrivilegedLoginPage` for the idle-timeout notice), quick links + counts last
because that's the "what do I do now" payload the rest of the screen exists to lead into. This
also satisfies the "StatBlock summaries above dense tables" scan-ability principle by extension —
the counts sit at the top of the screen a user lands on, not buried inside a page they have to
navigate into.

**Responsive behavior (AC-8):** grid is `grid-cols-1` on narrow viewports, `sm:grid-cols-2` /
`lg:grid-cols-3` where a role has multiple cards (see §3.3 per-role grid spec). No new breakpoint
values — reuses the `sm`/`md`/`lg` scale already used throughout `src/admin`, `src/security`,
`src/call-centre`. The mobile drawer nav is untouched by this feature (Home mounts *inside*
`DashboardShell`, never modifies it), so AC-8's "mobile-drawer nav pattern must continue to work
unchanged" is satisfied by construction, not by new testing surface.

---

## 3. Content spec

### 3.1 FR-1 — Identity greeting

Plain heading block, not a `Card` (a bordered box around "hi, it's you" reads as over-decorated for
what is functionally a page title). Composition:

```tsx
<SectionHeading as="h1" title="Welcome back" size="md" className="mb-1" />
<p className="text-sm text-text-secondary">
  Signed in as {account.email} · {roleLabel}
</p>
```

**Canonical role-label strings (FR-1 amendment, literal spec — do not reinterpret):**

| `PrivilegedUserType` | Display label |
|---|---|
| `admin` | `Admin` |
| `security_company_operator` | `Security Partner Operator` |
| `support_agent` | `Call Centre Agent` |

Sourced entirely from the already-hydrated `useDashboardAuth().account` object each layout already
holds — no new API call (AC-2).

### 3.2 FR-3 — Announcements

Composed from the existing `InlineAlert` component (`tone="info"`), one per active notice, iterated
from a static, versioned config shipped with the frontend build (no new backend route — per Stage 1
§3.1's explicit v1 constraint).

**Proposed config location:** `src/dashboard/content/homeAnnouncements.ts`

```ts
export type StaffRole = 'admin' | 'security_company_operator' | 'support_agent';

export interface HomeAnnouncement {
  id: string;                 // stable key, e.g. "2026-09-maintenance"
  text: string;                // plain text only — no markdown/HTML, no links (keep the
                                // review surface small; if a notice needs a link, that's a
                                // sign it should be a real feature, not a static string)
  roles?: StaffRole[];         // omit = shown to all three roles; present = shown only to
                                // the listed roles (e.g. the SAPS case-number notice from
                                // FR-3's own example is security_company_operator-only)
}

export const HOME_ANNOUNCEMENTS: HomeAnnouncement[] = [
  // empty by default — PR-reviewed additions only, see governance note below
];
```

Home filters `HOME_ANNOUNCEMENTS` by the current role and renders:

```tsx
{announcementsForRole.length > 0 ? (
  <div className="space-y-3">
    {announcementsForRole.map((a) => (
      <InlineAlert key={a.id} tone="info">{a.text}</InlineAlert>
    ))}
  </div>
) : null}
```

**AC-4 is satisfied structurally, not by a CSS trick:** the whole `<div>` wrapper — not just its
children — is conditional on `length > 0`. An empty list renders nothing to the DOM: no heading, no
bordered placeholder box, no "No announcements" message. This matches the existing idiom already in
this codebase (`{error ? <InlineAlert>...</InlineAlert> : null}` in `PrivilegedLoginPage.tsx`), so
no new rendering pattern is introduced.

**Governance note (carried forward from Stage 1 §3.1 / §8.5, not a design decision, just restating
so it isn't lost before Stage 9):** any PR touching `homeAnnouncements.ts` requires `product-manager`
(or delegate) review — same bar as customer-facing copy — before merge, per the business-analyst's
amendment. This belongs in the PR template/CODEOWNERS for that file, not in this design doc's scope,
but is flagged here so `frontend-architect` wires it up at implementation time.

### 3.3 FR-2 + FR-4 — Quick links with paired operational counts

Per Stage 3's structural finding, FR-2 and FR-4 are **not separate sections** where it would create
redundant chrome — where a count and a quick link point at the same destination (verification queue,
case queue, my cases), they render as one `Card`, count included, rather than a count appearing
twice or in an unrelated location. This directly implements the ux-research recommendation ("pairs
directly with FR-4's pending-verification count," "pairs with FR-4's open/unassigned count").

Every quick-link card is a real navigable element — `<Link>` wraps `<Card interactive as="div">`, so
the whole card is keyboard/screen-reader operable as one focus stop, not a `<div onClick>` (Stage 3
§5 accessibility note). `Card`'s own hover-lift/gold-edge affordance communicates interactivity
visually; no separate "click here" button is layered on top.

#### Admin (`/admin`) — two cards, deliberately different visual weight

```
┌───────────────────────────────────────┐  ┌───────────────────────┐
│  [Card padding="lg", interactive]      │  │ (no Card — plain link  │
│  Verification queue      [Badge: 14]   │  │  row, muted style)     │
│  Review pending identity submissions.  │  │                        │
│  Review verification queue  →          │  │  View analytics  →     │
└───────────────────────────────────────┘  └───────────────────────┘
        primary — grid col-span-2 (or first, wider column)     secondary — narrower
```

- **Primary card** — `Card padding="lg" interactive`, wrapped in `<Link to="/admin/verification">`.
  Contains: title "Verification queue", the pending-count `Badge` (tone `gold` when count > 0,
  `neutral` when 0 — see §4.3 for full state table), one line of supporting copy, and the CTA text
  "Review verification queue". This is the queue admins clear repeatedly (Stage 3 §1) — it earns the
  larger, bordered, count-carrying treatment.
- **Secondary link** — *not* a `Card`. A plain text row (link + small caption, `ArrowLink`-style
  underline-on-hover treatment via `Link` + Tailwind, not the `ArrowLink` component itself since
  `ArrowLink` renders a native `<a href>` that would force a full page reload inside this
  React-Router SPA — see §4.3 note). No `Badge`, no count, no border — "View analytics" reads
  distinctly lighter-weight than the verification card, which is the explicit ask from Stage 3 §1
  ("render with different visual weight/framing... not as two identical cards").
- **Grid:** `grid-cols-1 lg:grid-cols-3`, primary card spans 2 columns (`lg:col-span-2`), secondary
  link occupies the remaining column (or sits directly beneath the primary card as a simple row on
  narrower viewports — either is acceptable; the requirement is "not equal card weight," not a
  specific column math).

#### Security (`/security`) — one card, no secondary anything

```
┌─────────────────────────────────────────────┐
│  [Card padding="lg", interactive]            │
│  Case queue                    [Badge: 6]     │
│  Assigned and unassigned recovery cases.      │
│  Go to case queue  →                          │
└─────────────────────────────────────────────┘
```

- Single card, full available width (or capped at a comfortable reading width, e.g.
  `max-w-md`/`lg:max-w-lg` — a lone card stretched edge-to-edge across a wide desktop viewport looks
  unintentional). `<Link to="/security/cases">`.
- **Copy correction applied per Stage 3 §2:** CTA text is **"Go to case queue"**, not "Open case
  queue" — `open` is a live case-status value (`SecurityCasePages.tsx`'s `STATUS_ACTIONS` /
  `recoveryCase.status === 'open'`) and this label sits directly beside a Badge that may itself read
  "N open," so reusing "open" as the verb would create exactly the same-screen collision Stage 3
  flagged. This is a literal build spec, not a suggestion — `frontend-architect`/QA should treat
  "Go to case queue" as the exact string, consistent with how FR-1's role labels are treated as
  literal spec.
- Count Badge reflects **open/unassigned** cases specifically (the number Stage 3 confirmed as "the
  strongest FR-4 case of the three roles") — not a count of all cases regardless of status.

#### Call centre (`/call-centre`) — two equal cards, in existing workflow order

```
┌───────────────────────────┐  ┌───────────────────────────┐
│  [Card padding="lg"]       │  │  [Card padding="lg"]       │
│  Look up a customer        │  │  My cases         [Badge:3]│
│  Find a caller by email,   │  │  Support cases assigned    │
│  policy, or phone.         │  │  to you that are still open│
│  Look up a customer →      │  │  My cases →                │
└───────────────────────────┘  └───────────────────────────┘
```

- **Equal weight, equal treatment** — Stage 3 confirmed no reordering and no differentiation case
  here (unlike admin): the product's own case-creation flow already assumes lookup-then-case
  sequence, and both are genuinely used every call. `grid-cols-1 sm:grid-cols-2`.
- Only "My cases" carries a count Badge (open-count on the agent's own `scope=mine`-enforced cases);
  "Look up a customer" has no count — there's nothing count-shaped about a lookup action.

---

## 4. Redline / component composition map (for `frontend-architect` handoff)

| Element | Component(s) used | Variant/props |
|---|---|---|
| Page title | `SectionHeading` | `as="h1"`, `size="md"` |
| Identity line | plain `<p>` | `text-sm text-text-secondary` (matches existing layout convention) |
| Announcement row | `InlineAlert` | `tone="info"`, one per notice, list wrapper fully conditional |
| Primary quick-link card | `Card` + `Link` (react-router) | `padding="lg"`, `interactive` (default true) |
| Equal-weight quick-link card (call centre) | `Card` + `Link` | `padding="lg"`, `interactive` |
| Secondary/light quick link (admin analytics) | `Link` + Tailwind (no `Card`) | text link, muted tone, arrow-on-hover translate — same visual language as `ArrowLink` without its native-`<a>` mechanics |
| Operational count | `Badge` | see state table §4.3 — **not `StatBlock`** |
| Loading state (initial screen hydration, if ever needed) | `LoadingState` (existing, `dashboard/components/ui.tsx`) | unchanged |

### 4.1 States required per interactive element (per this role's checklist)

| Component | Default | Hover/focus | Error | Loading | Empty |
|---|---|---|---|---|---|
| Quick-link `Card` | bordered, resting shadow | `Card`'s existing hover-lift + gold edge (already built-in, no new CSS) | N/A — links to already-existing routes, cannot 404 (AC-3) | N/A — card itself always renders; only its Badge has a loading state | N/A |
| Count `Badge` | see §4.3 | inherits from parent `Card`/`Link` focus ring | shows "—" + `sr-only` failure text | shows pulse/neutral "…" state | count of `0` is a valid, real value — rendered normally (`tone="neutral"`), not treated as "empty" |
| Announcements section | N/A (static) | N/A | N/A | N/A | entire section omitted, see §3.2 |

### 4.2 Focus/keyboard note

Because the whole card is a `<Link>`, tab order across the quick-link section is: primary card →
(admin) secondary link → next card, one stop each, no nested focusable elements inside a card (no
separate "Review →" button competing with the card-level link for the same click target). This is
deliberate — two focus stops doing the same navigation inside one card is a keyboard-nav trap, not
an accessibility feature.

### 4.3 FR-4 operational count — three states (AC-9), and why `Badge` not `StatBlock`

`StatBlock` was evaluated and rejected for this use: it's built for a different job (a large,
animated, count-up-on-scroll-into-view marketing statistic, always numeric, no built-in
loading/error affordance). Forcing a "—" placeholder or skeleton through a component whose entire
prop contract is `value: number` means fighting the component, which is the wrong side of
"compose existing components before proposing new ones" — the honest answer here is that the right
existing primitive is `Badge` (already used for exactly this kind of small inline status/count
chip via `StatusBadge` elsewhere in these dashboards), not a new component and not a misused one.

| State | Rendering | Accessibility |
|---|---|---|
| **Loaded, count > 0** | `<Badge tone="gold">{n} pending</Badge>` (admin) / `{n} open` (security) / `{n} open` (call centre) | plain text content, no extra markup needed |
| **Loaded, count = 0** | `<Badge tone="emerald">0 pending</Badge>` (or role-appropriate zero-copy, e.g. "Queue clear") | reads as a real, positive state — zero is informative, not "no data" |
| **Loading (in flight)** | `<Badge tone="neutral">Loading…</Badge>` | plain text — screen readers announce "Loading" same as sighted users see it, satisfying Stage 3 §5's "skeleton must have a text alternative" note without needing a separate `aria-label` |
| **Error / timeout (AC-9)** | `<Badge tone="neutral">—</Badge>` plus adjacent small `<button>` text "Retry" (only if the underlying API client exposes a re-fetch — a bare inline text retry, not a modal or full-page error state) | `<Badge>` renders "—" visibly *and* to assistive tech (it's real text content, not an icon-only glyph), directly closing Stage 3 §5's flagged risk of "a skeleton with no accessible label reads as nothing to a screen-reader user" |

Critically: **only the `Badge` inside the affected card enters these states — the card itself
(title, CTA link, destination) always renders normally.** A failed verification-count fetch never
prevents the "Review verification queue" link from working, satisfying AC-9's "must never block
navigation via FR-2's quick links" clause by construction — the count and the navigation are two
independent pieces of state inside one card, not one blocking the other.

---

## 5. What this document does not decide (explicitly deferred, per scope)

- **Where each count's number actually comes from** (existing list endpoint's pagination metadata
  vs. a new backend aggregate) — Stage 1 §3.1 and Stage 2 §7 already flag this as a Stage 6/7
  sizing question, not a Stage 4 design one. One dependency worth surfacing now, though: the list
  endpoints already read in this session (`listSecurityCases`, `listVerificationRequests`) return
  `CursorPage` responses with `hasMore`/`nextCursor`, not an observed total-count field — if no
  existing response already carries a total, FR-4's counts may need either a small aggregate
  endpoint or a `?limit=1&countOnly=true`-style addition, which is exactly the "flagged, not
  assumed free" scenario Stage 1 anticipated. Confirming this is `backend-architect`'s call at
  Stage 6/7, not resolved here.
- **Admin's dropped "active policies" count** — per Stage 3 §4's verdict, not included in this
  design at all (admin gets exactly one paired count: pending verifications).
- Cross-role visibility, unified activity feed — out of scope per Stage 1 §3.2/§7, not designed
  here in any form.
- Exact copy for any specific `HOME_ANNOUNCEMENTS` entries — this document specifies the *config
  shape* and *rendering rule* (§3.2), not draft announcement text; that's a `product-manager`/
  `technical-writer` content decision made per-entry, under the governance note already carried
  forward.

---

## 6. New-component check (design-system-manager sign-off)

**No new design-system component is introduced or required.** Everything in this design composes
from already-approved primitives (`Card`, `Badge`, `SectionHeading`, `Link`) plus the existing
dashboard-local presentational-wrapper convention (`InlineAlert`, already living in
`src/dashboard/components/ui.tsx` alongside `StatusBadge`/`DataTable`/`DetailGrid`) — Home's config
file (`homeAnnouncements.ts`) and its role-parameterization logic are data/composition, not UI.

One item flagged for awareness, not sign-off, since it doesn't cross the "new component" line: the
admin secondary link (§3.3) is styled to *resemble* `ArrowLink` (arrow-on-hover-translate,
underline-on-hover) without using the `ArrowLink` component itself, because `ArrowLink` renders a
native `<a href>` and would force a full-page reload inside this React-Router SPA. If
`design-system-manager` wants a router-aware variant of `ArrowLink` as a real library addition later
(useful beyond this feature — every dashboard nav-out-to-a-lighter-weight-destination pattern would
benefit), that's a legitimate future backlog item, but it is **not required to ship Feature 012** —
a plain `Link` with Tailwind classes matching `ArrowLink`'s visual treatment is sufficient composition
for this one small usage and does not warrant blocking this feature on a new component's approval
cycle.

---

## 7. Handoff checklist (this role's pre-approval checklist, applied)

- [x] Screen composed primarily from existing component library (`Card`, `Badge`,
      `SectionHeading`, `InlineAlert`, `Link`) — one flagged look-alike-but-not-reused case (§6),
      not a new component, explicitly not requiring `design-system-manager` sign-off to ship.
- [x] Status/count indicators use accessible, redundant cues — `Badge` count is always real text
      content (number + word, e.g. "14 pending"), never a color-only or icon-only signal.
- [x] High-stress-flow check — N/A, this is an internal staff landing screen, not a
      theft/claims/dispute flow; no applicable stress-minimization redesign needed.
- [x] Contrast/tap targets — inherits `Card`/`Badge`/`Link` tokens already shipped and presumably
      audited at their own introduction; no new colors or type sizes introduced by this design.
- [x] Reviewed against `ux-research.md` findings — admin weight differentiation and security copy
      fix are both directly incorporated (§3.3); FR-4's dropped admin policy-count is honored by
      omission (§5).
- [x] Redline/handoff spec includes states (default, hover/focus, error, loading, empty) — §4.1–4.3.
- [x] Brand tone — calm, no unnecessary motion (`StatBlock`'s count-up animation deliberately
      avoided for this reason among others), consistent typography/spacing with existing dashboard
      pages.
- [ ] Sign-off from `product-manager` — not yet obtained; this document is the Stage 4 deliverable
      queued for that review before Stage 5.

---

## 8. Next lifecycle step

Per Stage 2 §7: **Stage 5 — Architecture Review** (`solution-architect` confirms Option B holds with
this design; `cybersecurity-architect` light-touch confirmation of zero new auth surface) →
**Stage 6/7 only if** FR-4's counts need a new backend aggregate endpoint (§5 dependency flagged
above) → Stage 8 (Security Review, hard gate) → Stage 9 (Development) → Stage 10 (QA Testing, hard
gate).

**Signed:** `ui-designer`, 2026-09-09.
