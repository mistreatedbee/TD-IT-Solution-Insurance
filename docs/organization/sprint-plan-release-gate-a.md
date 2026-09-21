# Sprint Plan — Path to Release Gate A and Beyond

**Owner:** `technical-project-manager` · **Date:** 2026-08-24
**Source of authority:** CTO decision memo, 2026-08-24 (verbatim scope/defer calls — not relitigated here)
**Companion doc:** `docs/organization/roadmap-release-gate-a.md` (`product-manager`, backlog/acceptance-criteria detail — this document does not duplicate that content, only sequences and assigns it)

This document sequences the memo into 1-week sprints starting **2026-08-24 (Sprint 1)**. It covers: Release Gate A (memo §2), the §3 priority chain (b)–(e), staging (§4), vendor scorecards (§5), and ADR ratification housekeeping (§6). Ownership is assigned per `docs/organization/01-raci-matrix.md`. Sequencing/ownership only — no scope, priority, or defer decision here overrides the memo.

## How to read this

- **Sprint** = ISO week starting Monday, 1-week cadence.
- **Owner (A)** = accountable role per RACI (or memo-designated owner for cross-cutting items). **R** = who does the work.
- **Gate** = lifecycle stage per `docs/organization/02-feature-lifecycle.md`; Stage 8 (Security Review) and Stage 10 (QA Testing) are never compressed out, per memo and per lifecycle doc.
- Items in *italics* are owner/external actions the TPM tracks but does not schedule engineering capacity against.

---

## Incident Log — INC-001 (2026-08-25)

**Status: CONTAINED, not closed.**

**What happened:** the location-ingestion endpoint shipped without ADR-0009's consent/provenance requirements and reached a client-distributed preview APK, before Stage 8 (Security Review) had been completed for that surface. This is a lifecycle-stage-gate breach — development/distribution proceeded ahead of the hard gate the org's lifecycle doc requires.

**Current status:** contained. A server-side kill switch is live in production, cutting ingestion at the endpoint regardless of what any client build does. This is a mitigation, not a resolution — the underlying gate breach, the affected preview APK, and the systemic question of how this got past Stage 8 are all still open.

**Remediation — four parallel work items in flight (tracked outside the sprint table below since this is incident response, not planned sprint capacity):**

| Owner | Work item | Status (2026-08-28) |
|---|---|---|
| `cybersecurity-architect` (incident chair) | SDL-2/SDL-6 completion; ADR-0009 §18 correction; Feature 009 systemic Stage-8 audit; incident post-mortem | SDL-2 closed §9.1; SDL-6 open (A-14); audit filed §7; CI-1/CI-2 partial landed |
| `compliance-specialist` | POPIA exposure assessment; purge-vs-retain disposition | Assessment filed; A-9 pending inventory run |
| `database-architect` | Inventory + quarantine — **no deletion** | Script ready: `backend/scripts/inc-001-location-inventory.ts` |
| `mobile-engineer` | Client-side location flag-off + **A-12 all §9.3 surfaces** | **Done** on `main` — A-13 bundle verify is next gate |

**Engineering note (2026-08-28):** A-12, A-15, A-16, A-17 (interim), CI-1, and CI-2 (partial) are on `main`. EAS preview build `426e5c01` triggered for A-13 (Android, commit `d3dc6f4`). Criterion 6 sign-off blocked on A-13 device verification. CTO status: `docs/organization/cto-status/2026-08-28-gate-a-inc-001.md`.

This incident is chaired by `cybersecurity-architect`, not `technical-project-manager` — this log entry tracks it for delivery/gate purposes only and does not substitute for the incident chair's own investigation or post-mortem artifact.

**Root-cause framing note:** this is the third instance this session of project documentation asserting something was done, verified, or absent when the code said otherwise (SR-007-11, ADR-0009 §17.4, app icons, and now INC-001 itself — an unreviewed surface reaching a client build). The planned remedy is not another manual documentation pass; it is mechanical CI gates that make the state machine-checkable instead of self-reported. `cybersecurity-architect`'s post-mortem is where that CI-gate design work lands — it is not designed in this document.

**Interaction with this plan:** see new Release Gate A criterion 6 below — build #2 (items 3.1/3.2) cannot ship until `cybersecurity-architect` signs off that no surface which bypassed Stage 8 is reachable in a client build. See also the ADR-0008 status note below — unrelated to INC-001 in cause, but both are instances of "stays open until independently verified, not just asserted."

---

## Release Gate A Criteria (as tracked by this plan)

Criteria 1–5 are the memo §2 conditions this plan has sequenced against since Sprint 1 (signing identity, Resend delivery confirmation, manual QA pass, claims build-flag, release notes) — see Sprint 1–3 table items 1.1–1.3, 2.1, 2.2. They are unchanged by this update.

6. **NEW (2026-08-25, INC-001):** No surface that bypassed Stage 8 security review is reachable in a client build, and `cybersecurity-architect` signs a positive statement to that effect.

**This is now a hard gate alongside the original five.** Build #2 (items 3.1 and 3.2 below) does **not** ship until criterion 6 is signed, in addition to criteria 1–5. `technical-project-manager` will not mark 3.1 (Gate A formally closed) or 3.2 (build #2 ships) green on the basis of 1.1–1.5/2.1/2.2 alone going forward — criterion 6 sign-off from `cybersecurity-architect` is a separate, required input tracked via the INC-001 remediation items above.

