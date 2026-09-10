# Feature 012 — Employee Dashboard (Shared Staff Landing Hub)

**Lifecycle stage:** 1 — Business Requirements
**Stage owner (A):** `business-analyst` (drafted here by `product-manager` per explicit platform-owner
request — `business-analyst` should countersign/amend before Stage 2 per RACI; this is a
product-manager-authored Stage 1 pass, same working pattern already used for 010/011)
**Contributors:** `product-manager`, `compliance-specialist`, `ux-researcher`
**Status:** Draft — new platform-owner request (2026-09-08). **Countersigned with amendments by
`business-analyst` 2026-09-09 (§8) — Stage 1 complete.** Not yet scoped into a milestone;
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
  **[business-analyst amendment]** The three label strings above (`Admin`, `Security Partner
  Operator`, `Call Centre Agent`) are hereby the canonical mapping from `PrivilegedUserType` →
  display label for this feature — `frontend-architect`/QA should treat these exact strings as
  the spec, not re-derive their own wording per surface, to avoid the terminology-drift pattern
  called out in this role's best practices.
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
  **[business-analyst amendment]** "Editable via PR" is a build mechanism, not a content-governance
  answer — it does not by itself establish who is *allowed* to approve wording every admin,
  security-partner operator, and support agent will see. v1 should require a `product-manager` (or
  delegate) review on any PR touching the notices config, same bar as customer-facing copy, even
  though the mechanism is a static file — this avoids an unreviewed string turning into a de facto
  policy or compliance statement (see this session's Feature 010/011 pattern of small-looking
  surfaces carrying real compliance weight). Not a blocker to Stage 2, just a governance note to
  carry into the FR-3 implementation ticket.
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
5. **AC-5 [amended by Stage 10 QA, 2026-09-10, per SR-012-6]:** The Home screen shows the
   per-role operational count(s) from FR-4, and each number is the **true total of the filtered
   population the operator is authorized to see** (i.e., the backend's `countDocuments()` result
   against the identical filter the sibling list route applies — never a page's `data.length` or
   any other page-capped derivation). This is **not** the same test as "matches the number of rows
   rendered on the corresponding list page": the corresponding list pages are paginated (e.g. the
   admin verification queue currently requests `limit: 50`) and, once a filtered population exceeds
   one page, the list page's own visible row count is *expected* to read lower than the Home
   screen's true total — that is correct pagination behaviour, not a discrepancy to reconcile. The
   original wording ("verifiably matching what the operator sees by navigating to the corresponding
   existing list page and counting/reading its own total") is retired: it was unsatisfiable for any
   population larger than one page and, if used as the literal test, would reward re-deriving the
   count from a capped page fetch — reintroducing F-012-2 (the exact page-cap bug this feature's
   design chain exists to have resolved) — rather than catching it. **Corrected test:** seed a
   filtered population strictly larger than the sibling list route's page `limit`; call the count
   endpoint and assert it returns the true total (e.g. 61 for a 61-row seed against a `limit: 50`
   list); separately confirm the list route's own page still caps at `limit` and is not expected to
   match. See `security-review.md` §10 item 5 (`countDocuments()`, no `limit`/cursor in any count
   path) and SR-012-6, and `backend/src/routes/admin-verification.test.ts`'s
   `AC-5/SR-012-6 — count is a true total, not capped at the list route's page limit` test, which
   already implements this corrected version.
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
9. **AC-9 [business-analyst addition]:** If the request(s) backing an FR-4 operational count
   fail, time out, or the underlying list endpoint returns an error, the Home screen degrades
   gracefully — the affected count shows a neutral placeholder (e.g. "—" or a skeleton state) and
   an optional inline retry, and the rest of the Home screen (FR-1 identity, FR-2 quick links,
   FR-3 notices) continues to render normally. A single failed count must never blank the whole
   Home screen or block navigation via FR-2's quick links. (This was unaddressed in the original
   AC-1–AC-8 set; FR-4 is the only FR in this feature that depends on a live network call, so it's
   the only one with a meaningful failure mode requiring its own criterion.)

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
  **[business-analyst amendment — see §8]** "Not mapped to north-star DAU" is correctly stated as
  a *non*-mapping to the customer-facing metric, but should not be read as "this feature has no
  success metric." `product-manager` should define a small staff-facing success measure at Stage 2
  (e.g. a qualitative check-in with each role 2–4 weeks post-launch, or a simple usage signal like
  quick-link click-through) so this feature has *some* way to be judged as having worked, distinct
  from — and not gated on — the 2,000-DAU customer metric.

