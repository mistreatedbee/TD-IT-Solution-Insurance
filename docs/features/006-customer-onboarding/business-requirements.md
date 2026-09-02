# Feature 006 — Customer Registration & Onboarding (Web + Mobile)

**Lifecycle stage:** 1 — Business Requirements  
**Stage owner (A):** `business-analyst`  
**Status:** Draft — client-directed plan structure ratified for Phase 1 onboarding; payment, photos, GPS assignment, and full profile/KYC remain deferred  
**Supersedes partially:** Feature 004 `business-requirements.md` D-01 (tier catalog) for onboarding UX only — pricing still `billingStatus: not_configured` until PSP integrates

---

## 1. Goal

Enable a customer to complete **account creation → plan selection → asset registration → review** on the **marketing website** (`/get-started`) and in the **mobile app**, without inventing coverage rules, payment success, or GPS hardware flows that are not built.

**Primary surface for this wave:** Web landing page funnel (`/get-started`), launched from hero CTAs.

---

## 2. Plan catalog (admin-configurable)

| Slug | Display name | Max assets | Monthly price (ZAR) | Notes |
|------|--------------|------------|---------------------|-------|
| `starter` | Starter | 5 | R200 | Default individual/small household |
| `standard` | Standard | 10 | R400 | |
| `enterprise` | Enterprise | null (custom) | Custom | **Requires quote** — no self-serve checkout |

- Plans are stored in MongoDB `insurance_plan_catalog` and editable via Admin API (`PATCH /v1/admin/plans/:id`).
- Clients must **not** hard-code prices; they read `GET /v1/plans`.
- Selecting a plan creates a policy with `planCatalogId`, `planTier` = slug, `status: pending_activation`, `billing.billingStatus: not_configured`.

**FR-P1:** Customer selects exactly one plan during onboarding.  
**FR-P2:** Enterprise selection shows contact/quote CTA — no fake fixed price.  
**FR-P3:** Asset registration is blocked when active asset count ≥ plan `maxAssets` (`ASSET_LIMIT_REACHED`).

---

## 3. Account type

**FR-A1:** Customer chooses **Individual** or **Business** before signup (stored client-side Phase 1; profile API Phase 2).  
**FR-A2:** Business flow copy adapts; full company registration fields are **CONFIGURABLE / REQUIRES CLIENT CONFIRMATION** (§8).

---

## 4. Registration & verification (inherited Feature 001)

- Email + password signup (web: Supabase; mobile: backend signup path).
- Email verification required before policy/asset writes (`ACCOUNT_NOT_ACTIVE`).
- Mobile OTP verification: **not built** — CONFIGURABLE / REQUIRES CLIENT CONFIRMATION.

---

## 5. Onboarding steps (web `/get-started`)

| Step | Name | Gate |
|------|------|------|
| 1 | Welcome | — |
| 2 | Account type | — |
| 3 | Create account / Log in | — |
| 4 | Verify email | `accountState === active` for writes |
| 5 | Choose plan | authenticated + active |
| 6 | Register assets | policy exists |
| 7 | Review summary | ≥1 asset recommended, not enforced Phase 1 |
| 8 | Complete | honest: payment & activation pending |

Progress indicator: **Account → Plan → Assets → Review → Activate**

---

## 6. Asset registration

Reuse Feature 004 eight types and polymorphic `details` validation.  
Photos, proof-of-purchase uploads: **deferred** (MP-5 — no object storage vendor).  
Asset verification states (Draft → Approved → Active): **CONFIGURABLE** — Phase 2 admin workflow.

---

## 7. Explicitly deferred (do not implement as if live)

| Item | Owner | Label |
|------|-------|-------|
| Payment / subscription activation | `payment-engineer` | CONFIGURABLE |
| Policy `pending_activation` → `active` on payment webhook | `payment-engineer` | CONFIGURABLE |
| GPS tracker assignment | `gps-integration-engineer` | Phase 2 |
| Phone OTP | `authentication-engineer` | CONFIGURATIVE |
| Full individual/business profile in identity store | `database-architect` | Phase 2 |
| KYC / ID verification | `compliance-specialist` | REQUIRES CLIENT CONFIRMATION |
| Coverage limits population | `business-analyst` | D-03 |
| Claims eligibility | `business-analyst` | D-08 |

---

## 8. Acceptance criteria (Phase 1 web onboarding)

