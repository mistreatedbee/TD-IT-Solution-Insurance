# Roadmap

Two tracks: what the **product** builds, and how the **organization** scales to keep building it safely. Owned by `product-manager` (product track) and `cto` (org track).

## Product roadmap

### Phase 0 — Foundation (current)
- Engineering organization stood up (this document set + `.claude/agents/*`).
- ADR-0001 ratifies the stack baseline.
- No product code beyond the existing design-system showcase yet.

### Phase 1 — MVP
- Authentication (customer + admin roles), asset registration (manual entry, no GPS hardware yet), policy/subscription selection, Stripe-class payment integration behind an abstraction `integration-architect` owns.
- Admin Dashboard: view customers, policies, assets.
- Customer Mobile App (Expo): register, view policy, view assets.
- Backend API + MongoDB schema for users, policies, assets.
- Baseline security posture (MFA for admin, encryption in transit/at rest, audit logging) — non-negotiable even at MVP.

### Phase 1.4 — Privileged account self-service (Feature 017) — CTO-prioritized, ahead of Phase 1.5/KYC and payment-gateway work
- Tracked 2026-09-23 (`docs/features/017-privileged-account-self-service/business-requirements.md`).
  CTO-authorized P1, sequenced alongside today's INC-002 follow-up items, ranked ahead of Feature
  016 (KYC) and payment-gateway work.
- Closes two confirmed, never-built gaps: no web UI to accept a staff/admin invitation and enroll
  MFA (mobile has a working reference implementation; web has none), and no web UI to *send* such
  an invitation in the first place (no reference implementation exists on either surface).
- Sequencing: `solution-architect` scope note (parallel) → `ux-researcher`/`ui-designer` (web
  enrollment UX) → `frontend-engineer` (lead implementation) → `authentication-engineer`
  (consulting only) → `cybersecurity-architect` (Stage 8) → `qa-architect` (Stage 10).
- Dependency: the privileged password-reset half of this problem space is only meaningful once
  Resend/Supabase Send-Email-Hook email delivery is owner-confirmed working — a pre-existing,
  separate open item, not reopened by this feature.

### Phase 1.5 — Identity verification (Feature 016, gating layer over Feature 013)
- Tracked 2026-09-21 (`docs/features/016-kyc-identity-verification/product-scope-decision.md`).
  First shippable increment is **data-only**: Feature 013 Tier 1 (SA ID checksum/DOB consistency,
  committed) + Tier 2 (peppered-HMAC duplicate detection, compliance-approved in principle) plus a
  gating rule that blocks asset registration and claims filing (not subscription/billing) on
  `verificationStatus: verified`.
- Document-based verification (ID-document photo, proof of address, selfie/liveness, any
  third-party vendor) is explicit non-goal until object storage + field-level encryption/KMS exist
  as their own infrastructure feature — tracked separately (MP-5, KYC-R-4), not a later phase of
  Feature 016.
- Design/build may proceed now; the peppered-HMAC write path and gate enforcement stay behind a
  flag until CT-1 (cross-border consent) plus its CT-15/CT-16 disclosure follow-ons close.
- FICA s29 suspicious-transaction-reporting procedure gap (C-013-9,
  `docs/features/013-sa-id-verification/compliance-review-kyc-identity-documents.md` §8) is a
  separate, smaller tracked item — `compliance-specialist` owner, due 2026-10-31 — independent of
  this feature and not gated on it.

### Phase 2 — GPS & Recovery
- GPS Integration Layer: device onboarding, ping ingestion, geofencing.
- Theft-report flow in the mobile app → live tracking map.
- Security Company Dashboard: recovery case handoff, status updates.
- Notification Services: real-time theft/recovery alerts (latency-critical path).

### Phase 3 — Scale & Intelligence
- Reporting & Analytics: recovery-rate, churn, claims-frequency dashboards for underwriting/ops.
- Customer Support Portal.
- First AI capability off the `ai-solutions-architect` roadmap (likely theft-pattern anomaly detection or claims fraud signals), shipped only after a responsible-AI review by `compliance-specialist` + `cybersecurity-architect`.
- Multi-region / higher-availability infrastructure per `cloud-infrastructure-architect`.

### Phase 4 — Expansion
- Additional asset categories, additional GPS hardware vendors, recommendation-engine-specialist's coverage-tier suggestions (with anti-dark-pattern guardrails), deeper security-company integrations (API access for partner ops tooling).

Exact sequencing and dates are `product-manager` + `technical-project-manager` territory, refined every planning cycle — this document sets order of operations, not a committed calendar.

## Organization scaling roadmap

The 35-role org is right-sized for "zero to first thousands of customers." As real load and headcount grow, expect these splits — each one is itself a decision `cto` ratifies, not an automatic trigger:

| Signal | Likely split |
|---|---|
| Backend API grows beyond one team can safely own | `backend-engineer` → per-domain squads (billing, assets, claims) each still reporting to `backend-architect` |
| GPS device fleet reaches a scale where ingestion is its own reliability problem | `gps-integration-engineer` role splits into ingestion-pipeline vs. device-onboarding specialists |
| Manual QA can't keep pace with release cadence | `automation-qa-engineer` capacity added before adding more `manual-qa-engineer` headcount — automation is the default answer to scale, not headcount |
| Security review becomes a bottleneck on delivery | Add a second `security-engineer`-equivalent before ever relaxing the Security Review gate |
| AI roadmap moves from advisory to shipping features | `ai-solutions-architect` team gains dedicated ML/data engineering capacity, still gated by `compliance-specialist` |
| Multi-region or high-availability requirements land | `cloud-infrastructure-architect` + `site-reliability-engineer` capacity scales ahead of the traffic, not after an incident |

## Principle

Org growth follows demonstrated need, documented as a decision (see [03-communication-workflow.md](03-communication-workflow.md)), never grown ahead of the product just because the platform is "supposed to be enterprise-grade." Right-sized beats over-staffed.

---

## Addendum 2026-10-29 — Owner feature brief, placed into phases (`cto`)