---

## Status Corrections — 2026-09-21 (`technical-project-manager`, filed nine days late against the 2026-09-10/09-14 asks)

**Source of authority for this section:** `docs/organization/cto-status/2026-09-14-task-assignment.md`
§5 (nine corrections requested), its Appendix 2 §4 (tenth: opened-vs-closed reporting), and
`docs/organization/cto-status/2026-09-21-status-and-dispatch.md` §5 (eleventh: account-deletion work
and Features 013/014 missing from this plan). This section corrects the record; it does not rewrite
sprint tables below wholesale. Where a specific line in a sprint table asserts something now known
stale, that line is marked **void** in place with a pointer here, per the house style at
`docs/features/012-employee-dashboard/security-review.md` §10.6/§14.1.

**1–2. Sprint numbering and item 1.2 (Resend framing) — corrected.** As of 2026-09-21, Sprint 6 is
underway and **Release Gate A is still not closed**: items 1.1, 1.2, 2.1, 2.2, 3.1, 3.2 remain open.
Item 1.2's original framing ("Resend email delivery confirmed by actual received inbox message") is
**void** — mechanism, not just status, was wrong: the Supabase Send Email Hook was never enabled,
Resend has never sent anything, and the mail the owner received came from Supabase's built-in sender.
Item 1.2 is replaced by four separately tracked legs, per CT-4a's ordering ruling (hook enablement is
now gated on CT-4a closing first, not merely owner action):
  - **1.2a** Supabase Send Email Hook enablement — owner-gated, now sequenced **after** CT-4a closes.
  - **1.2b** C-R-1 evidence capture (OI-R-8 screenshot set) — owner-gated, same sitting as 1.2a.
  - **1.2c** T-07 template rewrites (§A.6, seven templates) — **CLOSED 2026-09-14**, `notification-engineer`/`backend-engineer`, verified in `backend/src/lib/domain-email-templates.ts`.
  - **1.2d** CT-1 cross-border consent letter dispatch — **CLOSED 2026-09-14** (T-05), `SENT-2026-09-14-ct-1-...md` dispatch record filed, `correspondence/README.md` updated.

