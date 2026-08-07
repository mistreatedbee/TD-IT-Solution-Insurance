# Feature Delivery Lifecycle

Every non-trivial feature — from "add MFA to login" to "ingest live GPS pings" — passes through these 15 stages in order. No stage is skipped; small features move through fast, large features move through thoroughly, but nothing goes to Development without an Architecture Review and Security Review sign-off, and nothing ships without QA and Documentation sign-off.

| # | Stage | Owner (A) | Contributors | Entry Criteria | Exit Artifact |
|---|---|---|---|---|---|
| 1 | **Business Requirements** | `business-analyst` | `product-manager`, `compliance-specialist` | A problem or opportunity is named | Business rules doc + acceptance criteria draft |
| 2 | **Product Planning** | `product-manager` | `cto`, `technical-project-manager`, `business-analyst` | Requirements exist | Prioritized backlog item, scoped, target milestone assigned |
| 3 | **UX Research** | `ux-researcher` | `ui-designer`, `product-manager` | Item is scoped | User flow, journey map, or research findings |
| 4 | **UI Design** | `ui-designer` | `design-system-manager`, `ux-researcher` | Flow is validated | Hi-fi design using existing design-system components (new components go through `design-system-manager`) |
| 5 | **Architecture Review** | `solution-architect` | Relevant architects (`backend-architect`, `frontend-architect`, `mobile-architect`, `database-architect`, `integration-architect`, `cloud-infrastructure-architect`), `cto` | Design is ready | Approved approach; new ADR if the decision is significant (see [05-development-standards.md](05-development-standards.md)) |
| 6 | **Database Design** | `database-architect` | `backend-architect`, `compliance-specialist` | Architecture approved | Schema/migration plan, indexing strategy |
| 7 | **API Design** | `backend-architect` | `backend-engineer`, `integration-architect`, `mobile-architect` | Schema drafted | OpenAPI contract, reviewed and versioned |
| 8 | **Security Review** | `cybersecurity-architect` | `security-engineer`, `compliance-specialist` | API contract exists | Sign-off or documented required changes — **hard gate, cannot be bypassed for a deadline** |
| 9 | **Development** | Relevant engineer(s) | Architect of that domain, `authentication-engineer` if auth-adjacent | Security sign-off obtained | Working code + unit tests, PR opened |
| 10 | **QA Testing** | `qa-architect` | `manual-qa-engineer`, `automation-qa-engineer` | PR passes CI | Test results, defects logged/resolved |
| 11 | **Performance Testing** | `performance-engineer` | `site-reliability-engineer` | Feature is functionally complete, required only when the feature touches GPS ingestion, payments, or a shared hot path | Load/latency report against defined SLOs |
| 12 | **Documentation** | `technical-writer` | `business-analyst`, feature owner | QA passed | Updated API docs, runbooks, and/or help-center content |
| 13 | **Deployment** | `devops-engineer` | `site-reliability-engineer`, `technical-project-manager` | Docs merged | Deployed to staging → production via CI/CD, changelog entry |
| 14 | **Monitoring** | `site-reliability-engineer` | `devops-engineer`, feature owner | Live in production | Dashboards/alerts confirmed healthy for the new surface |
| 15 | **Continuous Improvement** | `product-manager` | `analytics-specialist`, `ux-researcher` | Feature has real usage data | Retro notes, follow-up backlog items |

## Fast path for small changes

Trivial fixes (copy edits, non-breaking bug fixes with no schema/API/security surface) may compress stages 1–7 into a single PR description reviewed by the relevant engineer's architect, but **never** skip stage 8 (Security Review) or stage 10 (QA Testing) — those two remain mandatory regardless of size.

## Stage ownership is not stage isolation

"Owner" means accountable for the artifact leaving that stage correct — it does not mean other roles are absent. `cto` and `technical-project-manager` track every feature's position in this lifecycle; see [03-communication-workflow.md](03-communication-workflow.md) for how handoffs and blockers are communicated between stages.