Appended by `cto`. Nothing above this line is changed. This section records the platform owner's
2026-10-29 feature brief (17 rows). Each row is checked against the code, given a phase above, and
given an owning role per [`01-raci-matrix.md`](01-raci-matrix.md). The brief's "Next / Later / Done"
column is the owner's priority signal. It is **not** a status claim. Where the code disagrees with
the brief, the code wins, and the entry says so.

### A. Sequencing rules for every entry below

1. **Release Gate A is not widened.** None of the 17 rows is inside
   [`roadmap-release-gate-a.md`](roadmap-release-gate-a.md) §1. Per `HANDOFF.md` §9, Gate A is
   **not closed**: criterion 6 is withheld (INC-001 §9.4), items 1–3 are blocked on the owner, and
   INC-002-X-1 blocks any upload. Every entry starts **after Gate A closes**. That includes
   Stage 1 work, unless `product-manager` explicitly authorises paper-only work that takes no time
   from the gate's critical path.
2. **The 15-stage lifecycle applies to each entry** ([`02-feature-lifecycle.md`](02-feature-lifecycle.md)).
   Stage 8 (Security Review) and Stage 10 (QA) are hard gates. Entries that are already partly
   built still owe whatever stages they skipped. Code being in the tree does not mean a gate was
   passed.
3. **Compliance review comes first** for any entry that touches location, identity or personal
   data. `compliance-specialist` reviews at Stage 1, under POPIA, and also under FICA for identity
   entries. Location shared with a security company must be **consent-based, time-limited and
   logged**.
4. **Open decisions stay open:** the GPS tracker vendor, the payment gateway and the
   identity-verification (KYC) vendor. Code stays vendor-agnostic. `integration-architect` runs
   each comparison as a scorecard (the existing GPS and payment scorecards are the precedent).
   Other open decisions these entries depend on are listed in §D.
5. **Feature numbers.** No `docs/features/0XX-*` folders are created by this addendum. The next
   free number is 019. `product-manager` assigns numbers when each Stage 1 folder is opened.
   Entries are referenced below as OB-01 … OB-17.

### B. Correction to the owner's standing instruction on Claims

The instruction "claims backend stays deferred" predates today. It is **no longer true in code**.
Feature 018 (`docs/features/018-claims-filing-and-adjudication/`) exists end to end:

- backend: `backend/src/routes/claims.ts` and `admin-claims.ts`
- admin web: `src/admin/pages/AdminClaimsPages.tsx`
- mobile: `mobile/src/screens/claims/*`

Release controls are the server kill switch `CLAIMS_API_ENABLED` and the mobile flag
`EXPO_PUBLIC_FEATURE_CLAIMS`. Stage 8 is **not discharged**. The chair's last verdict
(`security-review.md` §18.1, 2026-10-29) is "Still BLOCKED". Commits since then address the four
code items that verdict listed:

- SR-018-10/CR-018-7 (`0b97b20`)
- CR-018-12 (`65f5dde`)
- SR-018-11/CR-018-10 (`56c4c65`)
- CR-018-11: the `OTHER` minimum length is now present in `admin-claims.ts`

A chair re-review is still owed. Payout/disbursement is **not** built and needs its own Stage 8
(C-018-4). Feature 018 is not one of the 17 rows below. It is recorded here so nobody plans against
a "claims deferred" premise. [`roadmap-release-gate-a.md`](roadmap-release-gate-a.md) §1.4 and §2
still require claims to be absent from client builds until Stage 8 signs off. That remains true and
is not changed here.

### C. Entries

Column key:

- **Phase**: a phase heading above.
- **A / R**: per the RACI matrix.
- **Built today**: verified in code on 2026-10-29.
- **Blocking dependency**: what must close before this entry can pass Stage 8.

**Admin**

| ID | Item | Phase | A (owner) / R | Built today (code-verified) | Blocking dependency |
|---|---|---|---|---|---|
| OB-01 | Admin map of all customer assets, filterable by lost or stolen | Phase 2 — GPS & Recovery | A `frontend-architect` (Admin Dashboard), R `frontend-engineer`. New admin read route: A `backend-architect`, R `backend-engineer`. C `compliance-specialist` first, `cybersecurity-architect` | **Not built.** `admin-assets.ts` has no location field or route. No admin map exists. The only web map is the customer one (`src/customer/map/ProtectionMapCanvas.tsx`, Leaflet). Location ingestion is kill-switched under INC-001 (`LOCATION_INGESTION_ENABLED`). | INC-001 closure (A-7 consent enforcement) · ADR-0009 · FU-A14/AUD-9: each admin location read must carry a case reference, so a "see everything" map needs its own compliance ruling on purpose limitation · **GPS vendor (open)** for anything beyond self-device locations |
| OB-02 | Report a theft or loss on a customer's behalf (admin or call-centre agent) | Phase 2 | A `frontend-architect` (Support Portal / call-centre UI). Route: A `backend-architect`. C `compliance-specialist`, `cybersecurity-architect` (caller verification) | **Not built, but already specified.** `POST /v1/recovery/cases` is customer-only (`requireUserType('customer')`, `recovery.ts:65`). Feature 010 FR-9 is this item, and it is **blocked at Stage 1** on C-010-4 (a Tier 2 caller-verification design). See `02-support-incident-management-business-requirements.md` §303 and SR-010-1 (no audit event for agent-on-behalf writes). | C-010-4 caller-verification design · SR-010-1 audit event. Reuse Feature 010. Do not open a new feature. |
| OB-03 | Hand off a case to a chosen security company; sharing expires and every access is logged | Phase 2 | A `solution-architect` (dispatch-model ADR), then `backend-architect` / `frontend-architect`. C `compliance-specialist` first, `cybersecurity-architect` | **Partly built, different model.** Partners currently claim cases from a shared pool. Operators can `claim`, `release` and `reassign` (`security-cases.ts:233/404/475`). Partner reads and state changes are logged (`adminAccessLog.recordDetail/recordStateChange`). Not built: admin-directed dispatch to a named partner, and any expiry on partner access. `stage8-manifest.json` records **SR-INC002B-S3 (BLOCKING)**: an unclaimed pool case's `lastLocation` is visible to every operator org. | **Partner registry / dispatch model (PDM-6, G-7), open, needs its own ADR** · SR-INC002B-S3 disposition · consent model for sharing location with a partner (compliance) · partner-operator agreement (`partner-operator-agreement-requirements.md`) |
| OB-04 | Case timeline with time stamps, who acted, and response-time targets | Phase 2 | A `backend-architect`. Schema: A `database-architect`. UI: A `frontend-architect`. Response-time targets: A `business-analyst` | **Partial.** The audit trail exists (`admin_access_log`, `GET /v1/admin/audit-log`, `AdminAuditLogPage.tsx`). `recovery_cases` has **no per-case status or assignment history and no `claimedAt`**, per the documented limitations of `PartnerOrgScorecard` in `repositories/recovery-cases.ts`. No response-time target is defined anywhere. | Business decision on response-time targets (and whether they become contractual with partners) · schema change for case history |

