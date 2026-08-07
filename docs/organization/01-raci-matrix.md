# Ownership Matrix (RACI)

**R**esponsible (does the work) · **A**ccountable (owns the outcome, signs off) · **C**onsulted (input sought beforehand) · **I**nformed (told after the fact)

Every row must have exactly one **A**. Where a cell is blank, that role has no standing involvement in that system area.

| System Area | A (Owner) | R (Builds) | C (Consulted) | I (Informed) |
|---|---|---|---|---|
| **Customer Mobile App** | `mobile-architect` | `mobile-engineer` | `ux-researcher`, `ui-designer`, `authentication-engineer`, `notification-engineer`, `gps-integration-engineer` | `product-manager`, `qa-architect` |
| **Admin Dashboard** | `frontend-architect` | `frontend-engineer` | `ui-designer`, `reporting-engineer`, `design-system-manager` | `product-manager` |
| **Security Company Dashboard** | `frontend-architect` | `frontend-engineer` | `gps-integration-engineer`, `cybersecurity-architect`, `ux-researcher` | `product-manager`, `compliance-specialist` |
| **Backend API** | `backend-architect` | `backend-engineer` | `database-architect`, `security-engineer`, `integration-architect` | `cto`, `technical-project-manager` |
| **GPS Integration Layer** | `integration-architect` | `gps-integration-engineer` | `backend-architect`, `security-engineer`, `performance-engineer` | `cto`, `product-manager` |
| **Payment System** | `integration-architect` | `payment-engineer` | `compliance-specialist`, `security-engineer`, `backend-architect` | `cto`, `product-manager` |
| **Notification Services** | `backend-architect` | `notification-engineer` | `integration-architect`, `ux-researcher` | `product-manager` |
| **Reporting & Analytics** | `analytics-specialist` | `reporting-engineer` | `database-architect`, `business-analyst` | `product-manager`, `cto` |
| **Authentication System** | `cybersecurity-architect` | `authentication-engineer` | `backend-architect`, `compliance-specialist` | `cto`, all engineering roles |
| **Customer Support Portal** | `frontend-architect` | `frontend-engineer` | `ux-researcher`, `business-analyst`, `technical-writer` | `product-manager` |
| **Database Schema & Migrations** | `database-architect` | `backend-engineer` | `security-engineer`, `compliance-specialist` | `cto` |
| **Cloud Infrastructure & Hosting** | `cloud-infrastructure-architect` | `devops-engineer` | `security-engineer`, `site-reliability-engineer` | `cto` |
| **CI/CD Pipelines** | `devops-engineer` | `devops-engineer` | `qa-architect`, `automation-qa-engineer` | `cto`, `technical-project-manager` |
| **Production Monitoring & Incident Response** | `site-reliability-engineer` | `site-reliability-engineer` | `devops-engineer`, `security-engineer` | `cto`, `technical-project-manager` |
| **Test Strategy & Coverage** | `qa-architect` | `manual-qa-engineer`, `automation-qa-engineer` | `performance-engineer`, all engineering roles | `product-manager` |
| **Security Posture & Threat Model** | `cybersecurity-architect` | `security-engineer` | `solution-architect`, `compliance-specialist` | `cto` |
| **Regulatory Compliance & Data Privacy** | `compliance-specialist` | `compliance-specialist` | `cybersecurity-architect`, `payment-engineer`, `gps-integration-engineer` | `cto`, `product-manager` |
| **Design System (tokens, components)** | `design-system-manager` | `ui-designer` | `frontend-architect`, `mobile-architect`, all engineering roles | `product-manager` |
| **Product Roadmap & Prioritization** | `product-manager` | `product-manager` | `cto`, `business-analyst`, `ux-researcher` | Whole org |
| **Delivery Timeline & Milestones** | `technical-project-manager` | `technical-project-manager` | All leads | Whole org |
| **Business Rules (policy tiers, claims, cancellations)** | `business-analyst` | `business-analyst` | `product-manager`, `compliance-specialist`, `payment-engineer` | `cto` |
| **Future AI Capability** | `ai-solutions-architect` | `ai-solutions-architect` | `cybersecurity-architect`, `compliance-specialist`, `analytics-specialist` | `cto`, `product-manager` |

## Reading this table

- No system area has two owners. If a decision seems to require two "A"s, escalate to `cto` to resolve — see [03-communication-workflow.md](03-communication-workflow.md).
- "Consulted" is not optional — a change merged without the listed consultation is a process violation, flagged at code review (see [04-quality-gates.md](04-quality-gates.md)).
- This matrix is versioned alongside the org chart. Any change to it is itself a decision that must be logged per the decision-log format.
