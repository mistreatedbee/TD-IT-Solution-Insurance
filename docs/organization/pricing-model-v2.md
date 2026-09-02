# Pricing Model v2 — Essential / Plus / Pro / Business

**Owner:** `product-manager` · **Status:** Ratified for documentation and agent behaviour (2026-09-02) · **Supersedes:** `subscription-tier-strategy.md` (Starter / Standard / Enterprise naming and R200/R400 pricing)

**Canonical code reference:** `backend/src/lib/plan-catalog-defaults.ts` (`PLAN_CATALOG_DEFAULTS`, `LEGACY_PLAN_SLUG_MAP`). Runtime authority is MongoDB `insurance_plan_catalog` (admin-editable via `PATCH /v1/admin/plans/:planId`); clients read `GET /v1/plans` or `GET /v1/plans/catalog` — **never hard-code prices in UI, agents, or billing logic.**

---

## 1. Plan catalog (v2)

| Slug | Display name | Monthly price (ZAR) | Max assets | Max users | Positioning | Most popular |
|------|--------------|---------------------|------------|-----------|-------------|--------------|
| `essential` | Essential | R199 | 5 | 1 | Protection | — |
| `plus` | Plus | R399 | 10 | 1 | Protection + Monitoring | **Yes** |
| `pro` | Pro | R699 | 25 | 5 | Protection + Advanced Monitoring + Priority Service | — |
| `business` | Business | Custom (quote) | 25+ (uncapped, contract-defined) | Uncapped | Complete Business Platform | — |

- **Currency:** ZAR (`monthlyAmountCents`: 19_900 / 39_900 / 69_900 / `null` for Business).
- **Self-serve checkout:** Essential, Plus, Pro. Business requires quote (`isCustomPricing: true` → `PLAN_REQUIRES_QUOTE` on `POST /v1/policies`).
- **Account types:** Essential, Plus, Pro → `both` (individual and business). Business → `business` only (sales-led).
- **Billing today:** `billing.billingStatus: not_configured` until payment gateway (north-star M2) is live. Prices are ratified for catalog, marketing, and agent behaviour; charging customers is still blocked on PSP integration.

---

## 2. Legacy slug map (migration only)

| Legacy slug | v2 slug | Notes |
|-------------|---------|-------|
| `starter` | `essential` | Same asset cap (5); price R200 → R199 |
| `standard` | `plus` | Same asset cap (10); price R400 → R399 |
| `enterprise` | `business` | Custom pricing unchanged |

- **Policy history:** existing policies may retain `planTier: starter|standard|enterprise` on stored documents. Server-side `normalizePlanSlug()` maps legacy slugs to v2 for entitlement checks and display.
- **Agents and customer-facing copy:** use **only** Essential / Plus / Pro / Business. Never recommend or display Starter, Standard, Enterprise, Professional, Basic, or Premium as live plan names.
- **Admin seed:** `DEFAULT_PLAN_CATALOG_SEED` in `backend/src/repositories/plan-catalog.ts` may still show legacy rows until a catalog migration is applied; v2 defaults in `plan-catalog-defaults.ts` are the target shape.

---

## 3. Entitlements per tier

Entitlements are defined in `PlanEntitlements` (`plan-catalog-defaults.ts`). **Enforcement in code (2026-09-02):**

| Entitlement / limit | Enforcement |
|---------------------|-------------|
| `maxAssets` | `assertAssetRegistrationAllowed()` on `POST /v1/assets` — returns `ASSET_LIMIT_REACHED` when at cap |
| `locationHistory` | `assertPlanEntitlement()` on `GET /v1/assets/:assetId/location-history` — returns `PLAN_FEATURE_NOT_INCLUDED` on Essential |
| `gpsAlerts` | `GET /v1/alerts` filters out `tracking` / `device` category alerts when plan lacks `gpsAlerts` (Essential sees non-GPS alerts only) |
| All other entitlements | **Not yet gated** — marketing copy must still distinguish built vs. roadmap |

