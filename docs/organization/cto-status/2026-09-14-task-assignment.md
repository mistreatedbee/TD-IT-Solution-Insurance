# CTO — Task review and assignment pass, 2026-09-14

**Date:** 2026-09-14 · **From:** `cto` · **To:** `technical-project-manager` (re-baseline input), all named roles below, owner (§5 only)
**Type:** **Assignment.** This is not a status report. Every row below names an accountable role, a
startable/blocked call, and a next action. No scope, gate or vendor decision is reversed here; the
only decisions made are (a) the ADR-0008 condition-1 ruling at T-20, (b) the payment-scorecard date
re-baseline at T-24, and (c) dispatch priority.

**Companion entries:** [`2026-09-10-sprint-3-checkin.md`](2026-09-10-sprint-3-checkin.md) + addendum ·
[`2026-09-14-payment-deadline-read.md`](2026-09-14-payment-deadline-read.md). Both stand; where this
file disagrees with either, **this file is later and wins**, and the disagreements are listed at §1.

**Method / limits of this pass.** Every item was re-verified against current file and source state
today, not carried forward from the 09-10 or 09-14 lists. **This session has no shell**, so no test
suite, no `git log`, and no live console was run — where a claim depends on execution (test counts,
Render logs, Atlas console, commit `0ea5190`'s diff) it is marked as *code-evidenced* or
*unverified*, never asserted.

---

## 1. What actually moved since the 09-10 / 09-14 entries — five corrections

1. **OI-R-5 answered, then corrected the same day. The Resend escalation is withdrawn.**
   `compliance-review-resend.md` **Appendix C** supersedes Appendix B in part: a Resend account
   exists, holds an API key, and **has never sent** — the Supabase Send Email Hook was never enabled,
   so the verification mail the owner received came from Supabase's built-in sender (which only
   delivers to project-team addresses). **There is no live non-conformance and no breach.** All nine
   C-R conditions revert to **pre-go-live gates**. The two 24-hour clocks in Appendix B are gone.
   **Operational consequence that is larger than the compliance one: real-customer signup verification
   email does not work today**, and enabling the hook is a launch prerequisite, not a paperwork item.
2. **C-R-9 (consumer-webmail contact) is code-clean.** Grep for `gmail.com` across all `*.ts` in the
   repo returns **zero matches**; `src/lib/companyContact.ts:15` now reads
   `info@tditsolutionsinsurance.co.za`. All four sites Appendix C §C.5(3) named are covered.
   **The code fix has landed (owner, commit `0ea5190` — diff not verified this session, but the
   end-state is).** What has *not* happened is the condition being **closed on the register** — that
   is T-06 below, and it is `compliance-specialist`'s, not the owner's.
3. **The CT-1 letter's dispatch record is broken.** The file is named
   `SENT-2026-09-14-ct-1-cross-border-consent-request.md`, but **its own header still reads
   "DRAFT — NOT SENT"**, no dispatch record (date/sender/recipient/channel) was added, and
   `correspondence/README.md` still lists it as `DRAFT-…` with a **now-broken link**. Per that
   README's own rule 2, a `DRAFT-` header is treated repo-wide as evidence the communication did not
   happen. **This is a documentation-honesty defect of exactly the shape INC-001's root-cause note
   warns about, and it is 15 minutes of work.** T-05.
4. **The ADR-0010 collision I flagged on 09-10 is already resolved.** The marketing-origin
   privileged-login risk acceptance is filed as **`adr/0011-…`**, not 0010. **`0010` is free and
   remains reserved for the payment gateway decision** — sprint items 4.1/4.2 need no renumbering.
   **0004, 0005, 0007 and 0010 are unused**; that register gap is still worth one line (T-21).
5. **SH-2 is fixed in code.** `scripts/verify-stage8-manifest.mjs:134–149` now detects
   `<Route index …>` and attributes it as `${mountPrefix} (index)`. Sprint item 3.9's engineering leg
   is done; only the chair's sign-off is outstanding (T-22).

