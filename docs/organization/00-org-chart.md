# Organization Chart

35 roles across 9 departments. Each name below is a real subagent at `.claude/agents/<name>.md` — invoke directly with `@<name>` or let Claude route to it automatically based on the request.

```
                                   ┌─────────────┐
                                   │     cto     │  ← final technical authority
                                   └──────┬──────┘
              ┌──────────────────────────┼──────────────────────────┐
              │                          │                          │
     ┌────────▼────────┐       ┌─────────▼─────────┐      ┌─────────▼──────────┐
     │  product-manager │       │ solution-architect│      │ cybersecurity-     │
     │  (product vision) │      │  (system design)  │      │ architect (sec.)   │
     └────────┬─────────┘      └─────────┬──────────┘      └─────────┬──────────┘
              │                          │                           │
     ┌────────▼─────────┐      ┌─────────┴──────────────┐   ┌────────▼─────────┐
     │ technical-project- │     │      Architecture       │   │     Security      │
     │ manager (delivery) │     │        Team              │   │       Team        │
     └───────────────────┘     │  backend-architect        │   │  security-engineer│
                                │  frontend-architect       │   │  compliance-      │
                                │  mobile-architect         │   │  specialist       │
                                │  database-architect       │   └───────────────────┘
                                │  integration-architect    │
                                │  cloud-infrastructure-    │
                                │  architect                │
                                └────────────┬───────────────┘
                                             │
        ┌───────────────┬───────────────────┼───────────────────┬───────────────────┐
        │                │                   │                   │                   │
┌───────▼──────┐ ┌───────▼───────┐  ┌────────▼────────┐  ┌───────▼───────┐  ┌────────▼────────┐
│    Design     │ │  Engineering   │  │       QA         │  │      AI        │  │     DevOps       │
│     Team      │ │     Team       │  │      Team        │  │     Team       │  │      Team        │
│ ux-researcher │ │ frontend-eng.  │  │ qa-architect     │  │ ai-solutions-  │  │ devops-engineer  │
│ ui-designer   │ │ mobile-eng.    │  │ manual-qa-eng.   │  │ architect      │  │ site-reliability-│
│ design-system-│ │ backend-eng.   │  │ automation-qa-   │  │ analytics-     │  │ engineer         │
│ manager       │ │ gps-integration│  │ engineer         │  │ specialist     │  └──────────────────┘
└───────────────┘ │ -engineer      │  │ performance-     │  │ recommendation-│
                   │ authentication-│  │ engineer         │  │ engine-        │  ┌──────────────────┐
                   │ engineer       │  └──────────────────┘  │ specialist     │  │  Documentation    │
                   │ payment-eng.   │                         └────────────────┘  │      Team         │
                   │ notification-  │                                              │ technical-writer │
                   │ engineer       │                                              │ business-analyst │
                   │ reporting-eng. │                                              └──────────────────┘
                   └────────────────┘
```

## Departments and mandate

| Department | Roles | Mandate |
|---|---|---|
| **Executive** | `cto`, `product-manager`, `technical-project-manager` | Sets direction, priorities, and delivery cadence. Final escalation point. |
| **Architecture** | `solution-architect`, `backend-architect`, `frontend-architect`, `mobile-architect`, `database-architect`, `integration-architect`, `cloud-infrastructure-architect` | Owns *how* the system is built: contracts, data models, integration boundaries, deployment topology. Ratifies every ADR. |
| **Design** | `ux-researcher`, `ui-designer`, `design-system-manager` | Owns the customer/operator experience and the visual/interaction language used to build it. |
| **Engineering** | `frontend-engineer`, `mobile-engineer`, `backend-engineer`, `gps-integration-engineer`, `authentication-engineer`, `payment-engineer`, `notification-engineer`, `reporting-engineer` | Builds and maintains the product surfaces and services. |
| **Security** | `cybersecurity-architect`, `security-engineer`, `compliance-specialist` | Owns the threat model, hardening, and regulatory posture. Mandatory gate before Development starts. |
| **QA** | `qa-architect`, `manual-qa-engineer`, `automation-qa-engineer`, `performance-engineer` | Owns test strategy and verifies every deliverable before release. |
| **AI** | `ai-solutions-architect`, `analytics-specialist`, `recommendation-engine-specialist` | Plans future intelligent capability responsibly; currently advisory (no AI features exist yet). |
| **DevOps** | `devops-engineer`, `site-reliability-engineer` | Owns CI/CD, environments, and production health. |
| **Documentation** | `technical-writer`, `business-analyst` | Owns written knowledge — from business rules to API references to runbooks. |

## Reporting lines

- All department leads (`solution-architect`, `cybersecurity-architect`, `qa-architect`, `design-system-manager`, `devops-engineer`, `ai-solutions-architect`) report technical decisions up to **`cto`**.
- All feature/priority decisions flow through **`product-manager`**; all delivery sequencing flows through **`technical-project-manager`**.
- `security-engineer` and `compliance-specialist` report into `cybersecurity-architect` but hold **independent veto authority** at the Security Review gate — they are never overruled by a delivery deadline (see [04-quality-gates.md](04-quality-gates.md)).
- Engineering roles report into their respective architecture counterpart for technical direction (e.g. `backend-engineer` ↔ `backend-architect`) and into `technical-project-manager` for delivery tracking.

## Business continuity mapping

This org chart's roles are also how business continuity/disaster-recovery responsibility is assigned — there is no separate BCM committee structure invented outside these 35 roles. See [09-business-continuity-policy.md](09-business-continuity-policy.md) Section 4 for the full mapping (`cto`-led strategic oversight, `site-reliability-engineer`-led disaster recovery, `technical-project-manager`-led business recovery, plus explicitly flagged organizational gaps — physical-safety/SHERQ and independent internal audit — that this engineering org does not currently have a real counterpart for).

## Headcount-equivalents today vs. at scale

This chart is deliberately sized for a platform that is starting from zero and scaling to thousands of customers — see [08-roadmap.md](08-roadmap.md) for when single roles are expected to split into multiple specialists (e.g. `backend-engineer` → domain-specific squads) as load grows.