**AC-O1:** Visitor clicks **Get Started** on landing → `/get-started` wizard.  
**AC-O2:** After verified login, customer sees three plan cards from API.  
**AC-O3:** Selecting Starter/Standard creates policy via `POST /v1/policies` with `planCatalogId`.  
**AC-O4:** Customer registers at least one asset with type-specific fields.  
**AC-O5:** Review screen shows plan + assets; states payment/activation not complete honestly.  
**AC-O6:** Enterprise plan cannot complete self-serve policy create (`PLAN_REQUIRES_QUOTE`).

---

## 9. Open questions for client (`product-manager`)

1. Required fields for individual vs business registration beyond email/password?  
2. Is mobile OTP mandatory at launch?  
3. Minimum assets before "complete onboarding"?  
4. Enterprise quote workflow (email only vs CRM)?  
5. Exact insurance terms version for terms acceptance (Phase 2).

**§10 rules on 1–4 and formally defers 5. Read §10 before treating any of §9 as still open.**

---

## 10. `product-manager` ratification — 2026-08-13

**Author:** `product-manager` · **Date:** 2026-08-13 · **Appended, not merged into §9.** §9's five questions stand as originally written; this section rules on each rather than editing the record, following this org's append-not-rewrite convention (`ADR-0006` §16/§17 precedent).

Written after cross-checking the shipped web (`src/pages/onboarding/CustomerOnboardingPage.tsx`) and mobile (`mobile/src/screens/onboarding/CustomerOnboardingScreen.tsx`) wizards against this document — two of these rulings **ratify behavior already shipped**, they do not commission new work, and §11 flags where the two surfaces disagree with each other or with what's ratified here.

### PM-1 (OQ-1) — Required fields beyond email/password: first name, last name (mandatory), mobile number (optional)

**Ruling:** Phase 1 collects **first name and last name (mandatory)** and **mobile number (optional, free-text, no format commitment beyond basic shape validation)** for both individual and business account types — no additional fields, and no differentiation between the two types at this stage. This matches what mobile already collects and ships (`onboarding/onboardingStorage.ts` `SignupProfileDraft`).

Conditions, both already true of the shipped mobile behavior and now binding as the ratified shape:
- These fields are **client-side only in Phase 1** — same status as `accountType` (FR-A1). They are **not** sent to the identity store; mobile's `signup()` call carries only `email`, `password`, `consentAccepted` (verified: `mobile/src/api/auth.ts`, `mobile/src/screens/onboarding/CustomerOnboardingScreen.tsx:227`). No backend field exists to receive them.
- Business-specific fields (company name, registration number, VAT number, authorized-signatory details) are **not** added by this ruling — they stay deferred to the Phase 2 full profile store, exactly as §7 already states. This ruling closes "what beyond email/password," not "what makes business registration complete."
- First/last name are collected **for personalization copy only** ("Welcome, {firstName}") in Phase 1 — not identity verification, not KYC. Do not read their presence as satisfying any KYC or profile-completeness requirement.

**Gap this ruling creates, not resolves:** the web wizard does not currently collect these fields at all — signup is email/password only. Filed as **FU-P2** (§11) rather than silently deciding web should stay minimal; per this ruling, mobile's shape is what's ratified, and web is the surface that needs to catch up.

### PM-2 (OQ-2) — Mobile OTP: **not mandatory for Phase 1 launch**

**Ruling:** Email verification (Feature 001 BR-2, live) is the sole account-activation gate for Phase 1. Phone/SMS OTP remains exactly where §7 already places it — deferred, `CONFIGURABLE`, owner `authentication-engineer`. This is not a re-scoping; it is closing the ambiguity in OQ-2's phrasing ("is it mandatory") with a plain no.

**What stays open and is not mine to close:** the revisit trigger is an SMS/OTP delivery vendor being selected. That is a vendor decision in the same category as the payment gateway and GPS hardware — owned by `integration-architect` in coordination with `authentication-engineer` — and I am not naming one here.

### PM-3 (OQ-3) — Minimum assets before "complete onboarding": **1**

**Ruling:** At least one registered asset is required to reach the Complete step. This formalizes what both wizards already enforce in code: on the Asset Category screen, the "Skip to review" affordance only renders when `assets.length > 0` (verified: `src/pages/onboarding/CustomerOnboardingPage.tsx` and `mobile/src/screens/onboarding/CustomerOnboardingScreen.tsx`, both step `asset-category`) — there is no path from zero assets to Review or Complete on either surface today.

This also resolves an internal inconsistency in this document: §5's step-7 gate column reads *"≥1 asset recommended, not enforced Phase 1,"* which was true of the acceptance criteria's intent (AC-O4 already phrases asset registration as a flow step, not an optional one) but not of the shipped UI. §5 is left as originally written per the append convention; this ruling supersedes that cell. **A policy may still exist with zero assets** (nothing here changes what the API allows — `POST /v1/assets` has no policy-existence precondition per Feature 004 FR-7) — this rule governs onboarding-wizard completion only, not a server-side asset-count floor on the account.

