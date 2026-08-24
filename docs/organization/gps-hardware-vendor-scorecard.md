# GPS Hardware Vendor Scorecard

Owner: `integration-architect`
Status: **In progress — scorecard kickoff.** No vendor selected. Final ratification will be recorded as a future ADR (number reserved at selection time, following `0001`–`0009` sequencing convention in `docs/organization/adr/`).
Date opened: 2026-08-24
Target decision date: **2026-10-05** (6 weeks from kickoff)
Deciders on ratification: `integration-architect` (recommendation) → `cto` + `solution-architect` (joint sign-off), per this role's standing authority. Consulted before ratification: `cybersecurity-architect` (device-credential trust boundary — see below), `compliance-specialist` (location-data lawful basis, already partially ruled on for self-device tracking in `docs/organization/adr/0009-self-asserted-location-ingestion-trust-boundary.md`), `gps-integration-engineer` (implementation feasibility), `backend-architect` (ingestion pipeline fit).

**Current repo state note (honesty check, per `07-documentation-standards.md`):** no GPS hardware vendor is integrated anywhere in this repository. `backend/src/lib/tracking-profile.ts` (Feature 009 Phase 4) implements a vendor-agnostic tracking-profile abstraction with a `hardware_pending` provider state — assets awaiting hardware pairing get a placeholder profile ("Hardware vendor integration is pending") rather than any vendor-specific data shape. `Asset.gpsDeviceId` / `gpsPairedAt` exist in the asset schema and are written `null` on every create; nothing populates them. **This scorecard's outcome must slot into that existing abstraction without requiring it to be redesigned** — see §6.

**Related, binding context:** ADR-0009 §9 records that "the hardware pipeline, whenever its vendor is chosen, slots into SDL-1's discriminator [`source: hardware_tracker`, `assertionMode: device_attested`] rather than requiring a redesign" and explicitly states "no vendor is chosen, implied, or constrained beyond SDL-1's discriminator." This scorecard is the process that eventually resolves that open question — it does not pre-empt ADR-0009, and nothing here revisits SDL-1/SDL-2.

---

## 0. Hard constraints (given, not open for debate)

