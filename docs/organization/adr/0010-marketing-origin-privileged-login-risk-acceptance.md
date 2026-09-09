# ADR-0010: Marketing-Origin Privileged Login — Documented Risk Acceptance (R-LU-3)

Status: **Accepted (risk acceptance, not a design change)** — `cto`, 2026-09-09.
Date: 2026-09-09.
Deciders: `cto`. Escalated by: `cybersecurity-architect`, in
[`001-authentication/security-review-login-unification.md`](../../features/001-authentication/security-review-login-unification.md) (R-LU-3).

## Context

Feature 001's original security review ratified **SR-12(a)**
([`001-authentication/security-review.md:189,297`](../../features/001-authentication/security-review.md)):
the public marketing origin must not be able to reach an authenticated API
session, and admin/security-company dashboards should sit on distinct
origins from marketing and from each other — so an XSS or supply-chain
compromise of the public bundle can't laterally reach a privileged session.
SR-12(a) was never implemented; no CSP exists anywhere in the repo today.

The 2026-09-08 login-unification change (`src/pages/CustomerLoginPage.tsx`)
made this materially worse, not just unresolved: it made the marketing
origin's `/login` the **single, canonical credential-entry point for every
role**, including admin/security/support. Previously the dedicated
`/admin/login` etc. pages were at least a separate (if still same-origin)
code path; now privileged credentials are typed into the exact same page,
same bundle, same origin as the public marketing site, for all four roles.

## Decision

**Accept this risk for now, do not block on it, and do not let it go
silent.** Rationale:
- No CSP and no origin separation is a pre-existing platform-level gap
  (SR-12(a) is 2026-08 vintage), not something login unification created
  from nothing — it made an existing gap's blast radius larger, which is
  a reason to prioritize the fix, not a reason to revert a change that
  fixed a real, currently-shipping MFA-login bug (SR-LU-1) along the way.
- True origin separation (distinct domains/subdomains for marketing vs.
  admin vs. security-company dashboards, or at minimum a CSP
  `frame-ancestors`/`script-src` policy plus SRI) is real infrastructure
  work — DNS, hosting config, CORS allowlist population per SR-12(a)/(b) —
  owned by `cloud-infrastructure-architect` + `frontend-architect`, not a
  same-day code fix.
- The realistic attack path this accepts is: XSS or supply-chain
  compromise of the public marketing bundle → credential/token theft at
  `/login` → privileged account takeover. No known active exploit; this is
  a structural exposure being accepted with eyes open, not a shipped
  vulnerability being ignored.

## What this does NOT accept

- It does not defer SR-12(a) indefinitely. It stays open in Feature 001's
  own conditions register and is now additionally tracked here.
- It does not license any further widening of what the marketing origin
  can reach.

## Required before this acceptance lapses

1. `cloud-infrastructure-architect` + `frontend-architect` deliver an
   origin-separation or CSP plan for SR-12(a)/(d) — even a minimal CSP
   (`default-src 'self'`, no inline scripts, `frame-ancestors 'none'` on
   dashboard routes) meaningfully cuts this risk without waiting on a
   full multi-domain split.
2. Review date: **2026-10-09** (30 days). If SR-12(a) is still
   unimplemented at that date, `cto` re-reviews and either extends this
   acceptance explicitly (dated, again) or escalates to blocking.

## Consequence

Feature 001's SR-12(a) condition remains **open, not discharged, not
downgraded** by this ADR — this document only records that the platform
consciously chose not to block the 2026-09-08 login-unification fixes on
it, and sets a deadline so that choice can't quietly become permanent.