---

## 7. Out of scope (this feature folder)

- Any backend-authored/target-able notices system (deferred per §3.1 FR-3).
- Cross-role data visibility of any kind (deferred per §3.2, pending compliance review if revived).
- A unified multi-role auth/session model (Option A, §2) — not ruled out permanently, just not
  this feature's scope.
- All per-role feature ideas in §4 — each needs its own Stage 1 pass; listed here as backlog
  candidates only, not committed scope.

---

## 8. Business-analyst countersign

**Reviewer:** `business-analyst` (RACI-accountable owner, Stage 1 — Business Requirements)
**Verdict: Countersigned with amendments.** This is a well-scoped, correctly-disciplined draft —
the Option A/B placement analysis in §2 is the right way to have made that call, §3.2's explicit
"evaluated and rejected" list is exactly the standard this role expects, and the per-role backlog
in §4 stays honest about buildable-now vs. blocked. It did not need to be sent back. The amendments
below are small, targeted additions, not a rewrite of the draft's substance.

### 8.1 On scope (FR-1–FR-4 vs. what a "shared landing hub" should mean)

Option B's four FRs are the right size for a v1 landing hub: identity, navigation, static comms,
own-role glance data. Nothing reviewed here is over-scoped — if anything, §3.2's discipline in
*excluding* cross-role visibility and a unified activity feed is the harder and more important call
in this document, and it is the correct one; those features carry real compliance/security surface
that this feature's "small UI win" framing does not justify taking on. I don't find anything
business-critical missing from the FR set itself. The two gaps I did find were not missing FRs but
missing *specification precision* within the existing FRs, both now closed by amendment:

1. FR-1 left the role→label mapping as an implied convention rather than a canonical spec — closed
   by the amendment inline at FR-1 (§3.1), which fixes the exact three display strings so
   `frontend-architect` and QA build/test against the same wording instead of each inferring it.
2. FR-3's "static content, editable via PR" description specified the delivery *mechanism* but not
   *who approves what gets said to all staff* — closed by the amendment inline at FR-3 (§3.1),
   requiring the same review bar as customer-facing copy even though the artifact is a static file.

### 8.2 On acceptance criteria (§5)

AC-1 through AC-8 are each independently testable with a clear pass/fail condition, correctly
traced to a specific FR, and AC-6's explicit negative/network-level test for cross-role data is a
genuinely good catch by the original draft — most specs would have stopped at "UI doesn't show it."
One gap: FR-4 is the only FR in this feature with a live network dependency (FR-1/FR-2/FR-3 are all
already-hydrated client state or static config), and the original AC set had no criterion for what
happens when that call fails. **Added AC-9** (§5) to close this — a failed or slow operational
count must degrade to a neutral placeholder, not blank the screen or block the rest of the Home
screen's already-safe content. Without AC-9, "per-role operational count" could ship with an
undefined error state and no QA criterion to catch it before release.

### 8.3 On §4's per-role backlog ideas

