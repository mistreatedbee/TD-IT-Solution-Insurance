# Feature 006 — Security Review (Stage 8), Customer Onboarding & Plan Catalog

**Status:** **SUPERSEDED BY [§7](#7-re-verification-follow-up--2026-08-13-post-remediation) — now SIGN-OFF GRANTED WITH REQUIRED CHANGES** (re-verified 2026-08-13 after remediation; `security-engineer` and `compliance-specialist` concurrence still outstanding).
*Original status, retained as the record of the gate as chaired:* **BLOCKED — SIGN-OFF WITHHELD.** Merge and continued development are not blocked; **exposing this surface to any real customer account is.**
**Date:** 2026-08-13
**Lifecycle stage:** 8 — Security Review. **Chair / decision owner (A):** `cybersecurity-architect`.
**Joint gate:** `security-engineer` (R — concurrence not given) · `compliance-specialist` (C — not given).
**Reviewed against:** [`06-security-standards.md`](../../organization/06-security-standards.md) · [Feature 004 `security-review.md`](../004-policy-asset-management/security-review.md) and [`security-review-admin-surface.md`](../004-policy-asset-management/security-review-admin-surface.md) (precedent and bar) · [Feature 001 `security-review.md`](../001-authentication/security-review.md) (AC-5 anti-enumeration, SR-14(a) MFA) · ADR-0002 · ADR-0006 · `HANDOFF.md` MP-1…MP-8.

**Running code read (2026-08-13):**
`backend/src/routes/plans.ts`, `admin-plans.ts`, `policies.ts`, `assets.ts`, `auth.ts`; `backend/src/repositories/plan-catalog.ts`, `policies.ts`; `backend/src/lib/plan-enforcement.ts`, `validation.ts`, `account-gate.ts`, `policy.ts`; `backend/src/middleware/require-role.ts`, `authenticate.ts`; `backend/src/db/supabase.ts`, `mongo-bootstrap.ts`; `backend/src/index.ts`;
`src/pages/onboarding/CustomerOnboardingPage.tsx`, `src/onboarding/onboardingStorage.ts`, `src/customer/auth/CustomerAuthProvider.tsx`, `src/customer/supabase/auth.ts`, `src/dashboard/auth/DashboardAuthProvider.tsx`;
`mobile/src/screens/onboarding/CustomerOnboardingScreen.tsx`, `mobile/src/onboarding/onboardingStorage.ts`.

---

## 0. Verdict

**BLOCKED.** Sign-off is withheld for Feature 006.

This gate is being chaired **after** the code shipped, not before it. `docs/features/006-customer-onboarding/` contains `business-requirements.md`, `ui-design.md` and `ux-research-notes.md` and no Stage 5/7 artefact and no Stage 8 record, while `/get-started` (web), the mobile onboarding wizard, `GET /v1/plans*`, `GET/PATCH /v1/admin/plans*`, a plan-linked `POST /v1/policies`, and new `PATCH`/`DELETE /v1/assets/{id}` routes are all live and mounted (`backend/src/index.ts:104-114`). That is a Stage 8 bypass under `02-feature-lifecycle.md`, and this document is the retrospective gate, not a ratification of the bypass.

**Most of the backend design is good, and it is worth saying so before the findings.** Pricing is server-authoritative — `POST /v1/policies` accepts only a `planCatalogId` and derives `planTier` and `monthlyAmountCents` from the catalog (`backend/src/routes/policies.ts:18-20`, `:46-60`), so a client cannot name its own price. `validateBody` replaces `req.body` with the Zod-parsed object (`backend/src/lib/validation.ts:17`), so `updateById`'s `$set: {...patch}` (`backend/src/repositories/plan-catalog.ts:172-176`) cannot receive attacker-chosen document keys — the obvious NoSQL-injection shape is structurally closed, not merely unexploited. Every new route carries an explicit limiter per MP-7 except the one named in SR-006-2. Admin plan routes do carry `requireUserType('admin')` (`backend/src/routes/admin-plans.ts:33-34`, `:52-53`) — the authz middleware the task asked me to check is present and correct.

**What blocks.** Two findings, both on the authentication path this wizard newly makes reachable by ordinary customers in a browser:

- **SR-006-1 — MFA is bypassable on the customer web surface.** `POST /auth/supabase/exchange` mints a full backend session from a password-only Supabase session and never checks for a verified TOTP factor (`backend/src/routes/auth.ts:321-427`, `mfaVerifiedAt: null` at `:403`), while `POST /auth/login` refuses to mint one for an account with a verified factor and issues a challenge instead (`:535-582`). A customer who enrolled MFA is protected on mobile and not protected on the web. Account takeover on this platform is the scenario that ends with an attacker reading where a customer's vehicle physically is; a password-only path around the second factor is not a residual risk I can accept.
- **SR-006-2 — account-existence oracle.** `POST /auth/notify-email-verified` is unauthenticated and returns three distinguishable states for any address (`unknown` `:250-253`, `pending_verification` `:266-269`, `already_verified` `:301-304`), with a **per-email** cooldown only (`:230-237`) and no IP-scoped limiter. Feature 001 spent AC-5 making signup and login non-enumerable; this endpoint hands the answer back, and it is called from the browser on every sign-up attempt (`src/customer/supabase/auth.ts:129`).

**Route to a conditional sign-off:** close SR-006-1 and SR-006-2, obtain `security-engineer` concurrence on both, and this verdict converts to *sign-off granted with required changes* for the remaining items. Nothing in the plan-catalog or wizard design needs to be redesigned.

---

## 1. Threat model — onboarding and plan catalog

**New assets protected by this feature:** the customer web session (a browser-resident session that did not exist before this pull), the plan catalog (commercial configuration: prices, device limits, active/inactive), and asset-identifier drafts held client-side mid-wizard (VIN, IMEI, serial, licence plate) plus mobile signup PII (first name, last name, mobile number).

**Trust boundaries, new or changed:**

| # | Boundary | Posture |
|---|---|---|
| B1 | Browser → Supabase GoTrue **directly** (`signUp`, `signInWithPassword`, `resetPasswordForEmail`, `verifyOtp`) | Anon key in the browser; the backend is not in this path. **New** — the mobile app never had it. |
| B2 | Browser → `POST /auth/supabase/exchange` → backend session | Unauthenticated route that mints a first-class backend session. **The whole customer web trust chain rests here.** SR-006-1. |
| B3 | Browser localStorage → refresh token | Long-lived credential in XSS-readable, origin-persistent storage. SR-006-3. |
| B4 | Unauthenticated internet → `GET /v1/plans/catalog` | Public by design (pre-signup marketing). IP-limited 60/60s (`backend/src/routes/plans.ts:18`). Adequate. |
| B5 | Admin browser → `PATCH /v1/admin/plans/{planId}` | Authenticated + `admin` role. **Privileged write with commercial effect and no audit record.** SR-006-4. |
| B6 | Wizard client storage (web `sessionStorage`, mobile `AsyncStorage`) → asset identifiers + PII | Plaintext, not account-scoped, not cleared on sign-out. SR-006-5. |

### 1.1 T-1 — Account takeover through the new web auth path *(highest severity)*

```
Goal: read a customer's registered assets (and, once GPS ships, their live location)
├── (a) Obtain password  [phishing, credential stuffing, reuse]
│   ├── mobile app → /auth/login → verified TOTP factor found → challenge issued   ✔ blocked (auth.ts:535-582)
│   └── web wizard  → Supabase signInWithPassword (AAL1) → /auth/supabase/exchange
│       └── GoTrue /user succeeds at AAL1; no factor lookup; session minted        ✖ SR-006-1
├── (b) Confirm the target has an account before spending attempts
│   └── POST /auth/notify-email-verified → three-state answer, per-email limit only ✖ SR-006-2
├── (c) Steal the session from the browser
│   └── refresh token in localStorage, readable by any script on the origin         ✖ SR-006-3
└── (d) Reach data through the API
    └── customer routes are accountId-scoped from the JWT (Feature 004 §2.1)        ✔ inherited
```

Branch (a) is the live one. `getUserFromAccessToken` (`backend/src/db/supabase.ts:377-389`) calls GoTrue `/user` and returns `{id, email, emailConfirmed}` — it does not read `aal`, does not enumerate factors, and GoTrue answers this call happily for an AAL1 token. The exchange route then checks `userType === 'customer'` (`auth.ts:358`, which correctly keeps privileged accounts off this path), account state, and mints. There is no equivalent of SR-14(a)'s `findVerifiedTotpFactor` guard anywhere on the exchange path. The web client's own code confirms the intent was never to support MFA here: `loginWithPassword` only ever returns `{kind:'tokens'}` and the page's `else` branch tells the user to "use the mobile app" (`src/pages/onboarding/CustomerOnboardingPage.tsx:152-159`).

**I am not asserting when this route was introduced** — I cannot read history from this working tree, and Feature 001's `security-review.md` predates any customer web surface. What I can assert is that Feature 006 is the feature that makes it the ordinary sign-in path for ordinary customers, so it is in scope for this gate regardless of authorship.

### 1.2 T-2 — Plan catalog integrity (Tampering / Repudiation)

`PATCH /v1/admin/plans/{planId}` can set `monthlyAmountCents` to `0`, flip `isCustomPricing`, raise `maxAssets`, or activate/deactivate a plan (`backend/src/routes/admin-plans.ts:15-25`, `:50-75`). It is authenticated, role-gated and rate-limited — and it **writes no audit record of any kind**. Compare the same directory's read-only `GET /v1/admin/policies`, where a *read* produces N+1 `admin_access_log` rows (`backend/src/routes/admin-policies.ts:71-81`). The platform can currently reconstruct which admin *looked at* a policy and not which admin *changed the price of every plan*. ADR-0006's Trail A has `privilege_granted` for privilege-granting actions and Trail B for disclosures; a privileged **configuration mutation** falls in neither, and that gap is the finding, not a missing line of code. SR-006-4.

Second-order: the catalog is a live-read dependency of `POST /v1/policies` and of `assertAssetRegistrationAllowed`, so a catalog write silently changes entitlement for every existing customer with no versioning and no history collection.

### 1.3 T-3 — Entitlement bypass (plan limits are not authoritative)

`assertAssetRegistrationAllowed` reads **one** policy — `listByAccount(accountId, 1, null)` (`backend/src/lib/plan-enforcement.ts:11-13`) — and `listByAccount` sorts newest-first (`backend/src/repositories/policies.ts:140`). `POST /v1/policies` imposes no cap on how many policies an account may hold. So a customer on Starter (`maxAssets: 5`) creates a second Standard policy and their effective limit becomes 10, self-service, instantly.

Financial impact **today is nil** — nothing charges money, `billingStatus` is `not_configured`, and the wizard says so honestly (`CustomerOnboardingPage.tsx:552-554`, `:572-575`). This is filed because the moment `payment-engineer` wires a gateway to `monthlyAmountCents`, this becomes a paid-entitlement bypass with no code change required to exploit it. SR-006-6.

### 1.4 T-4 — Client-side residue of asset identifiers and PII

Precedent already exists on this platform: SR-004-admin-10(c) forbids client-side persistence of customer policy/asset data on the admin surface. The customer surfaces now do it:

- Web: `sessionStorage['td-onboarding-asset-draft']` holds the raw asset field map — VIN / IMEI / serial / licence plate depending on type (`src/onboarding/onboardingStorage.ts:75-90`, written on every keystroke at `CustomerOnboardingPage.tsx:513-517`). Cleared on successful registration (`:217`) and **not** on abandonment, sign-out, or account switch.
- Mobile: the same draft in `AsyncStorage` (`mobile/src/onboarding/onboardingStorage.ts:73-88`) — unencrypted, included in device backups, and **not** account-scoped or cleared on sign-out. Plus `td-signup-profile-draft` holding first name, last name and mobile number in the same store (`:42-58`), while Feature 001 deliberately puts session material in `SecureStore`.

Consequence, concretely: a shared or handed-on device pre-fills the next person's asset form with the previous person's VIN.

### 1.5 T-5 — Session storage asymmetry between surfaces

The privileged dashboard keeps its token in `sessionStorage` (`src/dashboard/auth/DashboardAuthProvider.tsx:39-50`). The customer surface keeps the **refresh** token in `localStorage` (`src/customer/auth/CustomerAuthProvider.tsx:16`, `:38`, `:45`) — the longer-lived credential, in the more persistent, XSS-readable store. Mobile uses `SecureStore`. Three surfaces, three postures, no ADR choosing between them. This is exactly the "architecture drift" risk this role monitors. SR-006-3.

### 1.6 T-6 — MP-5 breach: camera and media-library capture with no storage vendor

`mobile/src/screens/onboarding/CustomerOnboardingScreen.tsx:240-255` requests **camera** and **full media-library** permission and captures up to four images; `:744-777` renders the step, with copy stating "Photo upload to your policy will be available in a future update. Images are stored on this device for now."

MP-5 is explicit: no object-storage provider has been selected, the decision carries a POPIA transborder question, and "the mobile form must not show a disabled camera affordance implying it's coming next week." The shipped code goes further than the thing MP-5 prohibited — it is an *enabled* affordance. Nothing leaves the device (URIs live in component state only), so there is no data-flow exposure today; the finding is (a) an unnecessary high-sensitivity permission grant for a capability that does nothing, and (b) a user expectation of insurance-relevant photo evidence that the platform cannot honour. SR-006-7.

### 1.7 T-7 — Public catalog endpoint

`GET /v1/plans/catalog` is unauthenticated by design and returns marketing data only, IP-limited at 60/60s (`backend/src/routes/plans.ts:16-27`). **No finding.** Recorded here so the first unauthenticated non-auth data endpoint on the platform is a documented decision rather than an unnoticed one. `clientIp()` accuracy depends on `trustProxyHops` in the deployed environment — the same open verification as SR-004-admin-8.

---

## 2. Controls verified in code

| Control | Required by | Implementation | Status |
|---|---|---|---|
| Server-authoritative pricing / tier | this review | `POST /policies` takes `planCatalogId` only; price and slug read from catalog | ✔ `routes/policies.ts:18-20`, `:46-60` |
| Custom-pricing plans cannot self-serve | this review | `PLAN_REQUIRES_QUOTE` on `isCustomPricing` | ✔ `routes/policies.ts:52-54` |
| Request body key allow-listing before `$set` | this review | `validateBody` assigns `result.data`; Zod strips unknown keys | ✔ `lib/validation.ts:17` |
| `ObjectId` validation before catalog lookup/update | this review | `ObjectId.isValid` guards in every repo method | ✔ `repositories/plan-catalog.ts:142`, `:148`, `:170` |
| Admin role gate on catalog management | ADR-0006 C4/C8 precedent | `requireUserType('admin')` on both routes | ✔ `routes/admin-plans.ts:33-34`, `:52-53` |
| Explicit per-route rate limiter | MP-7 | present on `/plans`, `/plans/catalog`, `/admin/plans*`, `/policies*`, `/assets*` | ✔ / ✖ **not** on `/auth/notify-email-verified` (SR-006-2) |
| Live account gate (BR-2) on writes | Feature 004 §4.3 | `requireActiveAccount` on policy create, asset create/update/delete | ✔ |
| Idempotency on create | Feature 001 mechanism | `requireIdempotencyKey` on `POST /policies`, `POST /assets` | ✔ |
| IDOR: cross-account read → 404 | Feature 004 §2.1 | `findByIdForAccount(accountId, id)` everywhere on customer routes | ✔ |
| Privileged account excluded from web exchange | this review | `userType !== 'customer'` → `INVALID_CREDENTIALS` | ✔ `routes/auth.ts:358-361` |
| MFA enforced on session mint | Feature 001 SR-14(a) | enforced on `/auth/login`; **absent** on `/auth/supabase/exchange` | ✖ **SR-006-1** |
| Anti-enumeration on unauthenticated identity endpoints | Feature 001 AC-5 | three-state answer, per-email limit only | ✖ **SR-006-2** |
| Audit trail on privileged configuration writes | ADR-0006 (by analogy) | none on `PATCH /admin/plans/{id}` | ✖ **SR-006-4** |
| Client-side persistence of asset identifiers | SR-004-admin-10(c) precedent | web `sessionStorage`, mobile `AsyncStorage`, uncleared | ✖ **SR-006-5** |
| Session credential storage posture | this review | three surfaces, three stores, no ADR | ✖ **SR-006-3** |

---

## 3. Required changes

**Blocking — these two must close before this surface is exposed to any real customer account:**

| ID | Item | Owner |
|---|---|---|
| **SR-006-1** | **Close the MFA bypass on `POST /auth/supabase/exchange`.** The exchange must apply the same SR-14(a) discipline as `/auth/login`: if the account has a verified TOTP factor, do not mint a session — return an MFA challenge and require `POST /mfa/verify` before tokens are issued; if `mfa_required` and no factor exists, return the enrollment ticket. The web client must handle both branches instead of telling the user to go use the mobile app (`CustomerOnboardingPage.tsx:157-159`). Verifying the incoming Supabase token's `aal` claim is an acceptable mechanism **in addition to**, not instead of, a server-side factor lookup — the client chooses which token it sends. | `authentication-engineer` (design) + `backend-engineer` (code), verified `security-engineer` |
| **SR-006-2** | **Remove the account-existence oracle at `POST /auth/notify-email-verified`.** Collapse the response to a single non-committal shape for all three states (Feature 001 AC-5 precedent: `202` + "if this account needs verifying, check your inbox"), and add an **IP-scoped `createRateLimiter`** alongside the per-email cooldown per MP-7 — the current per-email bucket bounds abuse of one victim and does nothing against enumeration across many. Note this endpoint also triggers `markEmailVerified` and outbound mail for an arbitrary unauthenticated address; the state-change side effect needs to be justified in the same change or moved behind the verification-link flow. | `authentication-engineer` + `backend-engineer`, verified `security-engineer` |

**Required before go-live (not blocking merge):**

| ID | Item | Owner |
|---|---|---|
| **SR-006-3** | **Choose one session-credential storage posture per surface class and record it in an ADR.** Customer web currently holds the refresh token in `localStorage` while the privileged dashboard uses `sessionStorage`. My architectural position: the refresh token must not sit in `localStorage`; the acceptable targets are an `HttpOnly; Secure; SameSite` cookie (preferred — takes the credential out of script reach entirely) or in-memory + `sessionStorage`, matching the dashboard. Whatever is chosen, both web surfaces state the same rule. | `frontend-architect` + `authentication-engineer`, ruled `cybersecurity-architect` |
| **SR-006-4** | **Audit `PATCH /v1/admin/plans/{planId}`.** A privileged mutation of commercial configuration must be attributable: actor account, actor session, `auditRequestId`, plan id, and before/after values for the changed fields, written before the response, fail-closed, matching the ordering discipline in `admin-policies.ts`. Decide with `backend-architect` whether this is a new ADR-0006 Trail A event type or a Trail-B-shaped configuration-change collection — do not invent a third untracked persistence surface (ADR-0006 R-4 / FU-08 applies). Also add step-up re-authentication for catalog writes, and reject an empty patch body (`updatePlanSchema` currently accepts `{}`). | `backend-architect` + `cybersecurity-architect` (event design), `backend-engineer` (code) |
| **SR-006-5** | **Client-side draft hygiene.** (a) Clear the asset draft and signup-profile draft on sign-out and on account switch, on both web and mobile; (b) key the drafts to the authenticated account so one user's draft can never pre-fill another's form; (c) do not persist identifier fields (VIN / IMEI / serial / licence plate) at all — persist step position and non-identifying fields only; (d) mobile signup PII (name, mobile number) must not sit in plain `AsyncStorage` while session material uses `SecureStore`. | `frontend-engineer` + `mobile-engineer`, reviewed `cybersecurity-architect` |
| **SR-006-6** | **Make plan-limit enforcement authoritative before payments ship.** `assertAssetRegistrationAllowed` reads only the newest policy and nothing caps policies per account, so a customer can self-upgrade their asset limit. Requires a product rule (one active policy per account? highest-tier-wins? per-policy asset attribution?) from `product-manager` and then real enforcement. **This must close before `payment-engineer` connects any gateway to `monthlyAmountCents`.** | `product-manager` (rule) + `backend-architect` (enforcement) |
| **SR-006-7** | **Remove the asset-photo capture step until MP-5's object-storage decision lands** (or gate it behind a build flag that is off in every distributed build). Requesting camera and full media-library permission for a capability that stores nothing is unjustifiable permission scope and sets an evidentiary expectation the platform cannot meet. Re-review jointly with `integration-architect` when a vendor exists — photos of insured assets are personal information and carry the transborder question MP-5 named. | `mobile-engineer` + `product-manager`; ruling `cybersecurity-architect` (MP-5 is a `cto` ruling — escalate if the product wants it kept) |

**Governance items this gate must record (not security findings, but they belong to a Stage 8 record):**

| ID | Item | Owner |
|---|---|---|
| **SR-006-8** | **Contract drift.** `POST /v1/policies` no longer matches the ratified `004/api-design.md` §6.1 (`planTier` free-form string per MP-3); it now takes `planCatalogId` and returns `PLAN_REQUIRES_QUOTE` / `ASSET_LIMIT_REACHED`. `PATCH /v1/assets/{id}` and `DELETE /v1/assets/{id}` are new endpoints that exist in no ratified contract (P-15 recorded asset edit/delete as never designed) and carry **no audit record when an asset's identifying details change** — for an insurance platform, post-hoc mutation of VIN/serial is an anti-fraud concern in its own right. Amend `api-design.md` and file the asset-mutation audit question. | `backend-architect` |
| **SR-006-9** | **MP-3 supersession.** MP-3 forbade plan tiers, pricing and tier-comparison UI until commercial rules were ratified; a seeded catalog with real ZAR prices (`repositories/plan-catalog.ts:62-108`) and a three-plan picker have shipped on both clients. Either `cto` supersedes MP-3 on the record or the pricing UI comes down. I have no authority over the commercial call and am not making one — I am refusing to let it stay undocumented. | `cto` + `product-manager` |
| **SR-006-10** | **Missing Stage 5/6/7 artefacts.** Feature 006 has no architecture review, no database design (the `insurance_plan_catalog` collection is created by a repo-level `ensureSeeded()` with no validator and no bootstrap entry — unlike every Feature 004/007 collection), and no api-design. `database-architect` should bring the catalog collection under ADR-0008's provisioning mechanism with a `$jsonSchema` validator. | `database-architect` + `backend-architect` |
| **SR-006-11** | **Stage 10 abuse cases derived from this threat model:** MFA-enrolled customer cannot obtain a session via the web path; `notify-email-verified` returns an identical response for existing-verified / existing-unverified / non-existent addresses; second policy does not raise the asset limit (SR-006-6); `PATCH /admin/plans` rejected for `customer`, `support_agent`, `security_company_operator`; catalog `$set` cannot write an unlisted field; asset draft absent after sign-out. | `qa-architect` + `automation-qa-engineer` |

---

## 4. Residual risks accepted for this phase

| Risk | Why accepted | Owner / trigger |
|---|---|---|
| Browser talks to Supabase GoTrue directly (B1), so signup/reset rate-limiting and lockout are GoTrue's, not the backend's | Ratified consequence of ADR-0002's identity split; the backend exchange is still the only way to obtain platform authority | `authentication-engineer` if GoTrue-side limits prove insufficient |
| Anon Supabase key is present in the web bundle | Inherent to the Supabase browser SDK; it is a public key, not a secret. **Verify the service-role key is not in the bundle** — `security-engineer`, one grep | `security-engineer` |
| Plan catalog has no version history; a price edit changes entitlement for existing policies immediately | No billing exists yet; becomes material with payments | `payment-engineer` at gateway selection |
| Same Atlas database backs dev and prod (MP-8) — now also holds the plan catalog | Pre-existing; staging required before go-live | `devops-engineer` + `cloud-infrastructure-architect` |
| Bounded-staleness JWT claims (≤10 min) on customer reads | Feature 001 §4.3 ratified | — |

**Explicitly not accepted, and therefore not in this table:** SR-006-1 and SR-006-2. Per this role's standing rule, silent risk acceptance is not permitted, and neither is loud acceptance of an authentication-control bypass on a platform whose takeover scenario ends in physical asset location.

---

## 5. Out of scope

- Feature 007 notifications — separate gate at [`../007-notifications/security-review.md`](../007-notifications/security-review.md).
- Feature 004 admin policy/asset routes and `admin_access_log` — governed by [`security-review-admin-surface.md`](../004-policy-asset-management/security-review-admin-surface.md); SR-004-admin-2/4/5(d) remain open there.
- Legal basis, RoPA entries, consent-record design for the wizard's terms/privacy checkbox (`CustomerOnboardingPage.tsx:328-339`) — `compliance-specialist`. This gate records only that the acceptance is **not persisted anywhere**, which is a fact about the code, not a legal conclusion.
- Payments, GPS pairing, claims, penetration testing.

---

## 6. Sign-off record

| Role | Status | Date |
|---|---|---|
| `cybersecurity-architect` (Stage 8 chair) | **BLOCKED — sign-off withheld.** SR-006-1 and SR-006-2 blocking; SR-006-3…11 required | 2026-08-13 |
| `security-engineer` | **Concurrence required and not given** | — |
| `compliance-specialist` | **Concurrence required and not given** | — |

**What "blocked" means operationally,** using the same distinction `security-review-admin-surface.md` §6 drew: merging and continuing development is fine. Pointing this wizard at a Supabase project holding real customer accounts, or distributing a build that does, is a Stage 8 bypass until SR-006-1 and SR-006-2 close and `security-engineer` concurs. This project's stated success metric for this gate is zero bypasses; one has already occurred by shipping without the gate, and the correct response is to close the findings, not to backdate the approval.

**Signed:** `cybersecurity-architect` (designated Stage 8 chair), 2026-08-13.

---

## 7. Re-verification follow-up — 2026-08-13 (post-remediation)

*Appended, not substituted. §0–§6 above remain the record of the gate as it stood when it was chaired; this section records an independent re-read of the current source after `authentication-engineer`'s remediation and revises the verdict. Precedent for appending rather than editing: ADR-0006 §16/§17.*

**Revised verdict: BLOCKED → SIGN-OFF GRANTED WITH REQUIRED CHANGES.** Both blocking findings (SR-006-1, SR-006-2) are closed in code. SR-006-3…SR-006-11 remain open as before and are unaffected by this remediation. `security-engineer` and `compliance-specialist` concurrence is **still outstanding** — see §7.5, and note that a chair's sign-off is not the gate; the joint gate is.

**Code re-read for this section (2026-08-13):** `backend/src/routes/auth.ts` (`/auth/supabase/exchange` :335-486, `/auth/notify-email-verified` :217-323, `/auth/login` :498-641, `/auth/mfa/challenge` :647-716), `backend/src/lib/policy.ts:78-86`, `backend/src/db/supabase.ts:248-291`, `backend/src/lib/refresh-session.ts:96-131`, `backend/src/routes/auth.test.ts:393-707`; `src/customer/supabase/auth.ts`, `src/customer/auth/CustomerAuthProvider.tsx`, `src/pages/CustomerLoginPage.tsx:42-96`, `src/pages/CustomerAuthCallbackPage.tsx:51-68`, `src/pages/CustomerResetPasswordPage.tsx:45-54`, `src/pages/onboarding/CustomerOnboardingPage.tsx:147-165`.

### 7.1 SR-006-1 — MFA bypass on `POST /auth/supabase/exchange` — **CLOSED**

Verified against the running source, not the summary:

- `auth.ts:410` now calls `ctx.supabase.findVerifiedTotpFactor(accessToken)` **before** any session is minted, using the caller's own Supabase token as the user-scoped credential — the same mechanism and the same ordering as `/auth/login:589`.
- When a verified factor exists, the handler issues a GoTrue challenge and returns `{mfaRequired, mfaChallengeToken, expiresIn}` (`:471-481`) and **never reaches** `mintNewSession`. The mint call at `:432` is now inside the `if (!verifiedFactor)` branch. Confirmed by enumerating every `mintNewSession` call site in the backend: `auth.ts:432` (exchange, now factor-gated), `auth.ts:611` (login, gated), `auth.ts:700` (`/auth/mfa/challenge`, post-verification, `mfaVerifiedAt: new Date()`), `mfa.ts:208` (enrollment verify). There is no remaining unguarded customer session-mint path.
- The `mfa_required`-with-no-factor branch now issues an enrollment ticket (`:413-421`), matching SR-14(a)/login parity, rather than minting.
- Failure mode is **fail-closed**: `findVerifiedTotpFactor` throws `SupabaseUnavailableError` on any non-2xx from GoTrue and is not caught locally, so it propagates to the error handler — no session is issued when factor state cannot be determined.
- **The regression test would genuinely fail against the old behaviour**, which is the thing I said I would check rather than take a test name on trust. `auth.test.ts:482-524` asserts both the positive (`mfaRequired === true`, a non-empty `mfaChallengeToken`) *and* the negatives (`body.accessToken` and `body.refreshToken` are `undefined`). The pre-fix handler returned `{accessToken, refreshToken, expiresIn, sessionId}` unconditionally, so both negative assertions fail against it. The test then completes the challenge through the real `POST /auth/mfa/challenge` router and asserts tokens are issued only there — so it also proves the challenge is not a dead end. The paired baseline test (`:464-480`) pins the no-factor path so the fix cannot be "reject everything".

**Client side.** Every caller of the exchange now branches on the response shape instead of assuming tokens: `src/customer/supabase/auth.ts:84-100` discriminates `mfa` / `enrollment` / `tokens` and throws on anything else; `CustomerLoginPage.tsx:53-61` renders a real 6-digit code form and completes via `auth.completeMfa`; `CustomerAuthCallbackPage.tsx:54-62` redirects an MFA account to `/login` rather than failing open; `CustomerResetPasswordPage.tsx:46` handles the non-token branches. No client path treats a challenge response as a session.

**Residual (non-blocking), newly filed:**

| ID | Item | Owner |
|---|---|---|
| **SR-006-12** | **The MFA gate fails open if GoTrue ever stops returning `factors` on `GET /user` for a low-AAL token.** `findVerifiedTotpFactor` (`db/supabase.ts:275-291`) treats a `200` with an absent/empty `factors` array as "no factor enrolled", which is indistinguishable from "this token is not entitled to see factors". Today Supabase returns factors at AAL1 and the guard works; that is a vendor behaviour, not a contract we control, and the failure direction is a silent session mint. Add a defence that fails closed: assert the incoming token's `aal` claim and/or treat a response lacking the `factors` key (as opposed to an empty array) as indeterminate → refuse. This is the "in addition to, not instead of" point from SR-006-1's original wording, now the only part of it not implemented. | `authentication-engineer`, ruled `cybersecurity-architect` |
| **SR-006-13** | **UX dead-ends that will push users toward the weaker path.** `CustomerOnboardingPage.tsx:157-159` still tells an MFA-enrolled customer to "use the mobile app or contact support" even though `/login` now handles the challenge properly; and the web has no enrollment UI, so a `mfa_required` customer receives an enrollment ticket the browser cannot spend. Neither is a security hole — no session is issued in either case — but "the secure path is unusable" reliably becomes "turn MFA off". | `frontend-engineer` + `authentication-engineer` |

Observation, not a finding: sessions minted for `customer` accounts on the web still take the `customerMobile` surface (`auth.ts:44-46` → `refresh-session.ts:96-102`), so a browser session inherits mobile idle/absolute TTLs while its refresh token sits in `localStorage`. That is additional weight behind **SR-006-3**, which remains open.

### 7.2 SR-006-2 — account-existence oracle on `POST /auth/notify-email-verified` — **CLOSED**

- All three reachable branches — no Supabase user (`auth.ts:268-271`), user with unconfirmed email (`:284-287`), and the full sync/notify path (`:318`) — return the identical `NOTIFY_EMAIL_VERIFIED_ACCEPTED` object literal (`:231-233`) with status `202`. There is no `status` discriminator, no `confirmationEmailSent` flag, and no branch-specific error left on the route.
- The per-email cooldown (3 / 15 min, `:248-251`) is evaluated **before** any account lookup, so a `429` cannot itself signal account existence.
- The IP-scoped limiter is real and is registered as route middleware ahead of validation (`:237-241`), keyed `notify-verified:ip:${clientIp(req)}`, with the ceiling defined at `lib/policy.ts:83-86` (20 / 15 min). This is the MP-7 control the original finding said was missing.
- The browser-side enumeration vector is gone: `signUpWithSupabase` (`src/customer/supabase/auth.ts:151-185`) no longer prechecks the backend before calling Supabase; it branches on Supabase's own already-authenticated signals (`email_confirmed_at`, and the empty-`identities` anti-enumeration signal) and fires the backend ping only as a `void … .catch()` side effect it explicitly does not read.
- **Would the tests fail against the old code?** Yes. `auth.test.ts:639-668` asserts `bodies[0] === bodies[1] === bodies[2]` by deep equality across the unknown / pending / already-verified addresses and asserts the absence of the `status` and `confirmationEmailSent` keys — the pre-fix handler returned three distinct shapes, so this fails on all three assertions. `:686-706` sweeps 25 distinct addresses from one client and requires at least one `429`; against the pre-fix route (per-email cooldown only, distinct email per request) no request is ever limited, so it fails. `:670-684` correctly guards the opposite regression — that the uniform response did not quietly delete the legitimate side effect.

**Residual risks (documented, not silently accepted):**

| Risk | Assessment | Owner / trigger |
|---|---|---|
| **Timing side channel remains.** The unknown-address branch makes one upstream call; the already-verified branch makes four-plus, writes to Postgres, and sends mail. Response latency is therefore still a probabilistic existence oracle, bounded now at 20 probes / 15 min / IP. | Accepted for this phase. It is the same class of item as OI-11 / SR-15 (live timing verification on `/auth/login`), which this codebase cannot close by itself. Uniform-response + IP ceiling is the proportionate control at this stage. | `security-engineer` at the pentest / live-timing measurement |
| **Unauthenticated state change and outbound mail to an arbitrary address persist.** An unauthenticated caller can still cause `markEmailVerified` + a welcome email + an "already verified" email for any address (`:295-316`). | Accepted. The transition is a *sync* of a fact Supabase already asserts — the branch is unreachable unless `isUserEmailConfirmed` is true — so it cannot manufacture verification, and mail volume is bounded at 3 / 15 min per address. My original ask ("justify it in the same change") is met by the reasoning being recorded here rather than nowhere. **If the reset/verification flows ever depend on `accountState` transitions that this route can drive, re-open.** | `authentication-engineer` |
| `wasNotifyVerifiedPinged` (client) is a UX de-duplication, not a control — it is trivially bypassable and is not relied on. | Recorded so no future reader mistakes it for one. | — |

### 7.3 What I could not verify in this session

I could not run `npm test` or `npm run typecheck`: **no shell tool was available to this session**, so the claim of *179 tests passing across 34 files* is **not verified by me** and I will not record it as verified. What I did verify directly: 34 `*.test.ts` files exist under `backend/src/` (enumerated), and the two regression `describe` blocks exist at `auth.test.ts:402` and `:535` with assertions that, read line by line, contradict the pre-fix behaviour rather than merely naming it.

**A green suite and a clean typecheck are therefore an explicit condition of `security-engineer`'s concurrence, not something this chair has confirmed.** This is the correct division in any case — SR-004-admin-2's standard applies to me too: a claim is not evidence.

### 7.4 Findings unchanged by this remediation

SR-006-3 (session-credential storage posture), SR-006-4 (audit on `PATCH /admin/plans`), SR-006-5 (client-side draft hygiene), SR-006-6 (plan-limit enforcement before payments), SR-006-7 (MP-5 camera affordance), SR-006-8/9/10/11 (governance, contract drift, MP-3 supersession, missing Stage 5/6/7 artefacts, Stage 10 abuse cases) — **all still open**, all still required before go-live, none of them touched by this change. SR-006-6 in particular remains a hard precondition on `payment-engineer`.

### 7.5 Revised sign-off record

| Role | Status | Date |
|---|---|---|
| `cybersecurity-architect` (Stage 8 chair) | **Sign-off granted with required changes.** SR-006-1 and SR-006-2 verified closed in code; SR-006-3…13 open, of which SR-006-6 and SR-006-7 are hard preconditions on payments and on any photo-upload work respectively | 2026-08-13 (re-verification) |
| `security-engineer` | **Concurrence required and still not given.** Asks carried into this round: run `npm test` and `npm run typecheck` and confirm the suite is green (§7.3); confirm the Supabase **service-role** key is absent from the web bundle (§4); confirm `trustProxyHops` in the deployed environment so the new IP limiter keys on a real client IP and not a proxy hop | — |
| `compliance-specialist` | **Concurrence required and still not given.** Consent-record design for the wizard's terms/privacy acceptance (still not persisted), RoPA entries for the onboarding surface | — |

**Operationally:** the specific prohibition in §6 — that pointing this wizard at a Supabase project holding real customer accounts is a Stage 8 bypass — is **lifted on the chair's side**, and remains in force until `security-engineer` and `compliance-specialist` concur. Neither concurrence is mine to grant, and this section does not grant them. The Stage 8 bypass that occurred by shipping before the gate stands on the record as it was; closing the findings is the correct response to it, and that is what happened.

**Signed:** `cybersecurity-architect` (Stage 8 chair), 2026-08-13 — re-verification.

---

## 8-C. `compliance-specialist` concurrence — 2026-08-13 (body as originally filed)

*Heading repair, 2026-08-14, disclosed rather than done quietly: this section sat under a placeholder marker (`8-COMPLIANCE-MOVED-BODY-START`) left by an interrupted relocation in a prior session. **Only the heading line was replaced.** Everything below it — including its own internal `§8.x` subsection numbering and its signature block — is the 2026-08-13 body exactly as filed, unedited, so nothing signed is silently altered. It is labelled `8-C` rather than `9` because it predates and is independent of `security-engineer`'s `§8`, which follows it. The dated compliance disposition that carries this body forward, and that responds to `security-engineer`'s `§8`, is **[§9](#9-compliance-specialist-disposition--2026-08-14)**.*

### 8.0 Verdict

**Concurrence GRANTED IN PART.**

| Scope | Disposition |
|---|---|
| **SR-006-1 and SR-006-2 are closed, and SR-006-2's remediation adequately addresses the privacy harm behind it** | **Concurred** — §8.2 |
| **Continued development, merge, and testing against synthetic/staff accounts** | **Concurred** — no compliance objection |
| **Exposing this wizard to real customer personal information (any surface, web or mobile, internal distribution included)** | **WITHHELD** — conditions C-006-1 … C-006-4, §8.6/§8.7. Three of the four are pre-existing platform-level owner blockers, not new defects introduced by Feature 006 |

I am concurring with the chair's revised verdict rather than adding a fifth blocking finding. The specific prohibition §7.5 lifted "on the chair's side" **stays in force on mine** until C-006-1 (Supabase DPA) and C-006-3 (Resend vendor review) close, because those two decide whether real customer identity data may lawfully leave this platform at all — and neither is answerable from this repository.

### 8.1 Regulatory scope confirmed for this feature — not assumed

Per this role's standing rule that no single regime is assumed by default:

- **POPIA (Act 4 of 2013) — applies.** Confirmed footprint: ZAR-denominated plan catalog (`repositories/plan-catalog.ts`), a `.co.za` sending domain (`resend-setup.md`), SA-resident data subjects. Inherited unchanged from `compliance-review-supabase.md` §0/§4; nothing in Feature 006 changes it.
- **GDPR — not established as applicable, and this feature does not change that.** `/get-started` is a publicly reachable web surface, which is a *reachability* fact, not an Art. 3(2) targeting fact: no EU-currency pricing, no EU-language variant, no EU-directed marketing exists in the tree. **Recorded as assessed-and-negative, not ignored.** Revisit trigger unchanged: the first EU-resident data subject, EU-currency price, or EU market claim. This remains a `product-manager`/`cto` business decision to escalate, not mine to assume either way.
- **PCI-DSS — out of scope for Feature 006, verified this session.** No card field exists on either wizard; `POST /v1/policies` creates `billingStatus: not_configured`; `PLAN_REQUIRES_QUOTE` blocks self-serve on the only custom-priced plan; no PSP call occurs anywhere in the onboarding path. **The platform's PCI scope after Feature 006 is nil.** This is the per-release PCI-scope verification this role owes; it reopens the moment `payment-engineer` selects a gateway, and SR-006-6 (plan-limit bypass) is a *commercial-control* precondition on that work, not a PCI one.
- **Insurance-sector recordkeeping** — no policy is *activated* by this wizard (`pending_activation` only), so no FAIS/Insurance Act record-of-financial-service retention floor attaches to anything Feature 006 currently writes. Reassess at activation.

### 8.2 SR-006-2 — is the uniform response + IP limiter adequate under POPIA? **Yes, for this phase.**

The privacy harm behind the finding, stated in POPIA terms rather than security terms: the pre-fix route disclosed, to any unauthenticated caller supplying an email address, **whether an identified natural person holds an account with an insurer** — and, in the three-state form, the *state* of that relationship. That is personal information about the relationship itself, disclosed without a lawful basis, and it is a **s19** failure (appropriate technical and organisational measures against unlawful access to PI) before it is anything else. Enumeration at scale would also have produced a **s22**-reportable event on the "unauthorised access to personal information" limb, since the compromised attribute is the account's existence.

Verified against the running source, not the summary:

| Requirement | Finding |
|---|---|
| No branch discloses account state | All three reachable branches return the same `NOTIFY_EMAIL_VERIFIED_ACCEPTED` literal (`auth.ts:231-233`, returned at `:269`, `:285`, `:318`) — no discriminator, no `confirmationEmailSent` |
| A `429` cannot itself be the oracle | The per-email cooldown (`:248-251`) is evaluated **before** `getUserByEmail` — the rate-limit answer is independent of existence |
| Enumeration across many addresses is bounded | IP-scoped limiter registered as route middleware ahead of validation (`:237-241`), 20 / 15 min (`lib/policy.ts:83-86`) |
| The browser no longer leaks it by calling the route | `signUpWithSupabase` no longer prechecks; the backend ping is a `void … .catch()` whose result is not read |

**Ruling: proportionate and adequate as an s19 measure for this phase.** POPIA s19 requires measures appropriate to the harm and the sensitivity — not perfect measures. A uniform response plus a bounded probe ceiling is the proportionate control at Phase 1 for an existence oracle. I concur with the chair's closure.

**Three residuals I am documenting rather than silently accepting:**

| ID | Residual | Disposition |
|---|---|---|
| **C-006-5** | **My adequacy finding is conditional on `trustProxyHops`.** The IP limiter is the *only* control bounding cross-address enumeration; if `clientIp()` resolves to a proxy hop in the deployed environment, the ceiling is either a no-op or a platform-wide denial. This is already `security-engineer`'s §7.5 ask — I am recording that **if it resolves badly, this concurrence lapses**, it does not merely become a security to-do. | `security-engineer` + `devops-engineer`, before real PI |
| **C-006-6** | **Degraded-upstream asymmetry.** `UPSTREAM_UNAVAILABLE` is returned from two places (`:262`, `:278`), but `isUserEmailConfirmed` is only reached *after* a user was found. Under a partial Supabase degradation where lookup succeeds and the confirm-check fails, a `503` is reachable only for an address that exists. Low severity, narrow window, needs a specific upstream failure mode to exploit. **Not a blocker.** Fold into SR-006-11's abuse cases so it is at least observed. | `backend-engineer`, at next touch of this route |
| — | **Timing side channel.** I concur with the chair's §7.2 acceptance and with its owner assignment; I add only that it belongs in the same measurement pass as OI-11/SR-15 rather than a separate exercise. | `security-engineer` at pentest |

### 8.3 The consent artefact — my §7.5 ask, resolved with a finding and a hard trigger

**What the code actually does**, verified on all four signup surfaces:

- **Web `/get-started` and `/signup`:** `consentAccepted` is React state (`CustomerOnboardingPage.tsx:65`, `CustomerSignupPage.tsx:18`), gates submission (`:128`, `:44`), and **is never transmitted anywhere** — the web wizard signs up via `signUpWithSupabase` (`CustomerOnboardingPage.tsx:134`), which does not carry it. `src/customer/api/auth.ts:39` does send `consentAccepted: true` to the backend, but that is a hardcoded literal, not the checkbox's value.
- **Mobile:** `signup({ …, consentAccepted: true })` — also a hardcoded literal at the call site (`CustomerOnboardingScreen.tsx:224`, `mobile/app/(auth)/signup.tsx:89`), reaching `POST /auth/signup`.
- **Backend:** `consentAccepted: z.literal(true)` (`auth.ts:78`) is validated and then **discarded** — the handler destructures `{ email, password }` only (`:87`). No column, no document, no timestamp, no terms version, no IP.

So: **the platform cannot today produce evidence that any given customer accepted any given version of the Terms or the Privacy Policy.** `/terms` and `/privacy` are live static routes (`src/App.tsx:61-62`) with no version stamp.

**Why this is not a blocking finding today, stated so nobody reads it as one later.** Nothing in Phase 1 relies on *consent* as its POPIA s11 lawful basis. Policy and asset processing sits on **s11(1)(b)** (necessary for the conclusion or performance of a contract with the data subject); auth/security telemetry sits on **s11(1)(f)** legitimate interests, as ruled in `compliance-review-supabase.md`. The checkbox is therefore doing two other jobs: contract formation, and evidencing the **s18** open-hand notification. Both are weakened by having no record, and neither is currently unlawful for want of one. This aligns with `business-requirements.md` PM-5, which correctly deferred terms-versioning to me rather than inventing a scheme.

**C-006-2 — the trigger, which is the operative part.** A consent record must exist **before** any of the following ships, and each is a hard gate, not a best-effort:

1. Any marketing message on any channel (POPIA s69 — see the Feature 007 concurrence).
2. **Any location collection, including Feature 008's self-device tracking** — see [`../008-self-device-gps-tracking/compliance-review.md`](../008-self-device-gps-tracking/compliance-review.md), which places consent at the centre of that feature's basis and cannot be satisfied by a boolean the platform discards.
3. Any sharing of customer data with a security-company partner.
4. Asset photo upload, whenever MP-5's vendor decision lands.

**Required record shape** (`database-architect` + `authentication-engineer` own the implementation; the fields are mine): account id, document type (`terms` | `privacy` | a named consent purpose), **document version identifier**, accepted-at timestamp (server clock), surface (`web` | `mobile`), and the request's source IP. Append-only; **one row per acceptance, never an overwrite** — a consent record that can be updated in place is not evidence. Withdrawal must be recorded the same way, per s11(2)(b). This also finally gives PM-5 something to version *against*.

### 8.4 SR-006-5 — I am adding compliance weight, and one flow the chair's finding did not name

I concur with SR-006-5 as written and raise its priority. Two POPIA-specific points on top of the chair's security framing:

- **s14 (retention).** `sessionStorage['td-onboarding-asset-draft']` and the mobile `AsyncStorage` equivalents hold VIN / IMEI / serial / licence plate, plus first name, last name and mobile number (`mobile/src/onboarding/onboardingStorage.ts`, `mobile/src/forms/signupDraft.ts`) with **no deletion event other than successful registration**. Abandonment, sign-out and account switch all leave the record in place indefinitely. There is no retention rule because there is no deletion path.
- **An unassessed transborder flow, which is new.** Plain `AsyncStorage` on iOS and Android is included in **OS-level device backups** — iCloud and Google One. That means asset identifiers and signup PII are replicated to **Apple and Google as processors**, under no agreement this platform holds, with no s72 assessment, purely as a side effect of a storage choice. Feature 001 deliberately put session material in `SecureStore` (excluded from backups) for adjacent reasons; the drafts did not inherit that discipline. This is the same class of finding as `compliance-review-supabase.md` §6.2.1 — an uncontrolled second copy of PI in a third party's store — and it is **cheaper to fix here than to paper over**: SR-006-5(c)'s "do not persist identifier fields at all" removes the flow entirely rather than requiring a vendor assessment.

**C-006-7:** SR-006-5(c) and (d) are compliance-required, not merely recommended. (a) and (b) remain useful but are not sufficient on their own — clearing on sign-out does not retract what a backup already captured.

### 8.5 SR-006-7 — the POPIA concern is moot in the current tree

Recorded because it changes what the checklist needs, not to overrule the chair. **In the tree as of this reading, neither wizard has a photo step and `expo-image-picker` is not a dependency** (`mobile/package.json` — verified by absence across the whole `mobile/` tree). The specific POPIA exposure I would have flagged — an OS permission grant and an actual capture event for a collection with no defined purpose, i.e. an **s13 purpose-specification** failure, not merely a permissions-hygiene one — is therefore not live. `business-requirements.md` FU-P1 records the removal. **MP-5's transborder question reopens in full the moment an object-storage vendor is proposed**, and photos of insured assets are personal information; that review is mine and has not been done.

### 8.6 Cross-border processing and vendor status — the actual blockers

**I cannot confirm from this repository whether any DPA has been executed, and I am not assuming one has.** No agreement is checkable in code, and this session did not contact the platform owner.

| ID | Condition | Status |
|---|---|---|
| **C-006-1** | **Supabase DPA executed** (carries `compliance-review-supabase.md` C-2 forward). Feature 006 is the surface that puts real customer identity data into Supabase at scale, and the web wizard's B1 boundary talks to GoTrue **directly from the browser** — so the customer's own IP and credentials reach the operator with the backend not in the path. | **Open — platform owner.** Blocks real customer PI, not development |
| **C-006-3** | **Resend has never been reviewed as an operator by this role.** [`../001-authentication/compliance-review-smtp-vendor.md`](../001-authentication/compliance-review-smtp-vendor.md) is titled and reasoned entirely about **Brevo**; its C-5.1 (counterparty entity), C-5.2/C-5.3 (message-body and preview retention — the finding that verification and reset **tokens** sit in the operator's store), C-5.5 (transactional-only account) and C-5.6 (read the DPA before signing) were all determined against Brevo's structure. The vendor changed to Resend (`resend-setup.md` §7) and **`compliance-review-supabase.md` C-5's own requirement was that the operator be reviewed *before* selection is finalised, not after.** That sequence has now been broken twice over. Feature 006's email verification — BR-2, the gate on every real signup — depends on this operator. **A Resend operator review is required, to the same standard, before any real customer's address and verification token pass through it.** | **Open — mine to produce.** Blocks real customer PI |
| — | **Apple / Google via device backups** — see §8.4. Removed rather than assessed, if SR-006-5(c)/(d) land. | `mobile-engineer` |

### 8.7 RoPA — my second §7.5 ask

**No record of processing activity exists in this repository in any form.** Searched: no `ropa*` artefact anywhere under `docs/`; the term appears only as a forward obligation in six other documents, including this one's §5.

**C-006-4:** a RoPA covering the onboarding surface — categories of data subject, categories of PI (identity, contact, asset identifiers), purposes, lawful basis per purpose, recipients/operators (Supabase, Resend, and Apple/Google if §8.4 is not fixed), transborder flows and their s72 basis, and retention per category — must exist **before** real customer PI is processed. It is a s17/s14 documentation obligation and a precondition of answering an Information Regulator enquiry or a s23 access request at all. Owner: me, with input from `database-architect` on what is actually stored. It should be a single platform-level document with per-feature sections, not one per feature — otherwise it will drift the way this project's status docs did.

### 8.8 What I am explicitly not ruling on

SR-006-3 (session-credential storage posture), SR-006-4 (audit on `PATCH /admin/plans`), SR-006-6 (plan-limit enforcement), SR-006-8/9/10 — these are security-architecture, product and contract-governance matters and remain exactly as the chair filed them. My only overlap: SR-006-4's audit record, whenever it lands, acquires a retention period from me at that point, and it must not become a third untracked persistence surface (ADR-0006 R-4) whose retention nobody owns — see the Feature 007 concurrence §8.4 for a live instance of exactly that pattern.

### 8.9 Sign-off record — `compliance-specialist` row

| Role | Status | Date |
|---|---|---|
| `compliance-specialist` | **Concurrence granted in part.** SR-006-1/SR-006-2 concurred closed; SR-006-2's remediation assessed **adequate under POPIA s19 for this phase** (§8.2), subject to C-006-5. **Concurrence withheld for processing real customer personal information** pending C-006-1 (Supabase DPA), C-006-3 (Resend operator review — not done, and the existing vendor review is for a different vendor), C-006-4 (RoPA). C-006-2 (consent record) is not a blocker today and **becomes one at the first consent-based processing**, Feature 008 included. C-006-7 elevates SR-006-5(c)/(d) to compliance-required | 2026-08-13 |

**Signed:** `compliance-specialist`, 2026-08-13. Not legal advice; not a go-live approval.

---

## 8. `security-engineer` independent concurrence — 2026-08-13

*Appended, not substituted. §0–§7 stand as the chair's record. This section is my own hands-on re-read of the running source — not a re-statement of §7's summary — plus the two verification asks §7.3/§7.5 left open for this role.*

**Code read for this section:** `backend/src/routes/auth.ts:321-486` (`/auth/supabase/exchange`), `:217-323` (`/auth/notify-email-verified`); `backend/src/routes/auth.test.ts:402-524` (SR-006-1 regression), `:535-706` (SR-006-2 regression); `backend/src/repositories/idempotency.ts`, `backend/src/middleware/idempotency.ts`, `backend/src/routes/assets.test.ts:379-424`, `backend/src/routes/policies.test.ts:58-91`, `backend/src/routes/recovery.test.ts:60-70`; `backend/src/lib/errors.ts`. Ran `npm test` and `npm run typecheck` myself in `backend/`.

### 8.1 SR-006-1 (MFA bypass) — confirmed CLOSED

`auth.ts:410` calls `ctx.supabase.findVerifiedTotpFactor(accessToken)` before any branch that can reach `mintNewSession`. When a verified factor exists, execution goes straight to the GoTrue challenge + `createMfaChallenge` branch (`:471-481`) and returns `{mfaRequired, mfaChallengeToken, expiresIn}` — there is no code path between the `findVerifiedTotpFactor` call and that response that mints a session. The unguarded mint only happens inside `if (!verifiedFactor)` (`:432`), matching `/auth/login`'s ordering at `:589`/`:611`. I independently re-derived the negative assertions in `auth.test.ts:482-524` (`body.accessToken`/`body.refreshToken` both `undefined` on the challenge path) and confirm they fail against the pre-fix unconditional-mint shape the chair described in §1.1. I concur this finding is closed.

### 8.2 SR-006-2 (enumeration oracle) — confirmed CLOSED

All three reachable branches of `/auth/notify-email-verified` (`:268-271` no Supabase user, `:284-287` unconfirmed, `:318` full sync path) fall through to the single `res.status(202).json(NOTIFY_EMAIL_VERIFIED_ACCEPTED)` at `:318` — I read every `return` in the handler and there is exactly one distinct response shape reachable by an external caller. The IP-scoped limiter (`notify-verified:ip:${clientIp(req)}`, `:237-241`) is registered as route middleware *before* `validateBody`, so a malformed-body probe is still rate-limited by IP. The per-email cooldown (`:248-255`) is evaluated after the IP limiter and before any Supabase lookup, so neither ordering lets a `429` itself leak existence. I concur this finding is closed.

### 8.3 Idempotency-key cross-account IDOR — confirmed CLOSED

`repositories/idempotency.ts:33-43`'s `find()` takes `accountId` as its third parameter and the query predicate is `account_id is not distinct from $3` — correct null-safe scoping (a plain `=` would silently fail to match `NULL = NULL` for pre-session flows, which would have been its own bug). `middleware/idempotency.ts:36` derives `accountId` from `req.auth?.accountId ?? null` — server-derived, not client-supplied — and passes it through both `find()` and `store()`. This means a client-chosen `Idempotency-Key` colliding with another account's stored key is a guaranteed cache miss, not a replay: the mismatched `accountId` predicate excludes the foreign row, so the request falls through to fresh, correctly-scoped execution. `assets.test.ts:379-424` is a real end-to-end regression (not just an in-memory-fake assertion) — two distinct accounts, the same `Idempotency-Key` header, the same request body, hitting the live route: the second account gets its own `201` and its own asset id rather than the first account's cached response. I concur this fix is real and closes the finding. This mechanism is shared infrastructure used by `POST /policies`/`POST /assets` (this feature's scope) and by `POST /session/logout-all`, `POST /auth/reset-password/confirm`, invitations and MFA enrollment — I did not scope my review of it to Feature 006 alone.

### 8.4 `npm test` / `npm run typecheck` — independently run

```
Test Files  36 passed (36)
     Tests  187 passed (187)
```
`npm run typecheck` (`tsc --noEmit`) produced no output and exited clean. This is the baseline stated in the task brief and I confirm it myself rather than take it on trust, per §7.3/§7.5's own standard applied back to this role.

### 8.5 Other §7.5 asks — status

- **Supabase service-role key absent from the web bundle:** `grep -r "service_role\|SERVICE_ROLE\|supabaseServiceRoleKey" src/` (the Vite web app, not `backend/`) returns no matches. I did not build and inspect the production bundle output itself (no build artifact present in this tree to inspect) — grepping source is a reasonable proxy given the key is never referenced in `src/`, but a bundle-level check remains a good pre-go-live step for `devops-engineer`/CI.
- **`trustProxyHops` in the deployed environment:** this is a deployment-config value, not something this working tree can answer — `backend/src/config/env.ts:252-255` reads `TRUST_PROXY_HOPS` from the environment (default `1`) and `index.ts:84` wires it to `app.set('trust proxy', …)` correctly, so the code is right; what value is actually set in the deployed environment is outside what a source-tree review can verify and remains open for `devops-engineer`/`site-reliability-engineer` at deployment.

### 8.6 Findings I am not touching

SR-006-3…SR-006-13 are unchanged by this session's remediation and are not this task's scope; I have not independently re-verified them here and defer to §7.4's status for all of them.

### 8.7 My concurrence

**I concur with `cybersecurity-architect`'s revised verdict.** SR-006-1 and SR-006-2 are closed in code, verified independently against the running source and against a green, self-run test suite (187/187, 36/36 files) and a clean typecheck. The idempotency-key cross-account IDOR fix (not itself a numbered SR-006 finding, but in this feature's write-path scope) is also closed and independently regression-tested end to end. I have no dissent on any of the three items reviewed in this section.

**This is not a full Stage 8 sign-off on Feature 006 as a whole** — SR-006-3 through SR-006-13 remain open per §7.4/§7.5 and are unaffected by anything verified here. `compliance-specialist` concurrence remains separately outstanding and is not mine to grant.

| Role | Status | Date |
|---|---|---|
| `security-engineer` | **Concurrence given on SR-006-1 and SR-006-2, and on the idempotency-key cross-account IDOR fix.** Independently re-read the code (not the summary), independently ran `npm test` (187/187 passing, 36/36 files) and `npm run typecheck` (clean). No dissent. SR-006-3…13 not in scope of this concurrence. | 2026-08-13 |

**Signed:** `security-engineer`, 2026-08-13.

---

## 9. `compliance-specialist` disposition — 2026-08-14

*Appended, not substituted. §0–§6 are the gate as chaired, §7 the chair's re-verification, §8-C my 2026-08-13 concurrence body, §8 `security-engineer`'s independent concurrence. This section is dated after all four and responds to `security-engineer`'s §8, which had not been filed when §8-C was written. Precedent for appending rather than editing: ADR-0006 §16/§17.*

**Code re-read for this section (2026-08-14), not taken from §8-C on trust:** `backend/src/routes/auth.ts:217-323` (`/auth/notify-email-verified`, all branches and both limiters), `:78`/`:87` (signup schema vs. handler destructuring), `backend/src/lib/policy.ts` (`NOTIFY_EMAIL_VERIFIED_IP_LIMIT`); `src/customer/api/auth.ts:39`; `mobile/app/(auth)/signup.tsx:89`, `mobile/src/screens/onboarding/CustomerOnboardingScreen.tsx:224`.

### 9.1 Net disposition — unchanged from §8-C, restated here so the end of the document carries the answer

| Scope | Disposition |
|---|---|
| SR-006-1 and SR-006-2 closed; SR-006-2's remediation adequate under POPIA **s19** for this phase | **Concurred** (§8-C.2, re-verified 2026-08-14) |
| Continued development, merge, and testing against synthetic/staff accounts | **Concurred** — no compliance objection |
| Exposing this wizard to **real customer personal information** on any surface, internal distribution included | **WITHHELD** — C-006-1 (Supabase DPA), C-006-3 (Resend operator review), C-006-4 (RoPA) |

The §6/§7.5 prohibition — that pointing this wizard at a Supabase project holding real customer accounts is a Stage 8 bypass — **remains in force on the compliance side**. `security-engineer`'s §8 concurrence does not lift it and does not purport to; the three conditions above are answerable only by the platform owner (C-006-1) and by me (C-006-3, C-006-4), not by any verification of source code.

### 9.2 What `security-engineer`'s §8 changed for my conditions

| My condition | Effect of §8 | Status now |
|---|---|---|
| **C-006-5** — my SR-006-2 adequacy finding is conditional on `trustProxyHops` resolving to a real client IP | §8.5 confirms the *code* is correct (`config/env.ts` reads `TRUST_PROXY_HOPS`, `index.ts` wires `app.set('trust proxy', …)`) and states plainly that the **deployed value is not answerable from a source tree**. That is the honest answer, and it is not the answer C-006-5 needs. | **Open, unchanged.** The IP limiter is the only control bounding cross-address enumeration; if it keys on a proxy hop, my POPIA s19 adequacy finding **lapses** rather than degrading into a security to-do. Owner: `devops-engineer` / `site-reliability-engineer` at deployment, evidenced to `security-engineer` |
| **C-006-1 / C-006-3 / C-006-4** (Supabase DPA, Resend operator review, RoPA) | §8 does not touch any of them, correctly — none is a code question | **Open, unchanged.** Not assumed executed, not assumed done |
| **C-006-7** — SR-006-5(c)/(d) elevated to compliance-required | §8.6 explicitly defers on SR-006-3…13 | **Open, unchanged** |
| **C-006-2** — consent record | See §9.3 — it now has a live trigger | **Open, and no longer dormant** |

Two things in §8 I record as helpful to the compliance position without changing it: the green self-run suite (187/187, 36/36) satisfies the evidentiary standard §7.3 left open, and the service-role-key grep over `src/` reduces — but, as §8.5 itself says, does not close — the risk of a privileged Supabase credential reaching a browser bundle. Neither is a compliance condition; both are recorded because "a claim is not evidence" cuts in this role's direction too.

### 9.3 C-006-2 (consent record) has acquired its first hard trigger

§8-C.3 ruled that the discarded consent boolean is **not** a blocking finding today, because nothing in Phase 1 rests on consent as its POPIA s11 lawful basis, and named four future triggers. Trigger 2 is now live in documentary form: [`../008-self-device-gps-tracking/compliance-review.md`](../008-self-device-gps-tracking/compliance-review.md), filed 2026-08-14, rules **s11(1)(a) consent** as the primary lawful basis for self-device location collection. A consent basis the platform cannot evidence is not a consent basis.

Concretely, and re-verified in code this session: `consentAccepted` is a hardcoded `true` at every call site (`src/customer/api/auth.ts:39`, `mobile/app/(auth)/signup.tsx:89`, `mobile/src/screens/onboarding/CustomerOnboardingScreen.tsx:224`) — it is not the checkbox's value — and `backend/src/routes/auth.ts:78` validates `z.literal(true)` while `:87` destructures `{ email, password }` only. **C-006-2 is therefore a hard precondition on Feature 008 shipping any customer-facing opt-in**, not merely on marketing. The required record shape is unchanged from §8-C.3 and is not re-stated here.

### 9.4 One new observation from this session — `C-006-8` (minor, non-blocking)

`backend/src/routes/auth.ts:311-314` writes a customer's **full email address** into application logs on the mail-failure branch of `/auth/notify-email-verified`:

```
console.warn(`[auth/notify-email-verified] Account verified but confirmation email failed for ${normalizedEmail}:`, …)
```

That is personal information in an application log sink with no defined retention, no access control documented, and — because this route is unauthenticated — an address an arbitrary caller can choose to place there. It does not re-open SR-006-2 (the log is not a response, so it is not an oracle), and the volume is bounded by the same 3/15-min per-address cooldown. **Not a blocker.** Filed as **C-006-8**: log an account identifier or a hash, not the address; owner `backend-engineer` at next touch of this route, and it belongs in the same log-hygiene sweep as [Feature 007's](../007-notifications/security-review.md) §9-C.2 note on the same subject. Recorded now because a log sink with unbounded retention is precisely the surface my own retention rulings do not currently reach.

### 9.5 Sign-off record — `compliance-specialist` row, superseding the §8-C.9 row

| Role | Status | Date |
|---|---|---|
| `compliance-specialist` | **Concurrence granted in part, unchanged in substance from §8-C and re-affirmed against `security-engineer`'s §8.** SR-006-1 / SR-006-2 concurred closed; SR-006-2's remediation **adequate under POPIA s19 for this phase**, conditional on C-006-5 (unresolved by §8, and my adequacy finding lapses if it resolves badly). **Concurrence withheld for processing real customer personal information** pending C-006-1 (Supabase DPA — owner), C-006-3 (Resend operator review — mine, not done, and the only existing SMTP-vendor review is for a different vendor), C-006-4 (RoPA — mine). C-006-2 (consent record) is now a **hard precondition on Feature 008**, not a dormant trigger. C-006-7 unchanged. C-006-8 newly filed, non-blocking | 2026-08-14 |

**Signed:** `compliance-specialist`, 2026-08-14. Not legal advice; not a go-live approval. Nothing in this section asserts that any vendor agreement has been executed — no agreement is verifiable from this repository, and this session did not contact the platform owner.
