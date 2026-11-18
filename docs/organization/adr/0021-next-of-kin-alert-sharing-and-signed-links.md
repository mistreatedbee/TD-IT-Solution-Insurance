# ADR-0021: Next-of-kin alert sharing and signed links

Status: **Proposed** — author `cto` (orchestrating), 2026-11-17. For `cybersecurity-architect`, `compliance-specialist` and `authentication-engineer` to confirm or amend. **Not a Stage 8 sign-off, not a compliance ruling, and not authority to enable location ingestion or any flag.**
Date: 2026-11-17
Context: [`docs/features/021-theft-protection-signals/00-design-note.md`](../../features/021-theft-protection-signals/00-design-note.md) §9; builds on [ADR-0009](0009-self-asserted-location-ingestion-trust-boundary.md) (SDL-2), [ADR-0012](0012-step-up-authentication-for-privileged-actions.md) and [ADR-0020](0020-on-device-learning-and-behaviour-signal-trust-boundary.md) D4. Numbering: 0019 is on the `spike/gt06-ingest-pilot` branch; 0020 is the sibling ADR.

---

## 1. Why this is a new trust boundary

Until now every reader of a customer's location was an authenticated platform user (the owner, staff, a partner operator). Next-of-kin sharing makes a **third party who is not a user and has no account** a reader of an alert and, at the top level, of a live location. That raises three questions the existing ADRs do not answer: how a non-user consents, how access stops, and how this feature is stopped from becoming a stalking tool.

## 2. Decisions

### K1 — The customer is the only controller. Nobody else can add, upgrade or widen a contact.

- A kin contact is added, upgraded, downgraded or removed **only by the customer**, after the ADR-0020 D4 server-checked step-up **and** the customer's PIN or code word.
- **Staff cannot add or upgrade a kin contact** without the customer's PIN or code word, entered by the customer into a verify field (never read out to staff). Staff may *remove* a contact at the customer's request.
- Every add, upgrade and removal notifies the customer out of band (SDL-9 pattern).

### K2 — Three levels, chosen per contact by the customer

(a) alert only; (b) alert plus place name (a coarse label such as "Home" or a zone name, never coordinates); (c) alert plus a live location link. The level applies per contact, and the customer also chooses **which alert types** each contact receives. Level (c) is never the default and needs an extra confirmation screen that states what it shares.

### K3 — Kin must confirm before they receive anything

An invite link goes to the contact (SMS or email). Until they open it and accept, they receive **nothing**. The invite says who invited them, what they would receive, and how to decline or stop. Declining or silence means no sharing. A contact may leave at any time through a link in every message they get.

### K4 — Location is shared only while an alert is open

No standing access. A level (c) link is created when an alert opens and **ceases to work** when the alert closes, when its set time ends, or when the customer or the contact revokes it, whichever is first. Reopening needs a new link.

### K5 — Signed links: properties

- Random token of at least 128 bits, stored **hashed**; the URL carries no personal data.
- Scoped to one alert and one contact; short life (default and ceiling set by `cybersecurity-architect`); revocable immediately; rate limited; uniform error for invalid, expired or revoked.
- The page shows the minimum needed and labels the data as **reported by the customer's phone or tracker**, never as an instruction (SDL-2). It offers no way to dispatch anyone and no history beyond the open alert.
- **Every open is audited** (time, contact, alert, result). Every alert sent is audited.

### K6 — The customer can see and stop everything

- A log of who received what and when.
- A periodic reminder (cadence set by `ux-researcher` and `compliance-specialist`) listing who has access and at what level.
- A **one-tap "stop sharing"** that revokes all links and pauses all contacts at once.

### K7 — Duress PIN

If the customer uses the duress PIN, sharing **stays active** and staff are alerted silently. The duress PIN never turns sharing off, and it never looks different to the person watching the screen. It needs its own safety review (compliance request item 9).

### K8 — SDL-2 is preserved

Shared data is a customer-supplied or tracker-supplied claim shown to a person the customer chose. It is not an instruction. A contact cannot trigger any action in the platform. Disclosure to a security partner is a separate path (ADR-0017) and is not changed here.

## 3. Threats this ADR addresses

| Threat | Control |
|---|---|
| A coercive partner or family member uses the feature to track the customer | K1 (customer-only control), K4 (only while an alert is open), K6 (reminders, log, one-tap stop), K3 (contact sees who invited them and how to leave). Residual risk below. |
| A thief with the phone adds themselves as kin | K1 (step-up plus PIN or code word; out-of-band notice) |
| Link forwarded or guessed | K5 (hashed 128-bit token, short life, alert-scoped, rate limit, uniform errors, audit) |
| Staff abuse | K1 (staff cannot add or upgrade), plus the existing ADR-0006 third trail for any staff view |
| Kin's own data (phone, email) leaks | Stored encrypted; minimal; deleted when the contact is removed or the account is deleted (Feature 015) |

## 4. Consequences

New server data: `kin_contacts` (customer, channel address encrypted, level, per-alert-type choices, state, consent time), `kin_links` (hashed token, alert, contact, expiry, revoked), `kin_access_log`. All covered by retention limits and delete-my-data. A new public, unauthenticated-by-session page exists for kin links; it needs its own Stage 8 review (a new unauthenticated surface, unlike ADR-0009 SDL-3). SMS is a paid third-party channel: vendor, cost and cross-border handling are new open decisions (`integration-architect`, `compliance-specialist`).

## 5. Residual risks accepted (for review)

1. A customer can still be pressured into adding or keeping a contact. Bounded by K3, K4 and K6; not removable.
2. A contact who has a live link can screenshot or relay it while the alert is open. Bounded by K4/K5 and the short life.
3. The duress PIN assumes the coercer cannot tell the difference; that is a safety judgement for `compliance-specialist`.

## 6. What this ADR does not authorize

No code, flag, schema, endpoint, SMS or email vendor, or location ingestion. No Stage 8 or compliance conclusion. Release Gate A is not widened.