1. **Vendor-agnostic abstraction preserved until ratification.** `tracking-profile.ts` and the `TrackingProviderId` type in `backend/src/lib/tracking-device-types.ts` must not be hardcoded to a specific vendor's payload shape before this scorecard concludes and the ADR is ratified. Vendor-specific adapter code (if any is written for evaluation/sandbox purposes) stays isolated and is not wired into the production ingestion path pre-ratification.
2. **Asset-recovery fitness, not generic fleet telematics.** The product need is: locate and help recover a *stolen or lost* insured asset (primarily vehicles initially, with a roadmap toward other trackable equipment) — not fleet management, driver behavior scoring, or logistics optimization. Vendors are scored on recovery-relevant capability (tamper/jam detection, fast ping-on-alert, law-enforcement/security-partner handoff support), not on fleet-dashboard feature breadth.
3. **South African coverage.** GSM/cellular network coverage and, where relevant, an existing security-company/armed-response ecosystem relationship in South Africa — this platform coordinates with security-company partners on dispatch (per this role's mandate), and a device ecosystem with zero SA field-response relationships is a weaker fit regardless of hardware quality.

---

## 1. Scored evaluation criteria

| # | Criterion | Weight | What "5" looks like |
|---|---|---|---|
| G1 | Device coverage & accuracy | 20% | GPS + GSM + (ideally) Wi-Fi/BLE fallback positioning; sub-10m accuracy in open sky; documented indoor/jammed-signal degraded-mode behavior rather than silent failure. |
| G2 | Ping frequency / battery trade-off | 15% | Configurable reporting interval with a documented battery-life curve at each interval; supports both scheduled low-power pings and an on-demand/alert-triggered high-frequency burst mode (critical for a "just reported stolen" moment). |
| G3 | API/webhook quality | 20% | Signed, documented webhook push for location/status/alert events (not polling-only); clear payload schema; sandbox/test environment; reasonable rate limits for a growing device fleet. |
| G4 | Security-company ecosystem compatibility | 15% | Vendor or its SA distributor already has, or can plausibly build, a dispatch/response relationship with SA security-company partners — directly (own recovery network) or indirectly (open API a partner's system can consume). |
| G5 | Cost per device (hardware + airtime/data + platform fee) | 15% | Transparent, predictable per-device economics at the volumes this platform will actually deploy (from `product-manager`'s projections), no forced multi-year hardware lock-in. |
| G6 | Geographic coverage | 5% | Full SA GSM coverage including the connectivity profile of rural/peri-urban recovery scenarios, not only metro. |
| G7 | Data portability / exit terms | 10% | Device firmware/credentials not permanently bound to one platform account; reasonable data export; no proprietary lock-in that makes switching vendors mid-fleet prohibitive (this role's standing best practice against vendor lock-in). |

---

## 2. Candidate shortlist (research pass, 2026-08-24)

Two distinct vendor categories exist for this decision, and the shortlist deliberately spans both because they answer different parts of the requirement:

- **Category 1 — white-label/OEM GPS hardware + platform vendors**, who sell devices and a webhook/API layer that *we* would integrate directly, but bring no built-in SA recovery/dispatch network of their own (we'd supply that via our own security-company partner integration, per this role's separate `docs/organization/` security-partner spec work).
- **Category 2 — SA-established stolen-vehicle-recovery (SVR) operators**, who bring their own device, monitoring center, and existing armed-response/recovery network, but whose API/webhook openness for a third-party insurance platform to integrate against needs direct verification (their core product is B2C direct-to-driver, not B2B platform integration).

Sourced from public vendor documentation and SA telematics-market material current as of this research pass; **not yet independently verified to first-party contract/API-doc text** for pricing, SLAs, or exact webhook auth mechanism.

### Candidate A — Digital Matter (Category 1)
- **What it is:** GPS/IoT hardware manufacturer (Oyster/Bolt device families), globally deployed including active SA use cases (e.g. wildlife-anti-poaching asset tracking via SA integrator TG Tracking).
- **Fit signal:** Purpose-built battery-powered asset trackers (not only vehicle-installed units) — a better structural fit than vehicle-only SVR hardware for the platform's multi-asset-class scope (vehicles, equipment, potentially high-value portables). Documented APIs for third-party platform integration (G3). Configurable reporting intervals with published battery-life data (G2).
- **Open questions:** no native SA recovery/dispatch network (G4) — we would need to pair Digital Matter hardware with our own security-company partner integration rather than inheriting one; SA-specific airtime/SIM cost (G5, G6) needs direct quoting through an SA distributor/reseller, not the global price list.

### Candidate B — Teltonika Telematics (Category 1)
- **What it is:** Lithuania-based GPS/IoT hardware manufacturer, broad device catalog including autonomous asset trackers (e.g. TAT100) and Bluetooth accessory sensors (EYE line) for non-powered-asset tracking.
- **Fit signal:** Strong developer/API documentation reputation (G3), wide device range spanning vehicle OBD trackers through battery-powered asset tags — flexibility across the platform's asset-type roadmap (vehicles today, other equipment later). Large global install base and SA distributor availability (G6 plausible).
- **Open questions:** same structural gap as Digital Matter on G4 (no built-in SA recovery network); needs direct verification of webhook signing/idempotency practices (G3) rather than assumed from general reputation; per-device cost at SA import/distributor pricing unverified (G5).

### Candidate C — Cartrack (Category 2)
- **What it is:** SA-founded (JSE/Nasdaq-listed), one of the largest stolen-vehicle-recovery and fleet telematics operators in South Africa, with an established recovery response network reporting a large multi-year recovery track record.
- **Fit signal:** Strongest G4 fit by far — an existing SA armed-response/recovery ecosystem is Cartrack's core product, not something we'd have to build. Full SA geographic coverage (G6) is a given for a market incumbent.
- **Open questions:** Cartrack's core business is direct-to-consumer/fleet subscription tracking, not a B2B device+API play for a third-party insurance platform to embed — third-party API/webhook access for platform integration (G3), white-label or wholesale device supply terms, and whether their recovery network would even action a request originating from an external insurer's dispatch rather than their own monitoring center, all need direct commercial engagement to confirm. This is the single biggest open question on this candidate and could disqualify it if their model is closed.

### Candidate D — Tracker (Category 2)
- **What it is:** SA-founded (Naspers-associated history), long-established SA vehicle recovery and tracking operator with a national Emergency Control Centre model, similar market position to Cartrack.
- **Fit signal:** Same G4/G6 strength as Cartrack — mature SA recovery-network incumbent.
- **Open questions:** identical structural question to Cartrack — is third-party platform-level API/webhook integration commercially and technically available, or is their product closed to direct-consumer channel only. Needs direct vendor engagement, not assumed from public marketing material.

**Deliberately not shortlisted, but noted for completeness:** Queclink and Concox (Chinese OEM GPS hardware manufacturers, commonly white-labeled by SA resellers) were considered per the original brief but are typically sold *through* an SA reseller/platform layer rather than directly — if Candidates A/B's SA distributor economics (G5/G6) are weak, a Queclink/Concox-via-SA-reseller path is a plausible fallback worth a follow-up look, not dropped outright.

---

## 3. The Category 1 vs Category 2 tension — the real open question this scorecard exists to resolve

This is worth stating plainly rather than leaving implicit: **the four candidates don't compete on the same axis.** Digital Matter/Teltonika win on integration openness and multi-asset-class flexibility but require building our own dispatch relationship from scratch. Cartrack/Tracker win on an existing SA recovery network but may not offer the kind of open device+API integration this platform's GPS Integration Layer contract needs. It is plausible the eventual recommendation is not "pick one" but **"Category 1 hardware/API + our own security-company partner integration"** as the architecturally cleaner and more defensible-against-lock-in path (this role's standing best practice against vendor lock-in weighs against a Category 2 vendor that bundles hardware + monitoring + dispatch as one inseparable contract). That hypothesis is explicitly not decided here — it is what the Week 3–4 vendor engagement calls in §5 are for.

---

## 4. What's still open before scoring can be finalized

| Item | Owner | Needed by |
|---|---|---|
| Direct vendor engagement calls: confirm Cartrack/Tracker third-party API/dispatch-integration availability (G4, the single biggest unknown) | `integration-architect` | Week 2 (by 2026-09-07) |
| SA distributor/reseller pricing quotes for Digital Matter and Teltonika at realistic fleet-growth volumes (G5, G6) | `integration-architect` | Week 2–3 |
| Location-data trust-boundary review for hardware-attested pings against ADR-0009's `assertionMode: device_attested` discriminator | `cybersecurity-architect` | Week 3–4 |
| Sandbox test of webhook delivery, signing, and retry semantics for the top 1–2 candidates | `gps-integration-engineer` | Week 4–5 |
| Confirm scorecard outcome requires no change to `tracking-profile.ts`'s public shape, only a new populated `TrackingProviderId` branch | `backend-architect` | Week 5 |

---

## 5. Working timeline to 2026-10-05

| Week | Dates | Milestone |
|---|---|---|
| 1 | 2026-08-24 – 2026-08-30 | Scorecard kicked off (this document). Shortlist frozen at A–D. `backend-architect` confirms abstraction-layer constraints (§0 item 1). |
| 2 | 2026-08-31 – 2026-09-06 | Vendor engagement outreach begins: Cartrack/Tracker commercial contacts to resolve G4's open question; Digital Matter/Teltonika SA distributor pricing requests. |
| 3 | 2026-09-07 – 2026-09-13 | Vendor calls/responses land. §3's Category 1-vs-2 question gets a working answer. `cybersecurity-architect` begins the ADR-0009 device-attestation trust-boundary review. |
| 4 | 2026-09-14 – 2026-09-20 | Sandbox/API trial begins for the leading 1–2 candidates (`gps-integration-engineer`). Scoring table (§1) partially populated. |
| 5 | 2026-09-21 – 2026-09-27 | Sandbox trial results in. Scoring table fully populated. Draft recommendation written, including the Category 1 + own-dispatch-integration hypothesis outcome. |
| 6 | 2026-09-28 – 2026-10-04 | Joint review session with `cto` + `solution-architect` + `cybersecurity-architect` + `compliance-specialist`. ADR drafted. |
| Decision | **2026-10-05** | ADR submitted for ratification, following `07-documentation-standards.md`'s ADR template and `.cursor/rules/adr-process.mdc`. |

---

## 6. Constraint on the abstraction layer (binding for this scorecard's duration)

Per the CTO mandate: **`backend/src/lib/tracking-profile.ts` remains vendor-agnostic until this scorecard concludes.** Concretely:

- No vendor-specific field names, payload shapes, or SDK types may be merged into `tracking-profile.ts`, `tracking-device-types.ts`, or the `tracking-devices` repository ahead of ADR ratification.
- Any sandbox/evaluation code written to test a candidate's API (§4) lives outside the production ingestion path (e.g. a scratch script or an isolated evaluation branch), not merged to `main`.
- The eventual winning vendor's integration is expected to populate the existing `hardware_pending` → `active` status transition and the existing `capabilities` shape in `tracking-device-types.ts` — if a candidate's data model cannot be expressed in that existing shape without a breaking redesign, that is itself a scoring signal against G7 (portability) and gets flagged explicitly in the final recommendation, not silently absorbed.

## 7. Leading candidate (informal, pre-scoring)

**Not a decision, and less settled than the payment gateway pick** — the Category 1/2 tension in §3 is a genuine open question, not a formality. If forced to state a working hypothesis today: **Digital Matter or Teltonika (Category 1) paired with this platform's own security-company partner dispatch integration** is the architecturally cleaner starting hypothesis, because it avoids bundling hardware, monitoring, and dispatch into one vendor contract (this role's standing anti-lock-in principle) and fits more naturally with the multi-asset-class roadmap (vehicles now, other equipment later) that a vehicle-only SVR incumbent's hardware isn't built for. **Cartrack and Tracker remain live candidates** and would become the stronger pick if Week 2's vendor engagement reveals they offer genuine third-party API/dispatch integration — that single fact, not yet known, is the fulcrum of this whole decision.

## 8. Revisit triggers

- Week 2 vendor engagement reveals Cartrack or Tracker offers a genuine open B2B integration path — re-weight G4 findings and re-run scoring with that resolved.
- `cybersecurity-architect`'s device-attestation review surfaces a trust-boundary requirement (e.g. device-credential model) that a candidate's SDK cannot support — disqualifying, not merely a score deduction.
- A materially different vendor is identified before 2026-10-05 with a stronger fit — added to §2, not excluded by the deadline.
- Any candidate's data model cannot fit `tracking-profile.ts`'s existing `TrackingProviderId`/`capabilities` shape without a breaking change — flagged to `backend-architect` before ratification, not discovered after.