Sanity-checked, not approved for building (correctly out of scope for this feature). A-1/A-2/A-3,
S-1, and C-1/C-2 are all reasonable, grounded candidates that reuse existing entities and data —
none of them invent a new business capability out of nothing. S-2 is correctly self-flagged as
blocked on real case volume and INC-001 posture; C-3 is correctly *not* re-proposed given it's
already an open item under Feature 010's OQ-010-2. One soft note for whoever later Stage-1's C-2
("recent lookups" shortcut): it is customer-identifying data (name/policy/phone used in a lookup)
held in `sessionStorage`, and while "session-only, cleared on sign-out, no new persistence" is a
reasonable v1 answer, it should still get a one-line `cybersecurity-architect` confirmation when it
becomes its own ticket — not because this document is wrong to call it low-risk, but because this
session's pattern (Feature 010/011) has been that "small and obviously fine" surfaces are exactly
the ones worth a five-minute confirmation rather than an assumption. This is a note for that future
ticket, not a blocker on Feature 012 today.

### 8.4 On the north-star DAU framing (§6)

"Not mapped to the north-star DAU metric" is the *correct* factual statement — this is a staff tool,
not a customer acquisition/retention surface, and forcing a DAU mapping onto it would be worse than
having none. But stated alone it reads as "this feature has no success measure at all," which isn't
the same claim and shouldn't be allowed to stand as this document's final word on the feature's
value. **Amended §6** to require `product-manager` name a small, proportionate staff-facing success
signal at Stage 2 (a qualitative post-launch check-in with each role is enough — this does not need
its own analytics pipeline). A feature that touches three staff surfaces should have *some* way to
be judged as having worked or not, even if that measure is lightweight and qualitative rather than
a north-star-grade metric.

### 8.5 Flags carried forward to `product-manager`'s Stage 2 pass

- Confirm the FR-1 canonical role-label strings (§3.1 amendment) get built as literal spec, not
  reinterpreted per surface.
- Assign an owner (likely `product-manager` or `technical-writer`) for FR-3 content-review
  gatekeeping before the notices config ships, per the §3.1 amendment — this is a one-line process
  decision, not new engineering scope.
- Confirm AC-9's degrade-gracefully behavior gets carried into whatever Stage 4/6 design and
  implementation ticket covers FR-4, since it wasn't in the original AC set product-manager and
  ux-researcher may have already been designing against.
- Name a lightweight staff-facing success signal for this feature per §8.4, distinct from and not
  gated on the 2,000-DAU customer metric, so Stage 2 doesn't inherit an undefined "how do we know
  this worked" question.
- All four `compliance-specialist` / `cybersecurity-architect` / `solution-architect` /
  `ux-researcher` flags already listed in §6 stand as originally drafted — this countersign found no
  reason to add to or remove from that list, only to sharpen FR-1/FR-3/FR-4/§6 as above.

No changes were made to §1, §2, §4, or §7 — the current-state audit, placement analysis, per-role
backlog, and out-of-scope list were all found accurate and complete as drafted.

---

## 9. Solution-architect Stage 5 confirmation — Option A vs. Option B

**Reviewer:** `solution-architect` (Stage 5 — Architecture Review) · **Date:** 2026-09-09
**Verdict: Option B confirmed. Option A is correctly not pursued, and is not silently foreclosed —
§7 already keeps it open as a future ADR-level decision, which is the right disposition.**

This is the short confirmation §6 asked for, not a new architecture-review document. Three findings.

### 9.1 The roadmap check — multi-role accounts / staff SSO are not planned (verified, not assumed)

Searched `docs/organization/roadmap-release-gate-a.md`, `north-star-2000-dau.md`,
`innovation-backlog.md`, and all seven ADRs (0001, 0002, 0003, 0006, 0008, 0009, 0010) for any
account-model plan involving multi-role staff accounts, role switching, or staff SSO across roles.
**Nothing.** The only hits anywhere in `docs/` are this feature's own §2/§7 and `product-plan.md`.
The only prior statement on the subject is Feature 005's architecture doc §6.1 —
*"No role switcher, no shared 'staff portal' shell in Phase 1"* — i.e. the existing direction of
travel agrees with Option B rather than being neutral about it.