### PM-4 (OQ-4) — Enterprise quote workflow: **email only, Phase 1**

**Ruling:** A `mailto:` link to the company contact address is the complete Phase 1 workflow, exactly as shipped on both surfaces (`COMPANY_CONTACT.email`, subject "Enterprise plan quote"). No CRM integration is in scope. `PLAN_REQUIRES_QUOTE` (enforced server-side in `backend/src/routes/policies.ts`, not just client-side short-circuited) remains the mechanism that prevents self-serve checkout on the enterprise plan regardless of how the lead is captured.

If/when enterprise lead volume justifies CRM intake, that is a vendor selection for `integration-architect`, entering this document as a new deferred item with its own trigger — not assumed here.

### PM-5 (OQ-5) — Terms version for terms acceptance: **explicitly deferred, not ratified**

**Not ruled on.** This requires legal review of the actual Terms of Service / Privacy Policy text and a versioning scheme for consent records — `compliance-specialist` and, ultimately, the platform owner/legal counsel territory, not a product scope call I have authority to close per this role's constraints on inventing legal/compliance commitments.

**Verified not blocking Phase 1:** no terms-version field exists anywhere in the schema today — the only signup consent artifact is a boolean (`consentAccepted: z.literal(true)`, `backend/src/routes/auth.ts`), and Phase 1's UI is a checkbox linking to static `/terms` and `/privacy` pages with no version stamp. Nothing in Phase 1 is gated on this. It stays correctly scheduled at Phase 2 (§7) and remains open with `compliance-specialist` as owner.

---

## 11. Drift findings — shipped implementation vs. AC-O1–AC-O6, and vs. this document

Checked 2026-08-13 against `src/pages/onboarding/CustomerOnboardingPage.tsx` (web) and `mobile/src/screens/onboarding/CustomerOnboardingScreen.tsx` (mobile).

**AC-O1–AC-O6: consistent, no drift.** Both surfaces route `Get Started` → wizard (AC-O1); fetch plan cards from `GET /v1/plans` (AC-O2); create policies via `POST /v1/policies` with `planCatalogId` (AC-O3, note: the API now requires `planCatalogId` specifically — see §12); register at least one typed asset (AC-O4); show an honest pending-activation review screen with no fabricated billing state (AC-O5); and cannot self-serve an Enterprise policy (AC-O6) — enforced **both** client-side (mailto short-circuit before any API call) and server-side (`PLAN_REQUIRES_QUOTE` on `POST /v1/policies`), which is stronger than AC-O6 requires, not weaker.

**FU-P1 (mobile, needs remediation before next release) — asset-photo capture step is ahead of MP-5, not just ahead of this document.** The mobile wizard has a step (`asset-photo`, between asset-form and tracking-info) that calls `expo-image-picker`'s camera and media-library pickers, requesting real OS permissions, and previews captured photos before discarding them (`assetPhotoUris` is cleared in `handleRegisterAsset`'s cleanup and is never sent in the `createAsset` body). §6 of this document already says photo upload is deferred (MP-5 — no object-storage vendor); the `cto`-authored HANDOFF ruling on MP-5 is more specific and this step is out of line with it: *"the mobile form must not show a disabled camera affordance implying it's coming next week."* A working camera capture flow that requests permission and then discards the result is a step **beyond** a disabled affordance, not a lesser version of one — it spends a real permission grant and a real photo-capture event (POPIA-relevant) on a feature with no persistence and no backend path. **Ruling:** this step should be removed or hidden behind a flag until MP-5's object-storage vendor decision lands; the in-flow copy ("stored on this device for now") does not cure a capture flow with no actual storage or purpose. Owner: `mobile-engineer` (remove/flag) with `integration-architect` (MP-5 decision) as the unblocking dependency.

**FU-P2 (web, needs remediation) — signup field mismatch with PM-1.** Web collects only email/password at signup; mobile collects first/last name (mandatory) and mobile number (optional). PM-1 above ratifies mobile's shape as the Phase 1 answer to OQ-1, so this is web's gap, not a discrepancy to leave standing. Owner: `ui-designer` + web engineering.

**Minor, not blocking — `accountTypes` field is decorative.** The plan catalog seeds `enterprise` with `accountTypes: ['business']` (`backend/src/repositories/plan-catalog.ts`), but neither `GET /v1/plans` nor `GET /v1/plans/catalog` filters by it (`backend/src/routes/plans.ts`) — individual accounts see and can request an Enterprise quote too. Harmless (no self-serve checkout exists either way) but the field currently does nothing; next time the catalog is touched, either wire the filter or drop the field.