**Identity**

| ID | Item | Phase | A (owner) / R | Built today (code-verified) | Blocking dependency |
|---|---|---|---|---|---|
| OB-05 | SA ID number format check (checksum and birth date) | Phase 1.5 — Identity verification | A `mobile-architect` / `frontend-architect` (client); `backend-architect` if done on the server. C `compliance-specialist` | **Brief says "Done". That is only partly true.** `src/lib/sa-id-number.ts` and `mobile/src/lib/sa-id-number.ts` check length, check digit, a *plausible* calendar date and the citizenship digit, **on the client only**. They do **not** compare the ID's birth date with the date of birth the customer entered. The file header says that check is Feature 013 Tier 1 scope and is not built. The backend receives only the last 4 digits (`customer-profile-validation.ts:21-24`, CT-11), so it cannot validate the checksum. | Ruling from `compliance-specialist` + `cybersecurity-architect`: under CT-11 (the full ID never leaves the device), is a client-side birth-date cross-check sufficient? Remaining work is small. |
| OB-06 | Duplicate detection without storing the full ID number | Phase 1.5 (Feature 016 Tier 2) | Per Feature 016: A `backend-architect`, schema `database-architect`. C `compliance-specialist`, `cybersecurity-architect` | **Not built.** No peppered-HMAC code exists in `backend/src`. Feature 016 has completed Stage 5. The `cto` Stage 5 ruling (`03d-cto-ruling-stage5.md`) found two real defects in `repositories/customer-profiles.ts` (a customer can edit details after verification and stay `verified`; an admin can approve data that changed after they opened it). Those must be fixed first. | CT-1 cross-border consent (owner, not confirmed in the required form) and CT-15/CT-16 · `03d` defect fixes · how the HMAC input is derived when the full ID cannot leave the device (CT-11) must be stated explicitly in Stage 6/7 |
| OB-07 | Home Affairs name, birth date and ID match through a paid vendor | Phase 1.5 follow-on, after Feature 016 | A `integration-architect` (vendor scorecard, then integration). C `compliance-specialist` (POPIA consent, FICA), `cybersecurity-architect` | **Not built.** Feature 016's scope decision explicitly excludes any third-party vendor. This needs a new feature, not a later phase of 016. | **KYC / identity-verification vendor (open)**. `HANDOFF.md` §8 sequences it behind payments. · POPIA consent · FICA basis · cost is Client-paid (contract §5) |
| OB-08 | Selfie liveness check | Phase 3 — Scale & Intelligence | A `integration-architect` (vendor), storage A `cloud-infrastructure-architect`. C `compliance-specialist` (biometrics are special personal information under POPIA s26), `cybersecurity-architect` | **Not built.** | **KYC vendor (open)** · **object storage (MP-5, open)** + field-level encryption/KMS (KYC-R-4) · special-information processing basis |

**Different from others**