The account model is **structurally single-role per account today** — confirmed in code, not
inferred: `app.accounts.user_type` is one column of enum `app.user_type`
(`backend/src/repositories/accounts.ts:15`, `backend/migrations/030_*.sql`), denormalized as one
value onto `app.account_status_cache`; `requireUserType(...allowed)` matches the single
`req.auth.userType` claim (`backend/src/middleware/require-role.ts:18-24`); and the frontend's
`PRIVILEGED_DASHBOARD_CONFIG` is a `Record<PrivilegedUserType, …>` keyed one-role-to-one-tree
(`src/dashboard/auth/roleRouting.ts:28-37`). There is no join table, no array column, no
"roles" concept to grow into. Multi-role would be a schema change plus a token-claim change, not a
UI change.

**The stronger point, which §2 didn't have:** Option A isn't merely unbuilt — it is *actively
contradicted by an accepted security constraint*. **C-LU-2 / SR-LU-4** (login-unification security
review) requires that "establishing a session for role X must first terminate any session for role
Y held by the same browser — locally *and* server-side," implemented in
`clearOtherRoleSessions()` (`src/dashboard/auth/roleRouting.ts:136-145`), which clears every other
role's storage slot and fires server-side revocation. Concurrent multi-role sessions are therefore
a deliberately closed door, not an open one. Building Option A would require reopening a
`cybersecurity-architect` decision, which raises its true cost well above the "fourth auth context"
figure §2 already used — and further confirms Option B.

### 9.2 Architectural soundness of Option B — holds, with one structuring condition

Mounting a role-parameterized Home as the index route inside each existing tree, reusing each
`DashboardShell` and `DashboardAuthProvider` unchanged, is sound: it adds **zero** new service
boundaries, contracts, session surfaces, or storage slots; it consumes only already-hydrated
client state (FR-1/FR-2/FR-3) plus each role's own existing list endpoints (FR-4); and every
existing `AuthGate` continues to sit above it unmodified (AC-7 is then true by construction rather
than by test). Three mounts of one component is duplication of *routing*, not of logic — an
acceptable and reversible cost.

One condition, which I'd like carried into the Stage 6/9 implementation ticket:

- **C-012-A1 — role-specific data must be injected per tree, not branched inside the shared
  component.** The shared presentational Home belongs under `src/dashboard/` (consistent with
  `ui-design.md`'s `src/dashboard/content/homeAnnouncements.ts`), but its quick-link set and FR-4
  count source must be passed in as props by each role's own route file in `src/admin`,
  `src/security`, `src/call-centre` — **not** resolved by a `switch (role)` inside the shared
  component that imports all three roles' API clients. Reason: with injection, no role's Home code
  can even reference another role's API client, so **AC-6 (no cross-role fetches) becomes a
  structural property enforced by the import graph** rather than a runtime conditional that a
  future edit could regress past a test. This costs nothing extra to build now and is materially
  harder to retrofit later. It also keeps the three surfaces independently evolvable, which is the
  actual reason Option B is cheap in the first place.

### 9.3 On not rubber-stamping

Stages 2 and 4 both proceeded on Option B; I re-derived the placement question from the account
model and the login-unification constraints independently before reading their conclusions, and
would have said so had I disagreed. I did not, and the cost-of-unwinding question is therefore
moot — but for the record: unwinding at this point would have cost only the Stage 4 UI design's
mounting assumptions (§2/§4.3), not the FR set or acceptance criteria, since FR-1–FR-4 are
placement-independent. The expensive part of Option A was never the Home screen; it was the auth
model, which is precisely why doing it *this* way leaves that decision fully available later.

**No new ADR required.** This confirmation is not architecture-significant on its own — it
declines to change the architecture. If multi-role staff accounts are ever genuinely requested,
*that* is the ADR (account model + C-LU-2 revisit + a fourth auth context), and this section is the
record of why it was not taken speculatively in 2026-09.

**Stage 5 architecture gate: PASS** (subject to C-012-A1 above, which is a structuring note for
implementation, not a blocker). `cybersecurity-architect`'s separate §6 light-touch confirmation
that Option B introduces no new auth surface still stands as its own item — my finding that it
introduces none is an architectural read, not a security sign-off.

---

**Next lifecycle step:** Stage 1 business-requirements review is now complete (this countersign) →
`product-manager` Stage 2 scoping (confirm Option B, assign milestone/sprint, pick up the §8.5
flags) → `ux-researcher` light validation of FR-2 quick-link sets → Stage 4 UI design → Stage 5
Architecture Review (confirm zero new auth surface) → Stage 6/7 only if FR-4's per-role counts need
new backend aggregate endpoints rather than reusing existing list responses.

---

## 10. `cybersecurity-architect` — Stage 5 light-touch auth-surface confirmation

**Reviewer:** `cybersecurity-architect`, 2026-09-09. **Scope:** only the §6 flag — "does Option B
introduce a new auth surface." This is **not** a Stage 8 Security Review; the hard Stage 8 gate
(threat-model delta, `security-engineer` + `compliance-specialist` concurrence) still runs before
Stage 9 dev work ships. §9 is left free for `solution-architect`'s Option A/B confirmation.

**Verdict: CONFIRMED — no new auth surface — with two non-blocking flags for Stage 8.**

### 10.1 What was verified in code (not taken from the doc's assertion)

- **Zero new session/token handling.** `DashboardAuthProvider` (`src/dashboard/auth/
  DashboardAuthProvider.tsx`) takes `{storageKey, allowedUserType}` and is the sole owner of
  hydration (`:113–138`), server-side role re-verification via `GET /account/me` (`:93–111`), and
  fail-closed sign-in (`:159–172`). A Home screen mounted as an `index` route consumes
  `useDashboardAuth()` read-only; nothing in FR-1/FR-3/FR-4 writes a token, reads `sessionStorage`,
  or adds a provider. Option A's "fourth auth context" concern does not materialise.
- **Home sits behind the same gate as every other page (AC-7 satisfied structurally).** In all
  three trees the `index` route is nested inside `<AuthGate>` → `<Layout>`:
  `src/admin/AdminRoutes.tsx:52–54`, `src/security/SecurityRoutes.tsx:27–29`,
  `src/call-centre/CallCentreRoutes.tsx:34–36`. `AdminAuthGate` (`src/admin/layout/
  AdminLayout.tsx:8–37`) renders `<Outlet />` **only** on `status === 'signed-in'`, i.e. only after
  the server-side `/account/me` role check resolves — so Home's FR-4 fetches cannot fire before role
  verification. Replacing `<Navigate to="accounts" replace />` with `<HomePage />` changes the
  gate's *child*, not the gate.
- **FR-1 identity data is already-hydrated client state, no new call.** `account` is the same
  `AccountMe` object each layout already renders (`AdminLayout.tsx:56–58`). AC-2 holds.
- **FR-3 announcements are a static frontend constant** (`ui-design.md` §3.2) — no endpoint, no
  authored content, no new input trust boundary. Plain-text-only, no markdown/HTML/links, which
  keeps injection surface at zero rather than relying on sanitisation. Good structural choice.
- **FR-4 reuses existing endpoints whose role scoping is enforced server-side, not by the caller.**
  Confirmed the count-source endpoints authorize identically regardless of which page calls them:
  - `GET /admin/verification-requests` — `requireUserType('admin')`
    (`backend/src/routes/admin-verification.ts:27–35`).
  - `GET /security/cases` — `requireUserType('security_company_operator')` **plus**
    `requirePartnerOrg`, and the query is scoped by `req.auth.partnerOrganizationId` taken from the
    token, never from a request param (`backend/src/routes/security-cases.ts:32–39`, `:41–62`).
  - `GET /support-cases` — `requireUserType('support_agent')`, `scope` is **required with no
    default**, `scope=all` is rejected outright and has no repository implementation, and results
    come from `listMine(req.auth.accountId, …)` (`backend/src/routes/support-cases.ts:167–210`).
  - `requireUserType` reads `req.auth.userType` from the **verified access-token claim**
    (`backend/src/middleware/require-role.ts:18–30`) — the frontend cannot influence it.
  Because authorization is derived from the token and the partner-org / agent-account scope is
  server-derived, a Home-screen count-fetch **cannot** leak cross-role data even by accident: there
  is no parameter the Home screen could pass to widen scope. A wrong-role token yields 403, not a
  wider result set.
- **No shared-client cross-role bleed.** `configureDashboardClient` is a module singleton
  (`src/dashboard/api/client.ts:21–26`) but only one role tree mounts per URL path
  (`src/App.tsx:107/115/123`), so it is bound to the mounted role's provider. Home introduces no new
  pattern here — it fetches on mount exactly as `VerificationQueuePage`/`CasesListPage` already do.
- **§3.2's cross-role exclusion is honoured in the Stage 4 design.** Re-read `ui-design.md` §3.3 and
  §5: each role's card set points only at that role's own routes (`/admin/verification`,
  `/admin/analytics`; `/security/cases`; `/call-centre/lookup`, `/call-centre/cases`), each count is
  sourced from that role's own endpoint, admin's dropped "active policies" count is honoured by
  omission, and cross-role visibility / unified activity feed are explicitly not designed in any
  form (§5). Nothing reintroduces cross-role data. **AC-6 remains a valid, testable negative test as
  written.**

### 10.2 Flags to carry into Stage 8 (not blockers to Stage 5)

- **F-012-1 — FR-4 counts cause PII disclosure + audit-log writes on every dashboard landing.**
  Neither list endpoint returns a total; they return `CursorPage` rows. So "count of pending
  verifications" means **fetching real customer records** — `admin-verification.ts:46–60` returns
  email, first/last name, phone and masked ID per row, and `:62–69` writes a
  `recordBulkDisclosure()` audit event (ADR-0006 AUD-3(b)) per subject. `support-cases.ts:213–222`
  does the same. Today those disclosures correspond to an operator *deliberately opening a queue*;
  after Feature 012 they would fire automatically on every landing/refresh, attaching disclosure
  records to a user who never looked at anyone's data. That is a data-minimisation and
  audit-semantics change, not an authZ change — but it degrades the audit trail's evidential value.
  **Preferred resolution:** if Stage 6/7 adds a count mechanism, make it a genuine count/aggregate
  that returns a number and no subject rows (and therefore no per-subject disclosure event), rather
  than a `limit=N` row fetch the UI throws away. The `security-cases` count is the cheap case —
  `?status=open` filtering already exists (`security-cases.ts:16–18`) and that route emits no
  bulk-disclosure event. `security-engineer` and `compliance-specialist` should own the final call
  at Stage 8; I am flagging it, not deciding it here.
- **F-012-2 — a page-derived count is not the same number as a true total (AC-5 accuracy).**
  Deriving a count from a page of results silently caps at the page limit (admin's queue page
  already requests `limit: 50` — `src/admin/pages/AdminVerificationPages.tsx:21`), so a 60-item
  queue would render "50". Not a security issue, but it would make AC-5 unsatisfiable and could
  understate a backlog an operator relies on. Same resolution as F-012-1.

Rate limits were checked and are **not** a concern: 60/min for the admin verification list, 100/min
default elsewhere (`backend/src/lib/policy.ts:93–96`, `:117–120`) — one extra call per landing does
not meaningfully consume either budget.

### 10.3 Conditions on this confirmation

This confirmation covers Option B **as designed in `ui-design.md`**. It is void if any of the
following change, each of which would require a fresh review rather than this light-touch pass: (a)
any Home content sourced from a role other than the signed-in one; (b) any new endpoint created for
FR-4 (a new aggregate route is a new API surface needing its own authZ review at Stage 7/8, even
though the *data* is already-authorized); (c) FR-3 becoming backend-authored or accepting anything
other than plain text; (d) Home being hoisted out of the per-role tree to a shared `/staff` route
(Option A), which reopens the auth-context question in full.