**3. Criterion 6 (item 3.1's dependency) — corrected.** Build `426e5c01` **expired 2026-09-11**;
`7f3694b9` (Android, commit `2630cd9`) replaced it and has not itself expired. Per Appendix 2 §2 of the
09-14 task assignment, 14 of 15 strictly-required rows are now live-proven, but **all 14 ran on Expo
Go/iOS/local Metro, not against `7f3694b9`** — criterion 6 is scoped to the artefact, not the code
path, and remains unsigned for that reason, not a row-count reason. The 2026-09-10 `manual-qa-engineer`
documented negative stands and is cited here rather than worked around, per the 09-14 register's
instruction. One new preview build is authorised once an Android execution path exists (T-25b) — not
before.

**4. ADR-0008 condition 1 (Blockers item 8 below) — ruled, not open-ended.** `cto` ruling recorded
2026-09-14 (T-20): the deploy-path leg **is** satisfied — `backend/src/index.ts:78–94` calls
`verifyMongoCatalog()` unconditionally on every deploy. Condition 1 does **not** close on a log line
nobody reads; it closes when `database-architect` + `devops-engineer` make the drift finding
*observable* (a surfaced signal, not a louder crash). That design work is open, tracked as item 2.8
below — **not** re-opened as a live-log-confirmation question, which was the stale framing.

**5. ADR-0010/0011 collision — confirmed resolved, no action needed.** The marketing-origin
privileged-login risk acceptance filed as `adr/0011-...`, not `0010`. `0010` remains reserved for the
payment-gateway decision (items 4.1/4.2 below); no renumbering required. 0004/0005/0007/0010 are the
remaining unused register slots — one-line note owed by `solution-architect` (T-21, still open).

**6. Item 3.9 / SH-2 — already reflected correctly in the Sprint 3 table below** (chair sign-off
2026-09-14, runtime evidence captured 2026-09-14, item fully closed). No correction needed here.

**7. Item 4.1's date — corrected below in the Sprint 4 table, and flagged, not resolved.** The
2026-09-14 due date passed with sub-reviews not started. `cto` re-baselined sub-reviews to
**2026-09-25** and decision/ADR-0010 to **2026-10-02** in the 09-14 register. **As of 2026-09-21 this
date is unconfirmed as real** — see the T-24 disposition at the end of this section. Do not read the
Sprint 4 table's date as settled; it is the re-baselined date pending `integration-architect`
confirmation.

**8. CT register (contractual condition items T-11…T-18) now cross-referenced into this plan**, rather
than living solely in `compliance-review-resend.md`/register documents `compliance-specialist` alone
reads:

| CT item | Description | Owner | Status as of 2026-09-21 |
|---|---|---|---|
| T-05 (CT-1 dispatch) | Cross-border consent letter dispatch record | `compliance-specialist` | **CLOSED** 2026-09-14 |
| T-06 (C-R-9) | Consumer-webmail contact closure | `compliance-specialist` | **CLOSED** 2026-09-14 (Appendix D) |
| T-11 (CT-2) | MongoDB Atlas region confirmation | `cloud-infrastructure-architect` | **BLOCKED-ACCESS**, folds into T-25a |
| T-12 (CT-3) | Breach-notification runbook | `compliance-specialist` + `security-engineer` + `site-reliability-engineer` | **CLOSED** 2026-09-14, filed 2 days late |
| T-13 (CT-4) | Documented Client instructions §19(a) | `compliance-specialist` | **CLOSED (artefact only)** 2026-09-14 |
| T-14 (CT-5) | `seed-test-accounts.ts --teardown` | `backend-engineer` | **CLOSED** 2026-09-14 |
| T-15 (CT-8) | ADR-0003 compliance appendix | `cloud-infrastructure-architect` + `compliance-specialist` | **CLOSED** 2026-09-14 |
| T-16 (CT-10) | §19(b) INC-001 notice to Client | `cto` (service) + `compliance-specialist` (draft) | **OPEN** — draft still absent |
| T-17 (CT-11) | Client-side SA ID checksum + truncate | `backend-engineer` + `frontend-architect` | **CLOSED** 2026-09-15, 4 days early — but does **not** move CT-1/CT-13 (see forward constraint below) |
| T-18 (CT-12) | Amend §2 location table (Supabase eu-central-1; web is Vercel not Render) | `compliance-specialist` | **OPEN**, fold into next revision |

**Forward constraint from T-17's closure (Appendix 2 §1 of the 09-14 register):** CT-11 is data
minimisation on one field; it does not make the Frankfurt cross-border transfer lawful and does not
narrow CT-1/CT-13's scope. Any future design (e.g. Feature 013) needing full 13-digit server-side ID
validation re-opens CT-1/s72 and does not inherit CT-11's closure. Recorded here as a sequencing
constraint on any future sprint that touches Feature 013.

**9. T-25 — added as a single first-class blocker**, see Blockers to Watch item 9 below (new). It was
previously implicit inside items 1, 5, and 8; tracking it as five scattered blockers understated that
this is one procurement/access problem, not five engineering ones.

**10. Opened-vs-closed reporting.** Closed since 2026-09-10 (verified by direct code/document read per
the 09-14 register and its appendices, not by agent self-report): T-05, T-06, T-07, T-08, T-12/CT-3,
T-13/CT-4, T-14/CT-5, T-15/CT-8, T-17/CT-11, T-22/SH-2 — **ten closures**. Opened in the same window:
CT-1a, CT-1b, CT-1c, CT-13, CT-14, CT-3-OI-1…5, CT-4a…4d, SH-2a — **fourteen items**, per Appendix 2 §4
of the 09-14 register. Net open count across the full CT/OI/SH register is **rising, not falling**,
even though this plan's own Gate-A-scoped item count is shrinking. This entry discharges the
opened-vs-closed reporting ask itself; it is not a claim that the underlying trend has reversed.

**11. Account-deletion work and Features 013/014 — not previously in this plan, added now.** The
account-deletion request flow (mobile `delete-account.tsx`/`delete-account-confirm.tsx`, web
`DeleteAccountPage.tsx`) is in-flight as of 2026-09-21 with one P0 finding (Android package-name
mismatch, F-1 in the 09-21 CTO status note) blocking its commit — see new Sprint 6 item 6.7 below.
Features 013 (SA ID verification) and 014 (household member sharing) both have Stage 1
business-requirements filed and neither has moved past it; Feature 014 is blocked on an owner
clarification at its own §0.3. Neither is scheduled into a sprint here — both remain pre-Stage-2 and
are tracked as **not yet committed capacity**, consistent with this plan's scope (Gate A + the memo's
(b)–(e) chain only).

### T-24 disposition — flagged, not resolved

Per this task's instruction, the 2026-09-25 sub-review date attached to T-24 in the 09-14 register is
**not confirmed by any committed artefact I can read** — no sub-review document exists yet for C1/C2/C3
of the payment-gateway scorecard. The date originates from a `cto` re-baseline, not from
`integration-architect` directly, and the 09-21 CTO status note itself asks `integration-architect` to
confirm or deny it today. **This plan records the 2026-09-25/2026-10-02 dates in the Sprint 4 table
below as re-baselined-but-unconfirmed, and does not treat them as settled.** If `integration-architect`
does not confirm by 2026-09-25, per the CTO's 09-21 note this becomes the second missed baseline on
this item and should be escalated as a capacity decision rather than re-baselined a third time.
`integration-architect` owns the confirmation; `technical-project-manager` does not guess it here.

---

## Sprint 1 — 2026-08-24 → 2026-08-30

Focus: everything that must close before Release Gate A can even be evaluated, plus the one-week-mandated items (§1 signing identity, §6 ADR ratification, memo daily-tracked email confirmation).

