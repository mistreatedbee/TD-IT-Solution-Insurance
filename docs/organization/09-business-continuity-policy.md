# Business Continuity Management (BCM) & Disaster Recovery Policy

Owned by `cloud-infrastructure-architect`, ratified by `cto`. Reviewed jointly with `site-reliability-engineer` (DR execution), `cybersecurity-architect`/`compliance-specialist` (risk and regulatory posture), and `solution-architect` (cross-domain consistency). Last reviewed: 2026-08-07 (initial version).

This policy adapts a generic BCM template into a real policy for **TD IT Solution Insurance**. Anywhere the source template assumed things that are not true of this platform — a physical Head Office/Regional/Satellite office estate, a self-managed disaster recovery site, a mature multi-year BCM programme — this document says so explicitly rather than adopting the template's claims by default. See [07-documentation-standards.md](07-documentation-standards.md)'s honesty standard: no doc describes a system or capability as existing unless it actually does.

## 0. Current Maturity Level — read this first

**This platform is pre-launch.** As of this writing:

- No Business Impact Analysis (BIA) or Continuity Requirements Analysis (CRA) has been formally conducted for any critical activity listed in Section 2.
- No disaster-recovery procedure described in this document has been tested end-to-end. There has been no failover drill.
- There is no dedicated DR environment or standby infrastructure — production infrastructure itself does not exist yet outside a backend scaffold (`backend/`, see `backend/README.md`) and a design-system frontend.
- A real, live example of an in-scope dependency failing already occurred this session: a **MongoDB Atlas outage** during development, and separately, Feature 001's architecture review (`docs/features/001-authentication/architecture/backend-approach.md`, "Blocking concern flagged for Stage 5 exit") formally logged that **no Supabase outage/degradation fallback design exists yet** for the identity system. These are not hypothetical risks this policy is defending against pre-emptively — they are risks that have already manifested or been explicitly named as unresolved, and this policy exists partly *because of* them.
- No formal budget process for BCM/DR spend currently exists (Section 8) — this document proposes an ownership mapping to work toward, not a description of an operating budget.
- No independent internal audit function exists in this organization (Section 4).

This document therefore functions as **the framework to build toward**, not a record of mature, operating BCM practice. Every section below that describes a committee, a cadence, or a target should be read as "this is who is accountable for building and eventually operating this," not "this is already running." Progress against this framework is a standing agenda item for `cto` and `site-reliability-engineer`, and this document should be revisited at each major infrastructure milestone (see [08-roadmap.md](08-roadmap.md)) rather than treated as a one-time artifact.

## 1. Purpose

This policy establishes the framework for TD IT Solution Insurance to continue delivering its critical platform services during and after disruptive events — infrastructure failures, cloud-provider outages, cyber incidents, third-party/vendor failures, and other operational disruptions — and to recover quickly when disruption does occur. It exists to protect the platform's core commitment: customers who register valuable assets and pay for protection need the platform's tracking, dispatch, and account services to be available and trustworthy, especially in the moments (a theft in progress) when they matter most.

## 2. Scope

This policy covers the platform's actual technical surfaces, as described in [README.md](README.md) and [ADR-0001](adr/0001-baseline-architecture.md)/[ADR-0002](adr/0002-polyglot-persistence-identity-vs-domain-data.md): the Backend API, GPS Integration Layer, Payment System processing, Notification Services, Reporting & Analytics, Authentication System, the MongoDB Atlas cluster, and the Supabase (Postgres + Auth) identity store. It applies to everyone who operates or depends on that infrastructure: the engineering organization defined in [00-org-chart.md](00-org-chart.md) (all 35 roles, as applicable to their domain), and third-party providers this platform depends on (Supabase, MongoDB Atlas, Vercel, the eventual payment gateway and GPS hardware vendor, per `integration-architect`'s ownership).

This policy explicitly does **not** cover physical office continuity, employee workplace safety, or facilities management — see Section 4's "Organizational Gaps" for why, and what that gap means.

### 2.1 Critical activities

