# ADR-0020: On-device learning and the trust boundary for behaviour signals

Status: **Proposed** — author `cto` (orchestrating), 2026-11-17. Security-architecture requirements are for `cybersecurity-architect` to confirm or amend; no concurrence has been filed. **Not a Stage 8 sign-off, not a compliance ruling, and not authority to enable location ingestion.**
Date: 2026-11-17
Deciders (to confirm): `cybersecurity-architect`, `solution-architect`, `mobile-architect`, `authentication-engineer`, `compliance-specialist`.
Context document: [`docs/features/021-theft-protection-signals/00-design-note.md`](../../features/021-theft-protection-signals/00-design-note.md).
Numbering note: **0019** is already used by *Partner visibility of all devices and background phone tracking* (Proposed, on the `spike/gt06-ingest-pilot` branch), so this ADR takes **0020**. Numbers are not recycled (ADR-0006 §16.7, R-4).

---

## 1. Context

ADR-0009 settled that a location asserted by a customer-controlled phone is a **claim**, not an observation, and that a claim may not on its own cause a real-world or third-party consequence (SDL-2). It also locked self-device tracking to `smartphone` assets, foreground/on-demand only, enforced server-side (SDL-11).

Feature 021 adds *more* customer-controlled assertions: where the phone's "usual places" are, whether movement looks unusual, whether the SIM was removed, whether location was switched off. It also adds a decision aid (a score) and a human process (customer check, then staff). Three questions are new and are not answered by ADR-0009, ADR-0012 or ADR-0006:

1. Where may a "known place" be learned and stored, and what may the server see?
2. What may a behaviour score be used for?
3. How strong must a re-authentication be before protection is switched off, given ADR-0012 covers privileged accounts and MFA?

## 2. Decisions

### D1 — Known places are learned and stored on the phone. The server receives only a label, a coarse zone and a flag.

- On-device learning produces candidate places (home, work, regular). The customer names, edits, deletes and pauses them.
- Per place the server may store: customer-chosen **label**, **coarse zone** (geohash cell; default precision 5, about 5 km; final precision set by `compliance-specialist` with `business-analyst`), `paused` boolean, and timestamps.
- The server must **never** receive or store: raw coordinates of a known place, visit history, dwell times, or the model/state the phone used to learn.
- Deleting a place on the phone deletes the server copy. Delete-my-data (Feature 015) deletes all of it.
- This is a data-minimisation control, not a security boundary: a compromised phone can lie about its places. That is accepted because of D2.

### D2 — A behaviour score is advice to a human. It never acts. (Extends ADR-0009 SDL-2.)

- The score is an integer with a **list of machine-readable reasons** (for example `far_from_known_zones`, `odd_hour`, `fast_travel`, `sim_removed`, `location_off_while_moving`). A score without reasons is not stored.
- A score may: raise an alert for **customer check** (D3); order a staff queue; be shown to staff with its reasons.
- A score may **not**: dispatch or task a partner, disclose location to a partner as an instruction, change policy or billing, or adjudicate a claim. Those need a documented human decision step (SDL-2) and, for partner handoff, ADR-0017.
- No decision with legal or similarly significant effect is taken solely on a score (POPIA s71). Staff review is mandatory before any outward action.
- Scoring rules live in versioned configuration, not in the client. Sensitivity levels (low/standard/high) and quiet hours change thresholds, never the rule that a human decides.
- Outcome records (false alarm / stolen / recovered) are audit and tuning data. Using them to train a model is a separate decision needing compliance review.

### D3 — "Was this you?" comes before staff, and its reply is itself a claim.

- On a score above the customer's threshold, push a short-timer "Was this you?" with "Yes, it was me" and "No, this was not me".
- A reply needs the D4 step-up. A "yes" from a stolen unlocked phone is the expected attack; so: silence past the timer **escalates**, "no" escalates, and (later entry) a **duress PIN** answers "yes" while silently escalating.
- In parallel, a high score may notify the customer's **trusted contact** (needs its own compliance ruling: a third party who is not a user).
- Staff are engaged only on "no", on no reply within the timer, or on a duress signal.

### D4 — Protection changes need a server-checked step-up; the on-device biometric is a convenience layer.

Switching protection off, removing a device, and changing emergency contacts require:

