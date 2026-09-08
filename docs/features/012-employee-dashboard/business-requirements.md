# Feature 012 — Employee Dashboard (Shared Staff Landing Hub)

**Lifecycle stage:** 1 — Business Requirements
**Stage owner (A):** `business-analyst` (drafted here by `product-manager` per explicit platform-owner
request — `business-analyst` should countersign/amend before Stage 2 per RACI; this is a
product-manager-authored Stage 1 pass, same working pattern already used for 010/011)
**Contributors:** `product-manager`, `compliance-specialist`, `ux-researcher`
**Status:** Draft — new platform-owner request (2026-09-08). Not yet scoped into a milestone;
sequencing against Release Gate A / M6a (Call Centre Dashboard, Feature 010) is a Stage 2 call.
**Related system areas (RACI):** touches three existing owned surfaces — Admin Dashboard (A:
`frontend-architect`), Security Company Dashboard (A: `frontend-architect`), Customer Support
Portal / Call Centre Dashboard (A: `frontend-architect`) — all three already share one Accountable
owner, which simplifies this feature's architecture story (see §3).

---

## 0. Framing the ask

The platform owner asked for an "Employee Dashboard" as a shared landing hub every staff account
(`admin`, `security_company_operator`, `support_agent`) sees after login, on top of each role's
existing dashboard. This document does not take that framing as dictation — it evaluates what a
shared hub should contain, and, critically, **where it should sit relative to the just-shipped
login unification**, because that placement decision materially changes build cost and risk.

---

## 1. What's actually there today (verified against code, not HANDOFF.md)

- **Login is already unified.** `src/pages/CustomerLoginPage.tsx` is the single login page for
  all account types. After a successful `POST /auth/login`, it decodes the `user_type` claim and
  routes directly to that role's dashboard root (`/admin`, `/security`, `/call-centre`) via
  `PRIVILEGED_DASHBOARD_CONFIG` (`src/dashboard/auth/roleRouting.ts`). There is **no intermediate
  screen today** — login goes straight into the role's own app.
- **Each role dashboard is architecturally a separate app**, not three tabs of one shell:
  `AdminRoutes`, `SecurityRoutes`, `CallCentreRoutes` are mounted as three independent `/admin/*`,
  `/security/*`, `/call-centre/*` trees in `src/App.tsx`, **each wrapped in its own
  `DashboardAuthProvider` instance** with its own `sessionStorage` key
  (`td-admin-refresh-token`, `td-security-refresh-token`, `td-call-centre-refresh-token`) and its
  own idle-timeout/MFA gate. There is no shared "staff session" today — an admin's session token
  and a security operator's session token live in different storage slots and are never combined.
- **What each role's dashboard already has** (read from the actual route/page files):

  | Role | Existing nav items | Existing pages |
  |---|---|---|
  | `admin` (`/admin/*`) | Customers, Verification, Policies, Assets, Plans, Analytics | Accounts list/detail, verification queue/review, policies list/detail, assets list/detail, plan editor, DAU analytics (`AdminAnalyticsPage` — real `GET` against a session-dedup endpoint, not a mock) |
  | `security_company_operator` (`/security/*`) | Case queue | Cases list/detail with status actions (claim, investigate, tracking, recovered, closed) |
  | `support_agent` (`/call-centre/*`) | Customer lookup, My cases | Customer lookup by email/policy/phone, support case list/detail/create, call notes, caller-verification badge (SR-010-3, currently always "Unverified" — no verification mechanism exists yet, see Feature 010 OQ-010-2) |

  All three sit inside the same `DashboardShell` component (`src/dashboard/components/
  PrivilegedLoginPage.tsx`) — same sidebar/mobile-drawer/sign-out pattern, just different
  `navItems` and `brand` per role. This shared shell component is the actual reusable surface
  here, not a new design system.
- Every dashboard's `index` route currently redirects straight into its first working page
  (`/admin` → `accounts`, `/security` → `cases`, `/call-centre` → `lookup`). **None of the three
  has a "home"/overview screen today** — there is no existing page this feature would be
  duplicating.

---

## 2. Where should the shared hub sit? (the placement decision)

Two structurally different options were evaluated, not assumed:

**Option A — a hub *before* the three dashboards** (e.g. new `/staff` route staff land on
post-login, which then links out to `/admin`, `/security`, `/call-centre`).
Cost: requires a **fourth authentication context** that can represent "any staff account," since
today's three `DashboardAuthProvider` instances are role-scoped and don't share a session. Either
a new shared auth provider has to be built (duplicate session logic, or a refactor of all three
existing providers — real architecture-review-level work), or the login-routing change in
`CustomerLoginPage.tsx` (`routeTokensByRole`) has to seed *two* things (the role's own storage
slot, plus a new shared slot) and a new gate has to independently re-verify role server-side, same
as each existing gate does. This is the "cross-cutting technical investment" this role's spec says
to escalate to `cto` before committing to — it changes the login-unification work that just
shipped, not just adds a page.

