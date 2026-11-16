# ADR-0018: GPS Tracker Pilot — U907 hardware and the 18gps platform (integration route)

Status: **Proposed — not Accepted.** This ADR frames a decision now that physical hardware
exists. It does not select a production fleet vendor, does not authorise wiring any vendor into
the production ingestion path, and does not displace the scorecard's §9 Standing Decision Rule.
Ratification requires `cto` + `solution-architect`, with `cybersecurity-architect` and
`compliance-specialist` sign-off on the items in §5 first.

Date: 2026-11-16
Author: `cto` (drafting for `integration-architect`, who owns the recommendation)
Supersedes: nothing. Extends ADR-0009 (self-asserted location trust boundary) by adding the
first concrete `source: hardware_tracker` candidate.

## Context

- Feature 009 Phase 4 built a vendor-agnostic device registry and capability gate
  (`backend/src/routes/tracking-devices.ts`, `backend/src/lib/tracking-profile.ts`). Devices
  sit in `pending_vendor` and the UI honestly says "hardware vendor integration is pending".
- `docs/organization/gps-hardware-vendor-scorecard.md` ran to its 2026-10-05 deadline with no
  Category 2 commitment, so the OEM default (Digital Matter / Teltonika) applies by its §9 rule.
  No ADR ratified that outcome and no hardware was bought under it.
- On 2026-11-16 the business received a lot of **U907** magnetic 2G trackers from a supplier
  who operates on the **18gps** hosted platform, together with an API document (2021.5) and a
  platform login. Full evidence: `docs/vendor-apis/18gps/`.
- A read-only probe of the platform the same day established (see `probe-findings-2026-11-16.md`):
  the documented production API host has no TLS; HTTPS works only via the `www` host with a
  DV certificate expiring 2026-11-21; the platform and the device's default report server are
  in mainland China; the login supplied is the supplier's master account containing 602 of the
  supplier's and other customers' devices; the API is polling-only; WGS84 output works;
  battery and GSM level are reported for the U9 family.
- The U907 reports to a server IP:port set by SMS (`SZCS#SERVIP=…`). The device protocol is
  not in the manual.

## Decision being framed

Which route the **pilot** uses to get U907 location data into the platform, so that Feature
009 Phase 4/5 (device activation, live tracking, hardware-attested recovery) can be exercised
with real hardware.

### Route A — read through the 18gps hosted platform

Backend polls a TD IT-only 18gps account (login kept in Render secrets) via HTTPS on the
`www` host: `getDeviceListByCustomId` with empty `mapType` for positions,
`queryLocalAlarmInfoUtc` for alarms, `getHistoryMByMUtcNew` for history. An `EighteenGpsProvider`
adapter maps rows by `key` name into the existing `DeviceCapabilitySet` / `LocationFix` shapes.

- Pro: fastest to a working pilot; no device protocol needed; geofence, history and commands
  already exist server-side.
- Con: customer location data is processed in China before we see it (POPIA s72 transfer,
  DPA needed); plaintext production host and a weak CA chain; 20-minute token with password
  in query; no push so alert latency = our poll interval + device interval; Part 3 admin
  calls unavailable so device onboarding is manual via the supplier; API doc already drifted
  from the live schema.

### Route B — self-host ingestion, repoint the devices

SMS each unit `SZCS#SERVIP=<our ingest host>#SERVPORT=<port>`. Run a TCP listener (new
service, Render private service or a small VM) that parses the U907 protocol and writes
`location_events` + `device_telemetry` into MongoDB behind the existing kill switch.

- Pro: data never leaves our Render + MongoDB Atlas boundary; removes the TLS, DPA and
  shared-account problems in one move; fits ADR-0009's `device_attested` discriminator
  cleanly; maximum portability (G7).
