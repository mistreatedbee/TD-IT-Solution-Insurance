# Feature 021 — compliance routing request (to `compliance-specialist`)

**Raised by:** `cto`, 2026-11-17. **Needed before:** any build in stages (b)–(e) beyond paper design. **Status:** open, no ruling given.
Not a legal opinion. These are the questions that must be answered, with the answers recorded in this folder.

1. **Consent.** Is a single consent enough for location, or does behavioural profiling (scoring, known places) need a separate, withdrawable consent? Wording for both. Consent for a trusted contact who is a third party.
2. **No solely automated decisions (POPIA s71).** Confirm that the design (score advises; "Was this you?" then human review before any outward action) keeps us clear. Is the automated "Was this you?" push itself within bounds?
3. **Data minimisation and retention.** Per data class: known-zone labels and zones, scores and reasons, alert outcomes, heartbeat/last-seen, protection-change audit events, staff timelines. Proposed periods to be set by you, then enforced by a scheduled job (ADR-0009 SDL-8 pattern).
4. **Delete-my-data.** Feature 015 must delete every new collection. Confirm and list.
5. **Coarse-zone precision.** Is a roughly 5 km cell low enough risk for home and work? Alternatives: coarser, or time-boxed.
6. **Cross-border and operator agreements.** Any push, SMS or voice vendor used for "Was this you?" and the staff call path (Expo push, any SMS/voice provider). DPA and transfer basis for each.
7. **Store declarations.** Google Play background-location declaration and the iOS location-usage strings. Foreground-only (today) versus background (ADR-0019, not decided). Update `play-store-data-safety-declaration.md` accordingly.
8. **Staff access.** Confirm the existing ADR-0006 third trail (purpose and case reference on every staff view of a customer's location) is enough, and what else a customer may request (access log for their own data).
9. **Duress PIN and silent SOS.** Safety and legal review: a code that looks like it works but escalates silently; how it interacts with POPIA transparency; what staff may do on a duress signal.
10. **Identity check by phone.** Confirm that PIN or code word only (never ID number or full card data) is acceptable, how the secret is stored (hashed, rate-limited, never shown to staff), and the lockout rules.
11. **Honest-wording review.** Sign off the copy rules in the design note §7 (no promise to block or detect power-off).

Compliance review comes first for any entry touching location, per roadmap addendum rule A.3.

---

## Addendum (2026-11-17, second owner brief) — further questions

12. **Next of kin (ADR-0021).** Consent model for a person who is not a user: is confirmation through an invite link enough? What may we store about them, for how long? Who is the responsible party for their data? Safety review of level (c) live-location links (coercive-control risk) and of the reminder cadence.
13. **Alert channels.** Push, then SMS, then email (Resend). Operator agreements and transfer basis for the SMS vendor (not chosen). Opt-in and opt-out wording per contact and per alert type. Cost-abuse limits.
14. **Evidence pack.** A one-tap bundle of alerts, locations, staff actions and the SAPS number, exportable for the police and the insurer. Lawful basis for each disclosure, the customer's role in triggering it, watermarking and retention.
15. **Bluetooth tag and Wi-Fi/charger signals.** Data minimisation for hashed network and tag identifiers; Play and App Store permission wording for Bluetooth and nearby-network access.
16. **Wrong-passcode counter (Android).** Device-administrator permissions are restricted by Google Play. Is the feature permissible at all, and with what disclosure?
17. **Thief selfie (opt-in, Android).** Legal view on capturing an image of a third party, disclosure, retention, and Google Play policy. **Blocked until this ruling.** No covert capture of any kind.
18. **Lost mode.** Lock-screen contact message and loud alarm (Android). Confirm no remote camera or microphone is involved and the wording is accurate.
19. **Theft-hardening score.** Confirm the self-attested design and the copy (never "your phone is protected").
20. **Hardware tracker.** Independent-battery tracker as a data source: lawful basis, retention, device registration and consent, in addition to the vendor DPA once a vendor is chosen.