| # | Item | Memo ref | Owner (A) | R | Effort | Depends on |
|---|---|---|---|---|---|---|
| 1.1 | Deliberate EAS release identity: correct account/slug, bundle ID `co.za.tditsolutions.insurance` confirmed by owner, keystore generated + backed up off-machine, dead demo keystore/slug formally retired | §1 | `mobile-architect` | `mobile-engineer`, `devops-engineer` | 2–3 days | *Owner confirms bundle ID* |
| 1.2 | ~~Resend email delivery confirmed by actual received inbox message on a fresh signup~~ **VOID as of 2026-09-21 — see "Status Corrections — 2026-09-21" §1–2 above.** The mechanism this row assumed never existed: the Supabase Send Email Hook was never enabled and Resend has never sent. Split into 1.2a–1.2d above; 1.2c and 1.2d are closed, 1.2a/1.2b remain owner-gated and now sequenced after CT-4a. | §2.2 | `technical-project-manager` (tracks daily) | *Owner (Resend/DNS action)*, `backend-engineer` (verifies webhook/logs once received) | Owner-paced; TPM checks daily | CT-4a (compliance) must close before the hook is enabled — new dependency as of 2026-09-14 |
| 1.3 | Claims screens hidden behind build flag for client builds (`mobile/app/(app)/claims/`) | §2.4 | `mobile-architect` | `mobile-engineer` | 1–2 days | None |
| 1.4 | ADR-0008 (Mongo provisioning) ratification section filed | §6 | `solution-architect` | `database-architect` (author) | 0.5 day | None — memo already ratifies "in principle". **Note: condition 1 of ADR-0008 ("applied, never verified" catalog-provisioning language) is not closed by filing this ratification section. It stays open until `devops-engineer` confirms the catalog-verification check (item 2.8) actually runs in the deploy path, not merely exists in the repo. Do not mark condition 1 closed on the basis of 1.4/2.8 landing alone — closure requires the deploy-path confirmation specifically.** |
| 1.5 | ADR-0009 (self-asserted location trust boundary) ratification section filed | §6 | `solution-architect` | `integration-architect`/author | 0.5 day | None |
| 1.6 | Payment gateway vendor scorecard — kickoff: candidate list, POPIA-resident + hosted-fields/redirect-only constraint written into scoring criteria | §5 (3-wk deadline = 2026-09-14, one day into Sprint 4 — decision/ratification land Sprint 4, see 4.1/4.2) | `integration-architect` | `integration-architect`, consult `compliance-specialist`, `security-engineer` | 2 days this sprint, continues Sprint 2–4 | None |
| 1.7 | GPS hardware vendor scorecard — kickoff: candidate list, `tracking-profile.ts` abstraction constraint reaffirmed (no hardcoded vendor) | §5 (6-wk deadline = Sprint 6 close) | `integration-architect` | `integration-architect` | 1 day this sprint, continues through Sprint 6 | None |
| 1.8 | Supabase DPA — status check and escalation if still owner-blocked | §3(b) | `compliance-specialist` | *Owner (Supabase counter-signature)* | TPM tracks | None |

**Sprint 1 exit check:** 1.1, 1.3, 1.4, 1.5 closeable this sprint. 1.2 is the pacing risk (see Blockers to Watch). 1.6/1.7/1.8 are multi-sprint, tracked to completion in later sprints.

---

## Sprint 2 — 2026-08-31 → 2026-09-06

Focus: manual QA pass on physical device (Gate A item 3), release notes drafting, staging environment start (§4, two-sprint target = must land by end of Sprint 2), compliance chain (b) continues.

| # | Item | Memo ref | Owner (A) | R | Effort | Depends on |
|---|---|---|---|---|---|---|
| 2.1 | Signup → verify → login → create policy → register asset → view detail: full pass of `docs/features/004-policy-asset-management/manual-qa-checklist.md` on a physical device against Render | §2.3 | `qa-architect` | `manual-qa-engineer` | 2 days | **Blocked on 1.1 (signing identity) and 1.2 (email confirmed)** — cannot meaningfully QA signup/verify without real delivered email |
| 2.2 | Release notes drafted stating scope honestly (auth, policy/asset registration, admin/security-partner dashboards, self-device location design; explicitly not payments/claims/GPS hardware/live dispatch/"production-ready"/no date) | §2.5, §7 | `technical-writer` | `technical-writer`, review by `product-manager` | 1 day | Best drafted after 2.1 confirms actual working scope |
| 2.3 | Staging environment interim (MP-8): separate Mongo database name + separate Supabase project for QA | §4 | `cloud-infrastructure-architect` | `devops-engineer` | 3 days | None technical; sequenced here to land within the memo's two-sprint window, does not block build #2 |
| 2.4 | Payment gateway scorecard — candidate evaluation continues (hosted-fields/redirect vendors only) | §5 | `integration-architect` | `integration-architect`, `compliance-specialist` (consult) | ongoing | 1.6 |
| 2.5 | GPS hardware scorecard — candidate evaluation continues | §5 | `integration-architect` | `integration-architect` | ongoing | 1.7 |
| 2.6 | C-006-3 / C-007-2 Resend operator review | §3(b) | `compliance-specialist` | `compliance-specialist` | 2 days | 1.2 (need live delivery to review operator posture against) |
| 2.7 | Platform RoPA (C-006-4) drafting begins | §3(b) | `compliance-specialist` | `compliance-specialist`, consult `business-analyst` | 3 days, continues into Sprint 3 | None |
| 2.8 | Mongo catalog-verification check: confirm live Atlas collections actually match the seven collection-spec modules wired in `mongo-bootstrap.ts` — "applied" becomes verifiable, not just asserted. Rides the same deploy-time/CI mechanism as **FU-A10** (ADR-0006 §16.6 / ADR-0008), not a new separate script. **This item closes ADR-0008 condition 1 only when `devops-engineer` confirms the check runs in the actual deploy path — a check existing in the repo but not wired into deploy does not satisfy this item.** | Feature 008 / Mongo hygiene — does not gate Release Gate A or build #2 | `devops-engineer` | `devops-engineer`, `database-architect` | 1–2 days | FU-A10 mechanism |
| 2.9 | Confirm `location-events-collections.ts` isn't provisioning coordinate storage ahead of ADR-0009's SDL requirements — `database-architect` is investigating this in parallel already; this item tracks it to closure, does not duplicate it | Feature 008 / Mongo hygiene — does not gate Release Gate A or build #2 | `database-architect` | `database-architect`, `cybersecurity-architect` | 1 day | None — rides the in-flight investigation |

