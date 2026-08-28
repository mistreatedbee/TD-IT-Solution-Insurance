# North Star — 2,000 Daily Active Users with Registered Policies

**Owner:** `product-manager` · **Status:** Active, directional target — not a committed calendar
**Source of truth for current build state:** `HANDOFF.md` (point-in-time snapshot),
`CLAUDE.md` (repo-state section, refreshed 2026-08-24), `docs/organization/roadmap-release-gate-a.md`,
`docs/organization/sprint-plan-release-gate-a.md` (INC-001). Where these disagree, the code wins —
re-verify before citing any status line below as still true.
**Relationship to other roadmap docs:** `08-roadmap.md` is the multi-phase product roadmap.
`roadmap-release-gate-a.md` sequences the current release. **This document sets the outcome those
two are converging toward and the order of gates between here and it.** It does not replace either;
every future roadmap/sprint-plan revision should be evaluated against whether it moves the platform
closer to or further from this goal.

---

## 1. The goal, stated precisely

**2,000 daily active users, each with at least one registered policy, sustained (not a one-day
spike).** "Daily active" = a distinct authenticated user session on a given calendar day, per
whatever DAU definition `analytics-specialist` formalizes (§5) — this document does not invent
that definition, it names the need for one.

This is **not** "2,000 signups" or "2,000 registered assets." A user who signed up once and never
returns does not count. A user with a `pending_activation` policy and no session in 30 days does
not count.

## 2. Where the platform is today (2026-08-28), honestly

- **DAU today: 0.** There is no production customer base. Distribution is internal only
  (TestFlight / Play Internal Testing) per `003-mobile-app-foundation/architecture.md` §6 and
  Release Gate A is not yet closed.
- Core customer flows are real and tested (auth, MFA, policy creation, asset registration for all
  eight asset types, notification preferences) — this is genuine progress, not vaporware.
- **No policy can be activated.** Every policy created today lands in `pending_activation` /
  `billingStatus: not_configured` — there is no payment gateway, so "a user with a registered
  policy" in the strict sense this goal requires does not yet exist for anyone, including internal
  testers.
- **Claims has no backend.** UI exists (`mobile/app/(app)/claims/`) but is being hidden behind a
  build flag for the next client build (Release Gate A item 1.4) precisely because it 404s.
- **GPS hardware tracking has no vendor.** Self-device (phone-only) location design exists
  (Feature 008 / ADR-0009), but as of the most recent incident (INC-001, 2026-08-25), the
  location-ingestion endpoint is under an active **server-side kill switch** after a Stage-8-gate
  breach put an unreviewed location surface into a client-distributed preview APK. That incident is
  **contained, not closed** — see `docs/organization/incidents/`. No location capability ships in
  the next client build (`roadmap-release-gate-a.md` §2) regardless of INC-001.
- **No staging environment.** QA and any future load-adjacent testing runs against the same live
  Supabase/Atlas project as local dev.
- **No analytics/event instrumentation exists.** There is nothing in this repo today that can
  produce a DAU number even if 2,000 people opened the app tomorrow.
- **Compliance conditions block real customer PII entirely**: Supabase DPA unsigned, no
  platform-level RoPA, Resend (transactional email vendor) has never had its own operator/POPIA
  review (only a stale review of the superseded vendor, Brevo, is on file).

**Note (2026-08-28):** contract TDIT-2026-09 (signed-pending, not yet confirmed executed — see
`docs/organization/contract-tdit-2026-09-scope-summary.md`) establishes a funding/scope baseline
for the platform: a small monthly retainer (R3,000/month, R36,000 total over 12 months) covering
Customer Mobile App, Admin Dashboard, Security Dashboard, a newly-identified **Call Centre
Dashboard** (not previously tracked in this document — new surface, new operator role), Backend/
API, Database, and GPS Integration. This is a capped-scope retainer, not a growth budget — it
explicitly excludes security audits, penetration testing, uptime/GPS-accuracy guarantees, and all
hardware/payment-gateway/hosting/SMS costs (Client-paid separately). Treat it as evidence the
platform has a funded baseline, not as license to inflate what any milestone below actually
delivers.

Given this, **2,000 DAU is not a "next release" target.** It is a multi-quarter outcome that
depends on several things engineering does not fully control (§4). The milestones below are
sequenced so that every engineering-controlled gate closes before the parts of the goal that
depend on business/vendor decisions are asked to carry load.

## 3. Milestones — sequenced, not scheduled to fixed dates

Dates are not given as commitments; each milestone is gated on the one before it plus named
external dependencies. `technical-project-manager` owns converting this into sprint-level dates
once each milestone's inputs are confirmed, same as `roadmap-release-gate-a.md`.

