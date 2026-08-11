# Security Standards

Owned by `cybersecurity-architect` (design), `security-engineer` (implementation/hardening), `compliance-specialist` (regulatory posture). This platform handles PII, precise asset geolocation (which reveals customer behavior patterns), and payment data — security is a mandatory gate (lifecycle stage 8), not a post-hoc audit.

## Authentication & authorization

- Multi-factor authentication required for all privileged accounts: Admin Dashboard operators and Security Company Dashboard operators, non-negotiable. Offered (recommended) for customers.
- Role-based access control across four distinct user types — **customer**, **admin**, **security-company operator**, **support agent** — each with least-privilege scope. A security-company operator can see the assets they're actively assisting recovery on, never a customer's full account or billing data.
- Session tokens short-lived with refresh rotation; device binding for the mobile app to reduce token-theft blast radius.
- Owned end-to-end by `authentication-engineer`, reviewed by `security-engineer`.

## Encryption

- TLS everywhere in transit — no exceptions, including internal service-to-service calls and the GPS device ingestion endpoint.
- Encryption at rest for the database, with field-level encryption for the most sensitive fields (precise location history, payment tokens if any are ever stored) evaluated by `security-engineer` and `database-architect` together.
- Payment data: minimize PCI scope by tokenizing through the chosen PSP — raw card data should never touch our own database. Final scope confirmed by `compliance-specialist` once a gateway is selected.

## API & infrastructure security

- Rate limiting and input validation on every public endpoint, including the GPS webhook ingestion layer (verify device/vendor signatures on inbound pings — treat every webhook as adversarial input until proven otherwise).
- Standard web/API threats in scope for every review: injection (including NoSQL injection against MongoDB), IDOR (a customer must never be able to fetch another customer's asset by guessing an ID), SSRF, broken object-level authorization across the four role types.
- Dependency and CVE scanning is continuous, not a pre-release checklist item — `security-engineer` owns the process, `devops-engineer` owns wiring it into CI.
- External penetration test cadence: at least annually once in production, and before any major architecture change that expands the attack surface (e.g. adding a new third-party integration). Coordinated by `security-engineer`, commissioned by `cto`.

## Data protection & privacy

- Treat POPIA, GDPR-style personal-data rules, and PCI-DSS as candidate applicable frameworks until `compliance-specialist` confirms actual jurisdictional scope — do not assume a single regime.
- Location data is treated as sensitive personal data, not routine telemetry — retention limits and purpose-limitation apply, owned by `compliance-specialist`.
- Data retention & deletion policy: defined per data category (account data, location history, payment records, support tickets) before the first production customer is onboarded — see `compliance-specialist`'s deliverables.
- Audit logging required for: authentication events, access to another user's data by an admin/support/security-company operator, all payment actions, all changes to a customer's registered assets or policy.
- **A privileged-access audit trail lives in the store that holds the data it describes, carries the platform join key (subject, actor, actor session, timestamp — all server-derived), is append-only by privilege, and fails closed** (audit write fails → the request fails and the data is not returned). Binding on every domain trail, present and future — correlation across stores is always an application-layer read on that key, never a new per-trail scheme. Full rule, including the join key's field semantics and retention/legal-hold coupling: [ADR-0006](adr/0006-privileged-access-audit-correlation.md), owned by `cybersecurity-architect`. Append-only is a requirement that is **checked at review, not yet enforced by grants** on either store.
- **Designing a new privileged-access trail — in particular location access ("who looked at where a customer's asset is") — read ADR-0006 before designing, not after.** Such a trail inherits it by default: same store rule, same join key, no new correlation mechanism, AUD-7 retention symmetry and cross-store legal hold with the period reserved to `compliance-specialist` before the trail ships, **plus a mandatory purpose/case reference** — required for location access and for any partner-organisation operator access, not for admin trails. A deviation is a re-threat-model trigger, not a local design choice: `gps-integration-engineer` and `database-architect` route it back to `cybersecurity-architect`.
- Breach notification procedure documented and rehearsed before launch, not written reactively after an incident.

## Governance

- Security Review (lifecycle stage 8) is a hard gate — see [04-quality-gates.md](04-quality-gates.md). It cannot be waived for a deadline; only bypassed via a `cto`-signed, logged risk acceptance.
- Every ADR gets a security pass from `cybersecurity-architect` before ratification.
- Full role detail: [`.claude/agents/cybersecurity-architect.md`](../../.claude/agents/cybersecurity-architect.md), [`security-engineer.md`](../../.claude/agents/security-engineer.md), [`compliance-specialist.md`](../../.claude/agents/compliance-specialist.md).
