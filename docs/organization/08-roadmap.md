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
