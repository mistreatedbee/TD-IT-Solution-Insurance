# ADR-0022: Software-Agent Tracking for Computers and TVs (extends ADR-0009 beyond phones)

Status: Proposed
Date: 2026-11-20
Deciders: `solution-architect` (proposing). Requires: `cybersecurity-architect` (trust boundary, new credential class), `compliance-specialist` (consent, other users, employees, retention, IP data), `mobile-architect`, `backend-architect`, `database-architect`; ratification by `cto`.

Plan: [Feature 022 README](../../features/022-software-tracking-laptops-desktops-tvs/README.md).

## Context

Owner direction, 2026-11-20: phones, laptops, computers and TVs will be tracked with our own
software, not a GPS hardware device. Hardware trackers (ADR-0018 U907 pilot) remain for vehicles and
business equipment.

Verified on main, 2026-11-20:

- `resolveTrackingProfile()` (`backend/src/lib/tracking-profile.ts`) gives `self_device` to
  `smartphone` only. `laptop`, `desktop` and `tv` get `hardware_pending` and "Connect a GPS tracker".
- `POST /v1/assets/:assetId/location-report` (`backend/src/routes/assets.ts`) rides the user's
  session, rejects non-phones (`not_smartphone`), and does not check the stored consent record
  (INC-001 A-7).
- ADR-0009 SDL-3 forbids a new credential class for self-device ingestion. SDL-11 locks ingestion to
  `smartphone`. Both were written for phones and are correct for phones.
- No desktop or TV software exists in the repo.

A laptop or TV agent cannot use the phone model. It must work when nobody is signed in, it must not
hold the customer's session, and it runs on a device a thief may control. That is a new trust
boundary decision, so it gets an ADR.

## Decision

1. **Software agents are a third location source.** Laptops, desktops and TVs are tracked by our own
   installed agent. Records carry `source: 'software_agent'`, set by the server from the ingestion
   path, never from the request body. `self_device` stays the phone/mobile-app path.
   `hardware_tracker` stays the vendor path. This follows ADR-0009 SDL-1.
2. **All ADR-0009 requirements apply to agent records unchanged, except the two below.** In
   particular SDL-2 holds: an agent location is `self_asserted` and may not alone dispatch a partner,
   decide a claim, or change pricing. SDL-4 (server-side consent), SDL-5 (read side inherits
   ADR-0006), SDL-6 (no coordinates in logs/URLs; encryption evaluation), SDL-7 (server clock),
   SDL-8 (scheduled purge before ship) and SDL-9 (step-up and email on opt-in/out) all apply.
3. **Scoped exception to SDL-3: a per-device agent credential.** Each agent holds its own key pair
   in the OS keystore. The server stores only the public key. The agent exchanges a signed assertion
   for a short-lived token. The credential can only check in, report location, and read its own
   theft-mode flag. It is created only by a customer-approved pairing (short code / QR, approved
   from a signed-in session with step-up). It is revocable immediately. It never carries or becomes
   the customer's session. The one unauthenticated surface added is the pairing-request endpoint,
   which must be strictly rate-limited and reviewed at Stage 8.
4. **Scoped exception to SDL-11: asset types.** The agent path accepts `laptop`, `desktop` and `tv`
   only. The phone path stays `smartphone` only. Each path enforces its own list server-side.
5. **Consent is checked on every agent write.** No active consent record for (account, asset,
   agent) means the write is refused, not dropped. This closes INC-001 A-7 for agent devices. The
   same check should be added to the phone path; that is a fix under ADR-0009, not a change to it.
6. **Every record states method and accuracy.** `positionMethod` (`gnss` | `wifi` | `ip` |
   `unknown`) and `accuracyMeters` are required. IP-derived locations are shown as an area, never a
   pin. Agents use the OS location service and may not bypass OS permissions.
7. **Server-controlled cadence.** The server sets each agent's check-in interval and theft mode.
   Rate limits apply per agent and per account (MP-7).
8. **No covert behaviour.** The owner can always uninstall. A visible notice stays on the device.
   No hidden persistence, no webcam or screen capture. Remote lock/wipe needs MDM and a separate
   decision.
9. **Platform support order:** Windows, then macOS, then Android TV / Google TV. Linux and Fire TV
   deferred. Samsung Tizen, LG webOS and Apple tvOS not supported, because third-party apps there
   cannot run in the background or get useful location.

## Alternatives Considered

- **Reuse the phone path (user session on the laptop/TV).** Rejected. A long-lived customer
  session on an unattended device that may be stolen is worse than a narrow device credential. It
  also stops working when the user signs out.
- **Label agent records `self_device`.** Rejected. SDL-1 requires `source` to reflect the ingestion
  path. These are different paths with different credentials and different failure modes.
- **GPS hardware for laptops and TVs.** Rejected by owner direction. Also costly per unit and hard
  to fit inside a laptop or TV.
- **Shared static API key in the installer.** Rejected. One extracted key would let anyone write
  locations for any asset.
- **Our own Wi-Fi scanning and positioning, bypassing OS location permission.** Rejected. It
  undermines consent and modern Windows and macOS treat it as location access anyway.
- **Covert or self-reinstalling agent ("anti-theft rootkit").** Rejected. POPIA transparency, store
  rules, antivirus flags, and harm if the update channel is ever compromised.
- **Support every TV OS.** Rejected. It would promise tracking that cannot work.

## Consequences

- A new credential class, a new unauthenticated pairing endpoint, and a signed update channel join
  the attack surface. The update channel is the largest new risk; it must be protected like a
  production deploy.
- New costs: Apple Developer Program, Windows code signing, possibly an IP-geolocation data vendor.
- A desktop codebase (recommended Tauri; open decision) and a small Android TV app join the repo.
  Ownership must be assigned (recommended `mobile-architect`, open decision).
- Customers get honest coverage: useful last-seen and Wi-Fi/IP location for computers, limited value
  for Android TVs, none for other TVs. A wiped device sends nothing ever again; we say so.
- Mobile and web copy that tells laptop/TV owners to pair a GPS tracker must change first (Feature
  022 Phase 0).
- Hardware-tracker work (ADR-0018) is unaffected.

## Revisit Trigger

- Any proposal to let agent locations drive dispatch, claims or pricing (SDL-2 relaxation; ADR-0009
  SDL-12 then makes attestation mandatory).
- Any proposal for remote lock/wipe, MDM enrollment, or a privileged component beyond the minimal
  lock-screen-message helper.
- A TV platform opens background execution or location to third-party apps.
- A compromise of the agent update channel or the pairing endpoint.
- ADR-0019 (background tracking) is decided in a way that conflicts with agent cadence.