Customer policy responses support `?include=planSummary` on `GET /v1/policies` and `GET /v1/policies/:policyId` for plan name, asset usage, support level, and catalog price without a second fetch. Admin `GET /v1/admin/policies` includes `planName`, `maxAssets`, `activeAssetCount`, and `assetUsageLabel` per row for upgrade-opportunity visibility.

### Essential — Protection
- Basic asset management, customer mobile app
- Protection services (platform recovery workflow — **not** a substitute for insurance policy wording)
- GPS-assisted recovery when a **compatible tracking device is connected** (hardware vendor still open)
- Standard notifications, standard support

### Plus — Protection + Monitoring (MOST POPULAR)
- Everything in Essential
- Enhanced GPS monitoring, GPS alerts, location history
- Incident reporting and management, call-centre assistance
- Priority support, enhanced notifications

### Pro — Protection + Advanced Monitoring + Priority Service
- Everything in Plus
- Advanced GPS monitoring, extended location/activity history, advanced alerts
- Priority incident handling, advanced reporting, multiple users (up to 5)
- Enhanced customer support

### Business — Complete Business Platform
- Everything in Pro, at fleet scale (25+ assets, custom limits)
- Admin Dashboard, Security Company Dashboard, Call Centre Dashboard functionality (surfaces exist; full operational maturity varies by module)
- Advanced reporting, custom workflows, dedicated account support
- Custom integrations and API access where applicable (Change Request per contract TDIT-2026-09)

### Explicitly not sold in any tier today
- **Claims filing** — no `claims.ts` backend; mobile claims UI is stub/hidden.
- **Guaranteed GPS hardware** — vendor unselected; copy must say "when compatible hardware is connected" or "pending hardware."
- **Insurance payout guarantees** — platform subscription ≠ insurance coverage (see §5).

---

## 4. Upgrade and downgrade rules

**Upgrade (Essential → Plus → Pro):**
- Allowed anytime while billing is live (M2+). Mid-cycle upgrade: prorate per `payment-engineer` rules (credit unused portion of lower tier, charge difference for remainder of cycle).
- Asset cap increases immediately on plan change; customer may register assets up to new `maxAssets` without waiting for next cycle.
- Entitlements that require opt-in (e.g. continuous location, INC-001 containment notwithstanding) remain opt-in after upgrade.

**Downgrade (Pro → Plus → Essential):**
- Allowed at end of billing period by default; immediate downgrade only if new tier's `maxAssets` ≥ current active asset count.
- If active assets exceed new cap: customer must remove or archive assets **before** downgrade completes (`ASSET_LIMIT_REACHED` blocks new registrations; existing assets over cap need explicit remediation — owner: `business-analyst` + `payment-engineer` for edge-case policy).
- Downgrade does not delete location history or incident records; retention rules apply per compliance.

**Business tier:**
- Quote-only; no self-serve upgrade to Business. Sales assigns custom `maxAssets`, pricing, and contract terms.
- Downgrade from Business to Pro requires account review (multi-user and dashboard access revoked per contract).

**Pre-billing (today):**
- Plan selection during onboarding updates `planCatalogId` / `planTier` on the policy with `pending_activation`. No proration until PSP is configured.

---

## 5. Insurance vs platform subscription vs GPS charges

Three separate commercial concepts — **agents must never conflate them:**

| Concept | What it is | Where defined | Agent rule |
|---------|------------|---------------|------------|
| **Platform subscription** | Monthly fee for app access, asset registration limits, monitoring features, support tier | `insurance_plan_catalog` / this document | Quote prices from catalog API only |
| **Insurance coverage** | Underlying insurable interest, policy terms, exclusions, payout limits, waiting periods | Policy schedule / legal terms (not fully digitised in repo) | **Never** imply subscription tier equals a specific payout, deductible, or claim outcome |
| **GPS hardware / connectivity** | Physical tracker, SIM/data, installation — often third-party | Open vendor (`integration-architect`); not in subscription price today | Never bundle hardware cost into subscription quotes unless catalog row explicitly includes it |

