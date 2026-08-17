# Feature 009 — Customer Experience & Security Operations Redesign

**Status:** Discovery complete · Design package filed · **Implementation not started**  
**Date:** 2026-08-14  
**Owner:** `product-manager` (A) · `cto` (orchestration)  
**Lifecycle stage:** 2–5 (Requirements → Architecture → UX/UI design)

## Purpose

Redesign the post-onboarding customer mobile experience into a **protection command centre**, and elevate the security/recovery operator experience into an **operational SOC-style dashboard** — without destroying working functionality or inventing fake GPS capabilities.

## Agent team (mapped to org roles)

| Agent | Org role | This package |
|-------|----------|--------------|
| Agent 1 — Product Strategist | `product-manager` + `business-analyst` | [02-product-strategy.md](./02-product-strategy.md) |
| Agent 2 — Customer UX Architect | `ux-researcher` + `frontend-architect` | [03-customer-ux-architecture.md](./03-customer-ux-architecture.md) |
| Agent 3 — Customer UI Designer | `ui-designer` + `design-system-manager` | [04-customer-ui-system.md](./04-customer-ui-system.md) |
| Agent 4 — Customer Dashboard Specialist | `mobile-engineer` + `frontend-engineer` | [05-customer-home-dashboard.md](./05-customer-home-dashboard.md) |
| Security Operations Designer | `frontend-engineer` (security surface) | [06-security-operations-dashboard.md](./06-security-operations-dashboard.md) |
| Platform Architect | `solution-architect` + `gps-integration-engineer` | [07-tracking-provider-architecture.md](./07-tracking-provider-architecture.md) |
| QA & Security | `qa-architect` + `cybersecurity-architect` | [08-qa-security-accessibility.md](./08-qa-security-accessibility.md) |
| Implementation Planner | `technical-project-manager` | [09-implementation-roadmap.md](./09-implementation-roadmap.md) |

## Read order

1. **[01-current-state-audit.md](./01-current-state-audit.md)** — what exists today (verified in repo)
2. **02–07** — strategy, UX, UI, dashboards, security, tracking abstraction
3. **[09-implementation-roadmap.md](./09-implementation-roadmap.md)** — phased delivery + feature classification

## Hard rules (from discovery)

- Do **not** show live tracking when only last-known location exists
- Do **not** show battery/speed/ignition unless device capability + backend support it
- Do **not** imply laptops/vehicles are self-trackable from the phone app
- Reuse `src/components/*` and `mobile/src/theme/*` — no duplicate design systems
- Wire UI to **real APIs**; use typed service interfaces + honest empty states where backend is missing
