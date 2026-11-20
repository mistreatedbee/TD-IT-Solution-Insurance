# Feature 022 — Software tracking for laptops, desktops and TVs

Status: **Plan only. Nothing in this document is built.** Stage 1–2 input, not authorization to code.
Date: 2026-11-20
Author: `solution-architect`
Decision record: [ADR-0022](../../organization/adr/0022-software-agent-tracking-for-computers-and-tvs.md) (Proposed)

## 0. Why this exists

Owner direction, 2026-11-20: "a Phone, Laptop, Computer and TV don't need a hardcore GPS device
paired to them, we are going to use the app or software that we're building to track those devices."

Hardware trackers (ADR-0018, U907 pilot) stay the path for vehicles and business equipment.
For laptops, desktops and TVs we install our own software on the device. Phones already use the
mobile app (ADR-0009).

The honest headline: **software on a laptop can do useful theft work. Software on a TV can do
very little.** Most TVs have no GPS, most TV operating systems stop third-party apps running in the
background, and a stolen TV is often never put back on the internet. The plan below says so per
platform.

## 1. Current state (verified in code on main, 2026-11-20)

- `backend/src/lib/tracking-profile.ts` `resolveTrackingProfile()`: only `assetType === 'smartphone'`
  gets `providerId: 'self_device'`. Every other type gets `'hardware_pending'` and the message
  "Connect a GPS tracker to enable location recovery for this asset…".
- `backend/src/lib/asset-validation.ts` already has asset types `laptop`, `desktop` and `tv`.
- The location write path is `POST /v1/assets/:assetId/location-report` in
  `backend/src/routes/assets.ts` (lines ~109–208). Note: there is no `routes/asset-location.ts`
  file; only `asset-location.test.ts` carries that name. The route rejects non-phones with reason
  `not_smartphone` (line ~184). It rides the user's session and session `deviceId`. It is behind the
  INC-001 kill switch `locationIngestionEnabled`, and extended triggers sit behind
  `locationExtendedTriggersEnabled`.
- `POST /v1/assets/:assetId/location-consent` records a consent grant in `locationConsentLog`.
  **The report route does not check that record.** That is open finding INC-001 A-7.
- Location events are written with `source: 'self_device'` and a `triggeredBy` value.
- The mobile app (Expo) does phone self-tracking, including an Android background task for the
  owner-test build only.
- **No desktop software and no TV software exist in this repo.** No device-credential model exists
  for software agents.

## 2. What location a computer or TV can honestly give us

Plain accuracy bands used below:

| Method | Typical accuracy | Notes |
|---|---|---|
| GNSS (GPS chip) | 5–20 m | Almost no laptops, desktops or TVs have one. Some business laptops with a cellular modem do. |
| Wi-Fi positioning (via the OS location service) | 20–500 m in cities, worse in rural areas | Depends on the OS vendor's Wi-Fi database. Needs the user's location permission. Good enough to find a street or block, not a flat. |
| IP geolocation (done by our server) | Suburb to city at best. In South Africa often only the ISP's hub city, sometimes the wrong province. | Works on every device that reaches our server. Must never be drawn as a pin. Show it as an area. |

Rules we keep:

- We use the OS location service. We do **not** scan Wi-Fi ourselves to get around the OS
  permission. Windows 11 and macOS both now treat Wi-Fi scanning as location access anyway.
- Every record says how it was obtained (`positionMethod`) and how accurate it is (`accuracyMeters`).
- IP lookups are done server-side. The IP-geolocation data vendor is a new open decision for
  `integration-architect`. Do not assume one.

### 2.1 Per platform

