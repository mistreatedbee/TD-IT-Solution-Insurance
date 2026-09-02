# TD IT Solution Insurance — Engineering Organization

This directory is the governance backbone for the **Insurance Asset Protection & Recovery Platform**: how the team is structured, who owns what, how a feature moves from idea to production, and the standards every deliverable is held to.

Every role described here also exists as a real, invocable Claude Code subagent under [`.claude/agents/`](../../.claude/agents/) at the repo root — the same file is both the HR-style role spec and the agent's system prompt. There is no duplication: this directory synthesizes and cross-references those 35 files rather than repeating their content.

## Start here

| Doc | What it answers |
|---|---|
| [00-org-chart.md](00-org-chart.md) | Who exists, which department, who they report to |
| [01-raci-matrix.md](01-raci-matrix.md) | Who owns which part of the system |
| [02-feature-lifecycle.md](02-feature-lifecycle.md) | How a feature actually gets built, stage by stage |
| [03-communication-workflow.md](03-communication-workflow.md) | How agents hand off work, escalate, and log decisions |
| [04-quality-gates.md](04-quality-gates.md) | What "done" means; review and merge gates |
| [05-development-standards.md](05-development-standards.md) | Coding, branching, API, and ADR conventions |
| [06-security-standards.md](06-security-standards.md) | AuthN/Z, encryption, data handling, pentest cadence |
| [07-documentation-standards.md](07-documentation-standards.md) | Doc types, ADR template, changelog policy |
| [08-roadmap.md](08-roadmap.md) | Product roadmap and how the org itself scales with it |
| [09-business-continuity-policy.md](09-business-continuity-policy.md) | BCM/disaster-recovery framework, critical-activity priorities, current maturity level |
| [10-data-protection-contract-obligations.md](10-data-protection-contract-obligations.md) | POPIA Operator/Responsible-Party split under client contract TDIT-2026-09 §19: cross-border transfer, 48h breach notice, test-data deletion, and the open conditions register |
| [pricing-model-v2.md](pricing-model-v2.md) | Current subscription tiers (Essential/Plus/Pro/Business), prices, entitlements, legacy map, and agent behaviour rules |
| [adr/](adr/) | Architecture Decision Records, starting with [ADR-0001](adr/0001-baseline-architecture.md) |

## Current reality check

As of this writing, the repository contains **only** a Magic Patterns-generated React 18 + Vite + TypeScript + Tailwind CSS design-system showcase (`src/components/*`). There is no backend, no mobile app, no database, no infrastructure, and no real product pages yet. This organization is being stood up *before* that work starts, per the platform owner's direction — the lifecycle and standards below are how everything from here forward gets built, not a description of something already built.

## Platform in one paragraph

Customers subscribe to monthly insurance plans and register valuable assets — vehicles, laptops, smartphones, tablets, TVs, desktop computers, and other business equipment. Registered assets can carry GPS tracking hardware; the platform ingests location data to help locate and recover lost or stolen assets, coordinating with security-company partners who action recovery in the field. The platform spans a customer mobile app, an internal admin dashboard, a security-company partner dashboard, a backend API, a GPS integration layer, payment/subscription billing, notifications, reporting & analytics, authentication, and a customer support portal — built to enterprise standards for thousands of customers and a growing device fleet.
