# ADR-0013: Security Company Dashboard Client Demo — Proposed Time-Boxed Exception

Status: **Proposed — NOT YET AUTHORIZED.** Requires explicit, present confirmation from the business
owner before any step below touches production. No agent message and no prior "proceed with
whatever's needed" instruction given while the owner was away counts as that confirmation — `cto`
ruled this explicitly on 2026-10-13 when asked to authorize it autonomously.
Date: 2026-10-13.
Deciders: `cto` (ruling), pending business-owner go/no-go.
Context: business owner asked to present the Security Company Dashboard to a prospective client on
the live production URL, using fake data only.

## Context

`src/security/` (the Security Company Dashboard) is gated behind a build-time flag,
`VITE_FEATURE_SECURITY_OPERATOR` (`src/lib/features.ts`), added as the INC-002 containment control —
not a convenience toggle. The backend API behind it
(`backend/src/routes/security-cases.ts`) carries no separate flag; it is already always-live,
gated only by normal role + partner-org JWT authorization. The frontend flag is therefore a
UI-routing control, not the actual security boundary — the real exposure, flag on or off, is
**whether a security-company-operator account and a partner organization exist in production at
all**.

The Security Operations slice completed a full three-role Stage 8 review
([`009-customer-experience-redesign/security-review-security-operations.md`](../../features/009-customer-experience-redesign/security-review-security-operations.md)):
CONDITIONAL — a code-correctness pass, explicitly **not** clearance to expose real customer data.
Confirmed separately: production currently has zero real customers and zero real recovery cases.

`backend/scripts/seed-test-accounts.ts` is unsuitable for this use as-is: it commits fixed
passwords for all four account types (including admin and security operator) directly to git, and
creates privileged accounts with no MFA enrolled — anyone with repo read access could take over
any account it creates. Its own header already scopes it to "local/staging" use.

## Decision

**Not decided yet.** This document records the proposed shape of the exception, for the business
owner to accept, modify, or decline when they return — it is not a decision made on their behalf.

If accepted, the exception is:
- Scope: one demo security-operator account, one fake/clearly-labeled partner organization
  ("DEMO – Fictional Security Partner (not a live integration)"), and a handful of fake recovery
  cases, created in the **production** database for the sole purpose of a sales/client demo on the
  production URL.
- `VITE_FEATURE_SECURITY_OPERATOR=true` set on Vercel's **Production** environment for the
  duration of the demo only.
- No admin or support-agent account is created under this exception. No real customer data is
  touched or created.
- Expiry: **same calendar day** as the demo. This is not a standing exception — it does not carry
  over to the next business day under any circumstance.

## What this does NOT accept

- It does not authorize leaving the flag on, or the demo account/org in place, past the day of the
  demo. "No real data exists yet" is a fact about today, not a control — it stops being true the
  moment a real customer signs up and files a real theft report, and a forgotten demo artifact at
  that point exposes a real customer's report to an operator account whose credentials may have
  been shared in a sales room, against a partner org with no signed agreement — a likely POPIA
  breach, not a hypothetical one.
- It does not substitute for PDM-6 (partner registry) or G-7 (dispatch-model decision) — those
  remain required before any REAL pilot partner, unaffected by this demo either way.
- It does not authorize running `seed-test-accounts.ts` against production in its current form —
  a separate demo-specific seed/teardown script is required (see Required actions, item 1).
- It does not authorize the demo to represent the dispatch model or a partner integration as
  decided — the talk track must describe the product as pre-launch and the partner as fictional.

## Note (2026-10-15) — item 1 built; one real gap found, not resolved here

`backend/scripts/seed-demo-security-dashboard.ts` and its teardown mode now exist (requirement 1
below is satisfied), with 18 tests, independently re-verified clean. Building teardown surfaced a
real gap in the Teardown section below: ADR-0006's AUD-11 reserves `admin_access_log` deletion for
a separate, cluster-provisioned purge-user credential — the application's standard `MONGODB_URI`
role has `find`+`insert` only, by design, so no application bug or insider can delete evidence of
an access. If the live demo session causes the operator account to actually browse or claim any
fake case through the real routes (the point of doing a live demo), the resulting
`admin_access_log` rows **cannot be deleted by this script's teardown** — `deleteMatching` reports
this distinctly (`permissionDenied: true`) rather than silently succeeding or widening the app
credential's role to work around it.

**Consequence for the go/no-go and for Teardown step 2 below:** "confirm zero rows remain for the
demo org, the demo accounts, and the demo cases" will not fully hold for `admin_access_log` rows
if the demo was actually exercised live. Whoever runs the go/no-go needs to explicitly accept one
of: (a) those rows age out under the existing 12-month retention ceiling rather than being deleted
same-day, (b) `database-architect` runs the separate purge-user credential before closing this
ADR, or (c) the rows are tagged `legalHold`-equivalent and tracked rather than deleted. This is not
resolved here — `database-architect` owns the choice, per the Required actions item 1 instruction
not to decide it unilaterally.

## Required actions before this can run

1. A dedicated demo seed script (or a `--demo` mode on the existing script) that: creates only the
   operator + a customer account plus fake cases; generates random passwords at runtime, prints
   them once, stores none; uses the fake org name/id above; **refuses to create admin or
   support-agent accounts**; and ships with a matching `--teardown` that deletes every row it
   created (demo accounts, demo org, demo cases, and any access-log rows naming them — consult
   `database-architect` on whether these are hard-deleted or tagged per retention rules instead).
   Covered by tests. Not run against production until step 3 below.
2. The business owner personally completes MFA enrollment on the demo operator account — it is
   not pre-enrolled, by design.
3. Business-owner go/no-go, in person, covering: confirmation a production demo (vs. a Vercel
   Preview deployment with the flag scoped to Preview only, leaving the production build
   untouched) is actually wanted; a read-only confirmation production still has zero real
   customers/cases immediately before the demo seed runs; and acceptance of this exception's terms.

## Teardown (same day, mandatory)

1. Remove `VITE_FEATURE_SECURITY_OPERATOR` from Vercel Production (or set it back to unset/false)
   and redeploy; confirm `/security/*` shows the unavailable state again.
2. Run the demo script's `--teardown` and confirm zero rows remain for the demo org, the demo
   accounts, and the demo cases.
3. Close this ADR's status to **Closed — exception lapsed, teardown confirmed `<date>`**, with
   whoever ran teardown named.

## Standing gate item (regardless of whether this exception is ever exercised)

Added to launch-readiness: **no DEMO/test partner organizations, operator accounts, or
`VITE_FEATURE_SECURITY_OPERATOR=true` may be present in production once the first real customer
onboards.** Whoever owns the pilot go-live checklist should check for this explicitly, not assume
a same-day teardown actually happened.

## Consequence

The Stage 8 CONDITIONAL status is unchanged by this document either way — it governs real-pilot
readiness, not a one-day demo with fake data. This ADR exists only to make a deliberately
time-boxed, logged exception instead of an undocumented, indefinite one.
