# Documentation Standards

Owned by `technical-writer`, with `business-analyst` owning business-rule documentation specifically.

## Doc types and owners

| Doc type | Owner | Lives in |
|---|---|---|
| Architecture Decision Records (ADRs) | Proposing architect, ratified by `solution-architect` + `cto` | `docs/organization/adr/` |
| API reference (OpenAPI) | `backend-architect` defines contract, `technical-writer` maintains published docs | `docs/api/` (created when the backend exists) |
| Deployment runbooks | `devops-engineer` / `site-reliability-engineer`, written up by `technical-writer` | `docs/runbooks/` |
| Business rules & functional specs | `business-analyst` | `docs/business/` |
| Help-center / customer-facing content | `technical-writer`, reviewed by `ux-researcher` | `docs/help-center/` |
| Engineer onboarding | `technical-writer` | `docs/onboarding/` |
| Role/org governance (this directory) | `cto` ratifies, `technical-writer` maintains formatting | `docs/organization/` |

## ADR template

```markdown
# ADR-000X: <Title>

Status: Proposed | Accepted | Superseded by ADR-00YY
Date:
Deciders: <roles>

## Context
What problem or decision point prompted this?

## Decision
What are we doing?

## Alternatives Considered
At least 2, with why they were rejected.

## Consequences
What does this make easier/harder? What risks does it accept?

## Revisit Trigger
What would cause us to reopen this decision?
```

## Changelog policy

- Every production deploy gets a changelog entry (`devops-engineer` triggers it as part of the deploy pipeline, per [05-development-standards.md](05-development-standards.md)).
- Format: `[vX.Y.Z] - YYYY-MM-DD` heading, then `Added` / `Changed` / `Fixed` / `Security` sub-sections — `Security` entries are never omitted even if described generically for disclosure-safety reasons.

## Writing standard

- Plain language over jargon; define insurance/technical terms on first use per document.
- Every doc states its owner and last-reviewed date at the top.
- Docs are versioned with the code — a PR that changes behavior updates the relevant doc in the same PR, not "later."
- No doc describes a system or feature as existing unless it actually does — see the "Current reality check" in [README.md](README.md) as the standard for honesty about current state.