Adapted from the template's generic "customer services / call centre / pension payments" list to what this platform actually does. In rough priority order (highest business/safety impact first):

1. **Theft-report submission and security-company dispatch handoff.** A customer reporting a stolen asset and the platform successfully notifying a security-company partner is the single most safety- and trust-critical path on the platform — a failure here has real-world consequences beyond inconvenience.
2. **GPS ping ingestion and live tracking availability.** The append-heavy, high-frequency ingestion path from the device fleet (see [08-security-standards.md](06-security-standards.md) on treating the ingestion endpoint as adversarial input, and `cloud-infrastructure-architect`'s own charter on autoscaling this path). Data loss or extended unavailability here directly degrades recovery odds during an active theft.
3. **Backend API availability.** Every client (customer mobile app, admin dashboard, security-company dashboard) depends on it; per ADR-0002, it is also the only layer permitted to talk to either datastore.
4. **Customer authentication (Supabase Auth-backed).** Per ADR-0002, Identity Service is "the single most depended-upon service in the platform" — every other service's request path depends on token validation succeeding.
5. **Payment/subscription billing continuity.** Coverage lapses are both a revenue and a customer-trust problem; billing failures must fail safe (never silently drop a customer's coverage) rather than fail loud in the wrong direction.
6. **Admin and security-company partner dashboard availability.** Operational visibility for internal staff and dispatch partners; a lower-frequency but still business-critical path.
7. **Notification services and reporting/analytics.** Lower criticality — degraded notification delivery or analytics availability does not itself compromise safety or coverage, but sustained failure erodes trust and operational visibility.

## 3. Infrastructure and dependency reality (not a self-hosted DR site)

The template describes "a disaster recovery site maintained through an external provider" as an assumed-existing capability. **That is not accurate for this platform and this document will not claim it.** The actual dependency posture is:

- **MongoDB Atlas** (per [ADR-0001](adr/0001-baseline-architecture.md)) is a third-party-hosted, managed database service. This platform does not operate its own MongoDB failover infrastructure; it depends on Atlas's own replication, backup, and uptime guarantees, at whatever tier is provisioned.
- **Supabase** (Postgres + Auth, per [ADR-0002](adr/0002-polyglot-persistence-identity-vs-domain-data.md)) is likewise third-party-hosted. There is currently **no designed fallback** for Supabase outage or degradation — this was explicitly flagged as a blocking-before-Stage-8 item in Feature 001's architecture review and remains open at the time of this policy's writing.
- **Vercel** (per `vercel.json`) is the deployment target for both the frontend and backend services, via Vercel's own service routing (`/api` → backend, everything else → frontend). Deployment availability is itself dependent on Vercel's platform.

This means the platform's actual DR posture today is **dependency on the resilience guarantees of three separate third-party providers, with no first-party failover of our own**, not an owned or contracted DR site. This is a materially different risk profile than the template's assumption, and this policy treats it as such:

- **Single point of failure on third-party providers is itself a named BCM risk**, not an implementation detail to gloss over. If Supabase, MongoDB Atlas, or Vercel has an extended outage, this platform currently has no independent path to continue serving customers. The MongoDB Atlas outage experienced during this platform's own development is treated as a real, lived instance of this exact risk class, not a hypothetical.
- **`cloud-infrastructure-architect`** owns evaluating each provider's own published SLA/uptime commitments, DR/multi-region posture, and backup guarantees as part of the open hosting-provider evaluation (Section 3.1), and documenting what tier of guarantee this platform is actually contracted for versus what it assumes.
- **`site-reliability-engineer`** owns monitoring for and detecting third-party degradation early (see the Supabase-outage monitoring hook named as an open item in Feature 001's architecture review) rather than discovering it from customer reports.
- **`backend-architect`** (in partnership with this role) owns designing graceful degradation at the application layer — e.g., cached JWKS-based session validation continuing to work even if Supabase Auth itself is unreachable, per the analysis already done in Feature 001's architecture review — so a third-party outage degrades gracefully on the least-critical activities first, rather than taking down everything uniformly.

### 3.1 Hosting-provider decision status

The hosting/cloud-provider evaluation referenced in this role's charter is **open, not decided**, independent of this BCM policy. Vercel is the current deployment target for the frontend/backend split (per `vercel.json`), and MongoDB Atlas / Supabase are already-adopted managed data stores (per ADR-0001/ADR-0002) — but a full hosting-provider evaluation matrix (managed MongoDB compatibility, autoscaling primitives for GPS ingestion, region coverage, cost model, compliance certifications) has not yet been produced or ratified with `cto`. This BCM policy does not presuppose that evaluation's outcome; it will need updating once that decision is made, particularly Section 3's dependency-risk assessment and Section 6's DR targets.

## 4. Governance structure — mapped onto the real organization

The template describes a generic three-level BCM structure (Strategic BCC / Tactical SHERQ, Business Recovery, Disaster Recovery committees). This platform has **35 real, named roles** ([00-org-chart.md](00-org-chart.md)) — this policy maps onto those roles rather than inventing new committees that don't correspond to anyone who actually exists.

### 4.1 Strategic level — Business Continuity governance

No separate "Business Continuity Committee" is created. Strategic BCM accountability sits with the existing executive/architecture leadership already accountable for the platform:

- **`cto`** (chair) — final accountability for BCM programme, declares a disaster/major-incident status, ratifies this policy and any material change to it, reports upward to the platform owner.
- **`solution-architect`** — cross-domain consistency of BCM/DR design against overall system architecture.
- **`product-manager`** — business-impact judgment calls (which activities are truly critical, acceptable degradation order under Section 2.1).
- **`technical-project-manager`** — coordinates cross-role BCM/DR work as delivery items, same as any other cross-cutting initiative.

### 4.2 Tactical level — Disaster Recovery (technology restoration)

- **`site-reliability-engineer`** (lead) — incident detection and response, restoring service availability, running failover procedures, post-incident review.
- **`cloud-infrastructure-architect`** — cluster/hosting topology, DR architecture design, provider-dependency risk assessment (Section 3).
- **`devops-engineer`** — CI/CD and infrastructure-as-code execution of recovery procedures; ensures recovery steps are scripted and repeatable, not manual and undocumented.

### 4.3 Tactical level — Business Recovery (operational continuity)

- **`technical-project-manager`** (lead) — coordinates cross-team recovery sequencing during a disruption.
- **`business-analyst`** — documents which business rules/processes are affected and what "recovered" means functionally, not just technically.
- **`product-manager`** — prioritizes which critical activity (Section 2.1) gets attention first during a multi-service disruption.

### 4.4 Risk and audit review

- **`cybersecurity-architect`** — reviews BCM/DR plans for security implications (e.g., does a failover procedure reintroduce a vulnerability closed in production).
- **`compliance-specialist`** — reviews BCM/DR plans against regulatory obligations (Section 5).
- **`qa-architect`** — reviews DR test results and post-exercise findings for quality/completeness, analogous to the template's Internal Audit review-of-exercises function, **but this is not independent audit** (see 4.7 below) — it is the existing QA function extending its normal remit to DR test artifacts.

### 4.5 Communications

- **`product-manager`** — owns customer/public-facing messaging during a disruption (what customers are told, and when).
- **`cto`** — approves public-facing statements about outages affecting customer trust or safety (e.g., a theft-dispatch path degradation).
- **`technical-writer`** — documents the incident and recovery for internal record and any required status-page/changelog entry, per [07-documentation-standards.md](07-documentation-standards.md)'s changelog policy (Security entries are never omitted).

### 4.6 Supply chain / vendor continuity

- **`integration-architect`** — owns the vendor relationships this policy's Section 3 depends on: GPS hardware vendor, payment gateway (once selected), Supabase, MongoDB Atlas. Owns knowing each vendor's own SLA/support-escalation path before an incident, not during one.
- **`devops-engineer`** — operational point of contact for vendor status pages/incident channels during an active disruption.

### 4.7 Organizational gaps — flagged explicitly, not force-fitted

Two functions from the template have **no honest home in this organization** and should not be mapped onto a role that isn't actually equipped for them:

- **SHERQ's physical-safety/evacuation function.** The template assumes a Head Office / Regional / Satellite office estate with physical employee-safety obligations (fire evacuation, workplace health and safety compliance). **This organization has no such physical-office structure** — it is a software engineering organization ([00-org-chart.md](00-org-chart.md) describes 35 engineering/product roles, no facilities or workplace-safety function). Mapping this onto, say, `site-reliability-engineer` because "reliability" sounds adjacent to "safety" would be a category error — physical workplace safety is a genuinely different discipline requiring HR/facilities/legal competence this engineering org does not have. **This is a gap, not a solved problem.** If TD IT Solution Insurance establishes physical premises with staff, this function needs a real HR/operations counterpart outside this org chart, and this policy should be revisited to add it — it is out of scope for this document as written.
- **Formal Legal Services and an independent Internal Audit function.** The template assumes a Legal Services unit (compliance/legal advice) and an Internal Audit function structurally independent of the teams it reviews (so BCM exercises are audited by people with no stake in the outcome). **Neither exists in this organization.** `compliance-specialist` (Section 4.4) provides regulatory-compliance review, but reports within the engineering organization and is not an independent audit function in the corporate-governance sense; `qa-architect`'s review of DR exercises (4.4) is quality assurance of the engineering deliverable, not independent audit of the BCM programme's governance. **This is a genuine gap for a licensed insurer** (see Section 5) — Prudential Standard GOI 1 expects independent control functions including internal audit at board level. This platform does not currently have that function, and this policy will not pretend it does by assigning the label to a role not built for it. This should be escalated to `cto` and the platform owner as an organizational maturity gap to resolve before or shortly after launch, not silently absorbed into the existing engineering roles.

## 5. Regulatory and compliance framework

The template asserts compliance with "the BCM Good Practice Guide 2018" as if it were self-evidently applicable. **This policy does not repeat that claim.** "BCM Good Practice Guide 2018" reads as a South African public-sector/generic-template artifact — it has not been verified as an applicable, binding standard for a South African FSP-licensed insurer, and this policy will not assert compliance with a standard nobody has actually confirmed applies. This is flagged as an open item for `compliance-specialist` to research and confirm or discard, not silently kept because the template had it.

What research for this policy **did** find, and can be stated with reasonable confidence (not certainty — `compliance-specialist` should verify directly against the primary sources before this is treated as final):

- TD IT Solution Insurance was confirmed, per Feature 002's compliance review (`docs/features/002-landing-page/business-requirements.md`, Section 12.5), to hold (or require) **both** an insurer licence under the **Insurance Act 18 of 2017** (Prudential Authority) and an **FSP licence** under the **FAIS Act 37 of 2002** (FSCA). Both regulators have real requirements that likely bear on this policy.
- The Prudential Authority (housed within the South African Reserve Bank) has published **42 Prudential Standards** effective under the Insurance Act 18 of 2017, including **Prudential Standard GOI 1 — "Framework for Governance and Operational Standards for Insurers."** GOI 1's stated scope explicitly includes **business continuity** as one of its named areas (alongside fitness and propriety, outsourcing management, and reporting/disclosure), and expects governance/risk systems — including independent control functions such as risk management, compliance, actuarial, and **internal audit** — proportionate to the size and complexity of the insurer. ([FSCA — Prudential Standard GOI 1](https://www.fsca.co.za/Regulated%20Entities/SAM%20DOCUMENTS/Prudential%20Standard%20GOI%201%20-%20Framework%20for%20Governance%20and%20Operational%20Standards%20for%20Insurers.pdf))
- The Prudential Authority and FSCA have also issued more recent **Joint Standards** reinforcing IT governance and risk management with board-level accountability, cybersecurity/cyber-resilience expectations, and strengthened oversight of material outsourced service providers — directly relevant given this platform's dependence on Supabase, MongoDB Atlas, and Vercel as outsourced/third-party infrastructure providers (Section 3). ([Joint Standard 2 of 2024 discussion](https://pensionsworldsa.co.za/companies/icts/joint-standard-2-of-2024-post-1-june-2025-now-what/), [Mobius Consulting on the Joint Standards](https://mobiusconsulting.co.za/navigating-the-prudential-authority-joint-standards-and-the-potential-gaps-in-your-isms-and-cyber-controls/))
- More broadly, "operational resilience" — defined as an institution's capacity to anticipate, prepare for, respond to, adapt to, recover from, and learn from disruption — is an active regulatory theme in South African financial regulation generally (the SARB issued an operational resilience directive to banks in 2021 based on Basel Committee principles); whether an equivalent formal directive applies specifically to insurers (versus banks) was **not confirmed** by this research and should not be assumed either way. ([KPMG — Operational Resilience Factsheet](https://assets.kpmg.com/content/dam/kpmg/za/pdf/2023/Operational-Resilience-Factsheet.pdf))

**Net position of this policy:** treat **Prudential Standard GOI 1** and the related Joint Standards as the credible, real, likely-applicable regulatory framework governing this platform's BCM obligations — not the template's unverified "BCM Good Practice Guide 2018." This is stated with moderate, not full, confidence: this research was conducted by an infrastructure role via web search, not by `compliance-specialist` reading the primary Prudential Standard documents and FAIS General Code of Conduct against this platform's specific licence category and size. **A proper regulatory review by `compliance-specialist` is a required follow-up before this policy can claim actual regulatory compliance**, in the same pattern Feature 002's compliance review already established for FSP/insurer disclosure requirements (`business-requirements.md` Section 12.5) — do not fabricate or assume regulatory sign-off any more than that document fabricated a licence number.

**ISO 22301** (the international BCMS standard) is retained as an **aspirational/reference framework** — a well-regarded structure for the BCM lifecycle (plan, implement, monitor, maintain, improve) that this policy's structure loosely follows, but it is **not** asserted as a certification this platform holds or is pursuing. If GOI 1 compliance work later determines ISO 22301 certification is warranted, that is a `compliance-specialist`/`cto` decision to make explicitly, not something this document pre-commits to.

## 6. Disaster recovery targets and testing

Consistent with Section 0's honesty about current maturity: **no RTO/RPO target below has been validated by an actual test.** These are proposed targets, ordered by the criticality ranking in Section 2.1, to be validated (and revised if unrealistic) once real DR drills happen.

| Critical activity | Proposed RTO (time to restore) | Proposed RPO (acceptable data loss) | Notes |
|---|---|---|---|
| Theft-report submission / dispatch handoff | < 1 hour | Near-zero (no silent drop of an in-flight report) | Highest priority — failure has real-world safety consequences |
| GPS ping ingestion | < 1 hour, degraded-but-buffered acceptable | Minutes, via queue-based buffering (see `cloud-infrastructure-architect`'s own autoscaling architecture deliverable) | Ingestion should buffer through short disruptions rather than drop pings outright |
| Backend API | < 1 hour | N/A (stateless) | Everything downstream depends on it |
| Authentication (Supabase-dependent) | Unresolved — depends on the still-open Supabase-outage fallback design (Section 3) | Unresolved | Cannot set a credible target until the fallback design named in Feature 001's architecture review is actually completed |
| Payment/billing | < 4 hours, must fail safe (no coverage lapse from a processing outage) | Zero — payment state must never be lost | `payment-engineer`/`integration-architect` to confirm against the eventual payment gateway's own guarantees |
| Admin/security-company dashboards | < 4 hours | N/A | Lower priority than the paths above |
| Notifications, reporting/analytics | Best-effort, next business day acceptable | Low priority | Degrade first under sustained disruption |

**These targets are not final and must not be quoted externally (to customers, regulators, or partners) as committed SLAs until validated by at least one real failover drill**, per the Pre-Approval Checklist's requirement that autoscaling and DR posture be tested against realistic load/failure scenarios, not assumed.

### 6.1 Testing cadence (target, not yet operating)

- **First DR drill**: to be scheduled once production infrastructure exists (not yet the case — see Section 0). This is a concrete open action for `site-reliability-engineer` to bring to `cto`, not an indefinite deferral.
- **Ongoing cadence once established**: at minimum twice yearly, aligned with the template's awareness-campaign cadence, but this platform's small size may warrant more frequent, lighter-weight drills (e.g., a quarterly "simulate Supabase unreachable" game-day) rather than one large annual exercise — `site-reliability-engineer` to propose a cadence proportionate to actual team size once staffed.
- Every drill produces a written result (what worked, what didn't, revised RTO/RPO if the target proved unrealistic) reviewed by `qa-architect` per Section 4.4, and logged for `cto`.

## 7. Backup strategy

- **MongoDB Atlas**: back-up cadence and retention should be configured at the tier `database-architect`/`cloud-infrastructure-architect` selects, using Atlas's own managed backup/point-in-time-recovery features rather than a self-built backup mechanism — this is consistent with Section 3's honest framing that this platform depends on the provider's own resilience tooling, not a parallel first-party system.
- **Supabase (Postgres)**: likewise, rely on Supabase's managed backup/point-in-time-recovery tier, with the tier and its guarantees explicitly documented (not assumed) by `cloud-infrastructure-architect`, given identity data's criticality (Section 2.1, item 4).
- **Cross-database consistency**: per ADR-0002, there is no cross-database referential integrity between Supabase (`account_id`) and MongoDB (policy/asset/claim documents referencing it). A disaster-recovery restore of one store without the other risks silently reintroducing the orphaned-reference problem ADR-0002 already names as a standing risk — `backend-architect`/`database-architect` should specify a reconciliation check to run after any restore, not assume the two stores recover in sync.
- **Backup verification**: an untested backup is not a backup — `site-reliability-engineer` owns periodically confirming restorability, not just confirming that backup jobs "ran."

## 8. Cost governance for BCM/DR

The template assigns budget ownership to a "Strategy Office," "ICT Office," and "Risk Management Office" — none of which exist here. **This platform does not currently have a formal budget process to map onto**, and this policy will not pretend otherwise. The intended ownership, once a budget process exists, is:

- **Overall BC/DR budget authority**: `cto`.
- **DR/infrastructure spend** (backup tiers, multi-region if warranted, monitoring tooling): `cloud-infrastructure-architect` + `devops-engineer`, proposed to `cto`.
- **Risk-management spend** (security tooling, compliance review, pentest cadence per [06-security-standards.md](06-security-standards.md)): `cybersecurity-architect` + `compliance-specialist`, proposed to `cto`.

Cost governance basics that **do** apply regardless of formal budget-process maturity, consistent with this role's charter:

- Tag all cloud spend by environment (dev/staging/prod) and by service (per Section 2's critical-activity list) from the first resource provisioned, not retrofitted later.
- Set a budget alert threshold before any autoscaling policy for GPS ingestion goes live — an under-monitored autoscaling policy is exactly the kind of workload that silently runs up cost as device count grows.
- Any DR-related spend increase (e.g., upgrading Atlas/Supabase tiers for better backup/failover guarantees) is a `cto`-approved decision, logged the same way an ADR is logged, given this policy explicitly disclaims having a mature separate budget-approval process.

## 9. Reporting

The template's "quarterly to Risk Committee and CEO" cadence assumes a corporate scale this pre-launch platform does not have. Adapted realistically:

- **During normal operation**: `site-reliability-engineer` and `cloud-infrastructure-architect` report infrastructure health and DR-readiness status to `cto` as part of normal technical reporting — not a separate quarterly ritual invented for this policy alone, but folded into existing reporting lines already described in [00-org-chart.md](00-org-chart.md) ("All department leads report technical decisions up to `cto`").
- **`cto`** is accountable to the platform owner for BCM posture, consistent with `cto`'s existing role as final technical authority and escalation point.
- **After any real incident** (an outage, a degraded third-party dependency, a failed or partially-failed drill): a written incident report, owned by `site-reliability-engineer`, reviewed by `cto`, distributed to the roles in Section 4 relevant to the affected critical activity. This is the realistic, event-driven cadence appropriate to current scale — a fixed quarterly cadence can be introduced once there is a steady base of production incident/drill history to report on, not invented as reporting theater before that history exists.

## 10. Awareness

- Engineers and operators (all roles in Section 4) should know this policy exists and where their responsibility sits in it — this is a documentation/onboarding item for `technical-writer` (per [07-documentation-standards.md](07-documentation-standards.md)'s onboarding doc-type ownership), not a formal training programme at this scale.
- Emergency/incident contact paths (who pages whom during a live incident) should be documented in `site-reliability-engineer`'s eventual runbooks (`docs/runbooks/`, per [07-documentation-standards.md](07-documentation-standards.md)) — not yet written, flagged as an open deliverable.
- A twice-yearly awareness cadence is retained from the template as a reasonable target once the team exists at meaningful size, but at current scale this is closer to "make sure everyone who touches this infrastructure has read this document," reviewed at onboarding and after any material policy revision.

## 11. Applicability and non-compliance

Applies to every role in [00-org-chart.md](00-org-chart.md) whose work touches the systems in Section 2's scope, and to third-party vendors this platform depends on (Section 3, Section 4.6) to the extent their contracts/SLAs permit holding them accountable. As this is currently an engineering organization without a formal HR/disciplinary process (see Section 4.7's gap notes), "non-compliance" consequences at this stage are handled through the existing quality-gate and architecture-review process ([04-quality-gates.md](04-quality-gates.md)) rather than a disciplinary framework this document cannot honestly assert exists.

## 12. Key concepts (glossary)

- **BC / BCM** — Business Continuity / Business Continuity Management: the practice of preparing for, and recovering from, disruption to critical services.
- **BIA** — Business Impact Analysis: formally assessing the impact of disruption to each critical activity (Section 2.1). **Not yet conducted for this platform** — see Section 0.
- **CRA** — Continuity Requirements Analysis: formally defining what's needed (systems, data, people) to keep a critical activity running. **Not yet conducted for this platform** — see Section 0.
- **DR** — Disaster Recovery: the technical restoration of systems/data after a disruptive event; owned tactically by `site-reliability-engineer` + `cloud-infrastructure-architect` + `devops-engineer` (Section 4.2).
- **RTO** — Recovery Time Objective: target maximum time to restore a service after disruption (Section 6).
- **RPO** — Recovery Point Objective: target maximum acceptable data loss, measured in time (Section 6).
- **SLA** — Service Level Agreement: an availability/performance commitment, either one this platform makes to customers or one a third-party provider (Supabase, MongoDB Atlas, Vercel, payment gateway) makes to this platform (Section 3).

Note: the template's **SHERQ** and **BCC** acronyms are deliberately dropped from this glossary rather than redefined against roles that don't correspond to them — see Section 4.7 for why.

## 13. Key principles

Adapted from the template, kept because they hold regardless of organizational maturity:

- **Prepare before disasters** — this policy, and the open items it names (Supabase fallback design, first DR drill, formal BIA/CRA), exist to be acted on before an incident forces the issue, not after.
- **Protect the most critical activities first** — Section 2.1's ranking exists so that under real constraint (a multi-service disruption), effort and degradation-order decisions aren't made ad hoc in the moment.
- **Recover quickly, and know honestly how quickly** — RTO/RPO targets (Section 6) are only meaningful once validated by a real drill; an untested target is a guess, and this policy says so rather than dressing a guess up as a commitment.
- **Third-party dependency is a first-class risk, not a footnote** — Section 3's entire premise: this platform's actual resilience is bounded by Supabase's, MongoDB Atlas's, and Vercel's own resilience, and that must be actively managed (monitored, contractually understood, designed around), not assumed away.
- **Test regularly, and record what the test actually found** — an untested DR plan is a hypothesis, not a plan; Section 6.1's drills exist to convert this document from hypothesis to verified practice over time.
- **Be honest about maturity** — this entire document's organizing principle (Section 0): describing capability that doesn't exist yet as if it does is a bigger risk to this platform than admitting the gap plainly.
