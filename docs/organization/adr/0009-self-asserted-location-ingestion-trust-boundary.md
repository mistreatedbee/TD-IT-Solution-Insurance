# ADR-0009: Self-Asserted Location Ingestion — a New Trust Boundary, Distinct from ADR-0006's Third Trail

Status: **Proposed** — pending `cto` ratification (also standing in for `solution-architect`, per `.cursor/rules/00-house-rules.mdc`). Concurrence required before this closes: `compliance-specialist` (lawful basis, retention, and the data-class question at SDL-7/SDL-8 — a review is reported running in parallel this session and is **not** assumed here) and `security-engineer` (implementation-fidelity conditions on SDL-3, SDL-6, SDL-10). **The security-architecture requirements SDL-1 … SDL-12 below are binding now** under `cybersecurity-architect`'s standing authority over trust-boundary design (`06-security-standards.md` §Governance — the same authority ADR-0006's status line invokes). What awaits ratification is the ADR-level *packaging*: the platform-wide precedent this sets for **every future stream of telemetry asserted by a customer-controlled client**, of which self-device location is merely the first.
Date: 2026-08-14
Deciders: `cybersecurity-architect` (proposing and deciding). Consulted, via their filed artifacts rather than in person: `mobile-architect` ([`008/architecture.md`](../../features/008-self-device-gps-tracking/architecture.md) §5(b), which posed this question and expressly declined to answer it), `business-analyst` ([`008/business-requirements.md`](../../features/008-self-device-gps-tracking/business-requirements.md) §4, §9, which specified the feature without assuming either answer). Governs: `backend-architect`, `database-architect`, `gps-integration-engineer`, `mobile-architect`, `authentication-engineer` on anything that ingests, stores, or reads a self-asserted location record.

**This ADR discharges `GPS-SD-03` ([`008/architecture.md`](../../features/008-self-device-gps-tracking/architecture.md) §7) and answers `OQ-SD-04` ([`008/business-requirements.md`](../../features/008-self-device-gps-tracking/business-requirements.md) §8). It does not authorize development of Feature 008 — see §14, which is not boilerplate.**

---

## 0. Ruling, stated up front

**Yes. Self-device location reporting introduces a genuinely new trust boundary, and it gets its own ADR. ADR-0006 is not reopened, not amended, and not extended.**

The two documents divide cleanly, and the line between them is the point of this ruling:

| | ADR-0006 (ratified) | ADR-0009 (this document) |
|---|---|---|
| Question | **Who looked at** a location record, and can we reconstruct that afterwards? | **Should the platform believe** a location record, and what may it be used for? |
| Side of the pipe | Access / read | Ingestion / write, plus classification of the record itself |
| Trust problem | A privileged insider reads data they are not entitled to read on this occasion | A **customer-controlled client asserts a fact about the physical world** and the platform stores it as if observed |
| Adversary | Admin, support agent, partner-org operator, compromised privileged session | The account holder themselves; anyone holding that account's session; malware on the reporting device |
| Status here | **Inherited unchanged.** Every non-owner read of a location record is the AUD-9 third trail, with AUD-1's join key and AUD-9's mandatory purpose/case reference. No new correlation mechanism (SDL-5). | New requirements SDL-1 … SDL-12 |

ADR-0006's third-trail rule anticipated location **access** and locked it down well. It did not, and could not, anticipate location **provenance**, because in the hardware-tracker model provenance was never a live question: the record's origin was a device with its own credential, and the ADR explicitly routed hardware ingestion authenticity to `gps-integration-engineer`/`integration-architect`. Self-device reporting collapses the asserting party and the data subject into one identity. That is not a variation on an access-control decision; it is a different decision, about a different property, taken against a different adversary.

**The sharpest single reason this is ADR-level rather than a feature note:** ADR-0006 §7's attack tree records, as its own emphasis, `G4. Locate the asset in real time → NO ENDPOINT EXISTS YET ** the one that matters **`. Feature 008 is the first proposal on this platform that would create an answer to G4. The platform's highest-consequence attack branch acquires its first live path here, and the document that governs how that path is built should be findable by that name, not buried in a §18 addendum to an ADR about audit correlation.

---

## 1. Numbering note — why 0009

Re-verified against the repository on 2026-08-14, not taken from `HANDOFF.md`'s claim: `docs/organization/adr/` contains `0001`, `0002`, `0003`, `0006`, `0008`. **0004** and **0005** remain reserved by name in already-filed documents (PII deletion vs. anonymisation, FU-03; platform session-token contract, FU-18) per ADR-0006 §1; `cto` ruling **R-4** (ADR-0006 §16.7) declined compaction and left both reserved. **0007** is reserved for FU-08's third-persistence-surface ADR by that same ruling. **0008** exists as *Proposed*. No `0009` file existed and no string `ADR-0009` appeared anywhere under `docs/` before this document. **0009 is claimed here.**

Consistent with R-4: numbers are not recycled and gaps are cheaper than stale cross-references.

---

## 2. Context — verified in the repository, 2026-08-14

Everything in this section was checked in code. Nothing is carried over from a planning document's claim.

**What exists:**

- `assetType: 'smartphone'` is a live enum value (`backend/src/lib/asset-validation.ts`), with its own details schema. Feature 004's customer asset API is live.
- `Asset.gpsDeviceId` / `gpsPairedAt` exist and are **written `null` on every create** (`backend/src/repositories/assets.ts`) — shaped for hardware pairing, never populated, exactly as `008/architecture.md` §1.3 describes.
- A **recovery-case entity now exists**: collection `recovery_cases` (`backend/src/db/recovery-collections.ts`), repository (`backend/src/repositories/recovery-cases.ts`), and routes (`backend/src/routes/recovery.ts`, `security-cases.ts`). Its document schema already carries `lastLocation { latitude, longitude, recordedAt, accuracyMeters }` and `lastLocationAt`, both nullable, both written `null` on create. **Nothing writes them.**
- A location **read** endpoint therefore already exists: `GET /v1/recovery/cases/:caseId/location` — customer-authenticated, owner-scoped, rate-limited, returning raw coordinates. It has never returned anything but `404`, because no writer exists.

