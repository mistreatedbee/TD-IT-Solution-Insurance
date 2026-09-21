# CTO — Where we stand, and what happens next. 2026-09-21

**Date:** 2026-09-21 · **From:** `cto` · **To:** platform owner (§1, §3), `technical-project-manager`
(§5), all roles named in §6
**Type:** **Status + dispatch.** No gate is opened or closed here, no vendor decision is made or
reversed, no date is committed to the Client. Stage 8 and Stage 10 remain hard gates.

**Previous entries (all stand; where this file disagrees, this file is later and says so explicitly):**
[`2026-09-14-task-assignment.md`](2026-09-14-task-assignment.md) + Appendices 1 and 2 ·
[`2026-09-14-pre-meeting-check.md`](2026-09-14-pre-meeting-check.md) ·
[`2026-09-14-payment-deadline-read.md`](2026-09-14-payment-deadline-read.md) ·
[`2026-09-10-sprint-3-checkin.md`](2026-09-10-sprint-3-checkin.md).

**Method and limits of this pass — read before quoting anything below.** Read-only. **This session
has no shell**, so: no `npm test`, no `git log`, no `eas build:view`, no Render/Atlas/Supabase
console. Every claim is either (a) *code-evidenced* — I opened the file and cite the path/line — or
(b) *reported* — it came from the session's git-status/commit summary and I could not verify it
myself. I have marked which is which and I have not asserted anything I could not open. **Test
counts and build states quoted in earlier entries are not re-verified here and must not be treated
as current.**

---

## 1. Headline

Three things are true at once, and confusing them is the main risk this week:

1. **The platform itself has not regressed.** The product surfaces described in root `CLAUDE.md`
   are still there. Nothing in this pass found a broken system.
2. **The register is still moving in the right direction on closures but the net open count is
   probably still rising** — Appendix 2 §4 raised this on 09-15 and no artefact has since shown
   opened-vs-closed. That gap is now six days old and it is `technical-project-manager`'s.
3. **There is uncommitted work in the tree right now that contains one P0 defect** (§2, F-1). It is
   small, it is cheap to fix, and it would be expensive to discover after a Play Console upload.

**Release Gate A is not closed and will not close this week without the owner actions at §3.** That
is unchanged from 09-14 and I am not going to soften it.

---

## 2. The uncommitted work in the tree — account deletion (mobile + web)