| ID | Item | Phase | A (owner) / R | Built today (code-verified) | Blocking dependency |
|---|---|---|---|---|---|
| OB-09 | Protection score, with optional discounts tied to it | Phase 3 | Scoring rules: A `business-analyst`. Build: A `backend-architect`, mobile A `mobile-architect`. C `compliance-specialist` (fair treatment, no dark patterns), `product-manager` | **Partial base.** `backend/src/lib/profile-completion.ts` already produces a setup checklist (MFA, policy, asset, profile fields, verification status). Asset serial/IMEI is already captured (`lib/asset-validation.ts`). There is no score and no discount logic. | Discounts: **payment gateway (open)** plus pricing rules (`pricing-model-v2.md`) · "tracker linked" means little beyond self-device until a **GPS vendor (open)** is chosen · "identity verified" depends on OB-06/Feature 016 |
| OB-10 | Ownership vault (serial/IMEI, receipts, photos per asset) | Phase 3 | Storage: A `integration-architect` + `cloud-infrastructure-architect`. Build: A `backend-architect`. C `compliance-specialist` | **Serial/IMEI half is built.** Required per asset type in `asset-validation.ts`. Receipts and photos are **not built**. | **Object storage (MP-5, open)** |
| OB-11 | Police (SAPS) case number capture | Phase 2 (Feature 011) | A `backend-architect` / `mobile-architect` (existing Feature 011). UX change: `ui-designer` | **Built.** `PATCH /v1/recovery/cases/:caseId/police-report` (`recovery.ts:203`) stores `sapsCaseNumber`, `reportingStation`, `reportedToPoliceAt` and an append-only `policeReportHistory`. Mobile has `PoliceReportSection.tsx` on the tracking screen. The theft-report confirm screen deliberately points there rather than asking in the notes field (`ReportTheftConfirmScreen.test.tsx:101`). **Feature 011 Stage 8 is not discharged** (SR-011-4 and SR-011-6 were open at last record). | Close SR-011-4/6. Asking for the number *inside* the theft-report form is a UX change for `ui-designer`/`ux-researcher`, not a new build. |
| OB-12 | Lost mode (one tap marks a device lost, alerts the customer's contacts, starts a case) | Phase 2 | A `mobile-architect`; notifications A `backend-architect` / R `notification-engineer`. C `compliance-specialist` first | **Partial base.** Customers can already start a case (`POST /v1/recovery/cases`). An alerts API exists (`alerts.ts`). An emergency-contact field exists on the customer profile. **Nothing notifies a contact.** | Compliance ruling on notifying a third party who is not a user (that contact's personal information) · channel choice (email works today through Resend; SMS and WhatsApp are third-party costs outside the retainer) |
| OB-13 | Smart alerts (moved while parked, left behind, tracker battery low) | Phase 2 (geofencing), with Stage 11 performance testing | A `integration-architect`, R `gps-integration-engineer` + `notification-engineer`. C `compliance-specialist`, `performance-engineer` | **Not built.** `tracking-profile.ts` deliberately reports hardware capabilities as "pending". | **GPS vendor (open)** · INC-001 closure for any self-device variant |
| OB-14 | WhatsApp alerts, and the app in isiZulu, Afrikaans and Sesotho | Phase 3 | WhatsApp: A `integration-architect` (provider scorecard), R `notification-engineer`. Languages: A `mobile-architect` + `frontend-architect`, `technical-writer`. C `compliance-specialist` (Meta cross-border transfer, POPIA s72) | **Not built.** No i18n library in `package.json` or `mobile/package.json`. No WhatsApp code. | **WhatsApp provider: a new open decision** (Client-paid third-party cost) · translation source and review process |
| OB-15 | Partner ratings (response time and recovery rate) | Phase 3 (Reporting & Analytics) | A `analytics-specialist`, R `reporting-engineer`. C `frontend-architect` | **Largely built.** `GET /v1/admin/partner-organizations/:id/scorecard` (`admin-partner-organization-scorecard.ts`) has an admin UI in `src/admin/pages/PartnerOrganizationPages.tsx`. Two limitations are documented: no assignment history and no `claimedAt`, so response-time figures are approximate until OB-04. No Stage 8 manifest entry names it specifically. | Confirm Stage 8/10 coverage of the existing endpoint · accuracy depends on OB-04 |
| OB-16 | Business and fleet accounts (one company, many users, shared asset map) | Phase 4 — Expansion | A `solution-architect` (tenancy ADR), `database-architect`; auth A `cybersecurity-architect`. C `compliance-specialist`, `business-analyst` | **Not built.** No organisation or tenant concept on customer assets. Feature 014 (household sharing), the nearest model, is blocked at Stage 1 on owner clarification. | Tenancy-model ADR (expensive to reverse) · company billing needs the **payment gateway (open)** · Feature 014 clarification |

**Design**

| ID | Item | Phase | A (owner) / R | Built today | Blocking dependency |
|---|---|---|---|---|---|
| OB-17 | "Glass" frosted-glass redesign across mobile and web | Not placed in a phase until scoped. Post-gate. | A `design-system-manager`, R `ui-designer`. C `frontend-architect`, `mobile-architect`, `qa-architect` (accessibility) | **Tokens + component list ratified** (`docs/organization/design-system/ob-17-glass-redesign-tokens.md`, 2026-10-29) and **8 screen specs drafted** (`ob-17-glass-redesign-screens.md`, 2026-10-29, `ui-designer`) — onboarding/identity, home, asset list, asset detail, map, report theft/loss, alerts, account. Not yet built; not yet Stage 8/10 signed off. | **The owner's reference image is still outstanding** — every colour/gradient choice in both docs is flagged PROVISIONAL pending it. One component question (a non-shimmer map-screen `Skeleton` variant) is routed back to `design-system-manager` for sign-off before build. Constraint from the owner: visuals only. No changes to behaviour, routes or feature flags. Reuse `src/components/*` first. Stage 10 must include a full visual and accessibility regression (contrast over translucent surfaces, including real map screenshots) and a low-end Android performance check. |

### D. Open decisions and the entries they block

| Open decision | Owner | Blocks |
|---|---|---|
| GPS tracker vendor | `integration-architect` (`gps-hardware-vendor-scorecard.md`) | OB-01 (beyond self-device), OB-09 (tracker factor), OB-13 |
| Payment gateway | `integration-architect`. Ratification is reserved as ADR-0010; evaluation is in ADR-0016, which is Proposed. | OB-09 (discounts), OB-16 (company billing) |
| Identity-verification (KYC) vendor | `integration-architect`. A scorecard is to be opened. | OB-07, OB-08 |
| Object storage (MP-5) + KMS (KYC-R-4) | `integration-architect` + `cloud-infrastructure-architect` | OB-08, OB-10 (receipts and photos) |
| Partner registry / dispatch model (PDM-6, G-7) | `solution-architect`, with `product-manager` as sponsor | OB-03 |
| WhatsApp provider (new) | `integration-architect` | OB-14, and possibly OB-12 |
| Owner/compliance items: CT-1 cross-border consent, C-010-4 caller verification, INC-001 closure | Owner, `compliance-specialist`, `cybersecurity-architect` | OB-06, OB-02, OB-01 / OB-13 |

### E. Recommended order once Gate A closes (`cto` recommendation; sprint placement is `technical-project-manager`'s call)

1. **Finish what is already built before starting anything new.**
   - Feature 018 chair re-review (in flight, outside this brief).
   - OB-11: close Feature 011 SR-011-4/6.
   - OB-15: confirm Stage 8/10 coverage of the existing scorecard.
   - OB-05: the birth-date cross-check plus a compliance ruling.

   These are the cheapest items to ship and add no new vendors.
