# Compliance Specification — OB-03: Consent-based, time-limited, logged location sharing with a security partner

**Author:** `compliance-specialist` · **Date:** 2026-10-29
**Trigger:** `08-roadmap.md` §F item 6. OB-03 is paper only. `solution-architect` writes the
dispatch-model ADR (a separate, parallel dispatch), and this document is the consent-model input that
ADR must reference.
**Status:** **SPECIFICATION ONLY.** It authorises no build, and it is not legal advice. No code may be
written before `cto` ratifies the ADR (§F item 6), and no real customer location reaches a partner
before every precondition in §6 is met.
**Extends:** [`compliance-review-security-partner-data-minimisation.md`](compliance-review-security-partner-data-minimisation.md).
That ruling's §3 table says coordinates reach a partner "only via AUD-9-audited location API with
case-reference purpose", and its §5 said it "does not authorise location disclosure to partners".
This document specifies the conditions for that API. It does not loosen anything in that ruling.
**Companion:** [`../../organization/partner-operator-agreement-requirements.md`](../../organization/partner-operator-agreement-requirements.md)
(§B.1 scope, §B.2 purpose, §B.8 retention).
**Regime:** POPIA. GDPR and PCI-DSS are not engaged on current facts (no EU data subjects, no payment
data). This is unchanged from the companion ruling, and it reopens if either fact changes.

---

## 0. Bottom line

1. **A partner may see an asset's location only while a customer-given share grant is active.** A
   grant is specific (one case, one asset, one named partner organisation), time-limited (default 24
   hours, ceiling 72 hours, renewable only by the customer), revocable at any moment, and logged on
   every read.
2. **No grant is possible for the unclaimed pool.** Tier 0 (offer) never carries location, granted
   or not. A grant attaches only to a case that is assigned to, or claimed by, a named organisation
   that has an executed agreement.
3. **The grant is checked on the server for every read.** It is not cached at claim time. A
   dedicated location endpoint is the only route. The existing partner serialisers and projections
   stay location-free (PDM-2).
4. **I recommend admin-assigned dispatch for OB-03** (not mandated; that remains the Client's G-7
   decision). A share grant needs a named recipient. Directed dispatch gives the customer one named
   partner to approve and removes Tier 0 entirely.

---

## 1. Facts in code today (read 2026-10-29)

| # | Fact | Source |
|---|---|---|
| L-1 | **Partners receive no coordinates today.** `OFFER_TIER_FIELD_EXCLUSION_PROJECTION` excludes `lastLocation` and `lastLocationAt`. `CLAIMED_TIER_FIELD_EXCLUSION_PROJECTION` excludes `lastLocation`. Claimed-tier partners see `lastLocationAt` (a timestamp) only | `backend/src/repositories/recovery-cases.ts:252-272` |
| L-2 | `getLocationForCase` is scoped to the customer (`findByIdForAccount`) | `recovery-cases.ts:968-974` |
| L-3 | The 90-day wrap-up window (PDM-4) is built | `PARTNER_CASE_WRAP_UP_WINDOW_DAYS = 90`, `recovery-cases.ts:443-463` |
| L-4 | **One partner can hand a case to another partner** (`reassignForPartnerOrg`) with no admin or customer involvement | `recovery-cases.ts:944-966`; `security-cases.ts` reassign route |
| L-5 | Location ingestion is kill-switched (INC-001, `LOCATION_INGESTION_ENABLED`). No Client instruction authorises location processing at all (G-6) | `11-documented-client-instructions.md` G-6 |
| L-6 | No partner-organisation registry exists in code (PDM-6). `partnerOrganizationId` is still an unregistered UUID | companion ruling F-8; `08-roadmap.md` OB-03 row |

**On SR-INC002B-S3 (BLOCKING in `stage8-manifest.json`).** In code, the *coordinate* part is closed
by construction: L-1 means an unclaimed case's `lastLocation` is never fetched for a partner read.
What remains in the pool is the de-identified Tier 0 offer. That is lawful under the companion
ruling's §2.3 while PDM-6 (the registry) and the other conditions hold.
- **Formal disposition is not mine.** It belongs to the chair (`cybersecurity-architect`) and to the
  ADR, which must record it with a named owner (the manifest forbids silent acceptance).
- My input is that, **from the compliance side, admin-assigned dispatch is the cleanest disposition**,
  because it removes the pool.

---

## 2. Lawful basis: why consent is the operative control here

**The disclosure.** Showing a partner the location of a customer's asset is "dissemination by
transmission" (POPIA s1) of personal information.
- Precise location of a personal device is, in practice, a person's location.
- It reveals home, work and movement patterns.
- It often reveals the location of someone other than the customer: a family member using the
  device, or whoever now has it.

**Two bases are arguable:**
- **s11(1)(b), contract.** Recovery is part of what the customer subscribes to.
- **s11(1)(a), consent.**