1. a **fresh server-verified credential** (password re-entry, or MFA if enrolled) producing a step-up window on the session, enforced server-side exactly as ADR-0012 does for invitations (`mfaVerifiedAt`-style window read from the live session, never from a token claim); and
2. optionally, an **on-device biometric or device-credential prompt** before the app even asks.

Reason: the server cannot verify a local biometric result. A claim "the biometric passed" is self-asserted. Only a server-checked credential is a control. A later hardening (a device-bound key released by biometric) is possible but is not assumed.

This **extends ADR-0012 to customer protection-change actions**. `authentication-engineer` and `cybersecurity-architect` must confirm that extension, including the window length and the out-of-band notification (SDL-9 pattern) on each change.

### D5 — Phone-only signals are best effort, platform-limited, and never load-bearing.

- Last-gasp on shutdown, SIM-removed and flight-mode signals exist only where the OS exposes them, mostly **Android**. iOS does not expose them to a normal app. The server must treat their absence as "unknown", never as "safe".
- No detection logic may depend on a phone signal arriving. Went-dark detection (server side) is the backstop.
- **There is no power-off blocker.** Android and iOS do not allow a normal app to intercept or block the power-off menu. No UI, copy, notification or marketing may claim or imply one.

### D6 — Background phone sensing is not decided here.

Items needing the phone to sense or report in the background are blocked behind ADR-0019 (owner decision), closure of INC-001 (server-side consent enforcement, A-7) and the Play background-location declaration. SDL-11's server-side scope lock stays in force. Nothing in this ADR relaxes it.

## 3. Alternatives considered

| Alternative | Why rejected |
|---|---|
| Learn and store known places on the server from raw location history | Concentrates the most revealing data we could hold (home, work, routine) on our servers; larger POPIA exposure; larger leak impact. |
| Trust the on-device biometric as the guard | The server cannot verify it; a modified client or a thief with the unlocked phone defeats it. Kept only as a convenience layer. |
| Let a high score auto-dispatch a partner | Violates SDL-2 and POPIA s71, and a forged signal would send people to a physical location. |
| Skip the customer check and go straight to staff | Floods staff with false alarms and treats a customer's own movement as an incident. |
| Promise to detect or prevent power-off | Not technically possible for a normal app on either platform; would be a false claim to customers. |

## 4. Consequences

- A small server model: `known_zones` (label, zone, paused), `behaviour_alerts` (score, reasons, state, timestamps, outcome), `protection_change_events` (audit). `database-architect` designs the schema; all are covered by delete-my-data and retention limits.
- Re-use: ADR-0012's step-up enforcement shape; ADR-0006's third trail for staff views; Feature 011 (SAPS number), Feature 019 (timeline), ADR-0017 (partner handoff) for the staff console.
- New work is mostly mobile-side (learning, prompts) and server-side rules, plus a staff queue.
- A thief with the unlocked phone can still do harm in the seconds before protections react. The design reduces and records that; it does not remove it. The honest-wording rules in the design note §7 exist so the product does not claim otherwise.

## 5. Residual risks accepted (for review)

1. A compromised phone can lie about places and signals (bounded by D2).
2. Coarse zones of home and work are still personal information (bounded by D1 minimisation, consent, deletion and retention).
3. A customer who is coerced may answer "Was this you?" with "yes" (bounded by the duress-PIN entry, which has its own safety review).
4. Phone signals are missing on iOS and when the OS kills the app (bounded by D5).

## 6. What this ADR does not authorize

- Not authority to enable `LOCATION_INGESTION_ENABLED` or any `EXPO_PUBLIC_FEATURE_*` flag. Release Gate A is not widened.
- Not a Stage 8 disposition, QA sign-off, compliance ruling or `product-manager` approval.
- Not an API contract or schema approval, and not an instruction to add `expo-location`, a background task, a native module or a permission string.
- Not a decision on background tracking (ADR-0019) or on partner location sharing (ADR-0017).

## 7. Follow-ups

`compliance-specialist`: see the routing request. `authentication-engineer`: D4 window length and the notification on each change. `database-architect`: schema and retention. `mobile-architect`: on-device learning storage and the platform signal matrix. `ai-solutions-architect`: scoring limits and the rule against automated action. `cto`: ratify or amend after concurrences.