**What does not exist:** no location ingestion endpoint of any kind; no `expo-location` dependency in `mobile/package.json`; no consent/opt-in record; no location-access audit trail; no GPS hardware vendor; no purge job for location data.

**Three findings from that survey that bear directly on this ruling, stated plainly rather than left for someone to trip over:**

1. **FU-A14 is now partially discharged, and this changes the sequencing ADR-0006 §17.3 assumed.** §17.3 ruled that AUD-9's mandatory purpose/case reference *"has nothing to resolve against"* because *"no case, claim, theft-report or recovery entity exists anywhere on this platform."* That is no longer true — `recovery_cases` is real, with a `referenceNumber`, an owner, a status lifecycle, and a partner-organisation field. **What remains open in FU-A14 is not the entity; it is the wiring:** no read path yet resolves a purpose against a case, and no location endpoint yet exists to attach one to. The hard sequencing constraint §17.3 imposed ("a resolvable case entity is a prerequisite... it belongs in the Stage 1 of whichever of those features starts first") is therefore **satisfiable now** for Feature 008 rather than blocking, provided SDL-5 is honoured.
2. **The `recovery_cases` shape has already pre-empted part of this design, without a security review.** A coordinate field landed in a live collection validator ahead of any ingestion decision, any lawful-basis ruling, and any field-sensitivity evaluation. Nothing is stored in it, so nothing has leaked — but it is precisely the drift pattern `cto` named at ADR-0006 §17.1 ("a design document is not a migration") running in the other direction. SDL-6 and SDL-11 bind that field the moment anything writes to it.
3. **Neither `recovery.ts` nor `security-cases.ts` writes any audit record.** Grepped: no `admin_access_log` writer, no `record()` / `recordBulkDisclosure()` call in either file. The customer-owner path is defensible — a data subject reading their own data is not privileged access and must not pollute the privileged-access trails (SDL-4). **The partner-organisation path in `security-cases.ts` is not defensible under ADR-0006 AUD-9's partner-operator clause**, which requires a trail *and* a purpose reference for any partner-org operator access. Today it exposes `lastLocationAt` (a timestamp, not coordinates) and case/account identifiers with no trail at all. That is a live gap in Feature 004/005's surface, not in Feature 008's — I am recording it here because I found it while ruling on this, and filing it as **SD-FU-05** rather than silently leaving it. It is out of scope for this ADR's decision.

---

## 3. Why this is a new trust boundary — the reasoning, in full

`008/architecture.md` §5(b) framed the question correctly: the *access* side is the same class of sensitive data ADR-0006 already governs, but the *ingestion* side has no independent hardware attesting to the claim. Five properties make that difference structural rather than cosmetic. Any one of the first three would justify a separate decision; together they are decisive.

**(a) The asserting party is the data subject, so the audit key is tautological.** ADR-0006's entire mechanism rests on separating *actor* from *subject* — AUD-1's join key, AUD-2's schema correction, AUD-3(b)'s bulk-disclosure rows, the §7 attack tree, all of it. On a self-device ping, actor and subject are the same account, in the same session. AUD-1's key is still *well-formed* on the write path and still *worthless* there: a trail row saying "customer X, acting as customer X, wrote a location for customer X's own asset" answers no question anyone will ask. Applying ADR-0006 to the write path would produce evidentiary rows with zero evidential content, at the cost of growing an evidentiary table R-1 has already committed to growing at up to 200 rows per list call. **Extending ADR-0006 to ingestion would be architecture theatre of exactly the kind ADR-0006 §0 refused to commit** when it rejected a request-scoped join key that would never once hold the same value in both trails.

**(b) The record is a claim, not an observation, and the platform cannot tell the difference.** A hardware tracker's ping is a sensor reading transported under a device credential; forging it requires compromising the device or the vendor channel. A self-device ping is whatever the app says it is — and beneath the app, whatever the OS says it is, on a device the reporting party physically controls. Mock-location providers, rooted/jailbroken devices, emulators, and a modified build of our own client all produce a syntactically perfect ping. There is no Phase 1 control that makes a self-asserted coordinate *true*. The only honest architectural response is to **stop pretending the two sources are the same kind of fact** (SDL-1) and to **remove the incentive to lie by removing what a lie could buy** (SDL-2). ADR-0006 has no vocabulary for this because it governs a world in which every record it describes is a record of something the platform itself did.

**(c) The consequences of a false record reach outside the platform and touch third parties.** A false location on this platform's roadmap eventually means: a claim adjudicated on fabricated evidence, or — the one that matters — an armed-response partner dispatched to a physical coordinate. ADR-0006's read-side threat model has no analogue for a control failure whose blast radius is a person arriving at an address. That is a new consequence class, and it belongs in a document a `gps-integration-engineer` or a `payment-engineer` will find when they design the next self-reported stream.

**(d) The data class itself changes at ingestion, and ADR-0006 pre-committed to reopening exactly here.** AUD-12's forward constraint is explicit: *"if a future location-access trail records coordinates, a route, or any derived location value rather than only a reference, that trigger fires and the evaluation happens before it ships."* Feature 008 is the first thing on this platform that would persist coordinates. The trigger fires. That is not a reason to fold this into ADR-0006 — it is ADR-0006 correctly handing off a question it deliberately did not answer, and SDL-6 answers it.

**(e) The person-proximity of the source is different in kind.** A vehicle tracker reveals where an object is. A phone reveals where a *person* is, continuously, because it is carried on the body — the platform's own standard (`06-security-standards.md` line 28: location data is sensitive personal data because it reveals behaviour patterns) lands harder here than anywhere else on the roadmap. Combined with (a) — the same session both writes and reads it — **account takeover on this feature is qualitatively worse than account takeover anywhere else on this platform**: it hands an attacker a live feed of where the customer physically is, and it is the first feature to do so. That is the risk this role exists to refuse to wave through, and SDL-9 is the answer.