**Option B — a shared "Home" screen embedded as the first route *inside* each existing role tree**
(e.g. `/admin` index becomes a real Home page instead of an immediate redirect to `accounts`;
same for `/security` and `/call-centre`), built once as a shared, role-parameterized component and
mounted three times.
Cost: small. Reuses the `DashboardShell` each dashboard already renders inside; reuses each
dashboard's already-hydrated `useDashboardAuth()`/`account` object (email, role, and for security
operators, `partnerOrganizationId`) with zero new auth surface; no new session storage, no new
gate, no change to the login-unification code that just shipped.

**Recommendation: Option B.** It delivers the actual product value the owner described — a
consistent "landing" experience with role identity, quick links, and shared notices — without
introducing a fourth account-boundary auth context for a genuinely small UI win. Option A only
becomes worth its cost if a future requirement needs staff to *switch between roles in one
session* (e.g. a person who is both admin and support agent) — nothing in the current account
model (`PrivilegedUserType` is a single `user_type` claim per account) suggests that exists or is
planned. This is flagged for `solution-architect` to confirm at Stage 5, but is the framing this
Stage 1 document is scoping against.

**This also directly answers the owner's "before or as a home tab" question: as a home tab/screen
within each existing dashboard, not a screen that precedes them.**

---

## 3. Shared landing hub — scope

### 3.1 In scope for v1 (all three roles see the same shell, role-parameterized content)

- **FR-1 — Identity greeting.** "Signed in as {email}" + role label (Admin / Security Partner
  Operator / Call Centre Agent), reusing data already returned by each role's existing
  `useDashboardAuth().account` (already rendered in a smaller form on `AdminLayout`/
  `SecurityLayout`/`CallCentreLayout` today — this formalizes it into a proper Home screen).
- **FR-2 — Quick links into that role's own key actions.** A small set of cards/links pointing at
  that role's *already-built* nav destinations (e.g. admin: "Review verification queue," "View
  DAU analytics"; security: "Open case queue"; support agent: "Look up a customer," "My cases").
  No new destinations — this is navigational surfacing of what already exists, informed by which
  nav item in each role's current flat list is the most-used entry point (a UX call worth a light
  `ux-researcher` pass at Stage 3, not invented here).