**Release Gate A can close as early as end of Sprint 2** if 1.1–1.5 and 2.1–2.2 are all green and 1.2 has landed. If 1.2 slips, Gate A slips with it — see Blockers to Watch.

---

## Sprint 3 — 2026-09-07 → 2026-09-13

Focus: Release Gate A close-out (if not already closed), build #2 ships once gated, compliance chain (b) close, SR-007-11 kickoff. Payment gateway scorecard deadline has moved to Sprint 4 (see below) — ADR-0010 no longer sequenced here.

| # | Item | Memo ref | Owner (A) | R | Effort | Depends on |
|---|---|---|---|---|---|---|
| 3.1 | **Release Gate A formally closed** — all five §2 conditions verified **plus criterion 6 (INC-001)**, signed off by `technical-project-manager` + `cto` | §2 | `technical-project-manager` | `cto` (final sign-off) | 0.5 day | 1.1–1.5, 2.1, 2.2, **and INC-001 criterion-6 sign-off from `cybersecurity-architect`** |
| 3.2 | **Build #2 ships to client** | §2 (gate), §1 | `devops-engineer` | `mobile-engineer` | 0.5 day | 3.1 — hard gate, no build ships before Gate A closes, **which now includes criterion 6; if INC-001 remediation is not signed off by Sprint 3, 3.1/3.2 slip with it regardless of 1.1–2.2 status** |
| 3.3 | Platform RoPA (C-006-4) completed | §3(b) | `compliance-specialist` | `compliance-specialist` | continues from 2.7 | 2.7 |
| 3.4 | SR-007-11 admin account suspend/deactivate endpoint — Stage 1–4 (business requirements → UI design where applicable; this is API-only so effectively Stage 1–2 then straight to Stage 5) | §3(c) | `business-analyst` (Stage 1), `product-manager` (Stage 2) | `business-analyst`, `product-manager` | 2 days | 3.3 not a hard dependency, but (c) is sequenced after (b) per memo priority order — do not let (c) engineering start before (b)'s compliance items are substantially closed |
| 3.5 | GPS hardware scorecard — evaluation continues | §5 | `integration-architect` | `integration-architect` | ongoing | 1.7 |
| 3.6 | Payment gateway vendor scorecard evaluation continues (decision/ADR-0010 draft now due Sprint 4 — see 4.1) | §5 | `integration-architect` | `integration-architect`, `compliance-specialist` (consult) | ongoing | 1.6, 2.4 |
| 3.7 | ADR-0009 §15 — `security-engineer` concurrence (security review sign-off, reserved section of ADR-0009) | §6 | `security-engineer` | `security-engineer` | 1–2 days | ADR-0009 (already conditionally ratified, §15 open) |
| 3.8 *(Sprint 3 close)* | Batch sweep of ~30 stale agent role-brief files (`.claude/agents/*.md`) still stating "ADR-0008 proposed, pending `cto` ratification" — single pass, low value/low risk, explicitly not worth interrupting critical-path work for | Housekeeping | `technical-writer` | `technical-writer` | 0.5 day | ADR-0008 ratification (1.4) |
| 3.9 | **SH-2 — CI-1's manifest scanner is structurally blind to React Router `<Route index>` elements** (no `path` attribute for the regex-based scanner to discover, so `verify-stage8-manifest.mjs` reports PASS even when an index-route surface's manifest entry is missing entirely). Confirmed reproduced a third time in Feature 012 (`docs/features/012-employee-dashboard/security-review.md` §12.3, cto-review.md CTO-4) — INC-001's root cause, same shape as SH-1a/SH-1b, now in a sub-case neither of those covers. Fix: extend `discoverWebRoutes()` to also match `<Route index element={<X />} />` siblings and attribute them the parent route's path prefix (the same technique already used for `discoverAppTsxRoutes()`'s App.tsx-direct-route fix this session). Small, ~1 day per CTO-4's estimate — do not let it silently roll to "later" the way SH-1a/b sat undated before this entry existed | INC-001 §6 (CI-1), SH-1a/b precedent | `devops-engineer` | `devops-engineer`; chair sign-off `cybersecurity-architect` | ~1 day | None — can start immediately |

**3.9 chair sign-off (2026-09-14, `cybersecurity-architect`):** code fix landed in `ff73018`
(`discoverWebRoutes()` now detects `\bindex\b` before the `path` `continue` and emits
`` `${mountPrefix} (index)` ``). **Design signed off** — see
[`012-employee-dashboard/security-review.md`](../features/012-employee-dashboard/security-review.md) §16.
Verified statically: the three `<Route index>` elements (`AdminRoutes.tsx:55`, `SecurityRoutes.tsx:30`,
`CallCentreRoutes.tsx:37`) now map to the existing `/admin (index)` / `/security (index)` /
`/call-centre (index)` manifest entries, and **no** web wildcard pattern would absorb those strings if an
entry were deleted, so a missing entry does fail the run. **Still owed by `devops-engineer` before 3.9 is
marked done:** the actual `node scripts/verify-stage8-manifest.mjs` PASS output plus a recorded
deliberate-FAIL (remove one manifest entry, re-run, restore) — the chair session could not execute
commands and will not attest to an exit code it did not observe. **New residual SH-2a** (nested
`<Route index>` would be mis-attributed to the mount root and silently absorbed) filed in §16, owner
`devops-engineer`, follow-on — not a blocker on closing 3.9.

**3.9 runtime evidence (2026-09-14, orchestrator):** the PASS/deliberate-FAIL output the chair flagged
as still owed has now been captured directly — see
[`012-employee-dashboard/security-review.md`](../features/012-employee-dashboard/security-review.md) §17.
**Item 3.9 is fully closed.**

**Note on §3 ordering:** the memo lists (b)–(e) as a priority chain, "the difference between internal build and real customers." This plan treats (b) as substantially closing by Sprint 3 before (c)'s engineering stages begin in earnest — Stage 1/2 requirements work for (c) can run in parallel (it doesn't touch customer PII directly), but Stage 5 (Architecture Review) and beyond for (c) should not start until (b)'s Supabase DPA, RoPA, and Resend operator review are closed, since SR-007-11 itself touches account data governed by those same compliance artifacts.