**The honest counter-argument, addressed rather than avoided.** ADR-0006 §12's revisit triggers include *"a third privileged-access trail is proposed with a different correlation scheme."* If ADR-0009 proposed a different correlation scheme, ADR-0006 would have to be reopened rather than complemented. **It does not.** SDL-5 inherits AUD-1 verbatim, inherits AUD-7's retention symmetry and cross-store legal hold, inherits AUD-9's purpose/case reference, and invents nothing. No ADR-0006 revisit trigger fires. This document states a corollary in a domain ADR-0006 explicitly did not reach — the same relationship ADR-0006 §3/§10 established with ADR-0002, and it is deliberately modelled on it.

---

## 4. Alternatives considered

**(a) Append an addendum to ADR-0006 (its own §18), extending the third-trail rule to cover ingestion.** Rejected on three grounds. *Subject-matter:* ADR-0006 decides how privileged **access** is correlated across two stores; provenance and use-limitation of asserted telemetry is a different question with a different adversary, and merging them makes both harder to find. *Record integrity:* ADR-0006 is a ratified, signed document already carrying a `cto` correction layer (§17) appended precisely so the ratification record would not edit itself; hanging a new trust-model decision off it repeats that awkwardness at greater cost. *Discoverability, which is the decisive one:* ADR-0006 §6 and R-5 justify its own ADR-level status by naming the failure mode of a future role designing a location surface without reading the right document. The same argument applies to `gps-integration-engineer` opening hardware ingestion, or a future analytics/claims role ingesting any customer-asserted signal — none of them will search an audit-correlation ADR for a rule about whether to believe their input.

**(b) No ADR — a feature-level security note under `docs/features/008-*/`.** Rejected on `05-development-standards.md`'s own three-part test, applied as `integration-architect` applied it in `smtp-vendor-selection.md` §9. *Expensive to reverse?* The endpoint, no. The rule — "self-asserted telemetry is a distinct provenance class and may not, alone, drive real-world or third-party action" — yes: once claims, dispatch, or pricing has consumed a self-asserted signal, unwinding that is a product and legal problem, not a migration. *Affects multiple teams?* Normatively: `backend-architect`, `database-architect`, `mobile-architect`, `gps-integration-engineer`, `authentication-engineer`, and pre-decides a question for `payment-engineer` and Claims before either reaches it. *Sets a precedent?* Yes, and this is the first of its kind on the platform.

**(c) Defer the whole question until the GPS hardware vendor is chosen, then write one ingestion ADR covering both sources.** Rejected. The self-device slice's entire merit is that it does not depend on the vendor decision (`008/architecture.md` §0), and deferring would either block Feature 008 behind an unrelated open decision owned by another role, or — far likelier, given this platform's own recent history of code landing ahead of Stage 8 on Features 006 and 007 — let it ship ungoverned. SDL-1's source discriminator is specifically designed so the hardware pipeline slots in later without redesign, which is the coherence benefit (c) was reaching for, obtained without the delay.

**(d) Treat a self-asserted coordinate as equivalent in trust to a hardware-attested one, and design one ingestion path.** Rejected, and this is the error the whole ADR exists to prevent. It is also the cheapest error to make, because the two records look identical in storage. SDL-1 makes the distinction a stored, server-derived, immutable property rather than a fact about the endpoint that happened to write the row — an instance of this role's standing preference for controls that make a class of mistake structurally impossible over controls that rely on developers remembering.

---

## 5. Decision — the mandated requirements

Precise enough for `backend-architect`, `database-architect`, and `mobile-architect` to design against with no further input from me. Field names, endpoint shapes, and storage strategy remain theirs; the guarantees are mine.

### SDL-1 — Provenance is a first-class, server-derived, immutable property of every location record

Every stored location record carries, at minimum:

- **`source`** — the discriminator `008/architecture.md` §1.3 recommends (`self_device` | `hardware_tracker`), **derived by the server from which authenticated ingestion path the record arrived on**, never read from the request body. A client that could label its own ping `hardware_tracker` could launder a claim into a stronger evidence class with one JSON field.
- **`assertionMode`** — `self_asserted` | `device_attested`. Distinct from `source` on purpose: a future attestation mechanism (SDL-12) could raise a self-device ping's assertion mode without changing its source, and a compromised vendor channel could lower a hardware ping's without changing its.
- **Immutability.** Neither field may be updated after write by the application credential, on the same reasoning as AUD-11: a record whose provenance can be edited afterwards has no provenance.

`Asset.gpsDeviceId` / `gpsPairedAt` **may not be repurposed** to signal self-device tracking. `008/architecture.md` §1.3 is correct and I am converting its recommendation into a requirement: the overload would make "is this asset tracked" unanswerable without knowing which kind of tracked was meant, and ambiguity in exactly this field is how a self-asserted coordinate ends up treated as a hardware fix.

### SDL-2 — A self-asserted location may not, on its own, drive a real-world or third-party consequence

**Binding, and the single most important requirement in this document.** A record with `assertionMode: self_asserted` may be:

- displayed to the asset's own owner;
- retained as one input to a human-reviewed process.

It may **not**, without a documented human decision step and (once one exists) independent corroboration:

- dispatch, task, or route a security-company partner or any third party to a physical location;
- be disclosed to a partner organisation as an operational instruction rather than as a labelled customer-supplied claim;
- adjudicate, price, approve, or deny a claim;
- alter policy status, premium, eligibility, or any billing outcome;
- trigger any automated action with a physical-world effect.

