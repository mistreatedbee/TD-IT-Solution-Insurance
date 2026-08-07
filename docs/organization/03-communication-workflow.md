# Communication Workflow

## Principle

Every agent operates asynchronously and in isolation by default (this is how Claude Code subagents actually work — no shared memory between invocations). That makes **explicit, written handoffs mandatory**: nothing is "understood" between agents unless it is captured in an artifact one agent produces and the next reads.

## Handoff protocol

1. The owner of a lifecycle stage (see [02-feature-lifecycle.md](02-feature-lifecycle.md)) produces a **named artifact** in the repo (design doc, ADR, schema, OpenAPI spec, PR) — never a verbal-only decision.
2. The next stage's owner is invoked with a direct pointer to that artifact (file path or PR link), not a paraphrase.
3. If the next-stage owner needs something the artifact doesn't answer, they push the question back to the artifact — adding an open-question section or PR comment — rather than guessing.
4. Once resolved, the artifact is updated in place. History lives in git, not in chat.

## Escalation path

- **Peer disagreement** (e.g. `backend-architect` and `database-architect` disagree on a schema approach): both positions go to `solution-architect` for a ruling.
- **Cross-department conflict** (e.g. `product-manager` wants a date `qa-architect` says is unsafe): escalates to `cto`, who owns the final tradeoff call and documents the reasoning.
- **Security or compliance objection**: `cybersecurity-architect` / `compliance-specialist` sign-off is never overridden by schedule pressure. If a business case exists to accept a flagged risk anyway, `cto` must make that call explicitly and it is logged as a **risk acceptance**, not silently waived.
- **Scope dispute** (is this in scope for the current milestone): `technical-project-manager` and `product-manager` jointly own; `cto` breaks ties.

## Decision log

Every non-trivial decision — an ADR, a risk acceptance, a scope call, a security exception — is written down. Minimum fields:

```
Decision: <one sentence>
Date:
Decided by: <agent/role>
Context: <why this came up>
Options considered: <at least 2>
Chosen option + reasoning:
Consequences / risks accepted:
Reversibility: <easy | hard | one-way door>
```

Architecture-significant decisions become ADRs under `docs/organization/adr/` (see [05-development-standards.md](05-development-standards.md) for the process and [07-documentation-standards.md](07-documentation-standards.md) for the template). Smaller decisions (scope calls, risk acceptances) are logged inline in the relevant PR or issue, and significant ones are summarized in the milestone's retro notes (lifecycle stage 15).

## Standing rituals

| Ritual | Cadence | Owner | Purpose |
|---|---|---|---|
| Backlog grooming | Weekly | `product-manager` | Keep stage 1–2 artifacts current |
| Architecture review sync | As needed, gated by stage 5 | `solution-architect` | Rule on architecture-significant PRs before Development starts |
| Security review sync | As needed, gated by stage 8 | `cybersecurity-architect` | Mandatory sign-off before Development starts |
| Release readiness check | Per milestone | `technical-project-manager` | Confirm stages 10–13 are complete across all in-flight features |
| Retro | Per milestone | `product-manager` + `technical-project-manager` | Stage 15 — capture what to improve |

## Communicating with the human platform owner

`cto` is the default single point of contact for the platform owner unless a request is clearly domain-specific (e.g. a design question routes straight to `ui-designer`/`design-system-manager`). `cto` is responsible for translating cross-team status into a plain-language summary rather than making the owner chase five different agents for one answer.
