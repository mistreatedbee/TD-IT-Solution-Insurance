# Feature 021 (provisional number) — Theft-protection signals and behaviour alerts: design note

**Stage:** 1–3 (paper only). **Author:** `cto` (orchestrating; owners per [RACI routing](#6-raci-routing-and-stage-plan)). **Date:** 2026-11-17.
**Status:** Draft for review. Nothing here is built, enabled or approved. `product-manager` assigns the final feature number (021 is the next free one).
**Governing documents read for this note:** `CLAUDE.md`, `HANDOFF.md`, [ADR-0009](../../organization/adr/0009-self-asserted-location-ingestion-trust-boundary.md), [ADR-0012](../../organization/adr/0012-step-up-authentication-for-privileged-actions.md), [`08-roadmap.md`](../../organization/08-roadmap.md), [`roadmap-release-gate-a.md`](../../organization/roadmap-release-gate-a.md). The new ADR is [ADR-0020](../../organization/adr/0020-on-device-learning-and-behaviour-signal-trust-boundary.md).

## 0. Ground rules this note obeys

1. **Release Gate A is not widened.** Gate A is not closed (`HANDOFF.md`: criterion 6 withheld under INC-001). Every item below starts after Gate A closes. This document is paper-only work that takes no time from the gate's critical path; `product-manager` should confirm that under roadmap addendum rule A.1.
2. **Location ingestion stays off.** `LOCATION_INGESTION_ENABLED` is untouched. No flag in `eas.json` or Render changes. Nothing in this feature may be enabled by turning a flag on without the gates in §5.
3. **No power-off blocker, and no promise of one.** Android and iOS do not let a normal app intercept or block the power-off menu. The app must never imply otherwise (see §7, wording rules).
4. **Self-asserted data cannot, on its own, cause a real-world consequence** (ADR-0009 SDL-2). Every signal here is self-asserted by a customer-controlled phone. Scores are advice to a human, never an action.

## 1. What the brief asks for, and where it meets existing decisions

| # | Brief item | Meets which existing decision | Verdict |
|---|---|---|---|
| 1 | Protection-change guard (re-auth before switching protection off, removing a device, changing emergency contacts) | ADR-0012 (step-up) is written for **privileged** accounts and MFA. ADR-0009 SDL-9 already requires step-up to opt in to tracking. | **Buildable first.** Needs no location. Needs an ADR-0012 extension for customers (see ADR-0020 §D4). |
| 2 | Last-gasp on shutdown (Android, best effort) | Needs background execution and a native module. ADR-0009 SDL-11 (foreground only). | **Blocked** behind ADR-0019 owner decision, INC-001 closure and the Play background-location declaration. Never a dependency of anything else. |
| 3 | Heartbeat and went-dark detection | A heartbeat from a hardware tracker needs no phone background work (GT06 path exists on the `spike/gt06-ingest-pilot` branch). A phone heartbeat needs background work. | **Split.** Server-side detection for hardware trackers can come first. Phone heartbeat waits for ADR-0019. |
| 4 | Known places learned on the phone; only labels and coarse zones sent | New trust boundary (ADR-0020). POPIA data minimisation. | **Design now, build after compliance.** |
| 5 | Unusual-behaviour scoring with reasons | SDL-2: a score may never act automatically. POPIA s71 (automated decisions). | **Design now. Advisory only. Human review mandatory.** |
| 6 | "Was this you?" customer check before staff | Push exists as a partial adapter. The reply channel is itself self-asserted (see §3.2). | **Buildable after 1.** |
| 7 | Staff console, SLA timers, identity-by-code-word script, case, SAPS number, partner handoff, false positives | ADR-0006 third trail for every staff view of location. ADR-0017 (Proposed) governs partner handoff and location grants. Feature 010/011/019 overlap. | **After 5–6.** Reuse the existing case, SAPS and timeline work. |
| 8 | Duress PIN, silent SOS, trusted contact, planned-travel mode, sensitivity, quiet hours | Duress PIN and trusted contact need compliance and safety review (§4). | **Later.** Each is its own entry. |
| 9 | Staff records the outcome of every alert | Feeds tuning and audit. | **With 7.** |

**The one structural conflict, stated plainly.** Items 2–5 want the phone to sense and report while the app is in the background. ADR-0009 SDL-11 and the product rule FR-SD-02 lock tracking to foreground only, and ADR-0019 (Proposed, on the `spike/gt06-ingest-pilot` branch) is where background tracking is waiting on an owner decision. **This feature does not decide that.** It is designed so stages (b) and part of (c) do not need it.

## 2. Principle: the phone learns, the server only sees labels and coarse zones

Known places (home, work, regular places) are learned **on the phone** and stored on the phone. The server receives, per place: a customer-chosen **label**, a **coarse zone** (a geohash cell, default precision 5, about 5 km; `compliance-specialist` and `business-analyst` set the final precision), and a paused/active flag. It never receives raw coordinates for a "known place", and it never receives the visit history that taught the phone.

Why: it keeps the most revealing data (where someone sleeps and works) off our servers; it lowers POPIA exposure; and it limits what a database leak exposes. The cost is that the server can only judge "far from every known zone", not "at a specific unfamiliar address". That is acceptable because the server's job is to ask a human, not to decide.

Customer controls (all on-device first, then synced as labels and zones): name, edit, delete, pause a place. Deleting a place deletes the server copy. Pausing a place excludes it from scoring.

## 3. Threats specific to this feature (additions to ADR-0009's threat model)

1. **The thief holds the unlocked phone.** The phone, the session and the app are all in the thief's hands. A control that only trusts "the app says it is the customer" fails. Mitigations: protection changes require a **server-checked** fresh credential (password or MFA), not only a local biometric (ADR-0020 §D4); the on-device biometric is a convenience layer, not the control.
2. **The thief answers "Was this you?"** with "yes". Mitigations: the reply needs the same step-up as a protection change; a **duress PIN** (later entry) answers "yes" while silently escalating; "no reply within the timer" escalates, so silence is not safe for the thief either; and the customer's **trusted contact** is notified in parallel on a high score.
3. **The customer (or a fraudster) games the score** by faking locations. SDL-2 already makes a false location buy nothing, and a score can never trigger an action. The score only changes how fast a human looks.
4. **The server learns too much.** Mitigated by on-device learning (§2), coarse zones, retention limits and delete-my-data (§4).
5. **Staff abuse of location views.** Every staff view of a customer's location is an ADR-0006 third-trail event with a purpose and a case reference. No new mechanism.
6. **Alert fatigue and false alarms.** Sensitivity levels, quiet hours, planned-travel mode and the staff outcome record (false alarm / stolen / recovered) exist to tune this. Outcomes are audit data, not a model-training feed without a separate compliance review.

## 4. Compliance gates (route before build)

The full question list is in [`01-compliance-routing-request.md`](01-compliance-routing-request.md). Headlines, owned by `compliance-specialist`: POPIA consent for location **and** for behavioural profiling (separate consents); no solely automated decisions (human review); data minimisation and retention limits per data class; delete-my-data (Feature 015 must cover every new collection); cross-border transfer and operator agreements for any push, SMS or voice vendor; Google Play background-location declaration and iOS location-usage wording (`play-store-data-safety-declaration.md`); the audit trail for staff views (exists). Safety review for the duress PIN, silent SOS and the trusted-contact notification (a third party who is not a user).

## 5. What must be true before each stage can ship

| Stage | Hard prerequisites |
|---|---|
| (a) Design note + ADR | None. Paper only. ADR-0020 is **Proposed**, not ratified. |
| (b) Protection-change guard | ADR-0020 §D4 accepted. Stage 8 review of the step-up extension. No location dependency. Mobile build flag stays off in distributed builds until Stage 8 passes. |
| (c) Went-dark detection | Server-side, hardware-tracker heartbeat only at first. Needs the tracker pilot (ADR-0018) and the GT06 ingest branch merged and reviewed. Phone heartbeat additionally needs the ADR-0019 decision. |
| (d) Known places and scoring | Compliance rulings (§4). INC-001 closure (server-side consent enforcement, A-7). ADR-0020 accepted. Foreground/background scope decided under ADR-0019. |
| (e) Customer check + staff console | Stages (b) and (d). ADR-0017 accepted for any partner handoff. Caller-verification design (Feature 010 C-010-4). Stage 8 and Stage 10 (QA) are hard gates. |

## 6. RACI routing and stage plan

One PR per stage. Roles are the owning subagents under [`01-raci-matrix.md`](../../organization/01-raci-matrix.md).

| Stage | A (owns the decision) | R (does the work) | C (consulted first) |
|---|---|---|---|
| (a) Design note + ADR | `cto`, `cybersecurity-architect` | `solution-architect`, `mobile-architect` | `compliance-specialist`, `authentication-engineer`, `database-architect` |
| (b) Protection-change guard | `authentication-engineer` | `backend-engineer`, `mobile-engineer`, `ui-designer` | `cybersecurity-architect`, `security-engineer`, `compliance-specialist` |
| (c) Went-dark detection | `backend-architect` | `gps-integration-engineer`, `notification-engineer` | `site-reliability-engineer` (alerting), `performance-engineer`, `compliance-specialist` |
| (d) Known places and scoring | `mobile-architect` (on-device), `backend-architect` (server) | `mobile-engineer`, `backend-engineer`, `database-architect` (schema) | `compliance-specialist`, `cybersecurity-architect`, `ai-solutions-architect` (scoring limits), `ux-researcher` |
| (e) Customer check + staff console | `frontend-architect` (console), `backend-architect` | `frontend-engineer`, `notification-engineer`, `mobile-engineer` | `business-analyst` (SLA, scripts), `cybersecurity-architect`, `compliance-specialist`, `manual-qa-engineer` |

Every stage owes Stage 8 (Security Review) and Stage 10 (QA). Neither is skipped for speed.

## 7. Honest wording rules (binding on every screen, notification and help text)

- Never say or imply the app can stop, block or detect every power-off or shutdown. Say: "TD IT cannot stop someone switching your phone off."
- The last-gasp message is "best effort": say "if your phone can, it will try to send its last location and battery level. This may not always work."
- A went-dark alert says "we stopped hearing from this device", not "your device was stolen".
- A score is never shown to the customer as a verdict. Reasons are shown as plain facts ("a location far from your usual places, at 02:10").
- "Was this you?" never pressures. It states what we saw and offers "Yes, it was me" and "No, this was not me".
- Platform differences are stated: SIM-removal and last-gasp signals are **Android only**; iOS does not expose them to a normal app.
- Staff scripts never ask for an ID number, a full card number or a password. Identity is verified with the customer's **PIN or code word only**, which staff type into a verify field and never see.

## 8. What this note deliberately leaves open

Geohash precision for coarse zones; retention periods per class; whether behaviour profiling needs its own opt-in screen; the duress-PIN safety review; the trusted-contact consent model; the alert SLA targets; the voice/SMS vendor for the customer-call path. Each has an owner in §6 and is listed in the roadmap entries.

---

## 9. Addendum (2026-11-17, second owner brief): scope extended to twenty items, six stages

Appended by `cto`. Sections 0–8 above are unchanged. The second brief adds hardware and Bluetooth protection, more signals, alert channels, next-of-kin sharing, and recovery tools. Where it overlaps §1–§8 it wins; two supersessions are recorded in §9.6.

### 9.1 Standing rules, restated because the brief adds riskier items

1. Release Gate A is not widened. No flag changes. `LOCATION_INGESTION_ENABLED` stays off. All of this starts after Gate A closes except paper design.
2. **No power-off blocker and no promise of one.** The app states plainly that it cannot block switching off (item 20).
3. **No covert camera or microphone capture of any kind.** Lost-mode and any "thief selfie" are the only camera/audio-adjacent items. The alarm plays a sound the thief can hear; it records nothing. The selfie (item 16) is **opt-in, clearly disclosed, flag-gated, and not built until legal and Google Play policy review pass** (TP-17). No remote camera, ever (item 15).
4. SDL-2 still applies. Alerts and shared links are labelled as customer-phone claims or tracker readings, never as instructions to anyone.

### 9.2 Platform support matrix (to be verified per platform before any screen is written)

| Item | Android | iOS | Note |
|---|---|---|---|
| Protection-change guard (server-checked step-up) | Yes | Yes | Local biometric is a convenience layer only (ADR-0020 D4). |
| Last-gasp on shutdown | Best effort | **No** | Needs a native module and background execution. Never a dependency. |
| Wrong-passcode counter | Possible only through device-admin APIs, which Google Play restricts | **No** | Needs a Play-policy and permission review before it is even designed. |
| SIM removed, flight mode, location switched off while moving | Partly observable | Mostly **not** observable | Absence of a signal means "unknown", never "safe". |
| Unknown Wi-Fi / new charger | Possible, needs location-class permissions for Wi-Fi names | Wi-Fi name access is restricted; charger state is visible only while the app runs | Network identity is hashed on the phone (ADR-0020 D8). |
| Bluetooth tag separation | Background Bluetooth is limited by the OS | Background Bluetooth is more limited | Tag hardware is a **new open decision**. |
| Loud alarm and lock-screen message | Possible with a high-priority push and a native module | **Not possible** for a normal app | iOS relies on the platform's own lost mode. |
| Thief selfie | Possible; policy-sensitive | **No** | Blocked on legal and Play review. |

### 9.3 Layers, in order of strength (for product copy and expectations)

1. **Independent hardware tracker with its own battery (item 4).** The strongest protection: it keeps reporting after the phone is off. It is built behind the vendor-agnostic `HardwareProvider` and the `capabilities` shape in `tracking-device-types.ts`. Per the GPS scorecard §6, **no vendor-specific field may enter `tracking-profile.ts`, `tracking-device-types.ts` or the `tracking-devices` repository before the vendor ADR is ratified.** The U907 pilot (ADR-0018) is 2G and is a pilot only. This item stays vendor-dependent until `integration-architect`'s decision.
2. **Server-side went-dark detection (item 3).** Works for a hardware tracker without any phone background work.
3. **Phone signals (items 2, 6, 7, 11, 12).** Best effort, platform-limited, advisory.
4. **Bluetooth tag (item 5).** Separation of phone and tag in a case or bag; debounce, grace period and planned-travel suppression to avoid false alarms. It is a second independent signal, and its hardware is not chosen.

### 9.4 New threats added by this brief

1. **Coercive control through next-of-kin sharing.** Level (c) live location sent to a partner, parent or other person is also a tool for stalking. Mitigations are in ADR-0021: customer-only control, kin confirmation, sharing only while an alert is open, expiry, one-tap stop, periodic "who can see this" reminders, a log, and staff unable to add or upgrade a contact without the customer's PIN or code word.
2. **A thief adds themselves as next of kin** to learn the owner's location. Mitigation: adding or upgrading a kin contact needs the ADR-0020 D4 step-up plus the PIN or code word, and notifies the customer out of band.
3. **Shared-link leakage.** Links are signed, scoped to one alert, short-lived and revocable, and every open is audited (ADR-0021).
4. **Evidence pack misuse.** It bundles location and staff actions. One customer tap builds it; it names its purpose, is watermarked and hashed, and disclosure to police or insurer is a recorded customer action (TP-18).
5. **False reassurance from the theft-hardening score.** The app cannot verify most phone settings (especially on iOS). The score is a **self-attested checklist with links to the right settings**, and says so. It never says "your phone is protected".
6. **SMS cost and abuse.** SMS is a paid, third-party channel. Per-contact controls, rate limits and an owner cost decision are needed (TP-14).

### 9.5 Revised stage plan (one PR per stage)

| Stage | Contents (TP IDs) | Notes |
|---|---|---|
| (a) | Design note + ADR-0020 + ADR-0021 + roadmap + compliance request (TP-01) | This PR. Paper only. |
| (b) | Protection-change guard (TP-02), honest wording (TP-20), theft-hardening score (TP-19) | No location dependency. Verify current platform feature names first (see §9.7). |
| (c) | Went-dark detection (TP-03) + alert channels push, then SMS, then email (TP-14) | Hardware-tracker heartbeat first. SMS vendor is a new open decision. |
| (d) | Known places and scoring (TP-04, TP-05) + Wi-Fi, charger and wrong-passcode signals (TP-13, TP-12) | Needs compliance rulings and INC-001 closure. |
| (e) | Customer check (TP-06) + staff console (TP-07) + next-of-kin sharing (TP-15) + extras (TP-08) | Needs ADR-0021 accepted and the caller-verification design. |
| (f) | Evidence pack (TP-18), lost mode (TP-16), Bluetooth tag (TP-11); hardware tracker (TP-10) after the vendor decision; last-gasp (TP-09); thief selfie (TP-17) only after legal and Play review | The hardware tracker and selfie are explicitly gated. |

### 9.6 Supersessions recorded (nothing above is edited)

- §1 row 8 and TP-08 mention a "trusted contact notified on alert". That is **superseded by next-of-kin sharing (ADR-0021, TP-15)**, which adds per-contact levels, confirmation, expiry and audit.
- §5 stage table is superseded by §9.5 for stage contents.

### 9.7 Verification owed before copy is written (not done here)

Item 19 says to verify current feature names with each platform. That is owed at stage (b) by `mobile-architect` with `ux-researcher`, against the vendors' own documentation on the day. Candidate names to check, **unverified from memory**: iOS Stolen Device Protection and Find My; Android theft-protection lock features and Google's Find Hub (formerly Find My Device). Screens use only names confirmed at that time.

