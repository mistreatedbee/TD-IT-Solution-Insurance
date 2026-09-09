# Feature 012 — Employee Dashboard (Shared Staff Landing Hub)

**Lifecycle stage:** 2 — Product Planning
**Stage owner (A):** `product-manager`
**Contributors:** `cto`, `technical-project-manager`, `business-analyst`
**Status:** Approved for scope — proceeding to Stage 3 (UX Research), Stage 5 intake noted, sequenced alongside Release Gate A / Feature 010/011 work
**Input artifact:** [`business-requirements.md`](./business-requirements.md) (Stage 1, `business-analyst` countersign, §8, 2026-09-09)

---

## 1. Stage 1 Sign-off

I am signing off Stage 1 as **approved for scope**, including the business-analyst's §8 amendments
(FR-1 canonical role-label strings, FR-3 content-review gate, AC-9 degrade-gracefully criterion).
No changes to FR-1–FR-4, §3.2's exclusions, or AC-1–AC-9 are made here — this plan builds on that
document, it does not rewrite it.

## 2. Decision 1 — Option B confirmed

**Confirmed: Option B** (shared Home screen mounted as the first route inside each of the three
existing role trees — `/admin`, `/security`, `/call-centre` — not a new pre-login `/staff` hub).

Stage 1's cost/value analysis is correct and I see no reason to challenge it:

- Option A requires a fourth authentication context (a shared "any staff" session) on top of three
  already-independent `DashboardAuthProvider` instances with separate storage keys. That's real
  architecture-review-level work — a new session surface — to buy a UI convenience that nothing in
  today's account model (`PrivilegedUserType` is a single role claim per account) requires.
- Option A only earns its cost if staff need to switch roles within one session (one person holding
  both admin and support-agent access). Nothing in Stage 1's audit, the account model, or this
  session's roadmap docs suggests that's planned. I am not aware of any business request for
  multi-role staff accounts, and I'm not introducing one speculatively.
- Option B reuses each dashboard's already-hydrated `DashboardShell` and `useDashboardAuth()`
  object with zero new auth surface — the actual product value (a consistent landing/orientation
  screen) is delivered at a cost proportionate to what this feature is: a small usability
  improvement for three existing internal tools, not a new product surface.

This is my confirmation of the flag Stage 1 raised for Stage 2 (§6). `solution-architect` still
gets an independent Stage 5 confirmation per §6 of the Stage 1 doc (see §6 below) — my sign-off
here doesn't substitute for that, it green-lights scoping to proceed on this basis.

## 3. Decision 2 — Milestone / sequencing

**Not part of Release Gate A** (`roadmap-release-gate-a.md`) and **not part of the north-star
2,000-DAU roadmap** — this is correctly flagged in Stage 1 §6 as a non-mapping, and I'm not forcing
one. It also doesn't belong on Feature 010 (Call Centre Dashboard) or Feature 011 (SAPS case
reporting)'s own tracks — those are shipped/near-shipped feature branches (both have security
reviews on file as of the latest commits), not open work this feature should be inserted ahead of.

Checked against what's actually in flight right now, not assumed:

- `roadmap-release-gate-a.md` §1 lists nine active items (1.1–1.9) plus two gated/parked items
  (1.10 GPS, 1.11 staging) — all owned by `mobile-engineer`, `devops-engineer`, `backend-architect`,
  `backend-engineer`, `compliance-specialist`, and the platform owner. None of those owners overlap
  with this feature's actual build surface (`frontend-architect`'s web dashboards).
- Feature 010/011 commits (`c9db2d6`, `8e2cdaf`, `7cf54d5`) show that work is in late-stage
  development/fix territory (Stage 8 security review already closed per the commit log), not early
  scoping — this feature isn't competing with 010/011 for the same design or architecture cycles.

**Milestone assignment:** Feature 012 is sequenced as a **frontend-only side track, starting no
earlier than the sprint after Release Gate A's critical-path items (§1.1–§1.5) are scheduled**, so
that `frontend-architect`'s attention isn't split against anything gate-blocking. Concretely:

- **Target milestone:** first sprint boundary after Release Gate A's device-QA gate (§1.3) is
  scheduled (not necessarily closed) — i.e., this can start once Release Gate A's shape is locked
  in the sprint board, without waiting for Release Gate A to fully close. This satisfies Stage 1's
  "alongside, not ahead of" instruction literally: it runs in parallel on a track with no shared
  owner, rather than jumping the queue.
