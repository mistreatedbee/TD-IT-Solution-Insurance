# CTO Status — Sprint 3 mid-sprint check-in

**Date:** 2026-09-10 · **From:** `cto` · **Audience:** owner, `technical-project-manager`, `cybersecurity-architect`, `compliance-specialist`
**Type:** status only — no scope, sequencing, or gate decision is made or reversed here.
**Supersedes nothing.** Previous entry: [`2026-08-28-gate-a-inc-001.md`](2026-08-28-gate-a-inc-001.md) (still accurate as of its date; this entry records what changed since).

---

## 1. Headline

**Feature delivery is ahead. Release Gate A is stalled and has been for 13 days.** Those two facts
are related: capacity moved to Features 010/011/012 and pricing v2 while Gate A's remaining items
were all owner- or sign-off-blocked, not engineering-blocked. Nothing was done wrong, but the
sprint plan (`sprint-plan-release-gate-a.md`, dated 2026-08-24) no longer describes what the
platform is actually doing, and should be re-baselined by `technical-project-manager` before
Sprint 4.

## 2. Release Gate A — RED, will not close in Sprint 3

Verified against artefacts, not against the plan's own framing:

| Criterion | State (2026-09-10) | Evidence |
|---|---|---|
| 1 — signing identity / bundle ID | **Open, owner** | No confirmation artefact in repo |
| 2 — Resend delivery confirmed | **Open, owner** | No confirmation artefact; CT-7 additionally finds Resend was never compliance-reviewed |
| 3 — manual QA on device | **Blocked** on 1 + 2 | — |
| 4 — claims build-flag | **Done** | `mobile/eas.json` preview/production flags `"false"` |
| 5 — release notes | **Drafted, unreviewed** | `release-notes/build-2-draft.md` |
| 6 — no Stage-8-bypass surface reachable | **Engineering done; UNSIGNED** | `incidents/INC-001-A13-criterion-6-bundle-verification.md` §-sign-off table is **empty**; APK `426e5c01` has been ready since 2026-08-28 |