**Safe customer language:** "Your Plus subscription includes enhanced monitoring and priority support on the platform."  
**Unsafe:** "Plus covers your laptop for R50,000" or "Pro guarantees recovery within 24 hours."

**Recommendation and sales agents:** suggest tier based on **asset count and monitoring/support needs**, not fabricated coverage amounts. Escalate insurance-specific questions to licensed human advisers / policy documents.

---

## 6. Migration strategy

1. **Documentation and agents (this change):** v2 names and prices are authoritative in org docs and `.claude/agents/*`.
2. **Catalog data:** Admin updates MongoDB rows via `PATCH /v1/admin/plans/:planId` or re-seed from `PLAN_CATALOG_DEFAULTS` — slugs change to `essential|plus|pro|business`; deactivate legacy slug rows or alias via `normalizePlanSlug()`.
3. **Policies in flight:** Existing policies keep historical `planTier` until migrated; display layer maps legacy → v2 for UI.
4. **Tests and fixtures:** Update mobile/web/backend tests that reference `starter`/`standard`/`R200`/`R400` when catalog migration lands.
5. **Marketing:** `src/lib/marketing-asset-pricing.ts`, landing SEO, and Plans section must read from catalog or `PLAN_CATALOG_DEFAULTS`, not stale literals.
6. **Billing (M2):** Payment gateway products/prices mirror catalog `monthlyAmountCents` by `planCatalogId` — single source of truth remains MongoDB catalog, synced to PSP.

---

## 7. Agent behaviour rules

All AI agents (`.claude/agents/`, Cursor rules, Forge work orders) **must:**

1. **Use v2 plan names only** in customer-facing or product copy: Essential, Plus, Pro, Business.
2. **Never recommend** Starter, Standard, Enterprise, Professional, Basic, or Premium as purchasable tiers.
3. **Read prices from** `GET /v1/plans/catalog` or `PLAN_CATALOG_DEFAULTS` — not from memory, this doc's table alone, or hard-coded R200/R400.
4. **Treat Plus as the default recommendation** for households/small businesses with 6–10 assets or monitoring needs — not because of dark patterns, but because it matches the "most popular" positioning when asset count justifies it.
5. **Recommend Essential** when ≤5 assets and protection-only needs; **Pro** when 11–25 assets or advanced monitoring / multi-user; **Business** when 25+ assets or dashboard/call-centre needs — always with quote CTA for Business.
6. **Separate subscription from insurance** — never state or imply that a platform tier determines claim approval, payout amount, or legal coverage (§5).
7. **Honesty about build state** — claims, live billing, GPS hardware vendor, and many entitlements are partial or blocked; do not oversell (see `HANDOFF.md`, INC-001 for location).
8. **Legacy slugs** — acceptable only in migration code, audit logs, and historical policy references; map to v2 in any user-visible output.

`recommendation-engine-specialist` owns upgrade-suggestion guardrails; `product-manager` owns tier positioning; `payment-engineer` owns proration and catalog-driven billing; `business-analyst` owns tier eligibility and downgrade edge cases.

---

## 8. Related documents

| Document | Relationship |
|----------|----------------|
| `subscription-tier-strategy.md` | Superseded for naming/pricing; retained for historical upgrade-pull rationale |
| `docs/features/006-customer-onboarding/business-requirements.md` | Onboarding plan selection — §14 append ratifies v2 |
| `docs/features/004-policy-asset-management/business-requirements.md` | D-02 pricing — v2 amounts replace R200/R400 planning figures |
| `backend/src/lib/plan-catalog-defaults.ts` | Code source of truth for seeds and entitlements |
| `docs/organization/north-star-2000-dau.md` | M2 billing gate |

---

## 9. Open items (unchanged by v2)

- Payment gateway selection and live charging (M2)
- Entitlement gating beyond `maxAssets`, `locationHistory`, and `gpsAlerts` (monitoring dashboards, multi-user, incident workflows)
- D-03 coverage limits per asset type (insurance, not subscription)
- D-08 claims eligibility
- GPS hardware vendor and connectivity pricing