---

## 12. Cross-reference — Feature 004 `business-requirements.md` D-01/D-04 status

Written here because the finding depends on reading both documents together; **Feature 004's own document is not edited by this entry** — see the corresponding append there.

- **D-01 (plan tier catalog) is discharged for Phase 1** by this feature's plan catalog. `POST /v1/policies` now accepts **only** a validated `planCatalogId` (`backend/src/routes/policies.ts`), resolved against `insurance_plan_catalog` (admin-editable via `PATCH /v1/admin/plans/:id`); `planTier` is server-derived from the resolved plan's `slug`. Feature 004's BR-1 ("opaque, client-supplied free-form `planTier` string") describes a shape the live route no longer accepts — that is a real contract narrowing, not a documentation nuance.
- **D-04 (eligibility rules) is partially discharged** — specifically the "per-tier asset counts" item — by FR-P3 / `ASSET_LIMIT_REACHED`, live and tested (`backend/src/lib/plan-enforcement.ts`). D-04's other two items (policy-required-before-asset, business-equipment review) remain open exactly as Feature 004 states.
- **D-02 (pricing) is explicitly not discharged.** The seeded ZAR amounts (R200 Starter / R400 Standard) are planning-display numbers only — `billing.billingStatus` stays `not_configured`, no PSP call occurs. Publishing these as real customer-facing prices still needs the joint `product-manager` + `cto` + business sign-off D-02 requires; this document does not unilaterally clear that, consistent with pricing being shared authority.
- **D-03, D-05, D-06, D-07, D-08** — unaffected by anything in this feature; still fully open as Feature 004 states.

---

## 13. Pre-approval checklist update

- [x] OQ-1, OQ-2, OQ-3, OQ-4 ratified (§10, PM-1–PM-4).
- [ ] OQ-5 (terms version) — deferred to `compliance-specialist`, not blocking Phase 1.
- [ ] FU-P1 (mobile photo-capture step ahead of MP-5) — remediation owed by `mobile-engineer`.
- [ ] FU-P2 (web/mobile signup-field mismatch) — remediation owed by `ui-designer` + web engineering.
- [x] Feature 004 D-01 discharged for Phase 1; D-04 partially discharged — recorded at §12 and cross-referenced into Feature 004 `business-requirements.md`.

---

## 14. Pricing model v2 ratification — 2026-09-02

**Author:** `product-manager` / `technical-writer` · **Canonical doc:** `docs/organization/pricing-model-v2.md` · **Code:** `backend/src/lib/plan-catalog-defaults.ts`

### PM-v2-1 — Plan catalog slugs and prices

**Ruling:** The live plan catalog target shape is four tiers:

| Slug | Name | Max assets | Monthly (ZAR) | Self-serve |
|------|------|------------|---------------|------------|
| `essential` | Essential | 5 | R199 | Yes |
| `plus` | Plus | 10 | R399 | Yes (most popular) |
| `pro` | Pro | 25 | R699 | Yes |
| `business` | Business | 25+ (custom) | Custom quote | No (`PLAN_REQUIRES_QUOTE`) |

**Legacy map (migration/history only):** `starter` → `essential`, `standard` → `plus`, `enterprise` → `business`. Clients and agents must not display legacy names to customers.

§2 table above (Starter/Standard/Enterprise at R200/R400) is **superseded for forward work**; append-only record preserved per org convention.

### PM-v2-2 — Acceptance criteria adjustments

- **AC-O2:** Customer sees plan cards from API — expect **four** tiers when catalog is migrated (Essential, Plus, Pro, Business).
- **AC-O3:** Selecting Essential / Plus / Pro creates policy via `POST /v1/policies` with `planCatalogId` (replaces "Starter/Standard" wording).
- **AC-O6:** **Business** plan cannot complete self-serve policy create (`PLAN_REQUIRES_QUOTE`) — replaces Enterprise wording; `mailto:` quote CTA subject should use "Business plan quote".

### PM-v2-3 — D-02 status

v2 ZAR amounts (R199 / R399 / R699) are **ratified for catalog, marketing, and documentation**. Live charging remains blocked on PSP (M2); `billing.billingStatus: not_configured` unchanged.

### PM-v2-4 — Insurance vs subscription

Onboarding copy must not equate platform subscription tier with insurance payout or coverage limits. Subscription = platform access and monitoring entitlements; insurance terms remain separate (see `pricing-model-v2.md` §5).