Items 3.1 (Gate A close) and 3.2 (build #2) therefore slip to Sprint 4 at the earliest. Criterion 6
is the one that is *not* owner-blocked — it needs `security-engineer` to run the A-13 checklist on
an already-built APK and the chair to sign. That is the cheapest unblock available this week.

## 3. Genuinely good news — INC-001's data limb is closed, nil

A-9 closed **NIL PURGE**; INC-001-C-13 positive control **CLOSED** (3 assets, 5 policies returned —
a real count, not an empty-connection artefact); zero `location_events`, zero assets with a
non-null `lastLocation`, zero `recovery_cases`. The s22 determination is now recordable as a
**final negative** on evidence rather than on statutory construction. INC-001 was a real lifecycle
gate breach, but **no personal information was exposed.** The remaining INC-001 work is procedural
(A-13 sign-off, SDL-6/A-14, post-mortem), not remedial.

## 4. The larger risk is no longer INC-001 — it is contract TDIT-2026-09 §19

`10-data-protection-contract-obligations.md` (compliance-specialist, 2026-08-28) establishes that
we are an **Operator** for a Client responsible party, with obligations stricter than POPIA itself.
Current condition-register state by date:

- **CT-1** (Client's *prior written consent* to cross-border processing — every deployed surface is
  in Render Frankfurt): **unmet, owner action.** Not curable by engineering.
- **CT-2** (Atlas region confirmation): **overdue since 2026-08-31.**
- **CT-3** (breach-notification runbook), **CT-5** (`seed-test-accounts.ts` teardown), **CT-8**
  (ADR-0003 compliance appendix): all due **2026-09-12 — two days out.**
- **CT-4** (documented Client instructions, §19(a)): due 2026-09-15.
- **CT-7** (compliance-review Resend, replace consumer-webmail contact in `email-footer.ts`): due
  **before production email is enabled** — i.e. it is now a co-dependency of Gate A criterion 2, and
  the plan does not currently show that link.

## 5. Corrections to the plan's own "Blockers to Watch" framing

- **Blocker 8 (ADR-0008 condition 1)** is closer to closed than stated. `verifyMongoCatalog()` *does*
  run in the live deploy path — `backend/src/index.ts:78–94`, every boot, plus `routes/health.ts`.
  It is deliberately **non-fatal and log-only**, and no one has yet read a Render log line
  confirming a pass. Closure needs a log observation from `devops-engineer`, not more code.
- **Governance defect: ADR number collision.** `payment-gateway-vendor-scorecard.md` reserves
  **ADR-0010** for the payment gateway decision; ADR-0010 was used on 2026-09-09 for the
  marketing-origin privileged-login risk acceptance (R-LU-3). Sprint items 4.1/4.2 reference an
  ADR-0010 that is now taken. `solution-architect` to renumber the payment ADR before Sprint 4.
  (ADR numbers 0004/0005/0007 are also unused — worth a one-line register.)
- **Payment gateway scorecard (item 4.1) due 2026-09-14** is at shortlist stage, unscored. It needs
  owner commercial input (fee tolerance, settlement bank, lock-in appetite) to finish honestly.
- **Production Mongo database is effectively named `test`.** `mongo-database-naming-remediation.md`
  is **PLANNED, not executed**, awaiting an owner go/no-go with production credentials.

## 6. Pattern worth naming

Three of this period's security findings were made by reviewing something *after* it shipped —
SR-LU-1 (login unification had permanently broken MFA), the Feature 010/011 concurrences recorded
as **WITHHELD IN PART**, and SH-2 (the manifest scanner's third structural blind spot, now in
sprint item 3.9 with `devops-engineer` actively on it). The CI gates are catching more than they
did, which is the intended direction. But the lifecycle is increasingly being applied
retrospectively to work that has already landed. That is a velocity choice with a real cost, and it
should be a deliberate one rather than a drift.

## 7. Asks

**Owner (cannot be delegated):** bundle-ID confirmation; Resend/DNS action; CT-1 consent
conversation with TD IT Solution; production-Mongo rename go/no-go; payment commercial constraints
before 2026-09-14.

**Engineering:** `security-engineer` — run A-13 on APK `426e5c01` this week. `technical-project-manager` —
re-baseline the sprint plan to include Features 010/011/012 and the CT-register deadlines.

---

## Addendum — 2026-09-10 (same day, post-dispatch)

Append-only. Three items from §5/§7 were dispatched after the above was filed. This records what
changed and corrects two things I got wrong. It does not re-open the §2 gate assessment.

**1. ADR-0008 blocker 8 — half-closed, and a design question I own surfaced.** `devops-engineer`
confirmed by code review that `verifyMongoCatalog()` runs on every deploy (`backend/src/index.ts:60–94`);
`sprint-plan-release-gate-a.md` blocker 8 carries a dated correction. Live-log confirmation is still
outstanding. Newly surfaced and correctly *not* decided by the dispatched agent: the check is
non-fatal and log-only, and nothing reads the log. **Whether "log-only, unread" satisfies ADR-0008
condition 1 is my call, not `devops-engineer`'s** — I will rule on it, with `database-architect`,
before Sprint 4. My §5 framing ("closer to closed than stated") was right on the deploy-path
question and wrong to imply only an observation was missing.

**2. Resend — my item 2 was under-scoped; it splits into three, and one new owner ask.**
`compliance-review-resend.md` (APPROVED WITH CONDITIONS, C-R-1…C-R-9) confirms CT-7 was real and
finds it larger: Resend's 22 sub-processors are **all US** (the Brevo review's EU-domicile s72
reasoning is dead — binding-agreement only), ~20 Feature 007 domain templates carrying
theft/recovery-case and IP-address content were **never in scope of any email review**, and
`email-footer.ts:44` publishes a consumer Gmail address as the de facto s18/s23/s24 contact.
Consequence for §2 criterion 2: **"Resend delivery confirmed" is no longer a single owner action.**
It now has an engineering leg (C-R-3(a) template-content audit, C-R-8 dead-Brevo removal), a
contractual leg (CT-1, unmet), and a contact-address leg (C-R-9). **New owner action — OI-R-5, and
it goes first:** does a live Resend account exist, who owns it, and has it sent to real addresses?
One sentence to answer; it determines whether we are prospectively clean or already in a live
contravention. Owner list is now six.

**3. Criterion 6 — MORE urgent, and my "an afternoon" framing was wrong.** `manual-qa-engineer`
executed the checklist and correctly refused to fake a pass: §1 confirmed, §2 backed by
build-artifact + 12/12 flag-guard tests, §3/§4/§5 explicitly **NOT verified** — no tap-injection
tooling, no proxy, no backend log access. Verdict recorded: not ready for chair sign-off. This was
not sign-off inertia; **no one in this org currently has a device-capable or log-capable
environment.** Note also that APK `426e5c01` **expires 2026-09-11** — a rebuild is required
regardless. Criterion 6 joins criteria 1/2/3 as owner-blocked.

**4. Read-through.** The same missing capability blocked all three: live Render logs (item 1 §4),
a real device (item 3), and account access (OI-R-5). **The platform's binding constraint this
sprint is not engineering capacity or unmade decisions — it is the absence of anyone with hands on
live infrastructure and hardware.** That is one procurement/access problem wearing four hats, and
it should be treated as a single item at re-baseline, not four independent blockers.

**Gate A timeline: unchanged in date, worse in quality.** Nothing closed today was on the critical
path; criterion 2 acquired three blocking conditions and criterion 6 acquired a documented negative
and an expiring artifact. Sprint 4 at the earliest stands. **Cheapest unblock now available**
(superseding §7's "run A-13 this week", which we now know cannot be executed here): the **C-R-3(a)
template-content audit** — pure engineering, needs no owner, no device, no vendor, and closes the
largest single privacy exposure named today.