Also new since 09-10: a **fresh, unexpired** EAS preview build `7f3694b9` (Android, commit
`2630cd9`) and a **live Expo Go tunnel** (`exp://yxp6o0u-socials-8081.exp.direct`) — see T-03/T-04
for what each can and cannot evidence. And `backend/scripts/migrate-mongo-db-rename.sh` now exists
as an executable runbook; it has **not** been run (T-19).

---

## 2. The task register

**Legend — Start?** · **NOW** = dispatch today, no dependency · **SOON** = startable, sequenced ·
**BLOCKED-ACCESS** = a role owns it but nobody in this org has the credential/hardware ·
**BLOCKED-OWNER** = only the platform owner can act · **BLOCKED-DEP** = waits on another row.
**P0** = on the Gate A / go-live critical path. **P1** = overdue contractual or security obligation.
**P2** = scheduled. **P3** = hygiene.

### A. Release Gate A

| ID | Item | Accountable (A) | Start? | P | Next action |
|---|---|---|---|---|---|
| T-01 | Criterion 1 — bundle ID `co.za.tditsolutions.insurance` confirmation | `mobile-architect` | **BLOCKED-OWNER** | P0 | One owner sentence. No engineering substitute exists. |
| T-02 | Criterion 2 — working verification email end-to-end | `technical-project-manager` (tracks) | **BLOCKED-OWNER** on hook enable (OI-R-8); its engineering legs are T-07/T-08/T-09 | P0 | Owner: enable Supabase → Authentication → Hooks → Send Email, and capture the OI-R-8 screenshot set in the same sitting. |
| T-03 | Criterion 3 — manual QA pass (`004` checklist) on device | `qa-architect` / `manual-qa-engineer` | **BLOCKED-OWNER** (human with a phone) | P0 | The live tunnel makes the §3 "must work" half executable **today** by the owner in Expo Go. Signup/verify rows stay blocked behind T-02. |
| T-04 | Criterion 6 — INC-001 A-13 bundle verification | `security-engineer` (exec), `cybersecurity-architect` (sign) | **BLOCKED-OWNER** for §2/§3/§5; **BLOCKED-ACCESS** for §4 | P0 | Build `7f3694b9` is fresh and installable. Needs a human tapper on Android + Render log/proxy access. **Do not trigger another build** — a third unverified artefact is worse than none. |
| T-05 | CT-1 letter dispatch record + README status row | `compliance-specialist` | **NOW** | P0 | Replace the DRAFT header with a dispatch record; fix the README link/status to `SENT`; move CT-1's register entry from "unmet" to "requested, awaiting response". |
| T-06 | Close **C-R-9** on the register (code fix landed) | `compliance-specialist` | **NOW** | P1 | Verify the four sites, record closure in `compliance-review-resend.md` and the CT-7 register row. Ten minutes. Until done, three documents still call it `[BLOCK]`. |
| T-07 | **C-R-3(a) — the seven §A.6 template rewrites** (theft/recovery subject+preheader, drop `assetType`) | `notification-engineer` + `backend-engineer` | **NOW** | P0 | Single file, `backend/src/lib/domain-email-templates.ts`. Copy is already written in §A.6. This is the last *engineering* thing blocking first production send. |
| T-08 | **C-R-8 — delete/disarm the dead Brevo path** (`transactional-email.ts`, `env.ts:304`) | `backend-engineer`, verified `security-engineer` | **NOW** | P1 | One env var away from silently arming a second unonboarded operator. |
| T-09 | **C-R-4 — confirm token TTLs** (reset ≤60m, verification ≤24h, invitation ≤72h) against the 30-day Resend window | `authentication-engineer` + `cybersecurity-architect` | **NOW** | P1 | Read the configured values, record them. Pure verification. |
| T-10 | Criterion 5 — release notes review | `product-manager` (review), `technical-writer` (draft) | **NOW** | P1 | Draft exists. It must now say email delivery is not live — Appendix C changed the honest scope statement. |

### B. Contract TDIT-2026-09 condition register (all `compliance-specialist`-adjacent, several overdue)