**Ruling.** Partner location disclosure proceeds on the customer's **specific, per-case consent**
(s11(1)(a)). Contract performance is the background purpose, not the trigger. Reasons:
1. **Necessity under s11(1)(b) is not established for every case.** Many recoveries are coordinated
   without a partner ever needing coordinates (SAPS-led recovery, or the customer finds the item).
   Contract necessity would justify disclosure by default. A grant makes disclosure the exception,
   which s10 favours.
2. **s11(2)(a) puts the burden of proof on the Responsible Party.** A grant record is the evidence.
   "The contract allowed it" says nothing about which partner saw what, or when.
3. **The standing position in this organisation** is that partner location sharing is
   consent-based, time-limited and logged (`08-roadmap.md` §E item 2). This document makes that
   specific.
4. **Withdrawal under s11(2)(b) has to mean something.** With consent as the basis, revocation stops
   further disclosure immediately. We do not fall back to "contract" to keep sharing after the
   customer says stop. **That fallback is prohibited.**

**What makes the consent valid (s1 "consent": voluntary, specific, informed):**
- **Voluntary.** Refusing or revoking a grant must not block or delay filing the case, police-report
  capture, a claim (Feature 018), or any other recovery help. No copy may suggest that refusing
  reduces cover or affects a claim. **Grant status must never be an input to claim adjudication**
  (POPIA s71 and fair treatment, the same principle as Feature 018 CC-6).
- **Specific.** One case, one asset, one named organisation (legal name and PSIRA number shown).
  Never a blanket grant at onboarding. Never "any partner".
- **Informed.** The notice in §4 is shown before the customer confirms.

---

## 3. The model: requirements (SG register)

The `solution-architect` ADR decides *how*. These rows decide *whether* it is satisfied.

