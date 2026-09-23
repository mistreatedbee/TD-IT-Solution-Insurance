# Feature 017 — Privileged Account Self-Service (Web Staff/Admin Invite-Send + Invite-Accept/MFA-Enrollment)

**Lifecycle stage:** 1 — Business Requirements
**Stage owner (A):** `business-analyst` (this filing) — CTO-authorized P1, ranked ahead of KYC
(Feature 016) and payment-gateway work, alongside today's INC-002 follow-up items.
**Contributors required before Stage 2:** `solution-architect` (scope note, running in parallel),
`ux-researcher`/`ui-designer`, `frontend-engineer` (lead implementation), `authentication-engineer`
(consulting only — owns any backend-contract gap if found), `cybersecurity-architect` (Stage 8),
`qa-architect` (Stage 10).
**Status:** Draft — two confirmed, never-built gaps, verified against code before filing:

1. **No web UI exists for accepting a staff/admin invitation and enrolling MFA.** The backend
   contract already exists (`backend/src/routes/invitations.ts`, `backend/src/routes/mfa.ts`) and
   mobile has a working reference implementation (`mobile/app/invitations/accept.tsx`,
   `mobile/app/(app)/mfa-enroll.tsx`) — but no equivalent screen exists anywhere under `src/admin/`
   or `src/security/` on web.
2. **No web UI exists for *sending* such an invitation in the first place**, on either surface —
   mobile has no invite-send screen either; this half has no reference implementation to port from
   at all, only the backend route.

---

## 0. Scope

This feature packages both gaps as one delivery unit because they are two ends of the same
workflow (an admin/staff invitation lifecycle) and share the same backend contract
(`invitations.ts`, `mfa.ts`) and the same consuming surfaces (Admin Dashboard `src/admin/`,
Security Company Dashboard `src/security/`). Splitting them into separate features would create an
artificial sequencing dependency (accept-side is useless without a send-side, and vice versa) for
no delivery benefit.

**In scope:**
- Web UI: initiate a staff/admin invitation (role selection, target email, revoke/resend an
  outstanding invitation) — new build, no reference implementation.
- Web UI: accept an invitation (token validation, expired/used-token handling) and enroll MFA
  (QR code + manual-secret fallback, code entry, recovery-code display) — new build, porting the
  proven UX pattern from `mobile/app/invitations/accept.tsx` / `mobile/app/(app)/mfa-enroll.tsx`
  into the web design-system idiom, not a blind copy of mobile markup.

**Out of scope (flagged, not resolved here):**
- Any change to the backend contract itself. This document assumes `invitations.ts` / `mfa.ts` are
  sufficient; `authentication-engineer` is looped in as consulting specifically to confirm or
  refute that assumption, not to build new backend surface as a default.
- Privileged **password reset** — see §2, blocked on a separate, pre-existing open item.

---

## 1. Why this ranks ahead of KYC / payment-gateway work

CTO directive: this is an internal-control gap (no way to safely onboard or offboard privileged
staff/admin access on web, the primary surface those roles actually use) rather than a
customer-facing feature gap. Per standing practice on this platform (see INC-002 governance
threads), access-control gaps for privileged accounts are treated as higher-urgency than
incremental product surface (KYC, payments) because they carry standing risk for as long as they
remain unaddressed, independent of feature velocity elsewhere.

---

## 2. Critical dependency — flagged, not re-investigated here

The **privileged password-reset** half of this problem space is only meaningful once
Resend/Supabase Send-Email-Hook email delivery is owner-confirmed working in production. That is a
**pre-existing, separate open item** (tracked elsewhere per `HANDOFF.md` / root `CLAUDE.md`'s
"Not built" list — production email delivery confirmation, Resend owner action). This document
does not reopen or redo that investigation. It is noted here only because invitation-acceptance
emails (the invite-send half of this feature) ride the same delivery channel — if that channel is
not yet owner-confirmed, invite-send's *email dispatch* step inherits the same open risk, even
though the UI work itself is not blocked on it. `solution-architect`/`frontend-engineer` should
build against the existing email-send mechanism without assuming its production delivery is
proven.

---

## 3. Sequencing (CTO-specified, restated for the record)

1. `solution-architect` — scope note (parallel to this filing).
2. `ux-researcher`/`ui-designer` — web enrollment UX: QR code + manual-secret fallback, code entry,
   recovery-code display, expired/used-token error states, rate-limit error states.
3. `frontend-engineer` — lead implementation (both invite-send and invite-accept/MFA-enroll
   screens).
4. `authentication-engineer` — consulting only; owns any backend-contract gap *if found* against
   `invitations.ts`/`mfa.ts` — not assumed to be needed.
5. `cybersecurity-architect` — Stage 8 (hard gate).
6. `qa-architect` — Stage 10 (hard gate).

No stage in this sequence may be skipped per `docs/organization/02-feature-lifecycle.md`.

---

## 4. Acceptance criteria (high-level — Stage 2 to detail further)

1. **AC-1.** An authorized admin can send a staff/admin invitation from the web Admin Dashboard,
   selecting a role, without needing mobile or a backend/API client.
2. **AC-2.** An authorized admin can view outstanding invitations and revoke or resend one from the
   web Admin Dashboard.
3. **AC-3.** An invited user can accept their invitation from a web link and enroll MFA (QR + manual
   secret fallback) without needing the mobile app, mirroring the mobile reference flow's security
   properties (recovery codes shown once, expired/used-token handled distinctly from generic error).
4. **AC-4.** Expired-token, already-used-token, and rate-limited attempts each show a distinct,
   actionable error state — not a generic failure message.
5. **AC-5.** No new backend route is introduced unless `authentication-engineer` identifies a real
   contract gap against `invitations.ts`/`mfa.ts` during Stage 2/3 — this is a UI-delivery feature
   by default, not a backend feature.

---

## 5. Stage-gate status

- **Stage 1 (this document):** drafted.
- **Next:** `solution-architect` scope note (parallel), then Stage 2 product planning.
- **Hard gates carried forward, not to be skipped:** Stage 8 (`cybersecurity-architect`), Stage 10
  (`qa-architect`), per `docs/organization/02-feature-lifecycle.md`.

---

**Filed by:** `business-analyst`, 2026-09-23.
