# Feature 007 — Notifications & Communications (Email, Push, SMS)

**Lifecycle stage:** 1–3 (Discovery / Product Planning / Architecture) — blueprint only; **not implemented** except auth email.  
**Status:** **Master catalogue ratified for planning** — implementation is a separate workstream.  
**Owner:** `notification-engineer` (implementation) · **Architecture:** `integration-architect` + `backend-architect` · **Compliance gate:** `compliance-specialist`  
**Date:** 2026-08-13

---

## Honesty about current state

| Capability | Status |
|---|---|
| **Auth transactional email** (signup, reset, invite, magic link, OTP) | **SHIPPED** — Supabase `auth-send-email` → Resend; branded templates in `supabase/functions/auth-send-email/` |
| **Push token registration API** (`PUT/DELETE /devices/push-token`) | **SHIPPED** — MongoDB `device_push_tokens`; customer-only |
| **Notification preferences API** (`GET/PATCH /notifications/preferences`) | **SHIPPED** — defaults per category; theft_critical push cannot self-disable |
| **Mobile push registration** (Expo token upload on app entry) | **SHIPPED** — `mobile/src/notifications/`; requires EAS `projectId` for token |
| **Push delivery / event emitters** | **PARTIAL** — Expo send adapter; theft case create + test endpoint wired |
| **SMS** | **NOT BUILT** — vendor not selected |
| **Notification service / event bus** | **NOT BUILT** |
| **Preference center UI** | **NOT BUILT** — API only |
| **Payment / GPS / claims / recovery notifications** | **NOT BUILT** — upstream features incomplete |

Do not describe any row marked **PLANNED** or **BLOCKED** as live product behaviour.

---

## Agent team & deliverables

This feature was analysed by the roles below. Each section in the master matrix maps to an owning agent.

| # | Agent role | Scope | Deliverable in this feature |
|---|---|---|---|
| 1 | **Email Architecture** (`notification-engineer` + `integration-architect`) | Catalogue, priorities, channels, dedup, naming | [`notification-architecture.md`](notification-architecture.md) |
| 2 | **Customer Lifecycle** (`product-manager` + `business-analyst`) | Registration → cancellation | Matrix § Customer Account, Onboarding, Support |
| 3 | **Asset & Device** (`gps-integration-engineer` + `database-architect`) | Asset + GPS hardware events | Matrix § Assets, GPS / Tracking |
| 4 | **Insurance & Policy** (`business-analyst`) | Policy lifecycle | Matrix § Insurance — **unknown rules flagged** |
| 5 | **Payment & Subscription** (`payment-engineer`) | Billing events | Matrix § Payments — **gateway not chosen** |
| 6 | **Security & Recovery** (`gps-integration-engineer` + `cybersecurity-architect`) | Theft/recovery | Matrix § Security / Recovery |
| 7 | **Account & Security** (`authentication-engineer`) | Auth security alerts | Matrix § Authentication |
| 8 | **Claims** (`business-analyst`) | Claims lifecycle | Matrix § Claims — **not built** |
| 9 | **Admin** (`reporting-engineer` + `backend-engineer`) | Internal ops | Matrix § Administration |
| 10 | **Security Company** (`gps-integration-engineer`) | Partner ops | Matrix § Security Company |
| 11 | **System & DevOps** (`site-reliability-engineer` + `devops-engineer`) | Platform alerts | Matrix § Technical |
| 12 | **Compliance & Privacy** (`compliance-specialist`) | POPIA, retention, content rules | [`compliance-review-notifications.md`](compliance-review-notifications.md) |
| 13 | **UX & Content** (`ui-designer` + `technical-writer`) | Template UX, copy | [`email-template-catalogue.md`](email-template-catalogue.md) + push copy in [`push-notifications-spec.md`](push-notifications-spec.md) |

**Orchestrator:** `cto` — cross-cutting priorities, channel policy, implementation sequencing.

---

## Document index

| Document | Purpose |
|---|---|
| [`master-notification-matrix.md`](master-notification-matrix.md) | **Primary deliverable** — event × recipient × channel matrix |
| [`notification-architecture.md`](notification-architecture.md) | Event-driven design, naming, dedup, logging, failure handling |
| [`push-notifications-spec.md`](push-notifications-spec.md) | **Mobile app push** — Expo, channels, payloads, deep links |
| [`email-template-catalogue.md`](email-template-catalogue.md) | Email template IDs, variables, UX structure |
| [`compliance-review-notifications.md`](compliance-review-notifications.md) | POPIA/compliance flags — **not legal sign-off** |

---

## Implementation sequencing (recommended)

1. **Notification platform MVP** — event schema, queue, delivery log, preference API (`notification-engineer`)
2. **Push registration** — mobile token upload, Expo push send (`mobile-engineer` + `notification-engineer`)
3. **Auth security pushes** — new device login, password changed (`authentication-engineer`)
4. **Policy/asset transactional** — aligns with Feature 004/006 completion
5. **Payment notifications** — after gateway ADR (`payment-engineer`)
6. **GPS/theft critical path** — after ping ingestion (`gps-integration-engineer`) — **highest business value push surface**
7. **Claims, admin digests, marketing** — later phases

**Test debt against the sequencing above (`qa-architect`, 2026-08-13):** steps 1–3 have already
shipped code (this table's "SHIPPED" rows) ahead of a Stage 10 QA pass. Concretely:
`backend/src/routes/notifications.test.ts` gives adequate route-level coverage of push-token
registration and preferences (RBAC boundary, `theft_critical` non-disable rule, revoke-on-logout
all covered). What's **not** covered: `push-notification-service.ts`'s orchestration (preference
gating + invalid-token disable loop) has no direct test; the mobile push registration hook
(`mobile/src/notifications/usePushNotifications.ts`) and deep-link handler have zero test files;
and `push-tokens.ts`'s `disableAllForAccount()` is dead code — nothing calls it, so there is no
account-lifecycle event (deletion, forced logout, MFA reset) that bulk-clears a customer's push
tokens, which is worth a compliance/product decision before step 6 (theft-critical push, the
highest-stakes channel) goes further. Full detail and a broader onboarding-adjacent audit is in
[`006-customer-onboarding/qa-test-strategy.md`](../006-customer-onboarding/qa-test-strategy.md)
§3.3/§3.5, since onboarding is what actually exercises push registration end-to-end today. Do not
treat "SHIPPED" in the table above as "QA-verified" — it means the code path exists and passes
CI, not that Stage 10 has signed off on it.

---

## Related code (today)

- Auth email: `supabase/functions/auth-send-email/`
- Resend setup: `docs/features/001-authentication/resend-setup.md`
- Push token API: `backend/src/routes/notifications.ts`, `backend/src/repositories/push-tokens.ts`
- Mobile push client: `mobile/src/notifications/push.ts`, `mobile/src/api/notifications.ts`
- Mobile deep links: `tditinsurance://` scheme in `mobile/app.json` / route handlers
- Recovery scaffold (no notifications wired): `backend/src/routes/recovery.ts`