| # | Milestone | Gate condition to call it done | Primary owners |
|---|---|---|---|
| **M0** | **Release Gate A closes** | Criteria 1–6 in `sprint-plan-release-gate-a.md` all green, including INC-001's criterion 6 (no surface that bypassed Stage 8 is reachable in a client build) | `mobile-architect`, `technical-project-manager`, `cybersecurity-architect` |
| **M1** | **Compliance floor cleared for real customer PII** | Supabase DPA signed and confirmed; Resend-specific operator/POPIA review filed (supersedes the stale Brevo review); platform RoPA exists covering Features 001/004/006/007 | Platform owner (DPA), `compliance-specialist` (RoPA, Resend review) |
| **M2** | **A policy can actually activate** | Payment gateway selected (ADR-0010) and built; `pending_activation → active` transition exists and is tested; commercial rules D-01–D-08 ratified (tiers, pricing, coverage limits, eligibility, cancel/refund, retention) | `integration-architect` (vendor selection), `payment-engineer` (build), `business-analyst`/`product-manager` (commercial rules), `cto` (ADR ratification) |
| **M3** | **Staging environment exists** | Separate Supabase project + separate MongoDB Atlas database for QA, per MP-8 / roadmap item 1.11 | `cloud-infrastructure-architect`, `devops-engineer` |
| **M4** | **DAU/activation is measurable** | Event instrumentation live: session-start dedup, policy/asset funnel events, retention cohort capability; a DAU dashboard exists that could report a real number today even if it reads zero | `analytics-specialist` (design), `reporting-engineer` (build) — see §5 |
| **M5** | **Controlled/private launch** | First cohort of real, paying (M2-dependent) external users onboarded outside the internal test group — order of magnitude tens to low hundreds, not 2,000; used to validate onboarding conversion and activation before any marketing spend | `product-manager` (scope), `manual-qa-engineer`/`qa-architect` (Stage 10 evidence), platform owner (go/no-go) |
| **M6** | **Public app-store release authorized** | Phase 1 scope genuinely complete per `003-mobile-app-foundation/architecture.md` §6; public store review submitted and passed (Apple/Google, outside engineering's control on timing) | `mobile-engineer` (build), platform owner (store accounts), Apple/Google (approval — external) |
| **M6a (new, contract-scoped)** | **Call Centre Dashboard scoped and built** | New operator-facing dashboard per contract TDIT-2026-09 Schedule A (`docs/organization/contract-tdit-2026-09-scope-summary.md`) — Stage 1 requirements not yet started; needs a `010-call-centre-dashboard` feature folder once `product-manager` confirms scope intent. Not a Release Gate A item; does not block M0–M5. | `product-manager` (scope), `business-analyst` (Stage 1), `backend-architect`/`frontend-architect` (build, once scoped) |
| **M7** | **Growth loop running toward 2,000 DAU** | Distribution/marketing channel active (business decision), retention features (notifications, home dashboard, Feature 009 Phase 1+) driving return visits, DAU trending upward on the M4 dashboard for 4+ consecutive weeks | Platform owner / business stakeholders (spend, channel), `product-manager` (funnel iteration), `analytics-specialist` (signal) |
| **M8 (stretch, not required for the DAU number)** | **Device-tracking hardware live** | GPS hardware vendor selected (ADR-worthy) and Feature 009 Phase 4 integrated | `integration-architect` (vendor), `gps-integration-engineer` (build) |

**Realistic timeframe, stated as a range, not a date:** assuming M0–M4 proceed without another
Stage-8-gate incident and the compliance/payment vendor decisions land within a normal one-to-two
quarter vendor-selection cycle, **engineering can plausibly have the platform launch-ready (through
M6) within roughly 2–3 quarters from today.** Whether that translates into 2,000 sustained DAU
within any further specific window is **not an engineering-controllable estimate** — see §4. A
platform can be fully launch-ready and sit at 50 DAU indefinitely if distribution/marketing doesn't
land, or reach 2,000 faster than any estimate here if it does. Treat "2–3 quarters to launch-ready"
as the only calendar-shaped claim in this document; everything past M6 is directional.

## 4. What engineering controls vs. what it doesn't

### Engineering-controllable (this org's job)

- Feature completeness of the core registration/onboarding/policy/asset flows.
- Reliability: uptime, error rates, crash-free sessions once real traffic exists.
- Onboarding conversion — how many people who start signup finish it (instrumented per §5).
- Activation instrumentation — defining and measuring "a user with a registered policy" precisely.
- Retention-supporting features: notifications, the Feature 009 protection-centre home, honest
  empty states instead of dead ends.
- Security/compliance posture that makes it *legally and technically safe* to onboard real users
  at all (M0–M1).
- Not shipping features (claims, GPS hardware) with fake or partial capability that would create
  support burden or trust damage at scale.

### Not engineering-controllable (flagged explicitly, not assumed away)

- **Marketing/distribution** — how prospective customers find out the app exists. No amount of
  engineering work produces users without a channel to reach them.
- **Pricing/commercial terms (D-01–D-08)** — business-owned, jointly with `cto`/`product-manager`,
  but the actual price point and willingness-to-pay validation is a business call, not a build task.
- **Payment gateway availability** — vendor selection, contracting, and merchant-account approval
  timelines are partly outside this org's control once a vendor is chosen (bank/PCI onboarding).
- **GPS hardware vendor availability and cost** — an open `integration-architect` decision; device
  procurement/logistics for a physical hardware product is a supply-chain dependency, not code.
- **App-store review/approval** — Apple/Google timelines and rejection risk are external.
- **Security-company partner recruitment** — the recovery-dispatch value proposition depends on
  having real security-company partners onboarded to the dashboard; that's a business-development
  function, not something the Security Company Dashboard build itself produces.
- **Insurance licensing/underwriting posture** — whether TD IT Solution Insurance is itself
  licensed/authorized to sell the policies this platform registers is a regulatory/business
  question upstream of anything in this repo; flagged here so it is never silently assumed settled.

**Engineering cannot guarantee 2,000 DAU.** It can guarantee the platform is safe, reliable, and
measurable enough that if the non-engineering factors above land, growth isn't bottlenecked on the
product itself.

## 5. Metrics and instrumentation needed (conceptual — routed to `analytics-specialist`)

None of this exists today. Listed as requirements for M4, not a build spec — `analytics-specialist`
owns the actual design, `reporting-engineer` the build, per `01-raci-matrix.md`.

- **DAU definition and event**: a canonical "session start" event, deduplicated per user per
  calendar day, with a stated timezone convention.
- **Activation definition and funnel**: signup started → signup completed → email verified →
  policy created → asset registered → policy `active` (post-M2). Each step needs its own event so
  drop-off is visible, not just a final conversion percentage.
- **Retention cohorts**: D1/D7/D30 return-rate by signup cohort, to distinguish "growth" from
  "churn masked by new signups."
- **Registration completion rate**: started vs. finished registering an asset (named explicitly in
  the `product-manager` role spec's own success metrics — not new scope, just not yet built).
- **Notification engagement**: opt-in rate and push delivery success, since notifications are the
  main retention lever currently shipped (Feature 007).
- **Support-ticket volume trend** on product-owned flows, as a leading indicator of onboarding
  friction before it shows up as DAU decline.
- A dashboard that can honestly report **zero** today — the requirement is instrumentation that
  exists before real users do, not a retrofit once traffic shows up.

## 6. Current blockers and who owns unblocking each

| Blocker | Owner(s) (per RACI) | Status |
|---|---|---|
| INC-001 — location ingestion kill switch, Stage-8-gate breach | `cybersecurity-architect` (incident chair), `compliance-specialist`, `database-architect`, `mobile-engineer` | **Contained, not closed** as of 2026-08-25 — see `docs/organization/incidents/` |
| Payments/billing not built, no gateway selected | `integration-architect` (selection), `payment-engineer` (build), `cto` (ADR-0010 ratification) | Vendor scorecard in progress per memo §5; no selection yet |
| Claims backend not built | `backend-architect` + `backend-engineer` (build, when unblocked), `business-analyst`/`product-manager` (Stage 1 requirements — don't exist yet) | Explicitly deferred past Release Gate A per CTO memo §7 — not next in queue |
| GPS hardware vendor not chosen | `integration-architect` (selection), `gps-integration-engineer` (build once chosen) | Vendor scorecard due per memo §5 timeline; Feature 008/009 tracking code deliberately vendor-agnostic until then |
| No staging environment | `cloud-infrastructure-architect`, `devops-engineer` | Targeted within two sprints of Release Gate A close (MP-8, roadmap item 1.11) — not a Release Gate A blocker itself |
| Compliance floor (DPA, RoPA, Resend operator review) | Platform owner (DPA signature), `compliance-specialist` (RoPA, Resend review) | Open — blocks any real customer PII regardless of feature completeness |
| No analytics/DAU instrumentation | `analytics-specialist` (design), `reporting-engineer` (build) | Not started — needs to land before or alongside M5, not after |
| App-store public release not yet authorized | `product-manager` (scope call), platform owner (store accounts) | Internal distribution only through Release Gate A; public release is a separate, later authorization |

## 7. How to use this document

- Every new feature proposal or roadmap insert (like `roadmap-release-gate-a.md`) should be
  evaluated against which milestone (§3) it moves the platform toward, or state explicitly that it
  doesn't (e.g. an internal tooling fix has no milestone mapping, and that's fine).
- If a milestone's gate condition changes (a vendor is selected, an incident closes, an ADR
  ratifies), update the table in §3 in place rather than letting this drift the way `HANDOFF.md`
  and `CLAUDE.md` have been observed to drift from actual repo state.
- This document does not promise 2,000 DAU by any date. It promises a sequence: nothing after M4
  is meaningful to chase without M0–M4 done first, and nothing in §4's non-engineering column is
  this org's to guarantee — only to flag clearly when it's the actual constraint.