**Rationale, because this is a design constraint people will want to relax later:** the platform cannot verify a self-asserted coordinate (§3(b)), so the only structural defence is to ensure that a false one buys nothing. This converts "customer might lie" from a control problem into a non-problem for Phase 1, and it is the reason SDL-12's residual risk is acceptable rather than blocking. Relaxing SDL-2 is a re-threat-model trigger (§12), not a product decision — and it is the specific thing I will refuse at Stage 8 if it arrives unaccompanied by a corroboration design.

This requirement is **consistent with, and independently reached from**, `business-analyst`'s §2.2 and §6.2 rulings and `mobile-architect`'s §0 framing. Where they constrain what may be *claimed to customers*, SDL-2 constrains what the *system may do*. Both are needed; neither substitutes for the other.

### SDL-3 — Ingestion is a customer-authenticated write on the existing session boundary. No new unauthenticated surface.

- Self-device ingestion rides the existing mobile session (backend-minted, signature-verified, revocation-checked, device-bound). **No webhook, no shared static key, no device-registration secret, no new credential class** is created for this path. The hardware-tracker pipeline will need its own device-credential model; that is `gps-integration-engineer`'s and `integration-architect`'s to design and it does **not** inherit anything from this requirement.
- Every ping is **independently authorized on every call** — zero-trust, no enrolment-implies-trust caching. The authorization decision is the conjunction of: the session's account owns the asset; the asset's `assetType` is `smartphone`; the asset's location source is `self_device`; and an **active opt-in consent record exists** (SDL-4).
- **MP-7 applies without exception:** an explicit rate limiter, sized for a foreground/on-demand capture pattern. A location ingestion endpoint with the default authenticated limit is a cheap way for a compromised session to write a dense movement history that the feature was designed not to collect — the limiter is a privacy control here, not only an availability one.
- **Fail closed on authorization, fail closed on consent, and reject rather than silently drop.** A rejected ping returns an error; it does not return `202` and discard, which would leave the customer believing a location was captured.

### SDL-4 — Consent state is a stored, server-side, auditable object — not an OS permission

The OS permission grant is a *mechanism*, visible only on the device and revocable outside the platform's sight. It is not a record the platform can produce later. Therefore:

- An **opt-in record per (account, asset)** is persisted server-side, carrying at minimum: who opted in, when, from which session/device, the consent-copy version shown, and the current state.
- **Ingestion is rejected when no active opt-in record exists.** Consent is checked at the server on every write (SDL-3), not assumed from the presence of a coordinate in the request.
- **Opt-in, opt-out, and any re-consent are account-security events** and are recorded as such on the identity trail (Trail A's existing `app.account_audit_log`, event-type choice `backend-architect`/`database-architect`'s with `authentication-engineer`) — because an attacker who silently enables tracking on a taken-over account has performed a security-relevant state change, and the customer must be able to see it afterwards.
- **A customer-initiated location write is not privileged access and must not be written to the privileged-access trails.** Only *consent-state changes* land on Trail A; only *non-owner reads* land on the AUD-9 location trail (SDL-5). The pings themselves are domain data, not audit data.

### SDL-5 — The read side inherits ADR-0006 unchanged

Stated so nobody has to infer it:

- Any read of a location record **by anyone other than the asset's own owner** — admin, support agent, partner-organisation operator, internal service, analytics — is a privileged access in ADR-0006's sense and is the **AUD-9 third trail**. It lives in the store holding the data it describes (MongoDB, per ADR-0002), carries AUD-1's join key with identical field names and semantics, is append-only by privilege (AUD-11), fails closed (AUD-10), and **carries AUD-9's mandatory purpose/case reference**, which must resolve to an entity existing independently of the access. **`recovery_cases` is now that entity** (§2, finding 1) — free-text purpose strings remain excluded, per `cto` §17.3.
- **No new correlation mechanism may be invented.** A proposed deviation reopens ADR-0006, not this document.
- The owner's own read of their own asset's location is **not** privileged access and does not enter these trails (§2, finding 3).
- **AUD-7 inheritance is confirmed and its number remains `compliance-specialist`'s** (C-16(a)): the location trail's retention period, its effect on AUD-7(a)'s `min()`, and `cto`'s §17.4 clarification (a longer single-trail retention buys nothing for *correlated* reconstruction, and whoever sets the period must say which of the two they are buying) all apply here unchanged.

### SDL-6 — AUD-12's field-level-encryption evaluation fires, and must complete before ingestion ships

ADR-0006 AUD-12 pre-committed to this trigger on the first stored coordinate. **It has fired.** I am not pre-deciding its outcome — that evaluation is joint (`cybersecurity-architect` + `security-engineer` + `compliance-specialist` + `database-architect`) and must weigh Mongo-side encryption options against the query patterns a last-known-location read and any future geospatial query actually need. What is decided now, as the floor regardless of that outcome:

- **TLS in transit on every hop; encryption at rest on the store** (Atlas platform default — verified as a claim about the vendor, not about our configuration).
- **Coordinates may never appear in application logs, error envelopes, exception traces, analytics events, notification payloads, or support tooling.** This is the SDL-analogue of C-17 (no verbatim query values in the audit trails) and it is one well-meaning `console.log` away from being violated. Where a log line needs to reference a location event, it references the record id.
- **Coordinates are never a URL path or query parameter** — they belong in a body or a response, never in something that lands in access logs, proxies, or browser history.
- The evaluation's outcome is recorded in Feature 008's field-sensitivity review before any ingestion code ships, following the precedent of Feature 004's `field-sensitivity-review.md` (P-14).

### SDL-7 — Server clock is authoritative; the device clock is retained as a claim

Both timestamps are stored: `capturedAt` (device-supplied, part of the claim) and `receivedAt` (server-derived). **Every security, retention, ordering, or eligibility decision uses `receivedAt`.** `capturedAt` is displayed and retained because it is genuinely useful to the customer and to a later investigation, but it is caller-controlled and therefore, by the same reasoning as AUD-4, **not evidence**. A stored record whose `capturedAt` materially precedes its `receivedAt` is a normal offline-then-online case, not an anomaly — and equally, it is not something the platform may assert as a fact about when the phone was where.