2. **OB-03 dispatch-model ADR + compliance review.** This is the first new design work.
   SR-INC002B-S3 (pool-wide `lastLocation` exposure) is a live open risk, and directed,
   time-limited, logged hand-off is how it gets resolved properly. OB-04 (case history) should be
   designed alongside it, because both need the same new case-history data.

   **Correction, 2026-10-29 (`cybersecurity-architect`, manifest owner for SR-INC002B-S3):** the
   sentence above is stale. SR-INC002B-S3 is **not** a live open risk. The text stays above for the
   audit trail. No partner path fetches `lastLocation` at any tier
   (`backend/src/repositories/recovery-cases.ts:252-273`, re-verified in code). The item is recorded
   CLOSED (discharged by construction) in `gates/stage8-manifest.json` (`backend-security-cases`) and in
   ADR-0017's `cybersecurity-architect` sign-off section. The ADR-0017 work is still needed. It now
   retires the de-identified pool (D1) and adds consented, time-limited partner location (D3). It is
   no longer the fix for S3. SR-INC002B-S1/S2 stay BLOCKING. `technical-writer` may fold this into
   §E's wording.
3. **OB-02**, once C-010-4 caller verification is designed. **OB-06** (Feature 016), once CT-1
   closes and the `03d` defects are fixed. **OB-12**, after its compliance ruling.
4. **Vendor-gated entries** (OB-01 full, OB-07, OB-08, OB-09 discounts, OB-10 media, OB-13, OB-14,
   OB-16) wait for their scorecards. `integration-architect` should open the KYC-vendor scorecard
   only after the payment and GPS scorecards, matching `HANDOFF.md` §8's sequencing.
5. **OB-17** waits for the owner's design brief.

**Update, 2026-10-29 (orchestrator):** the owner has now supplied the actual design brief for
OB-17 (frosted-glass redesign: design tokens, a required component list, screen-by-screen scope
in order — onboarding/identity, home, asset list, asset detail, map, report theft/loss, alerts,
account — plus explicit rules on contrast, a low-end-Android blur fallback, and the same
visuals-only/reuse-`src/components`-first constraint already recorded above). **The reference
image the brief itself calls for was still not attached** ("No example image had been shared
when this was written") — `ui-designer`/`design-system-manager` are proceeding on the written
spec alone; request the image from the owner before any screen work is treated as final. Dispatch
to `design-system-manager` (tokens + component list) and `ui-designer` (screens) is in progress.
The owner also supplied background research on FICA/Home-Affairs identity verification relevant
to OB-07 — the owner's own note flags part of it (the quote→identity→documents→payment→policy
sequence) as "from memory, not checked against a specific SA insurer's process"; treat that part
as unverified input for `integration-architect`'s OB-07 scoping, not as fact.

### F. Owner directive "build the other features", and the go/no-go list (`cto`, 2026-10-29)

Appended by `cto`. §A to §E are unchanged.

**What changed.** The owner has told us to start building OB-01 to OB-16. This replaces §A.1's
rule that work starts only after Gate A closes. It does not replace anything else. Gate A's open
items are blocked on the owner (§1.1, §1.2) or come last in order (§1.3 device QA), so starting
this work does not pull engineers off the gate's critical path.

These conditions apply to every GO below:

- No OB work goes into a client build until its own Stage 8 and Stage 10 are signed. New surfaces
  sit behind a kill switch or flag that is OFF by default.
- No real customer data is used.
- Vendor and compliance decisions in §D stay open.
- Gate A work takes priority over OB work for any role it needs.
- Do not edit the OB-17 screens while they are being built: onboarding/identity, home, asset list,
  asset detail, map, report theft/loss, alerts, account.

**GO now, in this order:**

1. Feature 018: the chair's confirmation pass (`cybersecurity-architect`), plus `compliance-specialist`
   concurrence on CR-018-11 and CR-018-12.
2. Feature 011 closure:
   - `retention_job_runs` (security-review §11): `database-architect`, then `backend-engineer`.
   - `security-engineer` re-confirms on the diff.
3. DEFECT-001: the code has landed in `repositories/customer-profiles.ts`, but no Stage 8 or Stage 10
   record exists. `security-engineer` reviews (Stage 8), then `qa-engineer` tests (Stage 10).
4. OB-15: `backend-engineer` adds a separate manifest entry for the scorecard route. Under the
   SR-012-5 precedent, `/admin/*` does not count as coverage. Then `security-engineer` does a scoped
   Stage 8.
5. OB-04: Stages 1 to 7 for the case-history schema.
   - `business-analyst` sets *internal* response-time targets only. Contractual targets stay blocked.
   - `database-architect` and `backend-architect` design the history as append-only events, with no
     location fields, so that OB-03 events can be added later.
   - `backend-engineer` builds after Stage 8.
6. OB-03: paper only. `solution-architect` writes the dispatch-model ADR, with `compliance-specialist`
   on the consent model. The ADR must settle SR-INC002B-S3. No code before `cto` ratifies the ADR.
7. OB-02: paper only. `cybersecurity-architect` designs C-010-4, Tier 2 caller verification.
8. Rulings from `compliance-specialist` on OB-05, OB-12 and OB-09, then OB-09 Stage 1
   (`business-analyst`). No build.

**NO-GO, with the reason for each:**

| Item | Reason |
|---|---|
| OB-01 | Blocked on INC-001, ADR-0009 and the purpose-limitation ruling |
| OB-06 build | Blocked on CT-1 |
| OB-07, OB-08 | Blocked on the KYC vendor (and MP-5 for OB-08) |
| OB-09 discounts | Blocked on the payment gateway |
| OB-10 media | Blocked on MP-5 |
| OB-13 | Blocked on the GPS vendor |
| OB-14 WhatsApp | Blocked on the WhatsApp provider decision |
| OB-14 i18n string extraction | Waits for OB-17 to merge |
| OB-16 | Phase 4. Blocked on the Feature 014 clarification and the payment gateway |
| OB-05, OB-11 and OB-12 form/UI wiring | Each waits for its own ruling and for the matching OB-17 screen to merge |

**Compliance addendum to §F (`compliance-specialist`, 2026-10-29).** Appended. Nothing above is changed.

- **Item 1 (Feature 018), in `security-review.md` §21:**
  - CR-018-10 is closed.
  - **CR-018-11 is not met.** The code uses 20 characters, and 100 was ruled. The chair's §20 agrees.
  - CR-018-12 is met in substance. The new **CR-018-12a** (put the notice first on the screen) blocks
    the flip.
