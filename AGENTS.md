# TD IT Solution Insurance — Agent Index

This repo defines **35 specialized engineering roles** as agent specs under [`.claude/agents/`](.claude/agents/). Each file is a full role prompt (mission, standards, routing).

**In Cursor:** invoke the matching role via the Task tool `subagent_type` (e.g. `backend-engineer`, `frontend-engineer`) or by name in chat (`@backend-engineer` when supported). Cursor subagent types mirror these filenames.

**Governance:** [RACI matrix](docs/organization/01-raci-matrix.md) · [Feature lifecycle](docs/organization/02-feature-lifecycle.md) · [Pricing v2](docs/organization/pricing-model-v2.md)

---

## Strategy & cross-cutting

| Agent | Spec | Use for |
|-------|------|---------|
| CTO | [cto.md](.claude/agents/cto.md) | Prioritization, cross-team decisions, release go/no-go |
| Solution architect | [solution-architect.md](.claude/agents/solution-architect.md) | End-to-end architecture, ADRs, system decomposition |
| Product manager | [product-manager.md](.claude/agents/product-manager.md) | Roadmap, tier design, acceptance criteria |
| Technical project manager | [technical-project-manager.md](.claude/agents/technical-project-manager.md) | Sprints, dependencies, delivery tracking |

## Backend & data

| Agent | Spec | Use for |
|-------|------|---------|
| Backend architect | [backend-architect.md](.claude/agents/backend-architect.md) | API design, service boundaries, scalability |
| Backend engineer | [backend-engineer.md](.claude/agents/backend-engineer.md) | REST routes, business logic, Mongo/Supabase integration |
| Database architect | [database-architect.md](.claude/agents/database-architect.md) | Schemas, indexes, migrations |
| Authentication engineer | [authentication-engineer.md](.claude/agents/authentication-engineer.md) | RBAC, MFA, sessions, device binding |

## Web & design

| Agent | Spec | Use for |
|-------|------|---------|
| Frontend architect | [frontend-architect.md](.claude/agents/frontend-architect.md) | Dashboard structure, state, real-time patterns |
| Frontend engineer | [frontend-engineer.md](.claude/agents/frontend-engineer.md) | Marketing, admin, security, call-centre UI |
| Design system manager | [design-system-manager.md](.claude/agents/design-system-manager.md) | Components, tokens, library standards |
| UI designer | [ui-designer.md](.claude/agents/ui-designer.md) | Mockups, visual/interaction design |

## Mobile

| Agent | Spec | Use for |
|-------|------|---------|
| Mobile architect | [mobile-architect.md](.claude/agents/mobile-architect.md) | Offline, background GPS, push architecture |
| Mobile engineer | [mobile-engineer.md](.claude/agents/mobile-engineer.md) | Expo app screens, API wiring, customer flows |

## Security & compliance

| Agent | Spec | Use for |
|-------|------|---------|
| Cybersecurity architect | [cybersecurity-architect.md](.claude/agents/cybersecurity-architect.md) | Threat model, Stage 8 gate, trust boundaries |
| Security engineer | [security-engineer.md](.claude/agents/security-engineer.md) | Hardening, scanning, API security |
| Compliance specialist | [compliance-specialist.md](.claude/agents/compliance-specialist.md) | POPIA, contract obligations, retention |

## Integrations

| Agent | Spec | Use for |
|-------|------|---------|
| Integration architect | [integration-architect.md](.claude/agents/integration-architect.md) | GPS vendor, PSP, third-party contracts |
| GPS integration engineer | [gps-integration-engineer.md](.claude/agents/gps-integration-engineer.md) | Ping ingestion, geofencing, recovery handoff |
| Payment engineer | [payment-engineer.md](.claude/agents/payment-engineer.md) | Subscriptions, billing, catalog-driven amounts |
| Notification engineer | [notification-engineer.md](.claude/agents/notification-engineer.md) | Push, email, SMS, preference centre |

## Infrastructure & quality

| Agent | Spec | Use for |
|-------|------|---------|
| Cloud infrastructure architect | [cloud-infrastructure-architect.md](.claude/agents/cloud-infrastructure-architect.md) | Hosting, scaling, cost |
| DevOps engineer | [devops-engineer.md](.claude/agents/devops-engineer.md) | CI/CD, Render/Vercel, secrets |
| Site reliability engineer | [site-reliability-engineer.md](.claude/agents/site-reliability-engineer.md) | SLOs, alerting, incidents |
| Performance engineer | [performance-engineer.md](.claude/agents/performance-engineer.md) | Load tests, latency |
| QA architect | [qa-architect.md](.claude/agents/qa-architect.md) | Test strategy, Definition of Done |
| Automation QA engineer | [automation-qa-engineer.md](.claude/agents/automation-qa-engineer.md) | Unit/integration/e2e suites |
| Manual QA engineer | [manual-qa-engineer.md](.claude/agents/manual-qa-engineer.md) | Exploratory testing, RBAC walks |

## Data & product research

| Agent | Spec | Use for |
|-------|------|---------|
| Analytics specialist | [analytics-specialist.md](.claude/agents/analytics-specialist.md) | Metrics, dashboard specs |
| Reporting engineer | [reporting-engineer.md](.claude/agents/reporting-engineer.md) | KPI dashboards, exports |
| Business analyst | [business-analyst.md](.claude/agents/business-analyst.md) | Policy tiers, claims rules, acceptance criteria |
| UX researcher | [ux-researcher.md](.claude/agents/ux-researcher.md) | Journeys, usability testing |
| Technical writer | [technical-writer.md](.claude/agents/technical-writer.md) | Docs, runbooks, API reference |

## AI (roadmap)

| Agent | Spec | Use for |
|-------|------|---------|
| AI solutions architect | [ai-solutions-architect.md](.claude/agents/ai-solutions-architect.md) | Fraud/anomaly roadmap, responsible AI |
| Recommendation engine specialist | [recommendation-engine-specialist.md](.claude/agents/recommendation-engine-specialist.md) | Upgrade recommendations, tier fit |

---

## Active initiative: Pricing model v2

**Canonical spec:** [docs/organization/pricing-model-v2.md](docs/organization/pricing-model-v2.md)  
**Code defaults:** `backend/src/lib/plan-catalog-defaults.ts`

| Tier | Price | Assets |
|------|-------|--------|
| Essential | R199/mo | 5 |
| Plus | R399/mo | 10 (most popular) |
| Pro | R699/mo | 25 |
| Business | Custom | 25+ |

**Remaining integration work (2026-09-02):**
- Web/mobile **plan change UI** (`PATCH /v1/policies/:policyId/plan`) with downgrade asset checks
- **Admin** customers approaching asset limits
- **Entitlement gating** beyond asset limits where routes exist (GPS history, alerts)
- **Payment gateway** still not built — catalog prices are metadata until M2

Route pricing work to: `backend-engineer` (API/enforcement) · `frontend-engineer` (web) · `mobile-engineer` (app) · `payment-engineer` (billing prep) · `automation-qa-engineer` (tests).