- **Hard constraint:** this feature's Stage 9 (Development) may not consume `frontend-architect` or
  `mobile-engineer` capacity that Release Gate A items 1.1–1.5 need. Since Feature 012 touches only
  the three web dashboards (`src/admin/*`, `src/security/*`, `src/dashboard/*`), and Release Gate A's
  frontend-adjacent items (1.4, mobile claims flag) are mobile-only, there is no direct resource
  collision today — but `technical-project-manager` should re-confirm this at sprint planning, since
  capacity confirmation is explicitly not something `product-manager` self-certifies (same checklist
  discipline as Feature 001's product plan).
- This is a **small, low-risk, low-priority-but-not-zero-priority** item: it improves staff
  day-to-day usability of tools that already exist, but it unblocks nothing else on the roadmap.
  If a sprint gets tight, this is the item that slips, not Release Gate A or 010/011 follow-up work.

## 4. Decision 3 — Staff-facing success signal

Per the business-analyst's §8.4/§8.5 request, naming a lightweight, proportionate success signal —
not a new analytics pipeline, not gated on the 2,000-DAU customer metric:

**Success signal: a qualitative post-launch check-in with each of the three roles (admin, security
operator, support agent), 3–4 weeks after the Home screen ships**, structured as three short
questions asked directly to a sample of each role's actual users (or, if headcount per role is thin,
whoever is available):

1. Did you notice the Home screen? (Awareness — if a majority say no, placement/announcement is a
   navigation problem, not a content problem.)
2. Did you use any of the quick links? Which one, if any? (This doubles as light validation of
   FR-2's per-role quick-link selection — if a link nobody uses gets flagged, it's a candidate to
   swap in the next iteration.)
3. Did the operational count (FR-4) tell you something you'd otherwise have had to click through to
   find? (Validates whether FR-4 is pulling its weight vs. being a number nobody looks at.)

**Supplementary signal (no new system required):** if `analytics-specialist`/`reporting-engineer`
already capture route-level page views for the admin/security/call-centre web apps (worth
confirming, not assuming), a simple "Home route view count in the first 30 days" and "quick-link
click-through, if outbound clicks are already tracked at the route level" are opportunistic
signals to fold into the same check-in — but this is not a requirement to build new tracking, and
the qualitative check-in stands on its own as sufficient if no existing instrumentation covers this.

This satisfies Stage 1 §8.4's ask: the feature now has *some* way to be judged as having worked,
proportionate to its size, distinct from and not gated on the north-star DAU metric.

## 5. Decision 4 — v1 scope boundary confirmed as-is

**Confirmed, not amended.** FR-1 through FR-4 (§3.1 of the Stage 1 doc) stand as the v1 scope,
explicitly excluding cross-role visibility and a unified activity feed per §3.2.

I reviewed §3.2's exclusions specifically for whether Stage 1 drew the line too conservatively, and
I don't think it did:

- Cross-role visibility (even aggregate counts) crosses an auth/data boundary that today's three
  dashboards were built as three separately-RACI'd surfaces, one of which (Security Company
  Dashboard) has `compliance-specialist` as Informed where Admin Dashboard does not — that
  asymmetry alone is reason enough not to blur the boundary inside a "small UI win" feature. If a
  genuine cross-role need surfaces (e.g. admin needing a partner-SLA rollup), that's its own Stage 1
  item with `compliance-specialist` in the room from the start, exactly as Stage 1 recommends.
- A unified "all staff" activity feed is functionally a cross-role audit surface, which is
  ADR-0006/`cybersecurity-architect` territory, not a landing-hub add-on.

I am not expanding this feature to include either. Nothing in the countersign or in checking the
roadmap surfaced a business reason urgent enough to override Stage 1's caution here — if anything,
this session's Feature 010/011 pattern (small-looking surfaces carrying real compliance weight)
argues for holding the line, not loosening it.

## 6. Decision 5 — Sequencing the remaining §6 flags

Stage 1 §6 named four reviewers with work still to do. Sequencing who does what, and roughly when,
relative to this feature's lifecycle position (Stage 2 now → Stage 3 next):