| ID | Requirement |
|---|---|
| **SG-1 (grant record)** | A share grant is a persisted record with at least: `grantId`, `caseId`, `assetId`, `accountId` (the granting customer), `partnerOrganizationId` (exactly one), `scope` (§SG-5), `grantedAt`, `expiresAt`, `noticeVersion`, `grantChannel` (mobile/web), and an end record (`endedAt`, `endReason` ∈ `expired` / `revoked_by_customer` / `case_terminal` / `case_reassigned` / `partner_agreement_ended` / `location_consent_withdrawn` / `account_erased`, and `endedBy`). Grants are **append-only**: a renewal is a new grant, not an edit to the old one |
| **SG-2 (who may grant)** | Only the authenticated customer who owns the case. **No admin, call-centre agent or partner may create a grant on the customer's behalf.** Agent-on-behalf grants wait on OB-02 / C-010-4 and need a separate ruling. Whether granting needs step-up is `cybersecurity-architect`'s call. I recommend it, because a grant discloses location |
| **SG-3 (when a grant may exist)** | Only for a case in Tier 1 (assigned to or claimed by the named org), and only if that org's registry status is `executed` and not terminated (PDM-6). **Never for Tier 0.** **Pre-authorisation at report time is allowed** under directed dispatch, worded as "share with the partner TD IT Solution assigns to this case". It becomes active only on assignment. The customer is then told the partner's name by push **and** email at activation, and can revoke at once. This matters because the stolen device is often the customer's phone |
| **SG-4 (duration)** | Default **24 hours** from activation. Ceiling **72 hours** per grant. Renewal only by the customer. A grant ends automatically at the earliest of these: expiry; customer revocation; the case entering `recovered` or `closed`; reassignment to a different org (**L-4: the new org needs a new grant, and the old org's access ends at the same moment**); the partner agreement being suspended or terminated; withdrawal of the Feature 008 location consent; or account erasure. A shorter default needs no review from me. A longer one does |
| **SG-5 (scope)** | During an active grant the partner may see: (a) the most recent location point at activation, if it is no older than the case's `createdAt`; and (b) points recorded **while the grant is active**. Each point carries a timestamp and an accuracy value. **No history from before the theft report.** No geofence labels, no "home" or "work" tags, no customer address, no derived patterns. Full precision is allowed, because recovery needs it. Under SG-4, nothing is served after the grant ends |
| **SG-6 (access path)** | A dedicated, case-scoped partner location endpoint is the **only** route. It checks for an active grant **on the server for every request** (not at claim time, and not cached in the session or JWT). With no active grant it gives the same not-found response used for an inaccessible case. **No location field is ever added to the existing partner serialisers or projections** (PDM-2 stands). No bulk or map-of-all-cases view for partners |
| **SG-7 (logging)** | Every grant, activation, renewal, revocation and automatic end, and **every partner read**, writes a subject-keyed audit row (ADR-0006 C-16(b)). Each row holds: operator account, partner org, `caseId`, the customer's `accountId`, `grantId`, timestamp, time range of points returned, number of points returned, and purpose `recovery:<referenceNumber>`. AUD-8 reconstruction must be able to answer "which partner operator saw this customer's location, when, and under which grant". Log retention: no shorter than the case record, and **at least 12 months after the grant ends**. The final figure goes to the Client under G-3 |
| **SG-8 (what the customer sees)** | The customer can see active grants (partner name, time remaining, a revoke control that works in one tap) and an access history: "*[Partner] viewed your device's location N times between [time] and [time]*". This is also how s23 access is answered |
| **SG-9 (notice)** | §4 copy, shown before confirmation. `noticeVersion` is stamped on the grant (the lesson of SR-INC002-W5) |
| **SG-10 (partner push)** | Partner notifications carry **no coordinates and no place names**. "Location shared for case [REF] until [time]" is the maximum (an extension of PDM-5) |
| **SG-11 (location retention is not extended)** | Sharing does not lengthen how long location points are kept. That stays governed by Feature 008 / INC-001 retention. Grant records are kept with the case |
| **SG-12 (partner agreement)** | Before the first grant, the executed agreement must: list location as in scope **only under an active grant** (§B.1); limit its use to recovering that asset (§B.2); forbid the partner keeping platform-sourced coordinates beyond the operation, except in its own PSIRA/SAPS-regulated records listed in the carve-out schedule (§B.1, §B.8); and repeat the §B.4 ban on personal WhatsApp and personal email |
| **SG-13 (third parties and criminal information)** | Location points under a grant may reveal where a suspect or possessor is. The companion ruling's §7(2) counsel item (s57 prior authorisation) **must be answered before the first live grant**. The partner may not record anything about the possessor's identity on the platform. No such field may exist |
| **SG-14 (out of scope here)** | Admin and staff location reads (OB-01, AUD-9 case-reference purpose limitation). Law-enforcement requests: these go to TD IT Solution, never to the partner (§B.2 of the agreement). Neither is authorised by this document |

---

## 4. s18 notice copy (approved as written; adjust the wording only for the dispatch model chosen)

**At grant (or pre-authorisation):**

> **Share your device's location with [Partner legal name] (PSIRA [number])?**
>
> [Partner] is the security company handling case [REF]. If you agree, they'll see where your
> [asset category] is, starting now and for the next **24 hours**, to help get it back. They won't
> see where it was before you reported it.
>
> You can stop sharing at any time from this case. Sharing also stops on its own when the 24 hours
> are up, when the case is closed, or if the case moves to a different company. You'll be asked again
> before anyone new sees it.
>
> We record every time [Partner] looks at the location, and you can see that list here.
>
> Saying no won't affect your cover or any claim. We'll still work on your case.
>
> [Share for 24 hours] [Not now]

**Privacy notice addition (both surfaces), at category level:** "If you report a device lost or
stolen and agree to share its location, we show its location to the contracted security company
handling your case, only for the period you agree to, and we log every view."

---

## 5. What the ADR must settle (for `solution-architect`)

1. The dispatch model. My recommendation is admin-assigned (§0 item 4). The decision is the
   Client's, under G-7.
2. The formal SR-INC002B-S3 disposition, with a named owner (§1).
3. Whether partner-to-partner `reassign` (L-4) survives under directed dispatch. If it does, SG-4's
   end-on-reassignment rule applies, and the new org must be registry-`executed`.
4. Where the grant check sits. It must be per-request and server-side (SG-6), and must fail closed
   when the grant store is unavailable.
5. How SG-7 audit rows relate to OB-04's append-only case-history events. Grant lifecycle events are
   natural OB-04 events. **Location points themselves must not go into case history** (§F item 5:
   "no location fields").

---

## 6. Preconditions: none are met today

| # | Precondition | State |
|---|---|---|
| P-1 | INC-001 closed and location ingestion lawfully re-enabled (G-6 instruction, ADR-0009) | Open |
| P-2 | CT-1 in the required form (the §9.3 containment: no real customer PI on any surface) | Open |
| P-3 | G-7, extended (doc 11 §11): the Client permits partner location disclosure at all | Open |
| P-4 | PDM-6 registry and an executed partner agreement meeting SG-12 | Open |
| P-5 | PDM-8 / RR-012-2 subject-keyed partner audit, as the base SG-7 builds on | Open (check current state with `security-engineer`) |
| P-6 | Counsel's answer on s57 (SG-13) | Open |
| P-7 | Separate Stage 8 and Stage 10 for the build, behind a flag that is off by default (§F) | Not started |

---

## 7. Pre-approval checklist (OB-03)

- [x] Regime: POPIA. GDPR and PCI not engaged on current facts.
- [x] Lawful basis: specified as per-case consent (§2). **Authority (G-7 extended) is still open.**
- [x] Classification: precise location is the most sensitive class handled on this surface. Scope is
      in SG-5.
- [x] Retention: SG-7 and SG-11 (the final log period goes to the Client under G-3).
- [x] Audit logging: SG-7.
- [x] PCI: N/A.
- [ ] Vendor and partner agreement: SG-12 and P-4. Open.
- [ ] Breach procedure: the partner leg of the CT-3 runbook must name location-under-grant as an
      in-scope category. Open (`compliance-specialist`, with the CT-3 runbook owner).
- [x] Consent and disclosure copy: §4, approved as written.

**Filed by:** `compliance-specialist`, 2026-10-29. **Discharges nothing on its own.** It is input to
the OB-03 ADR.