- Con: requires the **device protocol specification** from the supplier (not yet in hand);
  we own uptime of a raw TCP ingress (new SRE surface, `site-reliability-engineer`); no
  platform-side geofence/history for free; if the protocol is a known Chinese OEM dialect
  (GT06-family is the most common in this supplier's catalogue) an existing open-source parser
  may cover it, otherwise we write one.

### Route C — both, sequentially

Pilot on Route A for two to four weeks using a dedicated TD IT sub-account and **test
devices only, no customer assets**, while the supplier supplies the protocol document; then
move to Route B for anything customer-facing. Route A code stays an isolated adapter that
is never the production provider.

## Recommendation (for ratification, not yet decided)

**Route C**, with the hard condition that **no customer-registered asset is linked to a
U907 until Route B is live or `compliance-specialist` has ruled Route A lawful with a signed
DPA.** Rationale: Route A alone fails the scorecard's G3 and the cross-border test; Route B
alone cannot start today because the protocol is unknown; C lets engineering exercise Phase
4/5 on real hardware now without putting customer location data through a China-hosted,
partly-plaintext platform.

Separately, this ADR does **not** make the U907 the production fleet device. Its
sleep-without-heartbeat behaviour is an open G2 concern (the 2G concern was withdrawn
2026-11-16: the lot is 4G per the owner); the scorecard's OEM default stands for volume procurement until a follow-up ADR.

## Consequences

- `TrackingProviderId` gains a concrete `'hardware'` branch populated by one adapter
  (`EighteenGpsProvider` for A, `U907DirectProvider` for B). `tracking-profile.ts`'s public
  shape does not change (scorecard §6 constraint honoured; `backend-architect` to confirm).
- New Mongo collections `location_events` (time-series) and `device_telemetry` per Feature 009
  doc 07 §4, `database-architect` to design indexes and retention (POPIA minimisation).
- Device status transitions `pending_vendor → activating → active` become real; mobile
  activation screens stop showing the pending copy for U907-linked assets.
- Ingestion remains behind the existing kill switch and ADR-0009's rule that hardware
  location alone does not trigger dispatch without a case.

## Open items that gate ratification

| # | Item | Owner |
|---|---|---|
| 1 | Supplier provisions a TD IT-only enterprise account or sub-account containing only our IMEIs; rotates the master login that was shared. | `integration-architect` |
| 2 | Supplier provides the U907 device communication protocol document and confirms which SA APN/SIM profile the lot is configured for. | `integration-architect` |
| 3 | ~~Confirm radio (2G-only or not) on the delivered units and the current SA 2G switch-off timetable.~~ **Resolved 2026-11-16:** owner confirms the lot is 4G. Residual ask: LTE bands for SA and 2G fallback behaviour. | `integration-architect` |
| 4 | Cross-border transfer ruling, DPA requirement, retention period for `location_events`. | `compliance-specialist` |
| 5 | Threat model for Route A (credential in query string, DV CA, shared platform) and Route B (unauthenticated TCP ingress, SMS reconfiguration by anyone holding the SIM number). | `cybersecurity-architect` |
| 6 | ~~IMEIs of the delivered units, so they can be matched against the platform's never-activated U9 rows.~~ **Resolved 2026-11-16:** IMEIs `869890083100051` and `869890083130629` supplied. Neither is in the supplier master account's direct list (probe findings §7); ask the supplier which account holds them and which protocol they speak (prefix hint: GT06N). | business owner → `integration-architect` |
| 7 | TLS chain validation from Render to `www.18gps.net`, and whether the cert expiring 2026-11-21 is renewed. | `gps-integration-engineer` |

## Revisit triggers

- Supplier cannot or will not provide the protocol document: Route B dies, decide A-with-DPA
  versus abandoning this hardware lot for the OEM default.
- Supplier offers a webhook/MQTT push or an EU/SA-hosted instance: re-score G3 and the
  residency item.
- SA 2G switch-off date lands inside the intended service life: U907 is pilot-only, full stop.

## Addendum 2026-11-16 — business direction received

The business owner stated the same day: TD IT wants its **own platform and dashboard connected
directly to the devices**, not a dashboard built on top of the supplier's platform. This makes
**Route B the target state**. Route A (reading through 18gps) is at most a short-lived stopgap
for exercising the two pilot units while the device protocol is confirmed, and may be skipped
entirely if the protocol is confirmed as GT06-family quickly. The §Recommendation stands with
that re-weighting; the gating items in §Open items are unchanged, with item 2 (protocol
document) now the critical path. Recorded by `cto`; `integration-architect` to carry into the
final recommendation.
