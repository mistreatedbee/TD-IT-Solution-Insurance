# Feature 012 — Employee Dashboard (Shared Staff Home) — CTO Independent Review

**Reviewer:** `cto` · **Date:** 2026-09-10 · **Type:** post-Stage-10 independent assessment, not a
lifecycle gate. Stages 1–10 are closed on their own terms; this document does not reopen them. It
records my own read of whether the process was real, whether the code is good, and what I would
still gate an actual *release* on (as distinct from a lifecycle stage).

**Read for this review:** `business-requirements.md` (all 10 sections) · `security-review.md` (all 14
sections, 1,191 lines) · `qa-report.md` (both QA sections incl. §8's recovery note) ·
`src/dashboard/components/HomeScreen.tsx` · `src/dashboard/hooks/useHomeCount.ts` ·
`src/dashboard/content/homeAnnouncements.ts` · `AdminHomePage.tsx` / `SecurityHomePage.tsx` /
`CallCentreHomePage.tsx` · `backend/src/routes/security-cases.ts`, `admin-verification.ts`,
`support-cases.ts` (count handlers + siblings) · `backend/src/repositories/recovery-cases.ts`,
`customer-profiles.ts`, `support-cases.ts` · `backend/src/db/customer-profile-collections.ts`,
`recovery-collections.ts`, `support-case-collections.ts` · `.eslintrc.cjs` ·
`docs/organization/gates/stage8-manifest.json` · commit sequence from the repo's reflog
(`7422b5d` → `e3b8a3b`).

**Verdict in one line:** the process was real, the code is good, the feature is production-ready —
and three things the chain reported as closed or covered are not, one of which (Stage 6 / index
verification) nobody performed at all and I found by checking myself.

---

## 1. Process assessment — real review, with two real soft spots

### 1.1 It was not review-theater. The evidence is specific.

Theater has a signature: each stage restates the prior stage's conclusion in its own vocabulary and
adds a sign-off line. That is not what happened here. Four findings were produced by reading
documents *against each other and against running code*, all **before any Feature 012 code existed**
(Stage 9 commits `012658d`/`860a4ae` post-date the Stage 8 chair review `85b78c8` by two days):

- **SR-012-2 (route shadowing).** `GET /v1/security/cases/count` and `/support-cases/count` would
  have been swallowed by the earlier-registered `:caseId` routes and returned `400`, surfacing as a
  Home badge stuck permanently on the AC-9 "—" placeholder — *a broken control that looks like a
  working degraded state*. This is a mechanical Express fact that a design review reading each
  document in isolation cannot produce. `security-engineer` re-grepped registration order rather
  than trusting the chair's line numbers, and additionally checked the two-segment `:caseId/notes`
  and `:caseId/status` routes for the same class of collision. Both the fix and its scope are
  verifiable in the shipped code (`security-cases.ts:78` above `:117`; `support-cases.ts:260` above
  `:314`), each with a load-bearing regression test.
- **SR-012-1 (unaudited subject-keyed oracle).** The chair found `api-design.md` §5's proposed
  optional `accountId` filter contradicting `compliance-specialist`'s own §9.5 durable rule written
  two sections later in the same file. That is the chair catching a Consulted role's document
  contradicting itself — the opposite of deference.
- **SR-012-5 / SH-2 (CI-1 blind to `<Route index>`).** The gate discovered that the platform's own
  manifest scanner structurally cannot see the kind of route this entire feature mounts on, and
  correctly refused to let that be silent. This is a platform defect surfaced by a feature review.
- **SR-012-6 (AC-5 unsatisfiable).** The acceptance criterion and the implementation had come to
  mean different things across five stages, with a plausible "fix" that would have reintroduced the
  exact bug (F-012-2) the chain existed to resolve.

Two further pieces of evidence weigh heavily with me because they are the hardest thing to fake:

- **Roles corrected themselves and each other.** `compliance-specialist` §13.2 reversed its own §9.7
  on a verified factual error (it had reasoned about Trail B, `admin_access_log`, while the required
  row lives in Trail A, `app.account_audit_log`) and explicitly flagged that `security-engineer`
  §12.6 had faithfully inherited the wrong premise. The chair then **amended §10.6 in place rather
  than defending it** (§14.1), re-verifying all four load-bearing claims in code before accepting.
  That is a chain that changes its answer when the evidence changes.
- **A control was added late that made the feature strictly better and cost the chair a position:**
  C-012-1 (the security count must emit an actor-keyed audit row). The reasoning — a partner
  organisation is an external legal entity and is the *last* principal whose reads should be
  traceless — is correct, and it is now in the shipped handler (`security-cases.ts:101-108`).

**Conclusion: this was substantive review.** For a ~180-line component and three ~30-line handlers,
the gates earned their keep by catching one certain production bug, one unaudited oracle, one
untestable acceptance criterion and one CI blind spot.

### 1.2 Where it was weaker than it reads

**(a) Stage 6 was effectively skipped, and the one delegated check was never performed.**
`api-design.md` §269 and `security-review.md` §8 both deferred index sizing to "a one-line `EXPLAIN`
confirmation at Stage 9 with `database-architect`." There is no `database-architect` artifact in this
feature folder and no commit by that role in the sequence. Nobody closed it. I checked it myself and
it has a finding — see §2.4. This is the one place where the chain's habit of *naming* a deferred
check substituted for performing it.

**(b) A "structural" guarantee was verified more narrowly than it was stated — by three roles in a
row.** SR-012-4 requires that the shared Home module "may not import any role's API client,
**directly or transitively**," enforced as a build error. What actually shipped
(`.eslintrc.cjs:32-49`) is `no-restricted-imports` scoped to the single file path
`src/dashboard/components/HomeScreen.tsx`. That rule:
- catches only **direct** imports in that one file — ESLint cannot see transitive import graphs, so
  the "or transitively" half of the condition is not enforced by anything;
- does not cover the feature's other two shared modules, `src/dashboard/hooks/useHomeCount.ts` and
  `src/dashboard/content/homeAnnouncements.ts`, either of which could acquire a role API client
  tomorrow with CI green;
- is bound to an exact file path, so a rename or a split of `HomeScreen.tsx` silently disables it.

`frontend-engineer` built it, `security-engineer`'s precedent (SR-011-1c) was cited for it, and
`automation-qa-engineer` re-ran an adversarial plant — but the plant tested the direct case only, so
it confirmed the mechanism works, not that the mechanism covers the claim. The *design* (pure props
injection, zero role branching in `HomeScreen.tsx`) is genuinely strong and is what actually delivers
AC-6 today; the lint fence is a thinner backstop than three documents assert. This is the one place I
would honestly call the chain agreeing with itself.

**(c) The prose-to-substance ratio is not sustainable as a standard.** 1,191 lines of security review
plus 528 lines of QA for a feature whose entire net-new surface is ~350 lines of code. It was worth it
*this* time — the findings justify it — but I do not want this cited as the bar for every small
feature. The bar is "did the gate find things," not "did the gate produce a long document."

**(d) The file-clobbering incident** — see §4. That is a real process defect, not a documentation
blemish.

---

## 2. Outstanding risk — what still worries me

### 2.1 F-QA-012-2 is **not** closed (contradicts "all findings closed")

`HomeScreen.tsx:21-23` still states that `HomeScreen.eslint.test.ts` (co-located) asserts the
no-cross-role-import property. **That file does not exist** — `src/dashboard/` contains only
`roleRouting.test.ts`, `DashboardAuthProvider.test.tsx`, `HomeScreen.test.tsx` and
`HomeScreen.crossRole.test.tsx`. The control exists under a different mechanism (the `.eslintrc.cjs`
override), so nothing is unprotected, but a source comment that names a nonexistent test as the
guarantee is precisely the kind of thing a future maintainer trusts and a future auditor cites.
F-QA-012-1 (manifest entries) *was* genuinely closed in `e3b8a3b` — I verified the three `web_route`
entries. F-QA-012-2 was not. **Severity: low. Cost to fix: one comment. Fix it.**

### 2.2 The accessibility finding is open, and I do not accept "check it later" as its disposition

`CountBadge`'s error branch renders a `<button>` nested inside the `<Link>`/`<a>` that wraps the
whole card (`HomeScreen.tsx:79-93` inside `:131-144`). `manual-qa-engineer` is right on the facts:
invalid per the HTML5 content model, works for pointer users via `preventDefault`/`stopPropagation`,
and is a known screen-reader footgun where the failure mode is that an assistive-technology user in
the error state has **no way to retry at all, silently**.

The recommended disposition was "verify with a real screen reader before/shortly after release." We
have **no staging environment** (per repo `CLAUDE.md`) and no visual/AT tooling in this repo, so
"verify later" has no owner, no date and no mechanism — it means "ship it and hope." The restructure
is roughly ten lines (move `Retry` outside the `<Link>`, or make the card title the link and the card
body non-interactive — both patterns already used elsewhere in these dashboards). **I would rather
spend the ten lines than carry an unverifiable accessibility claim.** Recorded as CTO-1.

### 2.3 SH-2: CI-1 currently reports PASS while structurally blind to a whole class of route

This worries me more than anything else in the feature, because it is not about Feature 012. INC-001's
root cause was surfaces reaching production with no record of review. SH-1a and SH-1b were fixed.
SH-2 is the same root cause in a third sub-case: `discoverWebRoutes()` skips any `<Route>` with no
`path` attribute, and React Router *forbids* an `index` route from carrying one. So a gate that exists
to answer "has every privileged surface been reviewed" returns **PASS** on a question it cannot see.
Feature 012 is covered by hand (the three `web_route` entries are in the manifest). The next feature
that mounts on an index route is not.

`security-engineer` §12.3 established the fix is roughly five lines. Yet SH-2 exists today only inside
this feature folder and a manifest `note` — there is no ticket, no backlog entry, no owner with a
date outside prose. A five-line fix to a known gate-integrity defect should not be waiting on a
narrative reference in a feature document. Recorded as CTO-4.

### 2.4 New finding (mine): the admin count is an unindexed collection scan, and nobody checked

`countByVerificationStatus('pending_review')` runs
`customer_profiles.countDocuments({ verificationStatus: 'pending_review' })`
(`customer-profiles.ts:273-275`). `customerProfilesIndexes`
(`backend/src/db/customer-profile-collections.ts:58-64`) contains **exactly one index**:
`{ accountId: 1 }`, unique. There is no index on `verificationStatus`. That query is a COLLSCAN, and
unlike the sibling list route (which scans the same way but is opened deliberately), it now fires on
**every admin Home landing and every refresh**, at up to 60/min per admin account.

The other two counts are fine and I checked them: `recovery_cases` has
`{ partnerOrganizationId: 1, status: 1, createdAt: -1 }` (`recovery-collections.ts:102`) and
`support_cases` has `{ createdByAgentAccountId: 1, status: 1, createdAt: -1 }`
(`support-case-collections.ts:111`). Both count paths are covered.

`customer_profiles` is the collection that grows with **every customer** — it is the one of the three
that will be large in the success case, and the only one where the count is unbounded by role scope.
At today's volumes this is genuinely nothing. It is also exactly what the deferred `EXPLAIN` check
would have caught for the cost of one command, and it went unperformed. Not a security or compliance
issue; a scaling item that should be closed cheaply now rather than diagnosed later as "the admin
dashboard got slow." Recorded as CTO-3.

### 2.5 RR-012-2 (partner-org audit gap) — I agree it does not block, and I am not letting it drift

Both `security-engineer` §12.6 and `compliance-specialist` §13.2 are right that Feature 012 does not
create or meaningfully widen this gap (`GET /security/cases` returns a strictly richer signal, at the
same tier, equally unlogged), and that building a partner audit trail backwards from a count endpoint
would produce a worse trail. `compliance-specialist`'s "holding a four-hour Home-screen feature
hostage to a multi-feature audit trail would be enforcement theatre" is the correct call and I ratify
it.

What I will not ratify is indefinite re-flagging. This gap has now been raised across multiple
features and remains owned by ADR-0006 C-15/C-16(b) with no scheduled work. POPIA s23 — "who has
accessed my information" — is unanswerable today for **every** partner read of `recovery_cases`, and
partners are third parties. C-012-1 closes the actor-keyed half for one endpoint of four and must not
be cited as narrowing the class; both compliance and the chair said so explicitly, correctly, and I
restate it here. Recorded as CTO-6: this needs a dated owner and a sprint slot, not a fourth
re-flagging.

### 2.6 Two smaller residuals I am naming rather than filing

- **The partner "N open" badge is a cross-tenant number displayed as a bare integer.**
  `SecurityHomePage` calls `countSecurityCases({ status: 'open' })`, and `status=open` is precisely
  the one filter value where `buildPartnerOrgQuery`'s `$or` includes the **platform-wide unassigned
  open pool**, not just this partner's cases. Compliance ruled — correctly — that a bare aggregate
  over that pool is not a POPIA disclosure. My concern is meaning, not law: an operator reading "6
  open" on their own Home screen will reasonably assume "my org has 6," and the only place the truth
  appears is the card's description line ("Assigned and unassigned recovery cases"). Watch the copy
  when partner volume is real. Not a defect today.
- **AC-8 has never been visually verified by anything.** Both QA passes say so plainly, which I
  credit. With no staging environment, the first real rendering of three staff Home screens happens
  in production. Structural risk is genuinely low (shared `DashboardShell` untouched; mobile-first
  Tailwind patterns identical to already-shipped pages) — but "low risk, never observed" should be
  said out loud in the release note rather than absorbed into a PASS.

---

## 3. Is the code actually good?

**Yes. This is code I am comfortable owning long-term.** It does not read like it was assembled by
several agents across many stages, which was my main worry going in.

**What is genuinely good:**

- **`HomeScreen.tsx` is purely presentational and contains zero role branching** — not even the two
  branches SR-012-4 explicitly permitted. The FR-1 label and the FR-3 role filter are both resolved
  by the caller. The component takes `roleLabel`, `email`, `announcements`, `cards` and layout
  classNames, and knows nothing else. That is a stronger reading of C-012-A1 than the condition
  required, and it is the reason AC-6 is a property of the import graph rather than a test.
- **The three wrapper pages are near-identical in shape and about 45 lines each.** Each owns exactly
  one fetch and one card config. A reader who understands one understands all three. Duplication of
  *configuration* across three files is the right trade here — it keeps the three surfaces
  independently evolvable, which is the whole reason Option B was cheap.
- **`useHomeCount` is honest and minimal:** one fetch on mount, an explicit `attempt` counter for
  user-initiated retry, a `cancelled` guard against setState-after-unmount, and an
  `eslint-disable-next-line` that *states the reason* (SR-012-3.3's no-auto-refetch rule) instead of
  silencing a warning anonymously. Taking the `fetcher` as a parameter is what keeps this shared hook
  role-blind.
- **The three count handlers are thin, boring and mirror their siblings verbatim** — same auth chain
  in the same order, own rate-limit key each, `countDocuments()` with no `limit`/cursor/`buildPage`
  anywhere in a count path, explicit `{ data: { count } }` literal, `count → audit → respond`
  ordering with the empty-array literal in `recordBulkDisclosure`. Boring is exactly right for a
  privileged read path.
- **`buildPartnerOrgQuery` extracted and shared** between `listForPartnerOrg` and
  `countForPartnerOrg` (`recovery-cases.ts:186-204, 269, 293`) is the single best structural decision
  in the backend diff: it makes C-012-3 (a count may never span more than its sibling list) true by
  construction rather than by vigilance.
- **The `support-cases/count` handler reproduces the explicit pre-schema `scope=all` rejection**
  rather than relying on `z.literal('mine')` alone, and the comment explains that there is no
  `countAll` repository method to reach even if validation were bypassed. Defense in depth, correctly
  reasoned.

**What I would push back on, none of it blocking:**

- **Comment density.** Several files run close to 1:1 comment-to-code, and the comments cite document
  section numbers (`§10.6`, `§9.4(e)`, `SR-012-3.3`) that will drift as those documents are amended —
  `security-review.md` §10.6 has *already* been superseded once in place. Comments should state the
  rule ("audit write must precede serialisation and fail closed") and cite the document once, not
  transcribe a section's argument. This is a house-style note for the next feature, not a fix here.
- **Two hand-mirrored filters guarded only by prose.** `admin-verification.ts`'s list and count both
  hard-code `'pending_review'` in different files; the same is true of `countMine`'s filter shape.
  C-012-3 is enforced structurally for security-cases (shared builder) and by comment for the other
  two. Acceptable given both are one-field filters, but it is the drift the shared builder exists to
  prevent, applied unevenly.
- **`email={account?.email ?? ''}`** renders `Signed in as  · Admin` in the (gate-prevented)
  null-account case. Cosmetic; the `AuthGate` makes it unreachable. Worth a fallback string if
  touched.
- **The lint fence** as covered in §1.2(b) — widen it to `src/dashboard/**` with a targeted exception
  list rather than pinning one file path.

No over-engineering: there is no abstraction here that exists for a second, hypothetical caller. No
under-engineering: error, empty and loading states are all real and tested. No brittleness from
multi-agent authorship that I can find.

---

## 4. The file-clobbering incident — an editorial note is not sufficient

**What happened:** `manual-qa-engineer` committed its Stage 10 section (`45a6757`).
`automation-qa-engineer` then wrote `qa-report.md` as a **full-file rewrite** rather than an append,
destroying that section in the working tree; it was recovered from the prior commit and restored with
an editorial note (`103971b`).

**Why the current fix is not enough.** The content survived only because the earlier agent had
already committed it. Had the two passes run inside one commit boundary — the normal case when a
lifecycle stage is executed in a single session — the manual QA section, including the **only
accessibility finding produced anywhere in ten stages**, would have been silently and permanently
lost. Nobody downstream would have known: a rewritten document reads as complete. The recovery was a
property of the commit sequence, not of any control. An editorial note inside the very document that
was clobbered documents the incident; it does not prevent the next one, and it is invisible to an
agent editing a *different* shared document tomorrow.

**This warrants a house rule, and I am saying so explicitly rather than noting it and moving on.**
Proposed text, for adoption in the repo's root `CLAUDE.md` house-rules section (primary — it must be
in the file every agent loads) and cross-referenced in
[`docs/organization/03-communication-workflow.md`](../../organization/03-communication-workflow.md)
(secondary — where document-authoring conventions belong):

> **Shared lifecycle documents are append-only.** Any document under `docs/features/*/` or
> `docs/organization/` that carries more than one role's contribution — business requirements,
> security reviews, QA reports, ADRs, incident records — must be modified with **targeted edits or
> appended sections only. Never rewrite one of these files wholesale.** If you did not author a
> section, you may not delete or restructure it; disagree with it in a new section that cites it.
> Corrections to your *own* prior section are made in place and must retain the superseded text
> marked void (the pattern `security-review.md` §10.6/§14.1 already uses), so the change is
> auditable. Commit before handing a shared document to another role.

I am **not** editing `CLAUDE.md` or `docs/organization/` myself in this pass — a root-instruction
change needs the platform owner's go-ahead, not a subagent's. The rule text above is ready to paste.
Recorded as CTO-5. Until it lands, treat it as ratified engineering practice from this document's
date.

---

## 5. Bottom line

**Feature 012 is production-ready. I consider it genuinely done as a build, and conditionally done as
a release.**

The lifecycle stages are legitimately closed — I re-derived enough of Stages 8 and 10 independently to
say that the sign-offs mean what they claim, which is not something I would have said about a chain
that had only agreed with itself. Nothing I found is a security, compliance or data-integrity defect.
Every acceptance criterion is satisfied by the shipped code, AC-5 as correctly amended.

Six conditions remain. **None blocks the code that has already merged.** Two of them I would close
before this reaches real staff on a real deployment, and one is bigger than this feature.

| ID | Condition | Owner | Gate |
|---|---|---|---|
| **CTO-1** | Restructure the FR-4 error-state Retry control so it is not a `<button>` nested inside an `<a>` (move it outside the `Link`, or link the card title only). "Verify with a screen reader later" is not an acceptable disposition while there is no staging environment and no AT tooling | `frontend-engineer` + `ui-designer` | **Before staff are pointed at these Home screens on a real deployment** |
| **CTO-2** | Close F-QA-012-2 (`HomeScreen.tsx:21-23` names a test file that does not exist) **and** widen the `no-restricted-imports` fence from the single `HomeScreen.tsx` path to `src/dashboard/**` with a targeted exception list, so `useHomeCount.ts`/`homeAnnouncements.ts` and any future rename are covered. State the transitive limit honestly in SR-012-4's terms | `frontend-engineer` | Same release |
| **CTO-3** | Perform the `EXPLAIN` check `api-design.md` §7 / `security-review.md` §8 deferred to Stage 9 and never closed. `customer_profiles` has only `{accountId: 1}` — `countByVerificationStatus` is a COLLSCAN on the one collection that grows per customer. Either add the index or record an explicit accepted threshold | `database-architect` + `backend-engineer` | Next backend sprint; not a release blocker at current volume |
| **CTO-4** | **SH-2 becomes a tracked, dated ticket outside this feature folder, and CI-1 is fixed.** A review gate that returns PASS on a class of route it cannot see is a gate-integrity defect, and it is INC-001's root cause in a third sub-case. Roughly five lines per `security-engineer` §12.3 | `devops-engineer` + `cybersecurity-architect` | **Before the next feature that mounts on an index route** |
| **CTO-5** | Adopt the append-only house rule for shared lifecycle documents (§4) in root `CLAUDE.md`, cross-referenced in `03-communication-workflow.md`. Needs platform-owner go-ahead for the `CLAUDE.md` edit; text is drafted above | `cto` + platform owner; `technical-writer` to apply | Immediate |
| **CTO-6** | RR-012-2 / ADR-0006 C-15/C-16(b) — the partner-organisation audit gap gets a **named owner and a sprint slot**, not a fourth re-flagging. C-012-1 covers one endpoint of four and is not a down-payment on the class | `cybersecurity-architect` + `compliance-specialist` + `technical-project-manager` | Next planning cycle |

**Ratified as-is, no change requested:** Option B (§9 of the requirements) and the decision not to
build a fourth auth context · the sibling-route-over-`countOnly`-flag choice · C-012-1's extension of
the audit row to the partner count · the `NOT ACCEPTED` disposition on RR-012-2 · the acceptance of
RR-012-1/-3/-4 on the recorded bases · the props-injection architecture · the amended AC-5.

**Not discharged by this document:** any Stage 8 or Stage 10 condition that its own author marked
standing (SR-012-7, C-012-2/-3/-4) · the pre-existing `web-admin-verification`,
`web-security-cases`, `backend-security-cases`, `backend-customer-lookup` waivers · Feature 009 A-1 ·
INC-001 Release Gate A criterion 6 · INC-001-C-10 (RoPA).

**Filed by:** `cto`, 2026-09-10.