- **Item 2 (Feature 011 B-1/B-2), in `security-review.md` §12: still withheld.**
  - The platform RoPA is overdue, and it is `compliance-specialist`'s. It is a Gate A §1.6 item and
    should be dispatched on its own.
  - The Feature 011 purpose is raised to the Client as G-15 (`11-documented-client-instructions.md`
    §11).
  - The B-2 copy is approved and waits on engineering.
- **Item 6 (OB-03):** the consent model is
  `docs/features/009-customer-experience-redesign/compliance-review-ob-03-partner-location-sharing.md`.
  It is input for `solution-architect`'s ADR. G-7 is extended in doc 11 §11.
- **Item 8:** the OB-05, OB-12 and OB-09 rulings are in `compliance-rulings-ob-items-2026-10.md`:
  - OB-05: sufficient, under conditions. Two items are open with `cybersecurity-architect`.
  - OB-12: yes in principle, under conditions. It is blocked in practice on a channel/sub-operator
    and on G-16.
  - OB-09: an informational score is permitted. A pricing-linked score falls under s71 conditions and
    G-17.
  - **OB-09 Stage 1 (`business-analyst`) may start against Ruling A.**

## Design System rollout (TD IT Solution Insurance Design System) — 2026-11-13

Appended. Nothing above is changed. The owner supplied a new design system: tokens, Day/Night
modes, Zilla Slab + Plus Jakarta Sans, glass components, backgrounds/patterns, and app
icon/splash/LoadingScreen. RACI (`01-raci-matrix.md`, "Design System"): A = `design-system-manager`,
R = `ui-designer`, C = `frontend-architect`, `mobile-architect` and engineering roles, I = `product-manager`.

**Constraints on every step**

- Release Gate A is NOT widened. No feature flag changes; `eas.json` is untouched;
  `verify-eas-feature-flags` must stay PASS.
- Contrast targets must hold: 4.5:1 text, 3:1 controls/focus, validated by `design-system/check-contrast.mjs`.
- Each step is its own branch and PR. Reviewer = owner.
- Restyles make no behaviour or API changes.
- **PUBLISHING NOTE.** The GitHub repo is public, and local `main` is 105 commits ahead of
  `origin/main` (including security/compliance docs). Do NOT open PRs until the owner decides the
  publishing approach (private first, or a clean base).

**Entries**

| ID | Scope | A | Contributors | Status | Gate |
|---|---|---|---|---|---|
| R1 | Tokens, fonts, Tailwind, mobile theme | `design-system-manager` | `ui-designer`, `frontend-engineer`, `mobile-engineer` | DONE. Local commit `eabd20d` on `design/01-tokens-fonts-assets`. Additive; no screen restyled. | Contrast check; owner review (PR held, see publishing note) |
| R2 | App icon, adaptive icon, notification icon, splash, animated LoadingScreen | `design-system-manager` | `ui-designer`, `mobile-engineer` | IN PROGRESS. Branch `design/02-app-icon-splash-loading`. Takes effect only in a NEW native build. | Native build; device check by `manual-qa-engineer`; owner review |
| R3 | Shared components: Button, GlassCard, TextField, StatusBadge, AssetCard, TabBar, with reduced-transparency fallback | `design-system-manager` | `ui-designer`, `frontend-engineer`, `mobile-engineer`, `automation-qa-engineer` | NOT STARTED | `design-system-manager` sign-off required (shared primitives). Supersedes the interim `glass*` tokens in `mobile/src/theme/colorSchemes.ts` and settles the `#2DBDB6` vs `#00B5B5` question. Contrast check. |
| R4 | Backgrounds and patterns, web and app | `design-system-manager` | `ui-designer`, `frontend-engineer`, `mobile-engineer` | NOT STARTED | Depends on R3; contrast check over patterns |
| R5.x | Restyle existing screens, one feature group per PR | `design-system-manager` | `ui-designer`, owning engineer, `qa-engineer` | NOT STARTED | Depends on R3/R4; regression tests green; no behaviour or API change |

R5.x feature groups: R5.1 auth/onboarding; R5.2 home/protection centre; R5.3 assets/register;
R5.4 alerts; R5.5 account/profile; R5.6 claims (UI only, still flag-hidden); R5.7 security-ops
portal; R5.8 admin panel; R5.9 marketing site.

## Addendum 2026-11-17 — Theft-protection signals and behaviour alerts (Feature 021, provisional) (`cto`)

Appended by `cto`. Nothing above this line is changed. Source: the owner's 2026-11-17 brief. Design note: [`docs/features/021-theft-protection-signals/00-design-note.md`](../features/021-theft-protection-signals/00-design-note.md). Decision record: [ADR-0020](adr/0020-on-device-learning-and-behaviour-signal-trust-boundary.md) (Proposed).

Sequencing rules that apply (from the 2026-10-29 addendum, §A): **Release Gate A is not widened** (it is not closed; criterion 6 is withheld under INC-001); the 15-stage lifecycle applies with Stage 8 and Stage 10 as hard gates; compliance review comes first for anything touching location or personal data. **No feature flag changes, and `LOCATION_INGESTION_ENABLED` stays off.** The only work that may happen before Gate A closes is the paper design in stage (a), which `product-manager` should confirm under rule A.1.

Hard product constraint, recorded here so no later entry can drift from it: **Android and iOS do not let a normal app intercept or block the power-off menu. No entry builds a power-off blocker, and no copy may promise one.**

