# Quality Gates

## Definition of Done

A feature is **not done** until all of the following are true — this is the checklist `technical-project-manager` verifies before a milestone closes:

- [ ] Business rules and acceptance criteria exist and are met (`business-analyst`, `product-manager`)
- [ ] UX flow validated, UI matches the design system, no ad-hoc one-off components without `design-system-manager` sign-off
- [ ] Architecture Review artifact exists for anything touching a service boundary, schema, or external integration (`solution-architect`)
- [ ] Security Review sign-off obtained — **no exceptions, no deadline overrides** (`cybersecurity-architect`, `security-engineer`, `compliance-specialist`)
- [ ] Code merged via PR with at least one approval from the relevant architect or senior engineer
- [ ] Automated tests pass in CI (unit + integration; e2e for user-facing flows) (`automation-qa-engineer`)
- [ ] Manual QA pass completed for customer-facing or cross-role-boundary flows (`manual-qa-engineer`)
- [ ] Performance/load tested if the feature touches GPS ingestion, payments, auth, or any shared hot path (`performance-engineer`)
- [ ] Documentation updated: API reference, runbook, and/or help-center content as applicable (`technical-writer`)
- [ ] Monitoring/alerting exists for any new production surface before it ships (`site-reliability-engineer`)
- [ ] Deployed via CI/CD with a changelog entry, not a manual/out-of-band deploy (`devops-engineer`)

## Code review requirements

- Minimum one reviewer with domain authority (the relevant `*-architect` or a peer engineer in the same domain when the architect delegates).
- Security-sensitive changes (auth, payments, PII/geolocation handling, anything touching the GPS ingestion pipeline) require `security-engineer` review in addition to the domain reviewer — no exceptions.
- Schema/migration changes require `database-architect` review.
- No self-merges on anything touching a shared service, schema, or public API contract.
- Review checklist: correctness, test coverage, adherence to [05-development-standards.md](05-development-standards.md), no secrets/credentials committed, no unreviewed new third-party dependency.

## Merge / release gates

| Gate | Blocks | Enforced by |
|---|---|---|
| CI green (lint, typecheck, unit/integration tests) | Merge to main | `devops-engineer` pipeline config |
| Security Review sign-off | Start of Development (stage 8) | `cybersecurity-architect` |
| QA sign-off | Deployment (stage 10 exit) | `qa-architect` |
| Performance sign-off (when applicable) | Deployment | `performance-engineer` |
| Staging soak / smoke test | Production deploy | `site-reliability-engineer` |
| Changelog + docs updated | Production deploy | `technical-writer` |

## Risk acceptance is the only bypass

A gate may be knowingly bypassed **only** via a documented risk acceptance signed by `cto` (see the decision-log format in [03-communication-workflow.md](03-communication-workflow.md)). A bypass that isn't logged is a process failure, not a shortcut — it gets raised at the next retro regardless of outcome.