---

## Sprint 4 — 2026-09-14 → 2026-09-20

Focus: SR-007-11 through build, C-007-11 kickoff, payment gateway scorecard deadline (moved from Sprint 3 — the 2026-09-14 due date falls one day past the original Sprint 3 boundary).

| # | Item | Memo ref | Owner (A) | R | Effort | Depends on |
|---|---|---|---|---|---|---|
| 4.1 | ~~Payment gateway vendor scorecard **due — decision made**, ADR-0010 drafted~~ **VOID — the 2026-09-14 deadline passed with sub-reviews not started.** Corrected 2026-09-21: `cto` re-baselined sub-reviews (C1/C2/C3 split: `integration-architect`, `cybersecurity-architect`, `compliance-specialist`) to **2026-09-25**, decision + ADR-0010 to **2026-10-02**. **These dates are re-baselined but UNCONFIRMED as of 2026-09-21** — see T-24 disposition above; `integration-architect` owes confirmation, not this plan. | §5, §6 | `integration-architect` | `integration-architect`, `cybersecurity-architect` (C2), `compliance-specialist` (C3) | Sub-reviews due 2026-09-25 (unconfirmed), decision due 2026-10-02 | 1.6, 2.4, 3.6 |
| 4.2 | ADR-0010 (payment gateway) ratification | §5, §6 | `solution-architect` / `cto` | `integration-architect` (author) | 0.5 day | 4.1 |
| 4.3 | SR-007-11 admin suspend/deactivate — Stage 5 Architecture Review | §3(c) | `solution-architect` | `backend-architect`, `database-architect` | 1 day | 3.4, (b) substantially closed |
| 4.4 | SR-007-11 — Stage 6–7 (DB design + API contract) | §3(c) | `database-architect`, `backend-architect` | `backend-engineer` | 2 days | 4.3 |
| 4.5 | SR-007-11 — Stage 8 Security Review (hard gate) | §3(c) | `cybersecurity-architect` | `security-engineer`, `compliance-specialist` | 1–2 days | 4.4 |
| 4.6 | SR-007-11 — Stage 9 Development | §3(c) | `backend-architect` | `backend-engineer` | 2–3 days | 4.5 sign-off obtained — **cannot start dev before security sign-off, no exceptions** |
| 4.7 | C-007-11 account-closure/deletion path — Stage 1–2 kickoff | §3(d) | `business-analyst`, `product-manager` | `business-analyst`, consult `compliance-specialist` | 2 days | Can start in parallel; per memo order, sequenced right after (c), not blocking on (c)'s completion since it's a different requirements track |
| 4.8 | GPS hardware scorecard — evaluation continues | §5 | `integration-architect` | `integration-architect` | ongoing | 1.7 |
| 4.9 | ADR-0009 §16 — `compliance-specialist` concurrence (reserved section of ADR-0009), sequenced after Platform RoPA (3.3) lands — same artifact dependency | §6 | `compliance-specialist` | `compliance-specialist` | 1 day | 3.3 (Platform RoPA completed) |
| 4.10 | **RR-012-2 — Security Company Dashboard partner-org audit trail (schema work).** `recovery_cases` reads (list, detail, claim, status-update, and now the Feature 012 count endpoint) have no audit trail of any kind — `admin_access_log`'s `resourceType` validator only accepts `policy \| asset`, with no row shape for a partner-org operator's own case access. Re-flagged as NOT ACCEPTED at Feature 012's Stage 8 (`security-review.md` §11/§14) and again by `cto` (cto-review.md CTO-6) rather than left as an indefinitely-deferred waiver — this gets a dated slot instead. Stage 1: schema/migration design for a new audit row shape (or a `resourceType` extension) covering `recovery_cases` reads, scoped to `partner_organization_id`, with the purpose/case-reference field ADR-0006 §14.7 and §14.4.3 already require for this class of access | ADR-0006 §14.4.3/§14.7, RR-012-2 | `database-architect` | `database-architect`, consult `cybersecurity-architect` | 2–3 days (design only — implementation is a follow-on item once schema is agreed) | None — can start in parallel with other Sprint 4 items |