| ID | Item | Accountable (A) | Start? | P | Next action |
|---|---|---|---|---|---|
| T-11 | **CT-2 — MongoDB Atlas region** (overdue since 2026-08-31, 2 weeks) | `cloud-infrastructure-architect` | **BLOCKED-ACCESS** | P1 | One console lookup — but nobody in this org has held Atlas console/API credentials in any session. Folds into T-25. It is *not* a role-capacity problem and should stop being tracked as one. |
| T-12 | **CT-3 — breach-notification runbook** (due 2026-09-12, **overdue**) | `compliance-specialist` + `security-engineer` + `site-reliability-engineer` | **NOW** | P1 | Pure document. Must compress **three** nested chains (Resend "undue delay" → our 48h → Client's s22) per `compliance-review-resend.md` §10. No external input needed. |
| T-13 | **CT-4 — documented Client instructions (§19(a))** (overdue **tomorrow**) | `compliance-specialist` | **NOW** | P1 | Must cover email dispatch explicitly. |
| T-14 | **CT-5 — `seed-test-accounts.ts --teardown`** (due 2026-09-12, **overdue**) | `backend-engineer` | **NOW** | P1 | Verified absent today: zero matches for `teardown` in that script. ~1 hour of work, and it is the only live §19(d) exposure. |
| T-15 | **CT-8 — ADR-0003 compliance appendix** (due 2026-09-12, **overdue**) | `cloud-infrastructure-architect` + `compliance-specialist` | **NOW** | P1 | Verified absent: no s72/cross-border text in `adr/0003-backend-hosting-platform.md`. Does **not** need CT-2 to close — Frankfurt is the decision being annotated. |
| T-16 | **CT-10 — §19(b) INC-001 notice to Client** | `cto` (service) + `compliance-specialist` (draft) | **NOW** (draft) | P1 | Draft does not exist. Must go as a **separate** document in the same week as CT-1, never merged into it. |
| T-17 | **CT-11 — client-side SA ID checksum + truncate** (due 2026-09-19) | `backend-engineer` + `frontend-architect` (+ `mobile-architect`) | **NOW** | P2 | Verified open: `customer-profile-validation.ts:17` still accepts a full `idNumber` server-side. This is the single most sensitive element in the CT-1 schedule. |
| T-18 | **CT-12 — amend §2 location table** (Supabase `eu-central-1`; web is Vercel not Render) | `compliance-specialist` | **SOON** | P3 | Fold into the next revision, not a separate pass. |

### C. Infrastructure, governance, ADRs

| ID | Item | Accountable (A) | Start? | P | Next action |
|---|---|---|---|---|---|
| T-19 | Production Mongo database named `test` — execute the rename runbook | `database-architect` + `cloud-infrastructure-architect` | **BLOCKED-ACCESS** | P1 | Script ready (`backend/scripts/migrate-mongo-db-rename.sh`). Needs shell + `mongodump`/`mongorestore` + Render dashboard in one pair of hands. **Standing instruction: do NOT land the `render.yaml` `MONGODB_DB_NAME` line ahead of the migration** — per §2 of the remediation doc that alone silently opens an empty database and orphans live data. |
| T-20 | **ADR-0008 condition 1 — CTO ruling** (is "log-only, unread" verification?) | `cto` (me) + `database-architect` | **NOW** | P2 | **My ruling, recorded here so it stops blocking:** the deploy-path leg is satisfied (`backend/src/index.ts:78–94`, unconditional). **Condition 1 does not close on a log line nobody reads.** `database-architect` + `devops-engineer` to make `verifyMongoCatalog()`'s drift finding *observable* — a non-fatal but surfaced signal (health-endpoint field or startup summary already consumed by something), not a louder crash. Live-log confirmation remains a separate, access-gated leg (T-25). |
| T-21 | ADR register one-liner — 0004/0005/0007 unused, **0010 reserved for payments, 0011 taken** | `solution-architect` | **NOW** | P3 | Corrects my own 09-10 §5 note. No renumbering needed. |
| T-22 | Sprint 3.9 / SH-2 — chair sign-off on the manifest-scanner index-route fix | `cybersecurity-architect` | **NOW** | P2 | Code fix verified present today. Sign it or say why not; do not leave a landed CI-gate fix unsigned. |
| T-23 | ADR-0009 §15 `security-engineer` concurrence; §16 `compliance-specialist` concurrence | `security-engineer` / `compliance-specialist` | §15 **NOW**; §16 **BLOCKED-DEP** on RoPA | P2 | §15 has no dependency and has been open since Sprint 3. |
| T-24 | **Payment gateway scorecard — sub-reviews never started** | `integration-architect` | **NOW** (doc legs); sandbox leg needs vendor accounts | P2 | **Date re-baselined by me: sub-reviews due 2026-09-25, decision + ADR-0010 due 2026-10-02.** Split the work and dispatch it: C3 → `compliance-specialist` (POPIA/s21/s72 per vendor, same method as the Supabase/Resend reviews); C2 → `cybersecurity-architect` (SAQ level + hosted-fields); C1/C5 → `integration-architect` (first-party API docs + sandbox). **Owner commercial input is not the binding constraint** — my 09-14 §1 correction stands. |
| T-25 | **"Nobody has hands on live infrastructure"** — one access problem wearing five hats (Render logs, Atlas console, Supabase dashboard, Resend dashboard, a physical Android device) | `cto` → owner | **BLOCKED-OWNER** | **P0** | Track as **one** item, not five. It currently blocks T-04(§4), T-11, T-19, T-20's log leg, and half of T-02. Ask: a read-only Render API key, Atlas project access, and one Android device in a tester's hands. |
| T-26 | Device/simulator automation harness (Maestro or Detox) so §2/§3/§5 verification stops being owner-gated forever | `automation-qa-engineer` | **NOW** | P2 | Genuinely startable engineering work and the only durable fix for the pattern that has now defeated A-13 twice. Not a substitute for T-04's current pass. |
| T-27 | Staging environment (MP-8) — `render-staging.yaml` exists; **provisioned ≠ gating** | `cloud-infrastructure-architect` | **SOON** | P2 | Confirm the separate Supabase project + `td_it_insurance_staging` database are real and that no real-customer path touches them, per sprint 6.6. Do not mark 2.3 green on the blueprint file alone. |
| T-28 | INC-001 remaining limbs — SDL-6 / A-14, post-mortem, systemic audit close-out | `cybersecurity-architect` (chair) | **SOON** | P2 | Data limb is closed NIL. What remains is procedural and is the chair's to sequence. |
| T-29 | ONB-002 s69 direct-marketing formalisation (consent basis + opt-out mechanics) | `compliance-specialist` (mechanics), `product-manager` (scope) | **SOON** | P2 | Prospective, not accrued (Appendix C). Sprint 4 timeline unchanged. **Standing interim instruction holds: do not extend or "improve" that email.** |
| T-30 | C-R-7 — RoPA entry for Resend + §11 privacy-notice copy replacement (Supabase recorded twice, in two roles) | `compliance-specialist` (a,b,d), `integration-architect` (c), `technical-writer` (copy) | **NOW** | P2 | Required **before** first send, and the old Brevo copy is now actively false — it must not ship anywhere. |
| T-31 | OI-R-3 (Resend non-US residency — 404'd, web search unavailable that session) and OI-R-4 (Resend security-incident contact) | `integration-architect` | **NOW** | P3 | Both are a web-search/vendor-email away and one of them (OI-R-3) could materially improve the s72 posture. Cheap. |
| T-32 | Stale `.claude/agents/*.md` briefs asserting "ADR-0008 proposed, pending `cto` ratification" | `technical-writer` | **SOON** | P3 | Single batch pass. Explicitly not worth interrupting anything above. |

---

## 3. Dispatch now — real engineering/compliance work, today, no owner dependency

These are not "eventually". I am naming the role and expecting the work to start:

1. **`notification-engineer` + `backend-engineer` → T-07.** The seven §A.6 template rewrites. The copy
   is already written. This is the last engineering item blocking first production email and it has
   sat since 09-10.
2. **`compliance-specialist` → T-05, T-06, T-12, T-13, T-16, in that order.** T-05 and T-06 are
   minutes each and both currently cause three other documents to misstate the platform's state.
   T-12/T-13 are overdue contractual obligations that need no external input.
3. **`backend-engineer` → T-14 (CT-5 teardown) and T-08 (dead Brevo path).** Both small, both overdue,
   both verified open in source today.
4. **`cloud-infrastructure-architect` → T-15 (ADR-0003 compliance appendix).** Overdue, and — contrary
   to how it has been tracked — it does **not** wait on CT-2.
5. **`integration-architect` → T-24 split + T-31.** Stop carrying "scorecard evaluation continues" as
   a sprint line with nothing behind it. Commission the two sub-reviews by name today.
6. **`cybersecurity-architect` → T-22 (sign SH-2) and T-09 (with `authentication-engineer`).**
7. **`automation-qa-engineer` → T-26.** The device-verification gap has now blocked criterion 6 twice.
   Build the harness.
8. **`database-architect` + `devops-engineer` → T-20's design half**, under the ruling recorded above.
9. **`backend-engineer` + `frontend-architect` → T-17 (CT-11)**, due 2026-09-19.

## 4. Owner-gated — no role can act, and I am not going to pretend otherwise

1. **Enable the Supabase Send Email Hook + capture OI-R-8's screenshot set** (hook state, Edge
   Function invocation count, Edge Function secrets, Render env vars, Resend domain verification).
   This is now the single highest-value owner action: it closes C-R-1, extinguishes C-R-10, and
   **makes customer signup verification actually work for anyone outside the Supabase project team.**
   It has overtaken OI-R-5 as my "if I could have one".
2. **Bundle ID confirmation** (T-01).
3. **Install `7f3694b9` on an Android phone and walk §2/§3/§5** (T-04) — or hand the phone to someone
   who will.
4. **Infrastructure access** (T-25): Render read-only API key/logs, Atlas console, so T-11/T-19/T-20
   stop being permanently parked.
5. **Mongo rename window go/no-go with a human at a shell** (T-19). The plan-level go-ahead is given;
   the executed window is not.
6. **CT-1 reply handling** — `compliance-specialist` is separately assessing whether the informal
   reply already received satisfies clause 19(c). **That assessment is in flight and is not
   duplicated or pre-empted here**; nobody else should opine on it until it lands.

**Deliberately *not* on this list any more:** payment commercial constraints (T-24 is blocked on our
sub-reviews, not on the owner) and the Resend log export (moot — nothing was ever sent).

## 5. Sprint-plan re-baseline — `technical-project-manager`, specifically what is wrong

I asked for this on 09-10 and it has not happened. Do not rewrite the whole document; correct these:

1. **Sprint numbering.** Today is Sprint 4 day 1, with **items 1.1, 1.2, 2.1, 2.2, 3.1 and 3.2 still
   open**. Gate A did not close in Sprint 2 or 3 and will not close in Sprint 4 without §4's owner
   actions. The plan should say so on its face rather than in a blocker footnote.
2. **Item 1.2's framing is dead.** "Resend delivery confirmed by an actual received inbox message" is
   no longer one owner action and no longer even describes the mechanism — the hook was never
   enabled, Resend has never sent, and the received mail came from Supabase's built-in sender. Replace
   with four tracked legs: hook enablement (owner), C-R-1 evidence (owner), T-07 rewrites
   (engineering), CT-1 (contractual).
3. **Criterion 6.** Build `426e5c01` expired 2026-09-11; `7f3694b9` replaces it. The blocker is a
   **human with a phone plus Render log access**, not sign-off inertia — `manual-qa-engineer`'s
   documented negative of 2026-09-10 should be cited in the plan, not worked around.
4. **Blocker 8 (ADR-0008).** Superseded by T-20. Record the ruling; stop tracking the deploy-path
   question, which is settled.
5. **The 09-10 ADR-0010 collision note is itself stale** — resolved via ADR-0011. Items 4.1/4.2 keep
   ADR-0010.
6. **Item 3.9 / SH-2 is done in code** and needs only T-22.
7. **Item 4.1's date has passed.** New dates per T-24: sub-reviews 2026-09-25, decision 2026-10-02.
   GPS (item 6.4) stays 2026-10-05 with its standing default rule intact.
8. **The plan contains no Features 010/011/012, no pricing v2, no CT register, and no C-R condition
   set** — which is why it stopped describing what the platform is doing. The CT register items
   (T-11 … T-18) are contractual deadlines with dates and owners and belong in the sprint table, not
   in a separate document only `compliance-specialist` reads.
9. **Add T-25 as a single first-class blocker.** Five items are parked on one missing capability.
   Tracking them as five independent blockers has made a procurement problem look like an engineering
   backlog.

---

**Standing constraints unchanged by this pass:** Stage 8 and Stage 10 remain hard gates. No build
ships before Gate A closes, criterion 6 included. Payment and GPS vendors remain **open**. No date is
committed to the Client anywhere in this document.

---

## Appendix 1 — same-day corrections, 2026-09-14 (late). Append-only.

Written after the register above, against current source and documents. §§1–5 stand as written;
these are corrections and closures, not a rewrite.

**Closed since the register was written** (all verified by direct read, not by agent report):
T-05 (`correspondence/README.md` index + dispatch record now read `SENT`) · T-06 / C-R-9
(`compliance-review-resend.md` **Appendix D**) · T-07 (`domain-email-templates.ts` — neutral
subjects/preheaders, no `assetType`) · T-08 (`backend/src/lib/transactional-email.ts` deleted; no
`BREVO_*` var survives in `backend/src/`; residual mentions are historical comments in
`policy.ts`/`README.md` only) · T-12 / CT-3 (`runbooks/ct-3-breach-notification-runbook.md`, filed
2 days late) · T-13 / CT-4 (`11-documented-client-instructions.md`, filed 1 day early, **discharged
as to artefact only**) · T-14 / CT-5 (`--teardown [--confirm]` with dry-run default) · T-15 / CT-8
(ADR-0003 Appendix A, lines 112–226) · T-22 / SH-2 (chair signed; residual **SH-2a** filed).

**Corrections to the register above:**

1. **§4 item 1 is now wrong and is withdrawn.** "Enable the Supabase Send Email Hook" was my top
   owner ask. **CT-4a** (`10-…` §12.4) makes the Client's §19(a) instruction on email dispatch a
   **precondition** to enabling it, because the §19(a) gap is prospective only until the first send.
   Revised instruction: **do not enable the hook until CT-4a closes.** Ordering, not cancellation.
2. **T-26 is delivered, T-04 is not.** `mobile/e2e/` is a real Maestro harness with live tap
   injection. It moves criterion 6 from *structurally impossible* to *a finite backlog* — it does
   not close it. One of §2's ten rows, three of §3's five, none of §4/§5; and the live pass ran on
   an iOS Expo Go session with env-var flags, **not** the §1 build-under-test (`7f3694b9`, Android).
3. **New conditions opened today that are not on the register above:** CT-1a, CT-1b, CT-1c, CT-13
   (Render DPA), CT-14, CT-3-OI-1…5, CT-4a…CT-4d, SH-2a. **CT-4c** (sub-operator authorisation
   before a PSP or GPS vendor is appointed) now sits **upstream of T-24's 2026-10-02 ADR-0010 date**
   — `integration-architect` and `compliance-specialist` must sequence for it, not discover it late.
4. **CT-14 appears already discharged** by T-05's edit, which landed the same day it was opened.
   `compliance-specialist` to confirm and close rather than leave it open against a fixed file.
5. **Unchanged and still open:** T-01 · T-02 (now also CT-4a-gated) · T-03 · T-04 · T-09 · T-10 ·
   T-11 · T-16 (CT-10 draft still absent) · T-17 (CT-11 — `customer-profile-validation.ts:17` still
   takes a full 13-digit `idNumber`; **due 2026-09-19**) · T-18 · T-19 · T-20 · T-21 · T-23 · T-24 ·
   T-25 · T-27 · T-28 · T-29 · T-30 · T-31 · T-32 (38 stale `ADR-0008` strings across 35 briefs).

**One process item I am naming formally:** two agent reports today were unreliable — a fabricated
"done" on the ADR-0003 appendix and a half-applied Brevo removal that would not have built. Both
were caught only by orchestrator re-verification. That control is real but unmeasured and
undocumented. `technical-project-manager` + `technical-writer`: add "a completion report is not
evidence — the artefact is verified by a second reader before a task is marked done" to the
lifecycle definition-of-done and `07-documentation-standards.md`, and start a one-line-per-entry
near-miss log. No new gate stage.

*Appendix 1 filed by `cto`, 2026-09-14.*