| Platform | How location is obtained | Runs in background? | Realistic theft value | Verdict |
|---|---|---|---|---|
| **Windows 10/11** | Windows Location API (`Windows.Devices.Geolocation`): Wi-Fi, GNSS if present. User must allow location for desktop apps in Settings. IP fallback. | Yes. A per-user agent started at login (tray app). Whether location works from a SYSTEM service before login must be proven in a spike — assume no. | **Good.** Laptops are stolen and reconnected to Wi-Fi often. Wi-Fi fix plus IP and last-seen is useful. | MVP |
| **macOS 13+** | Core Location: Wi-Fi. User permission prompt. IP fallback. | Yes, as a LaunchAgent at login. macOS shows the user a "background item added" notice — this is fine, it is honest. Location from a root LaunchDaemon is not workable. | **Good.** Same as Windows. Apple Find My already exists; ours adds the insurer's record and theft mode. | MVP (second) |
| **Linux desktop** | GeoClue. Its free Wi-Fi database (Mozilla Location Service) shut down in 2024. Mostly IP only. | Possible (systemd user service). | Low. Small customer share. | Defer. Revisit on demand. |
| **Android TV / Google TV** | Android location APIs. Most TVs have no GPS; network location may return nothing. Expect IP most of the time. | Limited. Boot receiver plus WorkManager (minimum 15 min). Behaviour varies by TV maker. | **Low to moderate.** Only reports if the stolen TV is set up on a network. | Phase 3 (best TV option) |
| **Amazon Fire TV** | Fire OS has no Google location services. Expect IP only. | Limited, as Android. | Low. And a Fire TV stick is usually a separate device from the TV set itself. | Defer |
| **Samsung Tizen** | Web app. No useful location API for third-party TV apps. IP only. | No. Runs only while the user has the app open. | Very low. A thief will not open our app. | Not supported |
| **LG webOS** | Web app. IP only. | No (third-party). | Very low. | Not supported |
| **Apple tvOS** | Core Location "when in use" only, coarse. Apple TV has no GPS. | No. | Very low, and the Apple TV box is not the TV set. | Not supported |

**Recommended platform order:** Windows → macOS → Android TV / Google TV. Everything else is
deferred or not supported. For Samsung, LG, Fire TV and tvOS the honest product answer is: register
the TV for insurance, record its serial number, and say plainly that software tracking is not
available on that TV.

## 3. Technology choice per surface

### 3.1 Desktop (Windows, macOS)

