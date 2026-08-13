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
