# Contract TDIT-2026-09 — Sanitized Scope Summary

**Owner:** `business-analyst` (formalization) · **Status:** Reference — contract signature status
flagged below, do not treat as fully binding until confirmed
**Purpose of this document:** a sanitized, operationally-relevant extract of contract TDIT-2026-09
for internal planning use by `product-manager`, `technical-project-manager`, `cto`, and engineering
roles who need to know what is and isn't funded/authorized — **not** a reproduction of the contract
itself. No banking details, personal phone numbers, or personal emails from the source document are
recorded here or anywhere else in this repo.

---

## 1. Parties and term

- **Developer:** NextWave Digital Solutions (this engineering org, "us").
- **Client:** TD IT Solution (Pty) Ltd ("Client").
- **Contract reference:** TDIT-2026-09.
- **Term:** 12 months, 1 September 2026 – 1 September 2027.
- **Retainer:** R3,000/month · **Total contract value:** R36,000 over the full term.

**Status:** Confirmed signed by both parties (per Developer representative, 2026-08-28). All terms
in this document are treated as fully binding.

## 2. In-scope modules (Schedule A)

The retainer covers ongoing work across the following modules, all already tracked in this repo in
some form **except item 4**:

1. Customer Mobile App
2. Admin Dashboard
3. Security Dashboard
4. **Call Centre Dashboard** — new, not previously tracked anywhere in `docs/organization/` or
   `docs/features/` prior to this contract. See §3.
5. Backend / API
6. Database
7. GPS Integration

## 3. Call Centre Dashboard — new in-scope surface

**The Call Centre Dashboard is already in scope under the existing retainer per Schedule A — no
Change Request is required to begin planning or building it.** This is a materially new product
surface with its own operator role (a call-centre agent/operator persona distinct from Admin,
Security Company, and Customer), not a variant of an existing dashboard.

Cross-referenced against current planning docs:

- **`docs/organization/north-star-2000-dau.md`** — did not previously mention a Call Centre
  Dashboard anywhere in its milestone table (§3) or blockers table (§6). Updated by this task —
  see the diff summary at the end of this document.
- **`docs/organization/roadmap-release-gate-a.md`** — scoped strictly to Release Gate A (auth,
  policy/asset flows, existing Admin/Security surfaces, compliance conditions); no Call Centre
  Dashboard item exists in its backlog (§1) or ship/no-ship lists (§2). **Not added to Release
  Gate A scope by this document** — Release Gate A is explicitly gated and should not silently
  absorb a new surface. Call Centre Dashboard should be sequenced as its own item once Release
  Gate A closes, per `technical-project-manager`.
- **`docs/organization/sprint-plan-release-gate-a.md`** — same scope boundary as
  `roadmap-release-gate-a.md`; no changes made there by this task for the same reason.

**Next step flagged, not actioned here:** per `docs/organization/02-feature-lifecycle.md`, a
product surface of this size (new dashboard, new operator role, its own auth/permission boundary,
likely its own data views into recovery-cases/security-cases and possibly customer/policy data)
should almost certainly become its own numbered feature folder under `docs/features/` (e.g.
`010-call-centre-dashboard/`) starting at Stage 1 (Business Requirements). This is judgment-flagged
rather than created in this pass: creating the folder without at least a `product-manager` scoping
pass first risks pre-committing requirements before intent is confirmed (what does a call-centre
agent need to see/do — read-only case lookup? ability to log a call against a policy/customer?
escalate to Security Company Dashboard? create a recovery case?). `product-manager` should confirm
scope intent before `business-analyst` opens Stage 1 for a `010-call-centre-dashboard` feature.

## 4. Security-company tablet — hardware/software split (do not conflate)

The contract addresses a client ask for security-company field tablets. The scope split is
explicit and must not be blurred in any future planning document:

- **Excluded from retainer scope (Client's responsibility):** physical tablet procurement — sourcing,
  purchasing, provisioning, and owning the hardware devices themselves.
- **In scope under the retainer:** making the existing Security Dashboard (`src/security/*`)
  **tablet-web-optimized** — i.e. responsive/usable on a tablet-sized browser viewport. This is a
  web/UI responsiveness scope item, not a native tablet app and not a hardware line item.

Any future roadmap or sprint-plan entry referencing "security-company tablets" must cite this split
explicitly — the tablet-web-optimization UI work is ours; the physical device is the Client's.

## 5. Other Client-paid, non-retainer cost items

The following are explicitly Client-paid and not covered by the R3,000/month retainer — relevant
context for `integration-architect`, `cloud-infrastructure-architect`, and anyone scoping vendor
selection so cost expectations aren't silently assumed to be inside engineering's budget:

- GPS hardware (tracker devices, procurement/logistics)
- Payment gateway fees
- SMS costs
- Hosting costs
- Third-party API fees generally

This aligns with the existing repo position that payment gateway and GPS hardware vendor are open
decisions with real, Client-borne cost implications, not free-to-select engineering choices.

## 6. Change Request procedure — governs anything outside Schedule A

Any "major new feature, module, or integration not expressly described in the Agreement" requires
the contract's Change Request procedure, not silent scope absorption into the retainer:

1. Written request from the requesting party.
2. 3-business-day quote turnaround.
3. 50% non-refundable advance required before work starts.

**Practical implication for planning:** anything in Schedule A (§2 above, including Call Centre
Dashboard) proceeds under the retainer with no CR needed. Anything *not* in Schedule A — e.g. a
future ask like a customer-facing loyalty program, a new external integration, a data-warehouse
build — needs a Change Request before `technical-project-manager` sequences it, regardless of how
small it seems. Flag any such ask to `cto`/`product-manager` rather than treating it as "just
another sprint item."

## 7. Retainer exclusions relevant to QA/security commitments

The monthly retainer explicitly does **not** include:

- Professional security audits
- Penetration testing
- 24/7 guaranteed support
- Guaranteed uptime
- Guaranteed GPS accuracy

**Relevant to `qa-architect` and `security-engineer`:** do not represent any SLA, uptime commitment,
audit cadence, or accuracy guarantee in customer-facing copy, release notes, or contractual
correspondence that this retainer does not actually fund. If the business wants to offer any of
these, it is a Change Request / separate commercial conversation, not an assumed retainer
inclusion.

## 8. Informational note — Client licensing status at contract drafting

The contract lists the Client's Registration No., Insurer Licence, and FSP No. all as **"[Pending]"**
as of drafting. This is recorded here as a factual note for context only — it is consistent with
this repo's existing standing flag (see `north-star-2000-dau.md` §4) that whether TD IT Solution
Insurance is itself licensed/authorized to sell the policies this platform registers is an open
regulatory/business question upstream of engineering, not something this document resolves or
editorializes on.

---

## Summary — what this contract does and doesn't establish

- Provides a **funding and scope baseline** for the platform: a small monthly retainer (R3,000/mo,
  R36,000 total over 12 months) covering ongoing work across seven named modules, including the
  newly identified Call Centre Dashboard.
- Does **not** fund security audits, penetration testing, uptime/SLA guarantees, or GPS accuracy
  guarantees — those remain unfunded commitments if ever promised externally.
- Does **not** fund hardware (GPS trackers, tablets), payment gateway fees, SMS, hosting, or
  third-party API costs — all Client-paid separately.
- Reflects a confirmed, signed agreement as of 2026-08-28 — terms are fully binding.
- Does **not** by itself resolve the Client's own insurer-licensing status, which remains
  "[Pending]" per the contract's own text.

## Decisions (cto)

1. **Call Centre Dashboard scoping** — deferred until Release Gate A closes; current sprint
   capacity stays committed to Release Gate A items. `product-manager` opens the
   `010-call-centre-dashboard` scoping pass once that gate closes.
2. **Tablet-web-optimization sequencing** — tracked as its own explicit backlog item, not folded
   silently into general Security Dashboard work.