- **FR-3 — Shared announcements/notices area.** Freeform short text notices (e.g. "Scheduled
  maintenance Sunday 2am–4am," "New SAPS case-number field now required on theft reports").
  **v1 must be static content — no new backend feature.** A small versioned config (JSON or a
  constant file) shipped with the frontend build, editable by `technical-writer`/`product-manager`
  via PR, is sufficient to prove the concept and matches this document's own "buildable now vs.
  blocked" discipline (`innovation-backlog.md`'s pattern). A backend-authored notices feature
  (who can post, targeting by role, read receipts) is **explicitly deferred** — file it as its own
  future Stage 1 item if usage demonstrates need, not built speculatively here.
- **FR-4 — Per-role operational glance, sourced only from that role's own already-authorized
  data.** E.g. admin: count of pending verifications, count of active policies (if cheaply
  derivable from existing list endpoints without a new aggregate query); security: count of open/
  unassigned cases in the queue; support agent: count of "my cases" open. This is same-role data
  the operator can already see by clicking through — the hub just surfaces a number so they don't
  have to. **Not new data access, not cross-role.** If any of these counts would require a new
  backend aggregate endpoint rather than reusing an existing list response's pagination metadata,
  that's a Stage 6/7 sizing question — flagged, not assumed free.

### 3.2 Explicitly evaluated and NOT recommended for v1

- **Cross-role visibility (e.g. an admin seeing security-partner case-activity summary, or a
  support agent seeing admin verification-queue depth).** **Flagged for `compliance-specialist`
  and `cybersecurity-architect` review before any Stage 2 commitment**, not casually recommended.
  Even operational/aggregate-only numbers (not raw PII) cross a role boundary that today's
  architecture (three separate auth contexts, three separately RACI'd surfaces with different
  Consulted parties — note Security Company Dashboard lists `compliance-specialist` as Informed,
  Admin Dashboard does not) was not designed to blur. This session's compliance work (Feature 010
  OQ-010-2 ruling, prohibiting voice-match biometrics; Feature 011's SAPS field scrutiny) has
  repeatedly found that visibility-boundary questions look cheap and aren't. **Recommendation:
  ship v1 with zero cross-role data.** If a genuine business need surfaces later (e.g. admin needs
  a security-partner SLA rollup for partner management), scope it as its own Stage 1 item with
  `compliance-specialist` in the room from the start, not as a landing-hub add-on.
- **A unified "all staff" audit or activity feed.** Same concern as above, amplified — an activity
  feed spanning all three roles is close to a cross-role audit surface, which is exactly the kind
  of thing ADR-0006 (audit trail) and this session's `cybersecurity-architect` posture would need
  to weigh in on before any commitment. Not recommended for v1; noted as a possible future idea
  only if a real operational need (not "would be nice") is named.
- **Editable/authored notices with role targeting.** Deferred per FR-3 above — static content only
  for v1.

---

## 4. Per-role "own dashboard" feature recommendations (grounded, not a wishlist)

Per the owner's ask, each role also keeps improving their *own* dashboard. These are Stage-1-level
candidate ideas only — each needs its own future Stage 1 pass before being built, same discipline
as `innovation-backlog.md`. Framed buildable-now vs. blocked-on-X.

### 4.1 Admin (`/admin/*`)

- **Idea A-1 — Overview counts on the Home screen (FR-4 above)** already covers the most obvious
  gap: today `/admin` redirects straight to the Customers list with no summary view at all.
  **Buildable now.**
- **Idea A-2 — Verification queue aging indicator** (e.g. flag verification requests older than
  N days) on the existing `VerificationQueuePage`. Admin already owns verification review;
  aging visibility is a small addition to an existing list, not a new entity. **Buildable now** —
  data (`createdAt` on verification requests) almost certainly already exists; needs a
  `backend-architect`/`database-architect` confirmation of the field, not a new schema.
- **Idea A-3 — Plan-catalog change history/audit view** on `AdminPlansPages` (who changed a plan's
  price/asset-limit and when) — admin can edit plans today but there's no visible history of past
  edits in the UI. **Likely buildable now if plan edits are already audit-logged per ADR-0006**
  (needs `backend-architect` confirmation of what's already captured server-side before promising
  a UI for it) — flag, don't assume the audit trail is already queryable this way.

### 4.2 Security Company Operator (`/security/*`)

- **Idea S-1 — Case queue filters/status breakdown** on `CasesListPage` — today it's a flat list
  with no visible filter by status (`assigned`/`investigating`/`tracking`/`recovered`/`closed`) or
  count-by-status summary. Genuinely useful once case volume grows past a handful of rows.
  **Buildable now** — reuses the existing `listSecurityCases` API surface, likely just needs a
  query-param filter added (`backend-architect` sizing).
  This is also a natural pairing with the Home-screen "open case count" from FR-4.
- **Idea S-2 — Recovery-case status timeline / structured recovery-rate reporting.** This overlaps
  directly with `innovation-backlog.md` idea #3 (customer-facing timeline) and this role's own
  north-star success metric ("GPS-assisted recovery success rate and time-to-recovery"). **Mostly
  blocked, not buildable now** — meaningful recovery-rate reporting needs real case volume, which
  doesn't exist pre-launch (0 DAU per `north-star-2000-dau.md` §2), and any richer location/status
  surfacing needs to clear the still-open INC-001 posture before touching case/location data
  further. Do not commit this to a near-term release; note it as a real future idea only.

### 4.3 Support Agent / Call Centre (`/call-centre/*`)

- **Idea C-1 — "My cases" queue summary on Home (FR-4)** already covers the most obvious gap
  given the dashboard has no overview today.
- **Idea C-2 — Recent-lookups shortcut.** Support agents likely re-look-up the same customer
  across a call (lookup → case detail → back to lookup). A small "recently viewed customers" list
  (client-side only, session-scoped, no new backend storage) would reduce repeat searches.
  **Buildable now**, genuinely small, no new PII persistence (session-only, cleared on sign-out).
- **Idea C-3 — Caller-verification workflow.** Explicitly **not** re-proposed here — Feature 010's
  own OQ-010-2 ruling already identified this as blocked pending a new Tier 2 verification design
  (C-010-1/C-010-4) with voice-match ruled out (C-010-7, POPIA special personal information). Not
  duplicating that open item; referencing it so this document doesn't accidentally re-litigate a
  decision already made.

---

## 5. Acceptance criteria — shared landing hub only (FR-1–FR-4)

These are testable criteria for the net-new shared-hub piece (§3.1). Per-role feature additions
(§4) are out of scope for this acceptance-criteria set and get their own Stage 1 passes.

1. **AC-1:** Signing in as an `admin`, `security_company_operator`, or `support_agent` account and
   landing on that role's dashboard root (`/admin`, `/security`, `/call-centre`) shows a Home
   screen — not an immediate redirect to the first data page as happens today.
2. **AC-2:** The Home screen displays the signed-in account's email and a human-readable role
   label, sourced from the same `useDashboardAuth().account` object each dashboard already
   hydrates — no new API call required for identity.
3. **AC-3:** The Home screen shows at least the quick-link set named in FR-2 for that specific
   role, each link navigating to an already-existing route in that role's own dashboard (no dead
   links, no placeholder "coming soon" targets).