### SDL-8 — Retention must be enforced by a scheduled mechanism before ingestion ships, not by a function nobody calls

The **period** is `compliance-specialist`'s (`06-security-standards.md` line 29; `008/business-requirements.md` §5.4 D-SD-07 correctly refuses to invent it). The **enforcement** is an architecture requirement and it is mine:

> No location ingestion may ship until a purge mechanism for location records is **scheduled and evidenced**, and no document may describe location retention as enforced until something calls it on a schedule.

This is not a generic precaution. `cto` §17.1/§17.2 found exactly this failure on Trail A: `app.purge_expired_audit_log()` exists, nothing invokes it, and a compliance document described the result as *"automated-and-evidenced enforcement."* Location data is the most sensitive class on the platform and would be the worst place to repeat it. Same standard, applied before the data exists rather than after.

### SDL-9 — Enabling self-device tracking is a sensitive account action, and account takeover must not silently yield live location

Because §3(e) makes ATO qualitatively worse on this feature than anywhere else on the platform:

- **Opting an asset in requires a re-authentication step-up** (fresh credential or MFA challenge, per the platform's existing session policy) — not merely an active session. An attacker holding a stolen session should not be able to turn on tracking with a single tap.
- **Opt-in and opt-out both notify the account holder out-of-band** on a channel the attacker does not necessarily control — at minimum the verified email address (the auth-email path exists via `auth-send-email`; delivery is still owner-blocked on Resend, which is a dependency, not a reason to skip the requirement). This is the same reasoning that makes password-change notifications standard.
- **Opting out takes effect server-side immediately** — ingestion is refused from the moment consent is withdrawn, regardless of what a stale client believes (SDL-3's per-call consent check is what makes this true rather than aspirational).
- **The opt-in state is visible to the customer** wherever they can see the asset, so a silently-enabled feature is discoverable.

### SDL-10 — Binding "this app install" to "that registered asset" is asserted, not proven, and must be recorded as such

The platform cannot prove the app is running on the specific phone registered as the asset. What it can do, and must:

- record the session's **device binding** (the existing device-ID mechanism used on login and refresh) on the opt-in record and on each ingested record, so that a later investigation can see whether pings for one asset arrived from more than one device install;
- treat a **change of bound device** for an opted-in asset as a consent-affecting event requiring re-consent (SDL-4) and notification (SDL-9), not a silent re-binding.

The residual — that a determined account holder can report a location from a device that is not the insured phone — is accepted at RR-3 and is bounded by SDL-2.

### SDL-11 — Scope lock: `smartphone` only, foreground/on-demand only, enforced server-side

`business-analyst`'s AC-SD-08 and AC-SD-02 are client-side acceptance criteria. **The server must enforce the same boundaries**, because a client-side scope rule is not a control:

- ingestion rejected for any asset whose `assetType` is not `smartphone`;
- ingestion rejected for any asset without an active `self_device` opt-in;
- the record's `triggeredBy` provenance value is constrained to the Phase 1 set (no background value exists to write), so that a background variant cannot arrive silently through a client update without the server-side change that SDL-12's revisit trigger would catch.

**The pre-positioned `lastLocation` field on `recovery_cases`** (§2, finding 2) is bound by every requirement in this section from the moment anything writes to it, including SDL-1's provenance fields — which that validator does not currently carry. A location record written into a recovery case without provenance would defeat SDL-1 at the first opportunity.

### SDL-12 — Attestation is not required in Phase 1, and the reason is SDL-2

Platform attestation APIs (Play Integrity, App Attest) would raise `assertionMode` toward `device_attested` and materially reduce §3(b)'s forgery exposure. **They are not mandated for Phase 1**, because SDL-2 removes what a forged location could buy, and mandating a native attestation surface for a feature whose own architecture recommends the lightest possible permission tier is disproportionate.

**This acceptance is explicitly conditional.** Attestation moves from optional to required the moment SDL-2 is relaxed in any direction — the day a self-asserted coordinate can dispatch a partner, inform a claim, or affect pricing. That coupling is deliberate: it means whoever proposes relaxing SDL-2 inherits the cost of making the signal trustworthy, rather than the platform absorbing the risk by default.

---

## 6. Why this is ADR-level

Applying `05-development-standards.md`'s test the way `smtp-vendor-selection.md` §9 and ADR-0006 §6 both applied it:

| Test | This decision |
|---|---|
| Expensive to reverse? | **The endpoint, no. SDL-1's provenance discriminator and SDL-2's use-limitation, yes.** Retrofitting provenance onto a store of already-written location records means re-classifying data whose origin is no longer determinable. Unwinding SDL-2 after claims or dispatch has consumed a self-asserted signal is a legal and product problem, not a migration. |
| Affects multiple teams? | **Yes, normatively** — binds `backend-architect`, `database-architect`, `mobile-architect`, `authentication-engineer`, `gps-integration-engineer`, and pre-decides a question for Claims and `payment-engineer` before either reaches it. |
| Sets a precedent? | **Yes, and this is the load-bearing reason.** This is the platform's first ruling on **customer-asserted telemetry as a distinct provenance class**. Every later self-reported signal — a customer-reported odometer reading, a self-declared asset condition, a self-reported theft time, any future non-hardware sensor — inherits SDL-1 and SDL-2 by name. |
| Governing-document signal | `CLAUDE.md` names the GPS vendor as an ADR-weight open decision. **This is not that decision and does not pre-empt it** — but it is the first ruling on how the data that pipeline will eventually produce must be classified and used, and it constrains the vendor decision's ingestion design at exactly one point: SDL-1's discriminator must exist on both paths. |

**If `cto` disagrees with this classification,** demoting it to `docs/features/008-self-device-gps-tracking/security-architecture.md` is a retitle-and-move that loses none of the analysis — the same escalation path ADR-0006 §6 offered in the other direction. SDL-1 … SDL-12 bind either way, under the authority named in the status line.

---

## 7. Threat-model delta

**New trust boundary — the first one this platform has added since Feature 001.** ADR-0006 §7 could truthfully record "no new trust boundary"; this one cannot, and that asymmetry is itself the answer to the question this ADR was asked.

> **TB-SD: customer-controlled client → platform, asserting a fact about the physical world.** The client is authenticated (the *account* is who it says it is) but the *content* it asserts is unverifiable, originates outside any environment the platform controls, and describes the physical position of a person.

Every prior write boundary on this platform accepts data *about* the customer's own declared property (an asset's brand, a policy request) where the customer is the authoritative source by definition. TB-SD is the first where the customer is **not** the authoritative source of the fact they are asserting, but is the only party in a position to assert it.

**STRIDE, TB-SD:**

| | Threat | Disposition |
|---|---|---|
| **Spoofing** | A ping is written for an asset by a session that does not own it, or for a non-phone asset | Closed by SDL-3's per-call authorization conjunction and SDL-11's server-side scope lock |
| **Tampering** | Mock-location provider, rooted device, modified client, or a replayed/edited `capturedAt` produces a false-but-well-formed record | **Not prevented and cannot be in Phase 1** (§3(b)). Bounded by SDL-2 (a lie buys nothing), SDL-1 (the record is permanently labelled as a claim), SDL-7 (device clock is never evidence). Accepted at RR-1, reopened by SDL-12's trigger |
| **Repudiation** | Who wrote / who read a location record | Write side: SDL-4's consent-state events on Trail A; the record's own provenance metadata. Read side: ADR-0006 AUD-1/AUD-9 unchanged (SDL-5) |
| **Information disclosure** | Coordinates leak via logs, URLs, error envelopes, notification payloads, analytics; or via a non-owner read with no trail | SDL-6's prohibitions; SDL-5's trail inheritance; AUD-12's FLE evaluation |
| **Denial of service / abuse** | A compromised session writes a dense movement history the feature was designed not to collect | SDL-3's mandatory, privacy-sized rate limiter |
| **Elevation of privilege** | A self-asserted coordinate escalates into a real-world action (dispatch) or a financial outcome (claim) | **Closed structurally by SDL-2** — the escalation path is not built, and building it is a re-threat-model trigger |

**Extension to ADR-0006 §7's attack tree — G4 gets its first live branch:**

```
GOAL: locate a customer's asset (and, for a phone, the customer) in real time
├── G4a. Compromise the customer's account, read their own location  → NEW, live if Feature 008 ships
│         ├── mitigated by SDL-9 (step-up on opt-in, out-of-band notice, immediate opt-out)
│         └── NOT mitigated by anything if the session itself is stolen post-opt-in
│             — the customer's own read path is legitimately unaudited (SDL-4/§2 finding 3)
├── G4b. Privileged insider reads the location trail                 → governed by ADR-0006 AUD-9 (SDL-5)
├── G4c. Partner-org operator reads location via a case              → AUD-9 purpose/case reference; SD-FU-05's live gap
└── G4d. Poison the location record to misdirect a response          → closed by SDL-2; reopens if SDL-2 is relaxed
```

**G4a is the branch this feature creates and the one worth stating plainly to `cto` and `product-manager`:** for a phone asset, a customer's own account becomes a live feed of where that customer physically is. Account takeover on this platform has always been serious; with Feature 008 it becomes a personal-safety issue, not only a data-protection one. SDL-9 is the mitigation and it is not complete — an attacker who takes over an account *already* opted in inherits the feed with no further step-up. Recorded as RR-2, not waved through.

**Hand-off to `qa-architect` / `automation-qa-engineer`** — security test cases this threat model generates, for whenever Feature 008 reaches Stage 10:

1. A ping for an asset the session does not own is rejected, and nothing is written (SDL-3).
2. A ping for a non-`smartphone` asset is rejected server-side even if the client sends it (SDL-11).
3. A ping with no active consent record is rejected; a ping after opt-out is rejected immediately, without waiting for a client to notice (SDL-3/SDL-4/SDL-9).
4. A request body attempting to set `source: hardware_tracker` or `assertionMode: device_attested` is ignored, and the stored record is `self_device` / `self_asserted` (SDL-1).
5. `receivedAt` is server-derived and is used for ordering even when `capturedAt` disagrees or is implausible (SDL-7).
6. No coordinate appears in any log line, error envelope, or notification payload for any of the above (SDL-6) — this is a grep-able assertion, not only a unit test.
7. Opt-in without a step-up re-authentication is refused (SDL-9).
8. A non-owner read of a location record writes an AUD-1-conforming trail row carrying a purpose/case reference that resolves to a real `recovery_cases` document (SDL-5) — `security-engineer`'s to verify against the live store, not a unit test.

---

## 8. Residual risks accepted

Silent acceptance is not permitted; each is accepted *because* a requirement above bounds it.

| ID | Residual risk | Why accepted | Bounded by | Owner |
|---|---|---|---|---|
| **RR-1** | **A self-asserted location can be falsified** by a mock-location provider, rooted device, or modified client, and the platform cannot detect it. | Unavoidable without attestation, and attestation is disproportionate while SDL-2 holds. The lie buys nothing: no dispatch, no claim, no billing effect. | SDL-2 (use limitation), SDL-1 (permanent provenance label), SDL-12 (attestation becomes required if SDL-2 is relaxed) | `cybersecurity-architect` |
| **RR-2** | **An attacker who takes over an already-opted-in account inherits a live feed of the customer's physical position**, with no further step-up. | SDL-9's step-up protects the *enabling* action, not an already-enabled one; adding step-up to every location read would make the feature unusable for its actual purpose. This is the same shape as ADR-0006 §7's admission that it does not prevent a compromised session from reading data. | SDL-9's out-of-band notification and immediate opt-out; the platform's existing session revocation, device binding, and MFA controls | `cybersecurity-architect` + `authentication-engineer` |
| **RR-3** | **The app-install-to-asset binding is asserted, not proven** — a customer could report from a device that is not the insured phone. | The only fix is attestation (RR-1's reasoning), and the consequence is bounded because SDL-2 forbids the outcomes that would make it worth doing. | SDL-10's recorded device binding and re-consent on device change | `mobile-architect` + `cybersecurity-architect` |
| **RR-4** | **The feature will be silent exactly when it is most needed** (post-theft), per `008/architecture.md` §0 — a security-relevant customer-trust risk, not only a product one: a customer may rely on it and be wrong. | It is honestly disclosed rather than engineered away, and the disclosure obligations are already ratified (`business-analyst` §6.1/§6.2/§6.3; `mobile-architect` §0). | §6's prominence rule; AC-SD-07; SDL-2 (the platform never acts as if the signal were reliable either) | `product-manager` + `compliance-specialist` |
| **RR-5** | **`recovery_cases.lastLocation` already exists in a live validator** with no provenance fields and no security review of that shape. | Nothing writes it, so exposure today is zero. | SDL-11's binding of that field; `database-architect` amends the validator before any writer exists | `database-architect` |
| **RR-6** | **Coordinate leakage through a channel nobody thought of** (a new log line, a push payload, an analytics event) is one careless commit away. | Inherent to storing a sensitive value in a system with many outputs; the same class of risk C-17 accepted for audit trails. | SDL-6's explicit prohibitions, the §7 test case 6 grep assertion, `security-engineer`'s Stage 9 review | `security-engineer` |
| **RR-7** | **Architecture drift** — everything here is design; no ingestion code exists, and Features 006/007 have already demonstrated code landing ahead of a Stage 8 gate on this platform. | Being at design time is the point and is the cheapest moment. Named rather than assumed away, given the platform's own recent record. | §14's explicit no-build statement; Stage 8 for Feature 008 chaired by this role | `cybersecurity-architect`; continuous |

---

## 9. Consequences

- The platform gains an explicit, storable answer to **"how much should we believe this location record?"** — and, via SDL-2, a structural guarantee that a wrong answer cannot cause a physical-world action.
- **Two provenance classes, permanently.** The hardware pipeline, whenever its vendor is chosen, slots into SDL-1's discriminator rather than requiring a redesign — the coherence `008/architecture.md` §3.1 argued for, obtained without designing the hardware path here.
- **ADR-0006 is unchanged and remains the sole authority on privileged-access correlation.** This document adds nothing to it and takes nothing from it.
- **FU-A14's entity half is discharged in fact** (`recovery_cases` exists); its wiring half now has a named first consumer — Feature 008's non-owner read path, which cannot ship without it (SDL-5).
- **AUD-12's field-level-encryption evaluation is now live work** with a named trigger date rather than a forward constraint.
- **`06-security-standards.md` gains a normative line on ratification** (SD-FU-01), so the rule binds roles that read neither this ADR nor the feature folder — the FU-A5 pattern, which worked.
- Feature 008's Stage 8, when it runs, has a concrete conformance checklist rather than a blank page.

## 10. What does NOT change

- **ADR-0006 is not amended, extended, or reopened.** No revisit trigger of it fires. SDL-5 inherits it verbatim.
- **ADR-0002 is not amended.** Location data is domain data and lives in MongoDB, exactly as ADR-0002 §Decision already assigns *"policies, assets, GPS/location history, and claims."* Consent-state *events* land on the identity trail because they are account-security events, which is equally inside ADR-0002's existing split.
- **ADR-0001 is not amended.** SDL-3 requires no native module beyond what `008/architecture.md` §6 already evaluated as managed-workflow-compatible; nothing here triggers an Expo eject.
- **The hardware-tracker model is untouched.** No vendor is chosen, implied, or constrained beyond SDL-1's discriminator. Vehicle, tablet, TV, desktop, business equipment, and `other_electronics` are unaffected.
- **No retention period is set.** SDL-8 constrains *enforcement*, not the number.
- **No lawful-basis determination is made.** That is `compliance-specialist`'s, running in parallel, and nothing here substitutes for it or predicts it.
- **No plan-tier, pricing, or marketing decision is made.** `business-analyst` §3's BR-SD-01 and §6 stand on their own authority.

## 11. Follow-ups

| ID | Item | Owner (A) | Blocks |
|---|---|---|---|
| **SD-FU-01** | One normative line in `06-security-standards.md` §"Data protection & privacy": *telemetry asserted by a customer-controlled client is a distinct provenance class, is labelled as such at write time by the server, and may not alone drive a real-world, third-party, or financial consequence.* | `cybersecurity-architect` (on ratification) | The rule binding roles who read neither this ADR nor Feature 008's folder |
| **SD-FU-02** | AUD-12's field-level-encryption evaluation for stored coordinates; outcome filed as Feature 008's `field-sensitivity-review.md` | `cybersecurity-architect` + `security-engineer` + `compliance-specialist` + `database-architect` | Any ingestion code (SDL-6) |
| **SD-FU-03** | Scheduled, evidenced purge mechanism for location records, against `compliance-specialist`'s period | `cloud-infrastructure-architect` + `devops-engineer`, period from `compliance-specialist` | Any ingestion code (SDL-8) |
| **SD-FU-04** | `recovery_cases` validator amended so `lastLocation` cannot be written without SDL-1's provenance fields | `database-architect` | Anything writing `lastLocation` (SDL-11, RR-5) |
| **SD-FU-05** | `/v1/security/cases*` (partner-organisation surface) writes no audit trail and carries no AUD-9 purpose reference today — a live gap in Feature 004/005's surface, found while ruling on this and filed rather than left | `backend-architect` + `cybersecurity-architect`, verified `security-engineer` | That surface serving real customer data; escalates to blocking the moment it exposes any location value |
| **SD-FU-06** | Consent-state event type(s) on Trail A for opt-in/opt-out/re-consent (SDL-4), and the step-up + out-of-band notification design (SDL-9) | `authentication-engineer` + `backend-architect` | Feature 008's Stage 7 API design |
| **SD-FU-07** | Location-access trail (AUD-9 third trail) design for non-owner reads, wired to `recovery_cases` as the purpose reference — the remaining half of FU-A14 | `database-architect` + `backend-architect`, conformance `cybersecurity-architect` | Any non-owner read of a location record (SDL-5) |

## 12. Revisit triggers

- **SDL-2 is proposed to be relaxed in any direction** — dispatch, claims, pricing, partner disclosure as instruction. Reopens this ADR, fires SDL-12's attestation requirement, and requires a corroboration design before Stage 8.
- **Background or periodic self-device tracking is proposed** (D-SD-02) — a different permission tier, a different collection profile, a different battery/consent calculus, and a materially denser movement history than SDL-3's rate limiter was sized for.
- **A non-phone self-reporting client is proposed** (D-SD-01's desktop agent) — a new client platform is a new trust boundary; SDL-1/SDL-2 carry over, nothing else is assumed to.
- **The GPS hardware vendor decision lands** — the two sources begin to merge, `assertionMode: device_attested` becomes real, and the composition rule for a "current known location" across both sources needs its own review.
- **Any endpoint composes identity + asset + location in one request** — ADR-0006 AUD-9's growth rule fires independently of this document, and I pre-commit again here to re-threat-modelling it.
- **A partner-organisation surface gains access to any location value** — ADR-0006 §12's partner trigger and SD-FU-05 fire together.
- **A platform attestation API becomes cheap enough to adopt without a native-surface cost** — reconsider SDL-12 on its merits rather than waiting for SDL-2 to be relaxed.
- **Any other customer-asserted telemetry stream is proposed** — it inherits SDL-1/SDL-2 by name; a deviation reopens this ADR rather than being settled locally.

## 13. Pre-Approval Checklist (`cybersecurity-architect` self-review)

- [x] **Threat model updated for this change's data flows and trust boundaries.** §7 — one genuinely new trust boundary (TB-SD), full STRIDE pass, and a new live branch (G4a) on ADR-0006 §7's attack tree.
- [x] **All new/changed trust boundaries follow zero-trust.** SDL-3: every ping independently authenticated and authorized, no enrolment-implies-trust, no new unauthenticated surface, mandatory rate limiter.
- [ ] **Sensitive data classification confirmed with `compliance-specialist`.** **Not yet, and this document does not claim it.** `06-security-standards.md` line 28 already classes location as sensitive personal data, which is what SDL-6/SDL-8 are built on — but the lawful-basis, consent-copy, and retention rulings (`GPS-SD-02`) are `compliance-specialist`'s and are running in parallel, not concluded.
- [x] **Encryption at rest and in transit specified for any new data store or channel.** SDL-6 sets the floor and fires AUD-12's field-level-encryption evaluation as SD-FU-02 rather than pre-deciding it.
- [x] **Third-party access scoped to least privilege with audit logging.** SDL-5 inherits AUD-9 in full for every non-owner read; SD-FU-05 records the live partner-surface gap found in the process rather than implying coverage that does not exist.
- [x] **Account-takeover and session-hijack scenarios explicitly considered.** §3(e), §7's G4a, SDL-9, and RR-2 — including the honest admission that an already-opted-in account under takeover is not fully mitigated.
- [x] **Residual risks documented and explicitly accepted by an accountable owner.** §8, seven risks, each bounded by a named requirement. None is a disguised open question.
- [ ] **`security-engineer` and `compliance-specialist` have concurred.** **Neither has.** Both are required before this closes; §15 and §16 are reserved for them. This checkbox stays unchecked rather than being marked "pending" in a way that reads as satisfied.

**Net:** six of eight satisfied; the two open items are the two concurrences that make Stage 8 a three-role gate, and they are open on purpose.

---

## 14. What this ADR does not authorize — read this before writing any code

**This is a design-time architectural ruling. It is not a green light to build Feature 008, and no part of it may be cited as one.**

- **Not a Stage 8 Security Review sign-off.** That gate has not run for Feature 008 and cannot until Stage 5–7 artifacts exist for it to review. SDL-1 … SDL-12 are inputs *to* that gate, not a substitute for it.
- **Not a compliance ruling.** `compliance-specialist`'s POPIA lawful-basis, consent-copy, and retention determinations (`GPS-SD-02` / `OQ-SD-03` / `D-SD-07`) are running in parallel this session and are not concluded. **SDL-8 explicitly cannot be satisfied without their number.** Nothing here predicts, pre-empts, or substitutes for that review, and a negative determination on lawful basis ends the feature regardless of anything in this document.
- **Not `product-manager` sign-off.** `business-analyst`'s §10 checklist leaves it open, along with OQ-SD-01, OQ-SD-02, and OQ-SD-05. Whether this feature is built at all remains that role's call.
- **Not an API contract, schema, or endpoint approval.** `backend-architect` (GPS-SD-04) and `database-architect` (GPS-SD-05) have not designed either, and this document deliberately specifies guarantees rather than shapes.
- **Not an instruction to add `expo-location`, a permission string, or any client capability.** `mobile/package.json` has no location dependency today and should not acquire one on the strength of this document.
- **Ratification is outstanding.** This ADR is *Proposed*. SDL-1 … SDL-12 bind design work under this role's standing authority, but the ADR-level precedent is `cto`'s to ratify.

The correct next steps are, in order: `compliance-specialist`'s ruling (`GPS-SD-02`), `product-manager`'s sign-off on §8's open questions, then Stage 5–7 design against SDL-1 … SDL-12, then Stage 8. Not code.

---

## 15. `security-engineer` concurrence — *reserved, not yet filed*

## 16. `compliance-specialist` concurrence — *reserved, not yet filed*

## 17. `cto` ratification — *reserved, not yet filed*