| ID | Item | Phase | A (owner) / R | Built today | Blocking dependency |
|---|---|---|---|---|---|
| TP-01 | Stage (a): design note and ADR-0020 | Phase 2 — GPS & Recovery (paper only) | A `cto`, `cybersecurity-architect`. R `solution-architect`, `mobile-architect`. C `compliance-specialist`, `authentication-engineer`, `database-architect` | **Done as paper** (this addendum's PR). Nothing built. | `cybersecurity-architect` concurrence; `cto` ratification |
| TP-02 | Protection-change guard: server-checked step-up before switching protection off, removing a device or changing emergency contacts; optional on-device biometric prompt on top | Phase 2 | A `authentication-engineer`. R `backend-engineer`, `mobile-engineer`, `ui-designer`. C `cybersecurity-architect`, `security-engineer`, `compliance-specialist` | **Partial base.** Step-up enforcement exists for privileged invitations (`lib/step-up.ts`, ADR-0012). Not applied to customer actions. Emergency-contact field exists on the profile. | ADR-0020 D4 accepted (extends ADR-0012 to customers). Stage 8. No location dependency. |
| TP-03 | Went-dark detection (server side): expected check-in interval, grace period, alert when a device goes silent away from known places or right after movement | Phase 2 | A `backend-architect`. R `gps-integration-engineer`, `notification-engineer`. C `site-reliability-engineer`, `performance-engineer`, `compliance-specialist` | **Partial base on another branch.** `device-connection.ts` (online/quiet/lost-contact) is on `spike/gt06-ingest-pilot`, not merged. | Hardware-tracker heartbeat first (GPS vendor open, ADR-0018 pilot). Phone heartbeat waits for ADR-0019 and INC-001 closure. |
| TP-04 | Known places learned on the phone; only labels and coarse zones sent; customer can name, edit, delete, pause | Phase 2 | A `mobile-architect`, `backend-architect`. R `mobile-engineer`, `backend-engineer`, `database-architect`. C `compliance-specialist`, `cybersecurity-architect` | **Not built.** No location library in `mobile/package.json`. | Compliance rulings (consent, zone precision, retention); ADR-0020 D1 accepted; ADR-0019 scope decision |
| TP-05 | Unusual-behaviour scoring with reasons (far location at odd hour, fast travel, SIM removed, flight mode or location off while moving). Advisory only | Phase 3 — Scale & Intelligence | A `backend-architect`. R `backend-engineer`, `mobile-engineer`. C `ai-solutions-architect`, `compliance-specialist` (POPIA s71), `cybersecurity-architect` | **Not built.** | TP-04; ADR-0020 D2; INC-001 closure; human-review process in TP-07 |
| TP-06 | Customer check first: push "Was this you?" with a short timer; escalate only on no answer or "not me" | Phase 2 | A `notification-engineer`, `backend-architect`. R `notification-engineer`, `mobile-engineer`. C `cybersecurity-architect`, `compliance-specialist` | **Partial base.** Push adapter exists (partial). No reply channel. | TP-02 (the reply needs step-up); TP-05 for the trigger. Push vendor DPA. |
| TP-07 | Staff console: alert queue with SLA timers, location and event timeline, customer-call script verifying identity by PIN or code word only, open a case, record SAPS number, hand case and location to a partner, mark false positives; staff record the outcome of every alert | Phase 2 | A `frontend-architect`, `backend-architect`. R `frontend-engineer`, `backend-engineer`. C `business-analyst` (SLA, script), `cybersecurity-architect`, `compliance-specialist`, `manual-qa-engineer` | **Partial base.** Case and partner flows exist (`recovery.ts`, `security-cases.ts`); SAPS capture is built (Feature 011); timeline is Feature 019; partner handoff is ADR-0017 (Proposed). No alert queue or SLA timers. | TP-05, TP-06; ADR-0017 accepted for handoff; caller-verification design (Feature 010 C-010-4) |
| TP-08 | Extras: duress PIN, silent SOS, trusted contact notified on alert, planned-travel mode, sensitivity levels, quiet hours | Phase 3 | A `product-manager` (scope), `mobile-architect`. R `mobile-engineer`, `backend-engineer`. C `compliance-specialist` (safety review; a trusted contact is a third party who is not a user), `ux-researcher` | **Not built.** | TP-02, TP-06; compliance safety rulings |
| TP-09 | Last-gasp on shutdown (Android only, best effort; never a dependency) | Phase 3 | A `mobile-architect`. R `mobile-engineer`. C `compliance-specialist`, `cybersecurity-architect` | **Not built.** Needs a native module and background execution. | ADR-0019 owner decision; INC-001 closure; Play background-location declaration |

Stage mapping for the PR plan: (a) = TP-01, (b) = TP-02, (c) = TP-03, (d) = TP-04 + TP-05, (e) = TP-06 + TP-07, with TP-08 and TP-09 later. One PR per stage.

Open decisions this adds: coarse-zone precision and retention periods (`compliance-specialist`); the trusted-contact consent model and duress-PIN safety review (`compliance-specialist`); alert SLA targets (`business-analyst`); the SMS/voice vendor for the customer-call path (`integration-architect`, a new open decision, not assumed). Existing open decisions that block entries here: GPS vendor, ADR-0019, INC-001 closure, ADR-0017.

## Addendum 2026-11-17 (second brief) — Theft protection, behaviour alerts and next-of-kin alerts: scope extended (`cto`)

Appended by `cto`. Nothing above this line is changed. This extends the 2026-11-17 addendum above (TP-01 to TP-09) after the owner's second brief. Design note §9: [`docs/features/021-theft-protection-signals/00-design-note.md`](../features/021-theft-protection-signals/00-design-note.md). Decisions: [ADR-0020](adr/0020-on-device-learning-and-behaviour-signal-trust-boundary.md) (D7–D10) and [ADR-0021](adr/0021-next-of-kin-alert-sharing-and-signed-links.md), both Proposed.

Standing rules, unchanged: **Release Gate A is not widened** (not closed; criterion 6 withheld under INC-001); no feature flag changes; `LOCATION_INGESTION_ENABLED` stays off; Stage 8 and Stage 10 are hard gates; compliance review first. **No power-off blocker and no promise of one. No covert camera or microphone capture of any kind.**

Supersession recorded: TP-08's "trusted contact notified on alert" is superseded by TP-15. TP-08 keeps duress PIN, silent SOS, planned-travel mode, sensitivity levels and quiet hours.

| ID | Item | Phase | A (owner) / R | Built today | Blocking dependency |
|---|---|---|---|---|---|
| TP-10 | Independent hardware tracker with its own battery (strongest layer; reports after the phone is off). Behind `HardwareProvider` / `capabilities`; vendor-dependent | Phase 2 — GPS & Recovery | A `integration-architect`, `gps-integration-engineer`. R `backend-engineer`, `mobile-engineer`. C `compliance-specialist`, `cybersecurity-architect` | **Abstraction built, no vendor.** `HardwareProvider.ts`, `tracking-device-types.ts`, `tracking-profile.ts` exist. U907 pilot is ADR-0018 (Proposed, 2G). | **GPS vendor decision (open).** Scorecard §6: no vendor-specific fields before the vendor ADR. |
| TP-11 | Bluetooth tag in the case or bag: alert when phone and tag separate (pairing, range debounce, grace period, planned-travel suppression) | Phase 3 | A `mobile-architect`. R `mobile-engineer`. C `integration-architect` (tag hardware), `compliance-specialist`, `ux-researcher` | **Not built.** No Bluetooth library in `mobile/package.json`. | **Tag hardware/vendor: a new open decision.** OS background-Bluetooth limits (iOS tighter). |
| TP-12 | Wrong-passcode counter (Android only): several failed unlocks send a "someone is trying to unlock" alert | Phase 3 | A `mobile-architect`. R `mobile-engineer`. C `compliance-specialist`, `cybersecurity-architect` | **Not built.** | Google Play device-administrator policy review; not available on iOS |
| TP-13 | Unknown Wi-Fi or new charger as a signal into the score, with its reason shown to staff (identifiers hashed on the phone, ADR-0020 D8) | Phase 3 | A `mobile-architect`. R `mobile-engineer`. C `compliance-specialist`, `cybersecurity-architect` | **Not built.** | TP-04/TP-05; permission wording; ADR-0020 accepted |
| TP-14 | Alert channels: push, then SMS, then email (Resend) for last-gasp, went-dark, unusual location, SIM removed, airplane mode while moving, wrong unlock, tag separation. Customer controls what each contact receives | Phase 2 | A `notification-engineer`, `backend-architect`. R `notification-engineer`, `backend-engineer`. C `integration-architect` (SMS vendor), `compliance-specialist` | **Partial.** Push adapter (partial) and Resend email exist. No SMS. No per-contact controls. | **SMS provider: a new open decision.** Operator agreement and cost limits. |
| TP-15 | Next-of-kin sharing (ADR-0021): per-contact level (alert only, plus place name, plus live link), invite-link confirmation, sharing only while an alert is open, signed expiring revocable link, customer log, reminders, one-tap stop, staff cannot add or upgrade without the customer's PIN or code word, duress PIN keeps sharing active, full audit | Phase 2 | A `cybersecurity-architect` (boundary), `backend-architect`. R `backend-engineer`, `frontend-engineer`, `mobile-engineer`. C `compliance-specialist`, `authentication-engineer`, `ux-researcher` | **Not built.** Emergency-contact field exists; nothing notifies a contact. | ADR-0021 accepted; compliance rulings (consent of a non-user, safety review); TP-02; TP-14. New unauthenticated link page needs Stage 8. |
| TP-16 | Lost mode: lock-screen contact message and a loud alarm (Android) triggered by a high-priority push. No remote camera. Not possible on iOS | Phase 2 | A `mobile-architect`. R `mobile-engineer`, `notification-engineer`. C `compliance-specialist` | **Not built.** OB-12 (lost mode) is the nearest earlier entry. | Native module; TP-14; wording review |
| TP-17 | Optional opt-in, clearly disclosed Android "thief selfie" after repeated wrong unlocks, behind a feature flag | Not placed | A `product-manager`, `compliance-specialist`. R `mobile-engineer` | **Not built. Not to be built** until legal and Google Play policy review pass. | **Legal and Play policy review (blocking).** TP-12. Never covert. |
| TP-18 | Evidence pack: one tap builds a timeline of alerts, locations, staff actions and the SAPS case number, exportable for the police and the insurer; feeds the partner handoff | Phase 2 | A `backend-architect`. R `backend-engineer`, `frontend-engineer`. C `compliance-specialist`, `cybersecurity-architect`, `technical-writer` | **Partial base.** SAPS capture (Feature 011); timeline (Feature 019); audit log. No export. | TP-07; compliance ruling on disclosure to police and insurer |
| TP-19 | Theft-hardening score: self-attested checklist of how well the phone is set up (lock-screen quick settings / Control Centre off, long passcode, SIM PIN, iOS Stolen Device Protection, Android theft-lock features, Find My / Find Hub) with links to the right settings. Verify current names first | Phase 2 | A `mobile-architect`. R `mobile-engineer`, `ui-designer`. C `ux-researcher`, `compliance-specialist`, `technical-writer` | **Partial base.** `profile-completion.ts` produces a setup checklist; OB-09 protection score is separate. | Verify platform feature names against each platform's own documentation at stage (b); no Stage 8 dependency on location |
| TP-20 | Honest wording across the app and notifications: what it can and cannot do, including that it cannot block switching off | Phase 2 | A `ux-researcher`, `technical-writer`. R `ui-designer`, `mobile-engineer`. C `compliance-specialist`, `cto` | **Not built.** Rules are in design note §7. | None; ships with stage (b) |

Revised stage mapping (one PR per stage): (a) TP-01; (b) TP-02, TP-19, TP-20; (c) TP-03, TP-14; (d) TP-04, TP-05, TP-13, TP-12; (e) TP-06, TP-07, TP-15, TP-08; (f) TP-18, TP-16, TP-11, then TP-10 after the vendor decision, with TP-09 and TP-17 only as their gates allow.

New open decisions: SMS provider (`integration-architect`); Bluetooth tag hardware (`integration-architect`); the customer-call voice path; kin reminder cadence and link life (`cybersecurity-architect`, `ux-researcher`). Existing blockers that still apply: GPS vendor, ADR-0019 (background tracking), INC-001 closure, ADR-0017 (partner handoff).