| Flag owner | What's needed | When |
|---|---|---|
| `ux-researcher` | Light validation of FR-2's per-role quick-link set (confirm the inferred "most-used nav item" per role against actual usage/interview, not just nav-order inference) | **Stage 3, starts now** — this is Stage 3's actual job and the direct next lifecycle step after this plan |
| `solution-architect` | Confirm Option A vs. Option B (§2 above) — specifically confirm no multi-role-staff-account requirement is on the roadmap that would make Option A the better long-term call | **Stage 5**, once Stage 4 (UI Design) produces a flow to review against — not before, per the lifecycle table's entry criteria |
| `cybersecurity-architect` | Light-touch confirmation that Option B introduces zero new auth/session surface (reusing each dashboard's existing `DashboardAuthProvider`/gate) | **Stage 5, alongside solution-architect** — this doc's own framing calls it "light-touch, not a hard blocker," so it doesn't need to precede Stage 3/4, but should close before Stage 8's full Security Review starts on the FR-4 network calls |
| `compliance-specialist` | Only required if cross-role visibility is later revived (§3.2) — **not required for the v1 scope confirmed in §5 above**, since v1 ships with zero cross-role data | **Not scheduled** — no action needed unless a future Stage 1 item reopens cross-role visibility |

Additionally, carrying forward the business-analyst's §8.5 process items as owned actions for this
feature's implementation ticket (not new scope, just naming who executes):

- **FR-1 canonical role-label strings** (`Admin`, `Security Partner Operator`, `Call Centre Agent`)
  — carried into the Stage 4 UI design and Stage 9 implementation ticket as literal spec text, owner
  `ui-designer`/`frontend-architect` at build time, not reinterpreted.
- **FR-3 content-review gatekeeping** — owner: `product-manager` (this role) is the reviewer of
  record for any PR touching the static notices config, per the business-analyst's amendment. No
  delegation needed at this feature's scale.
- **AC-9 degrade-gracefully behavior** — carried into whatever Stage 4/6 design and Stage 9
  implementation ticket covers FR-4, flagged explicitly so it isn't dropped between Stage 1's late
  addition and actual build.

## 7. What Happens Next

Per `02-feature-lifecycle.md`, this feature moves to:

- **Stage 3 — UX Research** (`ux-researcher`, owner), light validation of FR-2's quick-link sets per
  role. Entry criterion ("item is scoped") is satisfied by this document.
- **Stage 4 — UI Design** (`ui-designer`), building the shared Home component against `DashboardShell`
  and existing design-system components — no new component category expected, but
  `design-system-manager` sign-off applies if any genuinely new UI element surfaces.
- **Stage 5 — Architecture Review** (`solution-architect`), confirming Option B per §2/§6 above.
- **Stage 6/7** only if FR-4's per-role operational counts need a new backend aggregate endpoint
  rather than reusing an existing list response's pagination metadata — flagged, not assumed, per
  Stage 1 §3.1.

No stage is skipped. Stage 8 (Security Review) and Stage 10 (QA Testing) remain hard gates
regardless of this feature's small size.

## 8. Pre-Approval Checklist (product-manager self-review)

- [x] Problem validated — Stage 1's current-state audit (§1) confirms no dashboard has a home/
      overview screen today; the gap is real, not assumed.
- [x] Acceptance criteria specific enough to test against — inherited from Stage 1 AC-1–AC-9,
      unchanged.
- [ ] Feasibility/sizing confirmed with solution-architect — **not yet done**, expected at Stage 5,
      not a blocker to Stage 3 starting.
- [x] Subscription/tier impact reviewed — **N/A**, this feature touches only internal staff
      dashboards, no customer-facing plan/tier logic.
- [x] Compliance-specialist consulted where relevant — consulted via Stage 1's explicit flag on
      cross-role visibility (§3.2); not required for the confirmed v1 boundary (§5 above), since v1
      has zero cross-role or new PII surface.
- [x] Dependencies on open vendor decisions flagged — **N/A**, no GPS/payment/hosting dependency in
      this feature.
- [x] Success metrics defined before development starts — see §4 above.
- [ ] technical-project-manager has confirmed sprint/release capacity fit — **not yet done**; §3's
      milestone assignment is this plan's scoping input for that confirmation, not a substitute for it.