---

## Sprint 5 — 2026-09-21 → 2026-09-27

Focus: SR-007-11 ships, C-007-11 through architecture/security, FU-A14 wiring half kickoff.

| # | Item | Memo ref | Owner (A) | R | Effort | Depends on |
|---|---|---|---|---|---|---|
| 5.1 | SR-007-11 — Stage 10 QA Testing (hard gate) | §3(c) | `qa-architect` | `manual-qa-engineer`, `automation-qa-engineer` | 1–2 days | 4.6 |
| 5.2 | SR-007-11 — Stage 12–13 Documentation + Deployment | §3(c) | `technical-writer`, `devops-engineer` | `technical-writer`, `devops-engineer` | 1 day | 5.1 |
| 5.3 | **SR-007-11 shipped** | §3(c) | `technical-project-manager` | — | — | 5.2 |
| 5.4 | C-007-11 account-closure/deletion — Stage 5 Architecture Review + Stage 6 DB design | §3(d) | `solution-architect`, `database-architect` | `backend-architect`, `database-architect` | 2 days | 4.7 |
| 5.5 | C-007-11 — Stage 7 API contract + Stage 8 Security Review (hard gate — this item touches account deletion of PII, expect close compliance scrutiny) | §3(d) | `backend-architect` → `cybersecurity-architect` | `backend-engineer`, `security-engineer`, `compliance-specialist` | 2–3 days | 5.4 |
| 5.6 | FU-A14 wiring half (SD-FU-07) — Stage 1–2 requirements/scoping | §3(e) | `business-analyst`, `product-manager` | `business-analyst` | 2 days | Sequenced last in the (b)–(e) chain per memo; starts once (c) is shipping and (d) is architecturally underway, not blocked on either finishing |
| 5.7 | GPS hardware scorecard — evaluation continues | §5 | `integration-architect` | `integration-architect` | ongoing | 1.7 |

---

## Sprint 6 — 2026-09-28 → 2026-10-04

Focus: C-007-11 ships, GPS hardware scorecard deadline, FU-A14 wiring continues.

| # | Item | Memo ref | Owner (A) | R | Effort | Depends on |
|---|---|---|---|---|---|---|
| 6.1 | C-007-11 — Stage 9 Development | §3(d) | `backend-architect` | `backend-engineer` | 2–3 days | 5.5 security sign-off |
| 6.2 | C-007-11 — Stage 10 QA (hard gate), Stage 12–13 Docs/Deploy | §3(d) | `qa-architect` → `devops-engineer` | `manual-qa-engineer`, `technical-writer`, `devops-engineer` | 2 days | 6.1 |
| 6.3 | **C-007-11 shipped** | §3(d) | `technical-project-manager` | — | — | 6.2 |
| 6.4 | **GPS hardware vendor scorecard due — decision made** (self-device only scope per memo §3 GPS note; Feature 008 stays design-gated regardless) | §5 | `integration-architect` | `integration-architect` | Deadline this sprint | 1.7 and all interim evaluation sprints |
| 6.5 | FU-A14 wiring half (SD-FU-07) — Stage 5 Architecture Review onward | §3(e) | `solution-architect` | `backend-architect`, `integration-architect` | 2–3 days | 5.6 |
| 6.6 | Staging environment (MP-8) validation — confirm separate Mongo DB name + separate Supabase project are actually gating real-customer signup paths, not just provisioned | §4 | `cloud-infrastructure-architect` | `devops-engineer`, `qa-architect` | 1 day | 2.3 — this is the hard gate check before any real paying customer, per memo §4 |
| 6.7 *(added 2026-09-21)* | Account-deletion request flow (mobile + web) — resolve F-1 (Android package-name mismatch, owner sentence required, one-way door once uploaded to a Play track), fix F-2 (unused `Linking` import), then commit mobile/web/privacy-page/manifest changes together with a commit message naming the package decision; route F-3 (Stage 8 manifest coverage) to `cybersecurity-architect` and F-4 (deletion-fulfilment runbook: identity verification, SLA, retention exceptions, evidence trail) to `compliance-specialist` | New, not in memo — app-store policy requirement | `mobile-architect` (F-1), `mobile-engineer` (F-2) | `cybersecurity-architect` (F-3), `compliance-specialist` (F-4) | F-1: owner sentence, cheap; F-4: runbook, 1–2 days | Owner ruling on F-1 blocks the commit; do not commit `app.json` before it lands |

**Note:** GPS hardware selection at 6.4 does **not** trigger GPS build work — memo is explicit that Feature 008 stays design-gated and SDL-2 is binding "regardless of ratification status." A scorecard decision is a vendor selection, not a green light to build.

---

## Standing Decision Rule — GPS hardware vendor default

Recorded here as a policy note, not a scheduled task: for the GPS hardware vendor scorecard (items 1.7, 2.5, 3.5, 4.8, 5.7, 6.4), if Cartrack and Tracker do not commit to a documented third-party API on commercially reasonable B2B terms by the **2026-10-05** due date, the OEM route (Digital Matter / Teltonika) becomes the **default selection automatically**. `integration-architect` does not need further approval to conclude that outcome — it is a pre-authorized fallback, not a decision requiring a fresh sign-off cycle. This does not change the 6.4 deadline or the design-gated status of Feature 008.

---

## Sprint 7+ (2026-10-05 onward) — beyond this plan's mandated horizon