**Reported working-tree state** (from the session's git status, not re-derived by me):

| File | State |
|---|---|
| `mobile/app/(auth)/delete-account-confirm.tsx` | **untracked (new)** |
| `mobile/app/(auth)/delete-account.tsx` | modified |
| `mobile/app.json` | modified |
| `src/pages/PrivacyPolicyPage.tsx` | modified |
| `docs/organization/gates/stage8-manifest.json` | modified |

**What it is (code-evidenced).** An app-store-style "delete my account and data" path on both
surfaces. The web leg appears already committed: `src/pages/DeleteAccountPage.tsx` exists, is routed
at `src/App.tsx:70`, and is linked from `src/pages/LandingPage.tsx:387`. The mobile leg is reached
from the Account hub (`mobile/src/screens/account/AccountHubScreen.tsx:420-425`) and now has a
second step, `delete-account-confirm.tsx`, which raises a native `Alert` and then opens a prefilled
`mailto:` to `COMPANY_CONTACT.email`.

**This is a manual, email-based request flow, not an automated deletion, and it should stay that way
for now.** I verified there is **no account-deletion backend endpoint**: the only `router.delete` in
`backend/src/routes/customer-profile.ts` is line 268, `/account/profile/picture`. The copy on both
surfaces says "request" and hedges with "where legally required and operationally feasible", which is
honest. I ratify the approach. It is the right shape for an app-store policy requirement when the
erasure machinery does not exist yet.

### Findings

**F-1 — P0, blocking the commit. The Android package name has been changed and no longer matches
anything else in the repo.**

`mobile/app.json:24` now reads `"package": "co.za.tditsolution.insurance"` — **singular
`tditsolution`** — while `mobile/app.json:13` still reads `"bundleIdentifier":
"co.za.tditsolutions.insurance"` (**plural**). Everything else in the repo says plural:
`src/lib/mobileAppLinks.ts:10-11` (both iOS and Android, used for store/deep links),
`mobile/docs/DEPLOY.md:81,93`, `docs/organization/roadmap-release-gate-a.md:31`,
`docs/organization/sprint-plan-release-gate-a.md:61`, `mobile/README.md:201`, and Gate A criterion 1
itself (T-01).

This also **directly contradicts my own 09-14 pre-meeting note §2**, which recorded `app.json:13,24`
as carrying the plural form on both platforms. That note was correct when written; the tree has
changed since. My 09-14 statement is superseded on this point.

Two possibilities and they have very different consequences:

- **Typo** → fix the one character, done.
- **Deliberate** (e.g. the owner registered the singular package in Play Console) → then
  `mobileAppLinks.ts`, `DEPLOY.md`, the roadmap, the sprint plan and T-01's wording must all change
  in the same commit, and we must be explicit that any previously-built artefact under the plural
  package is **a different application to Google Play**, not an earlier version of this one.

**An Android `applicationId` is immutable once an artefact is uploaded to a Play track.** This is a
one-way door and it is sitting uncommitted in a working tree. It gets an owner sentence before it
lands. `mobile-engineer` must not "tidy" it either way without that sentence.

**F-2 — P3, trivial.** `mobile/app/(auth)/delete-account.tsx:6` imports `Linking`, which is unused
in that file (the `mailto:` moved to the confirm screen). Depending on lint/tsconfig settings this
may or may not fail CI; either way it should not land. `mobile-engineer`.

**F-3 — Stage 8 coverage is nominal, not substantive. `cybersecurity-architect`'s call, not mine.**
The manifest edit extends the **web** waiver: entry `web-legal-static`, `stage8-manifest.json:810-820`,
`"pattern": "/{terms,privacy,delete-account}"`, `"waived": true`, owner `compliance-specialist`. For
a static legal page I accept that reasoning as written. **But the mobile screens are not covered by
that entry at all** — they fall inside `mobile-auth` (`stage8-manifest.json:247-256`,
`"pattern": "(auth)*"`), whose Stage 8 verdict points at Feature 001's authentication security
review. So the CI scanner will pass, and a **data-erasure request flow will have inherited an
authentication review that never considered it.** That is the same shape of blind spot as SH-2, and
the scanner passing is exactly why it would go unnoticed.

I am not asserting the flow is unsafe — it makes no server call and stores nothing. I am asserting
the **evidence trail is wrong**, and after INC-001 that is the thing we said we would stop doing.
Minimum acceptable close: an explicit manifest entry for the mobile deletion screens with a named,
reasoned disposition (waiver or review), signed by the chair. Not a silent inheritance.

**F-4 — the obligation this creates, and nobody owns it yet.** Shipping a deletion request button
creates a real duty to fulfil requests. Today there is: no erasure endpoint, no documented fulfilment
runbook, no SLA, no identity-verification step for the requester (anyone can email from any address
claiming to be a customer), no retention-exception schedule behind the "some information may be kept"
sentence, and — because the request lands in the shared `info@` inbox — no evidence trail that a
request was received or actioned. **The screen is the easy half.** `compliance-specialist` owns
closing this, and it should reference the CT-3 breach-notification runbook as the format precedent.

**F-5 — minor.** `/(auth)/delete-account` is deep-link reachable (scheme `tditinsurance`,
`mobile/app.json:9`) without authentication. Consequence today is nil — the screen only composes an
email — but note it so nobody later adds a real API call there assuming the route is authenticated.

**Disposition:** do not commit as-is. Resolve F-1 (owner sentence) and F-2 (one line), commit the
mobile/web/privacy changes and the manifest change **together with a commit message that names the
package-name decision**, then route F-3 to `cybersecurity-architect` and F-4 to
`compliance-specialist`. Per the house rule, the manifest is a shared artefact: the change there is
an appended entry/reason, and nothing already in that file gets rewritten.

---

## 3. Owner-gated — unchanged, and the list has not moved in a week

Nothing below is new. That is the point.

1. **Bundle/package ID** (T-01) — now **two** questions, not one: confirm the iOS bundle identifier
   *and* rule on F-1's Android package. One reply covers both.
2. **CT-4a first, then the Supabase Send Email Hook** (T-02) — ordering per Appendix 1 correction 1.
   Do not enable the hook until CT-4a closes. Real signup verification email still does not work.
3. **T-25b — an admin-capable local environment** (sudo on the dev host, plus Android SDK/emulator or
   a physical device with `adb`). Appendix 2 §3 named this the cheapest, highest-leverage unblock on
   the board and it still is. It is the critical path for criterion 6's artefact leg.
4. **T-25a — credentials**: Render read-only API key, Atlas console, Supabase dashboard. Parks T-11,
   T-19, T-20's log leg.
5. **T-03 device QA pass** — a human with a phone.

---

## 4. Reconciling the 09-14 register — what is stale

Read `2026-09-14-task-assignment.md` **with its two appendices**; the base table alone is now
misleading in places. Against the reported commit log and my reads today:

**Recorded closed (in Appendices 1/2, not in the base table):** T-05, T-06, T-07, T-08, T-12/CT-3,
T-13/CT-4, T-14/CT-5, T-15/CT-8, T-17/CT-11, T-22/SH-2. **Do not re-dispatch these.** T-26 is
*delivered but does not close T-04.*

**Now stale in the base table and corrected here:**

- **T-01's next action** is no longer "one owner sentence" about a string already in the repo — F-1
  changed the string. Re-read T-01 through §2 above.
- **My 09-14 pre-meeting §2 bullet on bundle IDs is superseded** (see F-1).
- **T-04's "do not trigger another build"** was already amended by Appendix 2 §2: one new preview
  build is authorised **once an Android execution path exists**, and not before. Still not before.
  Appendix 2's `7f3694b9`-vs-`testID` commit-ordering check was assigned first-thing-next-session on
  09-15 and I have **no evidence it was done** — it needs a `git log`, which I cannot run.
- **The compliance/governance run reported in the commit log** (INC-001 POPIA assessment, CT-series,
  ADR-0003 cross-border appendix, T-07/T-22/T-26) is consistent with those closures. Reported, not
  verified by me.
- **T-24 (payments):** sub-reviews were re-baselined to **2026-09-25 — four days away** — with
  decision + ADR-0010 on **2026-10-02**. I have seen no sub-review artefact. If nothing lands by
  09-25 this is the *second* missed baseline on the same item, and I will stop re-baselining it and
  escalate it as a capacity decision instead. `integration-architect`: tell me now if that date is
  not real.
- **Feature 013 (SA ID verification)** and **Feature 014 (household sharing)** both have Stage 1
  `business-requirements.md` on disk and neither has moved past it.
  `docs/features/014-household-member-sharing/business-requirements.md` §0.3 is **blocked on an
  owner clarification** and Stage 2 cannot meaningfully start until that is answered. Feature 014 is
  an account-model change comparable in weight to Feature 001 — it does not get compressed because
  it was asked for casually.

**Still open and unchanged:** T-02, T-03, T-04, T-09, T-10, T-11, T-16, T-18, T-19, T-20, T-21,
T-23, T-25, T-27, T-28, T-29, T-30, T-31, T-32.

---

## 5. `technical-project-manager` — the re-baseline is now nine days late

§5 of the 09-14 assignment listed nine specific corrections. I asked on 09-10, again on 09-14, and
Appendix 2 §4 added a tenth: **report opened-vs-closed, not closed alone.** Add an eleventh: the
account-deletion work of §2 is not in any sprint artefact and neither are Features 013/014.

I am not asking for a rewritten plan. I am asking for those eleven targeted corrections. If the
reason it has not happened is capacity rather than priority, say that in one line and I will
re-sequence it — but silence on a twice-requested artefact is the failure mode INC-001's root-cause
note is about.

---

## 6. Per-role next actions

Each row is the thing I expect that role to do next. Roles not listed have nothing new from me and
should continue their standing 09-14 assignment.

| Role | Next action | Ref |
|---|---|---|
| `mobile-engineer` | **Do not commit `app.json` until the owner rules on F-1.** Then: fix F-2's unused `Linking` import; confirm the `7f3694b9`-vs-`testID` commit ordering by `git log` (Appendix 2 §2) and report the answer — it determines the criterion-6 plan. | §2, T-04 |
| `mobile-architect` | Own F-1's consequences. If the package name changes, produce the one commit that updates `src/lib/mobileAppLinks.ts:10-11`, `mobile/docs/DEPLOY.md:81,93`, `mobile/README.md:201` and flags the roadmap/sprint-plan strings — and state plainly in `DEPLOY.md` that artefacts under the old package are a different Play application. | F-1 |
| `cybersecurity-architect` | Rule on **F-3**: explicit `stage8-manifest.json` entry for the mobile deletion screens with a reasoned disposition, rather than silent inheritance from `mobile-auth`/Feature 001. Also still holding T-28 (INC-001 procedural limbs) and T-09 with `authentication-engineer`. | F-3, T-09, T-28 |
| `compliance-specialist` | Own **F-4** — the deletion-request fulfilment runbook: requester identity verification, SLA, retention exceptions behind the "some information may be kept" sentence, and an evidence trail out of a shared inbox. Use the CT-3 runbook as the format precedent. Then T-16 (CT-10 draft, still absent), T-18, T-30, and confirm/close CT-14. | F-4, T-16, T-18, T-30 |
| `technical-project-manager` | The eleven corrections at §5, including opened-vs-closed counts. Nine days late. | §5 |
| `integration-architect` | **T-24 sub-reviews are due 2026-09-25.** Confirm the date is real or tell me today that it is not. Sequence **CT-4c** (sub-operator authorisation) *upstream* of the 2026-10-02 ADR-0010 date. Plus T-31 (OI-R-3/OI-R-4 — cheap, web-search away). | T-24, T-31 |
| `backend-engineer` | Land the CT-11 breaking-change note (Appendix 2 §4 — `PATCH /v1/customer/profile` now rejects a 13-digit `idNumber`; any already-installed client silently fails profile save). Then the 5–10 extra SA ID checksum vectors. Do **not** start an erasure endpoint — F-4's process design comes first. | Appendix 2 §4 |
| `security-engineer` | T-04's execution legs remain owner/environment-gated; T-23 §15 concurrence on ADR-0009 has no dependency and has been open since Sprint 3. Close it. | T-04, T-23 |
| `automation-qa-engineer` | The Maestro harness is delivered and is not the blocker. Next useful increment is a flow covering the account-deletion path **once F-1/F-3 settle** — not before, so the flow is not written against a route that may move. | T-26 |
| `manual-qa-engineer` / `qa-architect` | T-03 stays owner-gated. Your documented 2026-09-10 negative stands and should be cited in the sprint plan, not worked around. | T-03 |
| `database-architect` + `devops-engineer` | T-20's design half under the 09-14 ruling: make `verifyMongoCatalog()`'s drift finding observable. T-19 stays blocked on T-25a/b. Standing instruction holds — **do not land the `render.yaml` `MONGODB_DB_NAME` line ahead of the migration.** | T-19, T-20 |
| `cloud-infrastructure-architect` | T-27 (confirm the staging Supabase project and `td_it_insurance_staging` are real and touch no customer path — do not mark 2.3 green on a blueprint file). T-11 stays BLOCKED-ACCESS under T-25a. | T-11, T-27 |
| `solution-architect` | T-21 (ADR register one-liner). Plus the Appendix 2 §1 forward constraint: any Feature 013 design needing full 13-digit server-side ID validation re-opens CT-1/s72 and does **not** inherit CT-11's closure — record that as a design precondition. | T-21 |
| `business-analyst` | Feature 014 Stage 1 is filed and correctly blocked on §0.3's owner clarification. Do not extend the requirements doc speculatively; the next move is `product-manager`'s. | Feature 014 |
| `product-manager` | Get §0.3's owner clarification for Feature 014, and take T-10 (release-notes review — the draft must now say email delivery is not live). | T-10, Feature 014 |
| `technical-writer` | T-32 (38 stale `ADR-0008` strings across 35 agent briefs). Plus the still-unconfirmed Appendix 1 item: write "a completion report is not evidence — the artefact is verified by a second reader" into the lifecycle definition-of-done and `07-documentation-standards.md`, and start the near-miss log. That was assigned on 09-14 and never confirmed done. | T-32, Appendix 1 |
| `notification-engineer` | Nothing new. T-07 closed. | — |

---

## 7. What I am deliberately not doing

- **Not re-dispatching closed items.** Ten-plus closures landed on 09-14/09-15; re-asking for them
  wastes the roles' time and corrodes trust in this register.
- **Not inventing a new priority stack.** §6 is the 09-14 register plus five new findings, nothing
  else.
- **Not quoting a test count or a build state.** No shell this session. Anyone needing those runs
  them.
- **Not letting the deletion flow grow.** The mailto pattern is correct for now. Nobody wires a real
  erasure endpoint until F-4's process exists and Stage 8 has seen it.

---

**Standing constraints unchanged:** Stage 8 and Stage 10 remain hard gates. No build ships before
Gate A closes, criterion 6 included. Payment gateway and GPS hardware vendor remain **open
decisions**. Hosting is settled (ADR-0003). No date is committed to the Client anywhere in this
document.

*Filed by `cto`, 2026-09-21.*

---

## 8. Addendum — KYC vs. the Play Console internal test release (2026-09-21, later same day)

Appended, not a rewrite. Nothing above is retracted.

**Question raised by the owner mid-flow while filling the Play Data Safety form:** the business needs
KYC/FICA-style identity data (name, address, phone, government ID) to operate as an insurance
platform. Should `EXPO_PUBLIC_FEATURE_KYC` be turned on for this build?

**Ruling: no. This internal test release ships scoped as-is (email + password + user IDs).** Reasons,
all code-evidenced:

1. **The flag is off because of INC-001, not because of scoping convenience.**
   `mobile/src/config/features.ts:31-35` records the reason in the source: the KYC profile-edit and
   verification surfaces "collect SA ID number, address, and emergency contact — **no Stage 8
   record**." Turning the flag on is therefore re-opening an incident finding, not a release toggle.
   Stage 8 is a hard gate (§7 above).
2. **What is built would not satisfy FICA anyway.** `backend/src/routes/customer-profile.ts:115-119`
   stores **only the last 4 digits** of the ID number (CT-11) — the full number is rejected at the
   Zod boundary and never reaches the handler. There is no identity-document capture, and no
   object-storage vendor exists to hold one (MP-5). `VerificationCentreScreen.tsx` submits to a
   manual `pending_review` queue. That is a self-attestation flow, not identity verification.
3. **Nothing downstream of KYC is live.** No payments/billing backend and no claims backend exist,
   so no money moves and no claim is adjudicated in this build. The regulatory exposure from *not*
   collecting KYC during an internal test with no real policies and no real premiums is near zero;
   the exposure from collecting identity documents through an unreviewed pipeline is not.
4. **Bundling it changes the Data Safety declaration.** The form being filled now would have to
   declare government-ID collection, which triggers Play's sensitive-data review path and invites a
   rejection on a first submission.

**Sequence before KYC goes live to real customers** (ordering matters; each row gates the next):

| # | Role | Deliverable |
|---|---|---|
| 1 | `product-manager` | Decide whether Feature 013 Tier 1 is the vehicle or whether a distinct "KYC / FICA onboarding" feature folder is opened. Today only Feature 013 Stage 1 exists (`docs/features/013-sa-id-verification/business-requirements.md`), and its §2.3 puts **true KYC explicitly out of scope, vendor decision required**. So there is currently **no feature folder that owns this ask**. |
| 2 | `compliance-specialist` | The determinative input: which FICA/FSCA obligations actually attach to this business model, what identity data is *required* vs. merely desirable, retention schedule, and the POPIA §26/§27 position on ID numbers. Also answer Feature 013 §2.1/§2.2's open duplicate-detection ruling. Nothing below starts before this lands. |
| 3 | `business-analyst` | Stage 1 requirements for the real flow — document capture, accept/reject/appeal states, admin review queue, and what happens to an unverified customer who already has a policy. |
| 4 | `solution-architect` | Per §6 above (Appendix 2 §1): full 13-digit server-side ID validation **re-opens CT-1/s72 and does not inherit CT-11's closure**. That precondition is already recorded and applies here directly. |
| 5 | `integration-architect` | Build-vs-buy on ID verification (DHA/third-party bureau) — a **new open vendor decision**, kept behind T-24 (payments, due 09-25) so we are not running two vendor evaluations at once against current capacity. |
| 6 | `cybersecurity-architect` | Stage 8 review of identity-document handling: encryption at rest, admin-reviewer access control and audit trail, and MP-5's object-storage gap. This is the highest-sensitivity data the platform would hold. |

**Flag for the owner, unrelated to KYC but same release:** the package name reported in this session's
Play Console flow is `co.za.tditsolutions.insurance.internal` — plural, plus an `.internal` suffix.
That matches **neither** side of F-1 (`app.json:24` singular, `app.json:13` plural). F-1 now needs one
owner sentence covering **three** strings, and the Android `applicationId` is a one-way door once
uploaded.

*Appended by `cto`, 2026-09-21.*