4. **AC-4:** The Home screen shows the static announcements content from FR-3 when present, and
   renders nothing (not an error state, not an empty box with a border) when the static content
   list is empty — since v1 ships with no authoring tool, an empty list is the default state and
   must look intentional.
5. **AC-5:** The Home screen shows the per-role operational count(s) from FR-4, each number
   verifiably matching what the operator sees by navigating to the corresponding existing list
   page and counting/reading its own total (no discrepancy between the "glance" number and the
   full page's own count).
6. **AC-6:** No data belonging to a different role (per §3.2) is fetched, requested, or rendered
   anywhere on any role's Home screen. This is a explicit negative test, not just an omission —
   `automation-qa-engineer`/`manual-qa-engineer` should verify no cross-role network calls occur
   from any Home screen, not just that the UI doesn't display anything.
7. **AC-7:** An account whose idle timeout or session has already expired sees the same
   `wrong-role`/redirect-to-login behavior on the Home screen as it does on every other route in
   that dashboard today (i.e., Home does not weaken or bypass any existing `AuthGate`).
8. **AC-8:** Home screen renders correctly at the existing dashboard breakpoints (desktop-first
   per NFR-1 in Feature 010's own requirements; mobile-drawer nav pattern already shared via
   `DashboardShell` must continue to work unchanged).

---

## 6. Flags for review before Stage 2

Per this role's pre-approval checklist and the same discipline applied to Features 010/011:

- **`compliance-specialist` — required before Stage 2 commits any cross-role content.** This
  document recommends **against** cross-role visibility in v1 (§3.2), but the owner's original ask
  explicitly raised it as a candidate ("cross-role visibility of anything, e.g. an admin seeing
  security-partner activity summary") — if `product-manager`/`cto` want to keep that idea alive
  for a later phase rather than dropping it, it needs `compliance-specialist` sign-off *before*
  any Stage 2 scoping, not after a design is already drawn.
- **`cybersecurity-architect` — light-touch, not a hard blocker, but should confirm Option B (§2)
  introduces no new auth surface.** The recommendation is deliberately built to reuse each
  dashboard's existing `DashboardAuthProvider`/gate with zero new session/token handling — this
  should be a quick confirmation at Stage 5 (Architecture Review) rather than a full new Stage 8
  review, but should not be skipped given this session's INC-001 history of small-looking surfaces
  turning out to have real exposure.
- **`solution-architect` — confirm Option A vs. Option B at Stage 5.** This document picks Option
  B on cost/value grounds but flags that Option A only becomes worth it if a future requirement
  (multi-role accounts, single staff SSO across roles) is actually on the roadmap — worth an
  explicit confirmation it isn't, rather than silently foreclosing it.
- **`ux-researcher` — light validation of FR-2's quick-link set per role**, since "which nav item
  matters most" is a usage-pattern question this document answers by inference (existing nav
  order) rather than research. Not a blocker to start Stage 2 scoping, but should land before
  Stage 4 UI design locks the layout.
- **`business-analyst` — should countersign or amend this Stage 1 doc.** Per RACI, `business-
  analyst` is the accountable owner of Business Requirements; this draft was produced by
  `product-manager` per the platform owner's direct request and should get a `business-analyst`
  pass before being treated as fully closed, consistent with how this document should not silently
  reassign RACI ownership just because of who drafted it first.
- **`technical-project-manager` — sequencing.** This feature has no north-star milestone mapping
  (§7 of `north-star-2000-dau.md`'s own "how to use this document" instruction: state explicitly
  when something doesn't map) — it is a retention/usability improvement for **staff**, not
  customer-facing DAU. It should be sequenced against current sprint capacity alongside, not ahead
  of, Release Gate A and Feature 010/011 work already in flight.

---

## 7. Out of scope (this feature folder)

- Any backend-authored/target-able notices system (deferred per §3.1 FR-3).
- Cross-role data visibility of any kind (deferred per §3.2, pending compliance review if revived).
- A unified multi-role auth/session model (Option A, §2) — not ruled out permanently, just not
  this feature's scope.
- All per-role feature ideas in §4 — each needs its own Stage 1 pass; listed here as backlog
  candidates only, not committed scope.

---

**Next lifecycle step:** `business-analyst` review/countersign of this draft → `product-manager`
Stage 2 scoping (confirm Option B, assign milestone/sprint) → `ux-researcher` light validation of
FR-2 quick-link sets → Stage 4 UI design → Stage 5 Architecture Review (confirm zero new auth
surface) → Stage 6/7 only if FR-4's per-role counts need new backend aggregate endpoints rather
than reusing existing list responses.
