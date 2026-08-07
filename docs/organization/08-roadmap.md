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