FU-A14 wiring half completion (Stage 6–13) rolls into Sprint 7 depending on Sprint 6 velocity. Real-customer onboarding readiness review (staging + (b)–(e) chain fully closed) is a `technical-project-manager` + `cto` joint checkpoint once 6.3, 6.4, and 6.6 all confirm green — this is the trigger the memo describes as unblocking real paying customers, not build #2 (which ships at Sprint 3 under Gate A alone). Detailed Sprint 7+ planning deferred to the next planning cycle per standard TPM cadence — not sequenced here to avoid committing capacity beyond current visibility.

---

## Blockers to Watch

The handful of items that, if late, cascade and delay everything downstream. Tracked daily by `technical-project-manager`, escalated to `cto` if red for more than 2 consecutive days.

1. **Resend email delivery confirmation (memo §2.2, item 1.2)** — owner-dependent, no engineering fix available. This is explicitly on the critical path for build #2: Gate A cannot close, manual QA (2.1) cannot meaningfully validate signup/verify, and release notes (2.2) cannot honestly describe "working auth" until this lands. **If this slips past Sprint 2, Gate A and build #2 slip with it, sprint-for-sprint.**
2. **Claims build-flag (memo §2.4, item 1.3)** — small effort but a hard Gate A condition; the memo calls this out by name alongside Resend confirmation as critical-path for build #2. Low technical risk but must not be deprioritized under Sprint 1 pressure from the signing-identity work.
3. **Deliberate signing identity + owner bundle-ID confirmation (item 1.1)** — blocks both 2.1 (device QA needs a real build to test) and 3.2 (build #2 itself). Owner confirmation of the bundle ID is the sub-dependency most likely to stall silently.
4. **Supabase DPA (§3(b), item 1.8)** — owner-dependent, gates the entire (b)–(e) compliance chain that the memo says is "the difference between internal build and real customers." A stall here doesn't block build #2, but it blocks every real-customer-readiness item in Sprints 3–7.
5. **Security Review (Stage 8) turnaround for SR-007-11 and C-007-11 (items 4.5, 5.5)** — both are hard gates with no bypass. `cybersecurity-architect`/`security-engineer` capacity across two PII/account-governance features in adjacent sprints is a resourcing risk the TPM should confirm against current team availability before Sprint 4 begins.
6. **Payment gateway scorecard deadline (item 4.1) — VOID as originally worded, corrected 2026-09-21.** The 2026-09-14 deadline passed with no sub-review artefact. Re-baselined by `cto` to sub-reviews **2026-09-25**, decision/ADR-0010 **2026-10-02** — but as of 2026-09-21 that date is **unconfirmed**; `integration-architect` owes a direct confirm/deny, not this plan (see T-24 disposition in "Status Corrections — 2026-09-21" above). If unconfirmed or missed again by 2026-09-25, `cto` has said this becomes an escalation to a capacity decision, not a third re-baseline. **GPS hardware scorecard deadline (item 6.4, Sprint 6, 2026-10-05)** is unaffected by this and stands, including its standing OEM-default fallback rule.
7. **INC-001 (new, 2026-08-25) — Release Gate A criterion 6 sign-off. Status corrected 2026-09-21.** Still unsigned, but the reason has changed: 14 of 15 strictly-required rows are now live-proven (Maestro harness, per T-26/Appendix 2 of the 09-14 register) — the remaining gap is that all 14 ran on Expo Go/iOS/local Metro against a different flag-injection mechanism than the `7f3694b9` preview build under test. Criterion 6 asks whether *this artefact* is gated, not whether the code gates work. Blocked on T-25b (Android execution path) before a fresh, verifiable preview build can be authorised. Track daily alongside item 1.2 as a build-#2 critical-path risk.
8. **ADR-0008 condition 1 — ruled, 2026-09-14 (T-20), not still open-ended.** `cto`: the deploy-path leg is satisfied (`backend/src/index.ts:78–94`, `verifyMongoCatalog()` runs unconditionally on every deploy — confirmed by code, not live logs). Condition 1 does not close on a log line nobody reads; it closes when `database-architect` + `devops-engineer` make the drift finding *observable* (item 2.8's design half). This is the current, correct framing — the version of this note previously here treating the deploy-path question as unresolved is **void**, superseded by the T-20 ruling.
9. **T-25 — "nobody has hands on live infrastructure" (added 2026-09-21 as a first-class blocker; previously scattered across items 1, 5, and 8 above).** One access/environment problem, two separately satisfiable legs: **T-25a** (credentials — Render read-only API key, Atlas console, Supabase dashboard; blocks T-11/CT-2, T-19 Mongo rename, T-20's log-confirmation leg) and **T-25b** (an admin-capable local environment — sudo on the dev host plus Android SDK/emulator or a physical device with `adb`; blocks criterion 6's entire EAS-artefact leg, currently the cheaper and higher-leverage of the two per the 09-14 register's Appendix 2 §3). Owner-gated on both legs; track as one line for reporting, dispatch as two asks.

## Explicit non-resequencing note

This plan does not alter any memo decision: payments and claims backend remain deferred past this milestone; staging blocks real-customer signups only, not build #2; GPS stays self-device-only and design-gated pending (b); no date is committed to a client at any point in this plan, consistent with memo §7. Sprint boundaries above are `technical-project-manager` sequencing calls made under the memo's stated constraints, not scope decisions.