| Option | For | Against |
|---|---|---|
| **Tauri** (Rust core + system webview, React/TS UI) | Small installer (a few MB). Reuses our React/TS design system for the small settings UI. Auto-start and signed auto-update plugins exist. Smaller attack surface than Electron. | Rust is a new skill for this team. Tauri's geolocation plugin targets mobile, so desktop location needs a small native module per OS (WinRT on Windows, Core Location on macOS). |
| Electron | All TypeScript. Large ecosystem. | Large install (~100 MB+), bigger attack surface, high memory for an always-on agent. Its built-in geolocation on Windows depends on a Google API key. |
| Native (C#/.NET + Swift) | Best OS fit and least overhead. | Two codebases, two languages, no UI reuse. |

**Recommendation: Tauri**, built as a small always-on agent with a tray icon and a minimal
settings window. Location, credential storage and theft-mode actions live in a thin native layer per
OS. If `cto` judges Rust a staffing risk, fall back to Electron, not native. This is open decision
OD-2.

### 3.2 TV (Android TV / Google TV)

Reuse the Expo app stack with the React Native tvOS/Android TV fork and its TV config plugin, as a
**separate, small TV app** (not the customer app). It needs: pairing screen, status screen, boot
receiver, WorkManager check-in. A spike must prove Expo's TV support builds cleanly with our current
Expo SDK before we commit. Fallback is a plain Kotlin app — it is small.

### 3.3 Shared

One backend contract for all agents (`/v1/device-agents/*`, §5). Agent check-in logic is the same on
every platform: authenticate, send status, send a location if allowed, read the server-set
interval and theft-mode flag.

## 4. Enrollment, credentials, revocation, theft

### 4.1 Pairing flow (device authorization pattern, modelled on RFC 8628)

1. Customer downloads the agent from our website (desktop) or the Play Store (Android TV).
2. The agent asks the backend for a pairing request. It generates a key pair locally and sends only
   the public key. It shows a short code (for example `K7Q4-9MZD`) and a QR code. The code lives
   10 minutes.
3. The customer opens the **mobile app or the website**, signed in, and taps "Link a computer or
   TV". They scan the QR or type the code.
4. Step-up re-authentication is required (ADR-0009 SDL-9).
5. They pick one of their own `laptop`, `desktop` or `tv` assets, and see the consent screen (§7).
6. The backend binds agent ↔ asset ↔ account and writes a consent record and a Trail A security
   event. An out-of-band email goes to the verified address.
7. The agent's next poll receives "approved". From then on it authenticates with its own key.

The device never sees the customer's password or session. The customer's session never acts as the
device.

### 4.2 Device credential

- The private key stays on the device, in the OS keystore: Windows CNG/TPM where available, macOS
  Keychain (Secure Enclave on Apple silicon), Android Keystore.
- The agent signs a short assertion to get a short-lived access token (for example 15 minutes). The
  server stores only the public key.
- Per-call checks on every check-in: agent active, not revoked, asset still owned by the account,
  asset type eligible, active consent present.
- An agent credential can do **only** agent things: check in, report location, read its own
  theft-mode flag. It cannot read the account, other assets or location history.

### 4.3 Revocation

Revoke happens when: the customer unlinks; an admin revokes; the asset is removed or transferred;
the customer withdraws consent; the account is suspended or closed. Revocation is immediate
server-side. A revoked agent gets a clear "unlinked" response and shows that on screen.

### 4.4 Uninstall and tamper — what we will and will not do

- The owner must always be able to uninstall. We will **not** build hidden, self-reinstalling or
  rootkit-like persistence. It breaks POPIA transparency, store rules, and antivirus will flag it.
- Uninstalling or removing permission cannot be reported reliably. The server marks an agent
  **"went dark"** after missed check-ins (threshold set by the server). The customer sees this. It
  can feed Feature 021's went-dark work once that is approved.
- Customer advice we will publish: use a standard (non-admin) everyday account, set a strong login
  password, and also switch on Apple Find My / Microsoft Find my device. A thief on a standard
  account cannot easily remove an agent installed with admin rights.
- **Stolen and wiped (OS reinstalled): our software is gone and no signal will ever come back.**
  We keep last-seen time, last known location and the serial number for the police report. Firmware
  persistence (the kind laptop makers license to a few vendors) is not available to us.

### 4.5 Theft features that are honest

| Feature | Honest? | Notes |
|---|---|---|
| Last seen (time of last check-in) | Yes | Server time (SDL-7). |
| Last known location with method and accuracy | Yes | Area, not a pin, when IP-based. |
| Report-when-online: after a theft report, the agent checks in more often and sends location every check-in | Yes | Interval set by the server, capped (§5.5). |
| Login / lock-screen message: "This device is reported stolen. Ref XXXX. Call …" | Yes, with care | Windows: logon legal notice, needs admin. macOS: login window text, needs root via a privileged helper. Stage 8 must review the privileged helper. |
| Remote lock / remote wipe | Not in MVP | Needs proper MDM (Windows MDM enrollment; Apple MDM push certificate from Apple). Separate decision, OD-5. |
| Thief photo (webcam) or screenshots | **No** | Captures third parties. POPIA and criminal-law risk. Rejected. |
| Sending location to a security partner for dispatch | **No** | Blocked by ADR-0009 SDL-2. Self-asserted. Human review only. |

**Needs OS-vendor or store approval:** Apple Developer ID + notarisation (macOS); any Apple MDM
work (Apple push certificate); Google Play review for the TV app, including background and location
declarations; Microsoft SmartScreen reputation (code signing) for Windows.

## 5. Backend changes

### 5.1 Tracking profile

- Generalise eligibility in `resolveTrackingProfile()` with an explicit map from asset type to
  tracking method: `smartphone` → `self_device` (mobile app); `laptop`, `desktop`, `tv` →
  `software_agent`; vehicles and business equipment → hardware.
- Add `providerId: 'software_agent'` with honest states: not installed, pairing pending, active,
  last seen, went dark, not supported on this TV.
- Keep `self_device` and `software_agent` as **separate source values**. ADR-0009 SDL-1 says
  `source` must reflect the ingestion path, and these are different paths with different
  credentials. "Generalise" means the eligibility map, not one blurred source value.
- `tablet` (if customers want it) goes on the mobile-app path. Open decision OD-6.

### 5.2 New data (MongoDB, per ADR-0002)

`device_agents`: id, accountId, assetId, platform, osVersion, agentVersion, publicKey, status
(`pending` | `active` | `revoked`), pairedAt, lastCheckInAt, revokedAt, revokedReason,
theftMode. Pairing requests in a short-TTL collection. Schema detail is `database-architect`'s.

### 5.3 New routes (shape is `backend-architect`'s)

- `POST /v1/device-agents/pairing-requests` — unauthenticated, strictly IP-rate-limited, returns
  user code. This is a **new unauthenticated surface** and needs Stage 8 attention.
- `POST /v1/device-agents/pairing-requests/approve` — customer session + step-up.
- `POST /v1/device-agents/token` — agent poll / signed assertion → short-lived token.
- `POST /v1/device-agents/check-in` — agent token. Status plus optional location.
- `GET /v1/assets/:assetId/device-agents`, `DELETE /v1/device-agents/:id` — customer list and revoke.

### 5.4 Location record fields

`source: 'software_agent'` (server-set from the path), `assertionMode: 'self_asserted'`,
`positionMethod` (`gnss` | `wifi` | `ip` | `unknown`), `accuracyMeters` (required; for IP the
server sets an honest radius), `capturedAt` (device), `receivedAt` (server), `agentId`. No
coordinates in logs or URLs (SDL-6).

### 5.5 Consent check and rate limits

- Every check-in that carries a location is refused unless an active consent record exists for
  (account, asset, agent). **This closes INC-001 A-7 for agent devices.** The same check should be
  added to the phone path in the same release — recommended, owned by `backend-architect`.
- Rate limits: per agent and per account. Proposed starting values: normal mode 4 check-ins per hour
  per agent; theft mode 12 per hour; hard cap per account. The server tells the agent its interval;
  the agent does not choose. Values to be confirmed by `cybersecurity-architect` (MP-7).
- Retention purge (SDL-8) must cover agent records before ingestion ships.
- Raw check-in IP addresses are personal information. Keep them only as long as the security log
  needs; store the derived area for location history. Period is `compliance-specialist`'s.

## 6. UI changes

Phase 0 must stop telling laptop, desktop and TV owners to pair a GPS tracker. Found by grep on
2026-11-20:

**Backend copy**
- `backend/src/lib/tracking-profile.ts` lines ~89–99 — "Connect a GPS tracker…" default message.
- `backend/src/lib/tracking-device-types.ts` — `INSTALLATION_GUIDE` is hardware-only.

**Mobile**
- `mobile/src/screens/assets/AssetDetailScreen.tsx` ~435 ("needs a GPS tracker for live
  location"), ~507 and ~533 ("Connect GPS tracker" buttons), ~526–538 ("GPS tracker" section).
- `mobile/src/screens/assets/DeviceHealthScreen.tsx` ~80–82, ~170.
- `mobile/src/screens/assets/DeviceActivationScreen.tsx` (whole screen is hardware; must not be
  reachable for these types).
- `mobile/src/screens/assets/InstallationGuideScreen.tsx` (hardware guide).
- `mobile/src/screens/assets/RegisterAssetScreen.tsx` ~379–398 (tracker copy at registration).
- `mobile/src/screens/location/DeviceLocationsScreen.tsx` ~33 and ~96.
- `mobile/src/screens/home/ProtectionMapScreen.tsx` ~527.
- `mobile/src/tracking/TrackingCapabilityService.ts` — today any non-`self_device` provider shows
  device activation and the installation guide. A new provider id must be handled here first.
- `mobile/src/tracking/types.ts` line 10 — `TrackingProviderId` union.
- `mobile/app/(app)/(tabs)/assets/[id]/_layout.tsx`, `mobile/e2e/flows/flags-off-screens.yaml`.

**Web**
- `src/pages/LandingPage.tsx` ~186 — "Each registered asset can carry a small, discreet GPS
  tracker". Marketing copy; product-manager to reword.
- `src/admin/pages/AdminLocationsPage.tsx` — source labels; add a "Software agent" source later.

Reuse `mobile/src/design` and `src/components/*`. Any new component needs `design-system-manager`.

## 7. Security, POPIA and consent

- **Trust:** agent locations are self-asserted. ADR-0009 SDL-2 applies in full: no dispatch, no
  claim decision, no pricing from these records alone.
- **New credential class:** ADR-0009 SDL-3 forbids a new credential for the *phone* path. Agents
  need one, because they must work when nobody is signed in. ADR-0022 records this as a deliberate,
  scoped extension.
- **Other people on the device:** a family laptop or a work laptop is used by people who are not the
  account holder. Their location is revealed too. The agent must show a visible, permanent notice
  on the device (tray icon and first-run screen: "This computer reports its location to TD IT
  Solution Insurance for theft recovery"). Business equipment used by employees needs a
  `compliance-specialist` ruling on employer monitoring.
- **Consent:** per (account, asset, agent), versioned copy, recorded server-side, withdrawable from
  the phone, the web and the agent itself. Opt-in and opt-out notify by email (SDL-9).
- **Field-level encryption** evaluation (SDL-6) extends to these records.
- **Supply chain:** signed builds, signed auto-updates, update channel protected like a production
  deploy. A compromised update server would turn every agent into malware. This is the largest new
  risk in the feature.
- **Privileged helper (macOS) / admin install (Windows):** smallest possible, reviewed at Stage 8.

## 8. Signing, stores and cost (approximate, to be confirmed by owners)

| Item | Needed for | Approx. cost |
|---|---|---|
| Apple Developer Program | macOS Developer ID signing + notarisation (and tvOS if ever) | USD 99 / year |
| Windows code signing (OV/EV certificate, or a cloud signing service if eligible in our region) | SmartScreen, installer trust | roughly USD 120–600 / year |
| Google Play developer account | Android TV app | USD 25 once (may already exist for the mobile app) |
| IP-geolocation data | IP fallback | free tier to low monthly cost; vendor open (`integration-architect`) |
| Update hosting | signed agent updates | small on existing Render/static hosting; `cloud-infrastructure-architect` to confirm |
| Engineering | Tauri + native modules, backend, TV app | the main cost; `technical-project-manager` to estimate |

## 9. Phased roadmap

| Phase | Scope | Accountable / responsible | Gates |
|---|---|---|---|
| **0 — Copy and UI fix** | Laptop/desktop/TV no longer told to pair a GPS tracker. New honest message: "You won't need a GPS tracker for this device. Our tracking software for computers and TVs is coming." Hide the hardware CTA and installation guide for these types. Backend: change the default message by asset type and add an **additive** field (for example `softwareTrackingPlanned: true`) rather than a new `providerId`, so old app builds do not mis-render. Landing page copy. No data, no new endpoint. | A `product-manager`; R `mobile-engineer`, `frontend-engineer`, `backend-engineer`; C `ui-designer`, `design-system-manager`, `technical-writer` | Stage 4 copy review; Stage 7 (contract is additive); Stage 8 light review (copy and one field — still required, not waived); Stage 10 QA |
| **1 — Foundations** | Stage 1 requirements; ADR-0022 ratified; compliance ruling (consent, other users, employees, retention, IP); A-7 consent check on the phone path; spikes: Windows location from a login agent, Tauri native module, Expo TV build. | A `business-analyst`, `solution-architect`; R `backend-engineer`, `mobile-architect`; C `compliance-specialist`, `cybersecurity-architect` | Stages 1–5 |
| **2 — Windows MVP** | Pairing, device credential, check-in, last seen, Wi-Fi/IP location, theft mode, went dark, unlink. Signed installer + signed updates. Phone/web "Link a computer" screens. | A `mobile-architect` (device agents, OD-3), `backend-architect`; R `mobile-engineer`, `frontend-engineer`, `backend-engineer`, `devops-engineer`; C `security-engineer`, `database-architect` | Stages 6–7; **Stage 8 hard gate**; **Stage 10 hard gate**; Stage 11 (touches GPS ingestion) |
| **3 — macOS** | Same agent on macOS: notarised, Core Location, LaunchAgent, login-window message helper. | as Phase 2 | Stage 8 (privileged helper), Stage 10 |
| **4 — Android TV / Google TV** | Small TV app: pair, boot check-in, IP/network location, last seen. Store listing says plainly what it can and cannot do. | A `mobile-architect`; R `mobile-engineer` | Stage 8, Stage 10, Play review |
| **5 — Later, by decision only** | Remote lock/wipe via MDM; Linux; Fire TV. | `cto` decision first | Full lifecycle |

## 10. Open decisions (owner / `cto`)

- **OD-1** Confirm platform order: Windows → macOS → Android TV; Samsung, LG, Fire TV and tvOS not supported.
- **OD-2** Desktop stack: Tauri (recommended, needs Rust) or Electron.
- **OD-3** Who owns device agents. No desktop role exists. Recommend `mobile-architect` owns all device agents (phone, desktop, TV).
- **OD-4** Should the server refuse linking a hardware tracker to a laptop/desktop/TV, or only hide it in the UI? Recommend hide in Phase 0, decide later.
- **OD-5** Remote lock/wipe (MDM): in or out for 2027.
- **OD-6** Tablets: mobile-app path like phones?
- **OD-7** IP-geolocation data vendor (`integration-architect`).
- **OD-8** Budget for code-signing certificates and the Apple Developer account.

## 11. What this plan does not do

It does not authorize code beyond Phase 0. It does not relax ADR-0009 SDL-2. It does not choose a
GPS hardware vendor, a payment gateway or an IP-data vendor. It does not change the owner-test
exception, which stays limited to the `owner-test` EAS profile.

## 12. CTO review (2026-11-20, `cto`)

- Approved to merge as **Proposed**. Not ratified. Ratification waits for `cybersecurity-architect`
  and `compliance-specialist` sign-off (Phase 1).
- Correction to §5.1 / OD-6: `tablet` already exists as an asset type
  (`backend/src/lib/asset-validation.ts`). It is not hypothetical. Phase 0 copy should cover
  `tablet` as well as `laptop`, `desktop` and `tv`.
- Phase 0 may ship as a copy-only change with no new `providerId`. The additive
  `softwareTrackingPlanned` field is optional. Stage 8 light review and Stage 10 QA still apply.
- Positions on open decisions: OD-2 Tauri, with Electron fallback if the Phase 1 spike fails.
  OD-3 `mobile-architect` owns all device agents. OD-5 remote lock/wipe out of MVP. OD-6 tablets
  on the mobile-app path. OD-7 stays with `integration-architect`, needs a scorecard first, no
  vendor until then. OD-1 and OD-8 need the owner's decision.
