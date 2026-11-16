# 18GPS platform + U907 tracker — vendor API folder

Owner: `integration-architect` · Opened 2026-11-16 by `cto` after physical trackers arrived.

| File | What it is |
|---|---|
| `18gps-open-api-brief.md` | Agent brief for the 18gps Open API (v2021.5), translated from the vendor's Chinese document. Read first. |
| `18gps-open-api-endpoints.md` | All 61 endpoints with parameters and example responses. |
| `u907-device-notes.md` | What the U907 tracker's printed manual actually says (SMS commands, modes, radio, SIM). |
| `probe-findings-2026-11-16.md` | What a read-only probe of the live platform showed, using the supplier-issued login. |

**Status:** this is evidence for the open GPS-hardware-vendor decision
(`docs/organization/gps-hardware-vendor-scorecard.md`, Candidate E) and for
**ADR-0018 (Proposed)**. Nothing in this folder authorises wiring 18gps into the
production ingestion path. `backend/src/lib/tracking-profile.ts` stays vendor-agnostic
until ADR-0018 is Accepted.

**Credentials:** the supplier's platform login must never appear in this folder, in
source, or in any committed file. See `probe-findings-2026-11-16.md` §5 for why the login
currently in hand is not one TD IT should use at all.
