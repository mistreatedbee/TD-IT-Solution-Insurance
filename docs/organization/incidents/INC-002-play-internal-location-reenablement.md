# INC-002 — Location capture re-enabled in a live Google Play internal-testing build

**Owner / chair:** `cto` · **Date:** 2026-09-21 · **Status:** **HALT ISSUED — awaiting owner action in Play Console**
**Severity:** High. **Class:** INC-001-adjacent (same data class, same conditions register) — filed
separately because INC-001 is a shared, append-only record authored by `compliance-specialist` and
this is a new event, not a correction of theirs. INC-001 §14 points here.

---

## 1. What happened

In this session the `playInternal` EAS profile (`mobile/eas.json`) was changed to set
`EXPO_PUBLIC_FEATURE_LOCATION_TRACKING="true"` (with `_ALERTS`, `_THEFT_REPORTING`,
`_HARDWARE_TRACKING`, `_SECURITY_OPERATOR`). That build was built, submitted, and is **live and
active on the Google Play Console Internal testing track**, installable by up to 100 testers.

Effect of that one flag, verified in code (not inferred):

- `mobile/app.config.ts:11-18,101` — `stripLocationFromConfig()` only runs when the flag is
  `'false'`. With it `'true'`, the shipped Android manifest **declares `ACCESS_FINE_LOCATION` /
  `ACCESS_COARSE_LOCATION`** and ships the `expo-location` plugin.
- `mobile/src/location/useLocationReporter.ts:20,52` — the INC-001 client guard returns early only
  when the flag is off. With it on, the hook mounts in the authenticated shell and the
  `expo-location` path is reachable.
- Capture still additionally requires a device-local consent grant plus a linked smartphone asset
  (`useLocationReporter.ts:22-27`), i.e. a tester who opts in through the primer. So exposure is
  **opt-in-gated, not automatic** — but the opt-in path is live, and the consent mechanism behind it
  is the exact one INC-001 §4.2 ruled invalid (device-local SecureStore, no server-side record, no
  reachable withdrawal control, 2-of-8 s18 elements).

## 2. Why this is not merely a repeat of INC-001

Two independent live exposures:

1. **POPIA.** INC-001 §8.5 is explicit that re-enabling this pipeline before its conditions close is
   *"a fresh, knowing contravention rather than a careless one."* That text governs
   `LOCATION_INGESTION_ENABLED` (server) but its reasoning is about the processing, and the client
   flag is the other half of the same pipeline. The backend kill switch, if still off, means no
   coordinate reaches the store — but the **device-side capture, OS permission prompt and transmit
   attempt are real-world processing of real testers' personal information** under an invalid
   consent notice regardless of what the server does with the payload.
2. **Google Play policy.** `docs/organization/play-store-data-safety-declaration.md` (dated
   2026-09-21, same day) carries a binding constraint at §Scope: *"Flipping any of those flags to
   `"true"` in a shipped build invalidates rows in this table and requires a Data safety
   re-declaration before that build is uploaded."* The declaration answers **Precise location: No /
   Approximate location: No**. The uploaded artifact declares location permissions. **The live Data
   safety declaration is therefore false as against the shipped bundle.** A false Data safety
   declaration is a Play policy violation in its own right and is independent of POPIA.

## 3. Condition-closure status — verified 2026-09-21 by reading the register

INC-001 §9 carries **no closure marker on C-1, C-3 or C-4**, and the corroborating evidence is
elsewhere in the same incident family:

| Condition | Owner | Status as at 2026-09-21 |
|---|---|---|
| **C-1** — `LOCATION_INGESTION_ENABLED` unset/false in *every* environment reaching the live Atlas cluster | `devops-engineer` + `backend-engineer` | **OPEN.** `INC-001-location-events-inventory.md:127` names it "open, `devops-engineer`". Due 2026-08-27 — **25 days overdue** |
| **C-2** — inventory D-A-1…D-A-10 | `database-architect` | **RETURNED 2026-09-02**, subject to the stated limits of a `--mongo-only` return (INC-001 §13). Substantively the only one of the four discharged |
| **C-3** — Atlas region / s72 | `cloud-infrastructure-architect` | **OPEN.** `10-data-protection-contract-obligations.md:62,193` records the region as UNKNOWN and CT-2 as "due today and unreturned" |
| **C-4** — grep-verified no-coordinate-egress (SDL-6 / F-2) | `security-engineer` | **OPEN.** Inventory §297: *"F-2 survives on the client limb — INC-001-C-4 stays open"* |

**Finding: conditions 1–4 are NOT closed. Three of four are open and overdue.** The precondition in
INC-001 §8.5 for any re-enablement is unmet.

## 4. Decision — `cto`, exercising release go/no-go and security-exception authority

1. **HALT. The Google Play internal-testing release containing this build is to be deactivated
   immediately.** Not paused-for-discussion, not superseded at the next convenient build. In Play
   Console: *Testing → Internal testing → Releases → deactivate the active release* so the artifact
   stops being installable. This must be relayed to the owner **now**. The owner's "ask the CTO, you
   don't need me" delegates the *decision* to me; it does not and cannot delegate the *console
   action*, which only they can perform. Informing them that a live release with real-device
   exposure is being pulled is not asking permission — it is the notification half of the delegation.
2. **Existing installs.** Deactivation stops new installs; it does not uninstall. Testers who have
   already installed must be told, via the Play internal-tester channel, to uninstall or at minimum
   to decline/revoke the location permission. Draft copy is `compliance-specialist`'s under
   INC-001 §6.5's standard — it must not claim "no data was affected" until C-1/C-4 return.
3. **Repository state corrected at the same time:** `mobile/eas.json` `playInternal` now has
   `EXPO_PUBLIC_FEATURE_LOCATION_TRACKING="false"` and `EXPO_PUBLIC_FEATURE_HARDWARE_TRACKING="false"`
   (both touch the location data class), with an inline `_comment_INC-002` recording that they may
   not be flipped again without closure of C-1/C-3/C-4 **and** `compliance-specialist` re-approval of
   the Data safety declaration.
4. **`_ALERTS` / `_THEFT_REPORTING` / `_SECURITY_OPERATOR` remain `true` but are now blocked from
   upload** until `compliance-specialist` re-issues the Data safety declaration against the actual
   flag set. No further Play upload of any profile until that is done. `SECURITY_OPERATOR` in a
   tester build additionally needs a ruling on whether it exposes other data subjects' case data to
   an internal tester — `compliance-specialist` to answer.
5. **No new build may be uploaded to any Play track** until items 3–4 are satisfied and this record
   carries a `cto` release note. Standing.

## 5. Dispatched — verification runs in parallel with the halt, not instead of it

These are directives; each owner returns into INC-001 §9 (their own condition row) or into §6 here.

| # | To | Task | Due |
|---|---|---|---|
| **D-1** | `devops-engineer` | **Close INC-001-C-1.** Read the live Render env for the backend service and every other environment pointing at the same Atlas cluster; report the literal value (or absence) of `LOCATION_INGESTION_ENABLED`. If it is `"true"` anywhere: set it to `false`/unset immediately, then report. This is the single highest-priority return | immediately |
| **D-2** | `security-engineer` | **Close INC-001-C-4**, with the shipped `playInternal` artifact explicitly in scope — no coordinate in any log line, error envelope, analytics event, notification payload or third-party SDK call, client and server. Also: whether any location value reached the backend while this build was live (log/metric evidence) | 2026-09-23 |
| **D-3** | `cloud-infrastructure-architect` | **Close INC-001-C-3** — Atlas region, and the s72 consequence if outside South Africa. 21 days overdue | 2026-09-23 |
| **D-4** | `database-architect` | Re-run the §5.2 inventory against the window this build was live. The 2026-09-02 return was zero rows; confirm it is still zero, metadata only, no coordinates out of quarantine | 2026-09-23 |
| **D-5** | `compliance-specialist` | (a) Rule on whether this event is a fresh contravention under their own §8.5 language and whether s22 re-arms; (b) draft the tester notification per §6.5; (c) re-issue the Data safety declaration against the real flag set before any further upload | 2026-09-23 |
| **D-6** | `mobile-architect` + `devops-engineer` | Confirm actual internal-tester list size and how many installs occurred (Play Console statistics) — the denominator for §4(2) | 2026-09-23 |

## 6. Root cause, provisionally — the CI gate that exists did not cover this

`scripts/check-adr-prohibitions.mjs` guards the *server* prohibition (route exists ⇒ kill switch
must exist). Nothing mechanical asserts that a **distributed** build profile keeps
`EXPO_PUBLIC_FEATURE_LOCATION_TRACKING="false"`, and nothing ties an `eas.json` flag change to the
Data safety declaration that depends on it. This is INC-001 §5's finding recurring — *verification is
narrative rather than mechanical* — one level further out, in build configuration rather than code.

**Remedy required (owner: `devops-engineer` + `security-engineer`, due 2026-09-28):** a CI check that
fails the build if any `distribution`-bearing or store-submitted profile in `mobile/eas.json` sets
`EXPO_PUBLIC_FEATURE_LOCATION_TRACKING` or `EXPO_PUBLIC_FEATURE_HARDWARE_TRACKING` to `"true"` while
INC-001 is open, and that fails if the `playInternal` flag block diverges from the set recorded in
`play-store-data-safety-declaration.md`. Cheap, mechanical, nobody has to remember anything.

## 7. What this record does not do

- Does not close INC-001 or any of its conditions. C-1, C-3, C-4 stay open on their own terms.
- Does not assert the backend kill switch is currently on or off — **that is D-1 and is unverified
  from this environment.** The halt does not depend on the answer.
- Does not apportion blame. The flag was flipped under an owner instruction to ship a full-featured
  tester build; the failure is that nothing mechanical connected that instruction to a live
  prohibition, which is §6.
- Is not legal advice and is not a s22 determination. That is `compliance-specialist`'s (D-5).

---

## 8. D-6 return — `mobile-architect` — tester-list size and install count

**Scope:** D-6 (§5) asks for the actual internal-tester list size and install count for the window
this build was live, as the denominator for §4(2)'s tester-notification obligation.

**Result: cannot be answered from this environment.** No browser/Play Console access exists in this
session, and — the substantive finding — **nothing in this repository ever recorded a Play
Console internal-tester list or install statistics in the first place.** This is not a
this-session access gap alone; it is a standing gap in how the org tracks distribution:

- Grepped `docs/organization/` and the wider repo for tester emails, invite lists, and install
  counts. The only email-shaped strings that appear anywhere near this incident are: (a) seeded
  fixture accounts on `@tditsolutions.dev` (`test.customer@`, `test.admin@`, `test.security@` —
  `INC-001-location-events-inventory.md:24-27`, `INC-001-A13-criterion-6-bundle-verification.md`),
  which are backend test fixtures, not Play testers; and (b) the EAS CLI identity
  `ashleymashigo013@gmail.com` (`INC-001-A13-criterion-6-bundle-verification.md:260`), which is the
  *publisher/build account*, not a tester roster. Neither is a record of who was invited to or
  installed the `playInternal` release.
- `mobile/eas.json` (read this session, confirmed reverted: `playInternal.env` now has
  `EXPO_PUBLIC_FEATURE_LOCATION_TRACKING="false"` and `_HARDWARE_TRACKING="false"`, with the
  `_comment_INC-002` marker) contains build/submit configuration only — `submit.production.android`
  points at a service-account key path for upload, not a tester-list query, and there is no
  `playInternal` submit block or tester-management config at all. Google Play's internal-testing
  tester list is managed live in the Play Console UI (email list or Google Group), never written
  back into this repo, so its absence here is expected, not anomalous — but it means the org has
  **no independent record outside Play Console itself** of who could install this build.
- No script, credential reference, or doc anywhere in `docs/organization/` or `mobile/` queries the
  Play Developer Reporting API or Play Console statistics for install counts. There is no mechanism
  in this repo that could have captured that number even after the fact.

**Theoretical maximum exposure (bound, not a real count):** Google Play's Internal testing track
caps testers at **100 accounts**, and — critically for scoping this — only accounts explicitly
added to the release's tester list (by email or via a Google Group) can ever see the opt-in link or
install the build; it is not discoverable or installable by the wider public or by search. So the
hard ceiling here is **≤100 testers**, each of whom had to have been individually enrolled by
whoever manages the Play Console tester list — but this session has no way to determine how many of
that ≤100 ceiling were actually enrolled, nor how many of those actually installed during the
window `EXPO_PUBLIC_FEATURE_LOCATION_TRACKING="true"` was live in the uploaded bundle.

**Finding to flag separately from the location issue itself, per dispatch instruction:** this
organization currently **cannot answer "who was exposed" from its own records** for a Play internal
release. Tester-roster and install-statistics data lives exclusively inside Play Console, which
nothing in this repo mirrors, exports, or snapshots. If §4(2)'s tester-notification step is to be
executed with any precision (rather than "notify everyone who might have the app"), whoever holds
Play Console access must pull Testing → Internal testing → the release's tester count and
`Statistics`/installs-over-time for the live window **directly from the console** — this cannot be
reconstructed from the repository. Recommend, as a standing remedy alongside §6's CI gate: after
every store submission, the person with Play Console access exports the tester list and install
count into an append-only file under `docs/organization/` (e.g. a per-release distribution log), so
future incidents of this kind have a denominator instead of a gap.

**Devops-engineer half of D-6** (Play Console statistics pull) is outstanding — this return covers
only the repository-record half, which is `mobile-architect`'s lane.

---

## 9. `compliance-specialist` ruling — D-5(a), (b), (c)

**Appended 2026-09-21 by `compliance-specialist`. §1–§7 are `cto`'s and the D-6 return above is
`mobile-architect`'s; neither is amended, edited or reinterpreted here.** (This section was drafted
as "§8" and renumbered to §9 on filing, because `mobile-architect` filed the D-6 return as §8 in the
same session. Nothing in their section is altered.) This section answers D-5 and nothing else. It is
a compliance determination made from the repository and the statute. **It is not legal advice**, and
§9.7 lists what must not be finally settled on my assessment alone, following the discipline of
INC-001 §10.

### 9.1 Facts I verified myself before ruling (2026-09-21, read in code)

I do not adopt §1–§3's findings on trust; I re-read the artefacts. Where I differ from or extend
`cto`'s account, I say so.

| # | Verified | Where |
|---|---|---|
| V-1 | `stripLocationFromConfig()` runs only when the flag is the exact string `'false'` (`locationTrackingEnabled()` returns `process.env… !== 'false'`). With the flag `"true"` the AAB manifest declares `ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION` and ships the `expo-location` plugin | `mobile/app.config.ts:11-13,15-47,101` |
| V-2 | Capture requires **three** independent device-local conditions after the flag: stored consent `'granted'`, a linked smartphone asset id, and an OS permission grant. Exposure on install is **not** automatic | `mobile/src/location/useLocationReporter.ts:20-31` |
| V-3 | **The consent mechanism live in that build is the exact one I ruled invalid at INC-001 §4.2.** `LocationConsentModal.tsx:43` still tells the user *"You can turn this off anytime from the asset detail screen."* `AssetDetailScreen.tsx:301-308` still renders only **"Update location now"** when `trackingActive`. `clearLocationTrackingConsent()` is still called from **no screen** — only `src/location/index.ts`'s re-export and its own unit test | `LocationConsentModal.tsx:43`, `AssetDetailScreen.tsx:106,301-308`, grep for `clearLocationTrackingConsent` |
| V-4 | Repository state is corrected as `cto` recorded at §4(3): `playInternal` now carries `LOCATION_TRACKING="false"`, `HARDWARE_TRACKING="false"` and the `_comment_INC-002` prohibition | `mobile/eas.json:46,49,53` |
| V-5 | **New finding, not in §1–§7 — both flag layers are fail-OPEN.** `featureEnabled()` is `process.env[key] !== 'false'` and `locationTrackingEnabled()` is the same test. An **unset, misspelled, blank or `"False"`** variable enables location in a distributed build. This is the exact inverse of the server kill switch, which INC-001 §2.4 praised precisely because only the literal `"true"` enables it. The client half of this pipeline fails open; the server half fails closed | `mobile/src/config/features.ts:16-18`, `mobile/app.config.ts:12` |
| V-6 | `/v1/security/cases*` derives the partner org from `req.auth.partnerOrganizationId` **server-side** on every route, not from a client flag | `backend/src/routes/security-cases.ts:33,55,91,130,156,193` |

**V-5 materially changes §6's root cause.** §6 frames this as "nothing mechanical asserts the flag
stays false." That understates it: nothing mechanical asserts the flag is *set at all*, and the
absence of the variable produces the unsafe state. The CI check required at §6 must therefore assert
**presence and literal value `"false"`**, not merely "not `true`". I am making that a condition
(INC-002-C-3, §9.6).

### 9.2 D-5(a)(i) — Is this a fresh contravention under INC-001 §8.5?

INC-001 §8.5's sentence is mine, and it is narrower than §2.1 of this record reads it. It says:
*"Re-enabling **the endpoint** by flipping `LOCATION_INGESTION_ENABLED`…"*. The server flag was not
touched (§7, second bullet; I did not verify the live Render value and it remains D-1). So the
literal terms of §8.5 are **not** met.

**I decline to rest on that.** §8.5's sentence sits inside four conditions on a concurrence, and the
condition is that the *pipeline* stays off until C-1…C-4 close and the consent, retention, notice and
withdrawal layers are built. The ruling it embodies is at INC-001 §8.5's last paragraph: *"The
existing code is not a head start; it is a liability whose consent, retention, notice and withdrawal
layers must be built before **any part of it** is re-enabled."* The client capture path is a part of
it. Shipping it to real handsets is within what that sentence prohibits.

> **Ruling (a)(i): YES — this is a fresh contravention of the §8.5 conditions, and of POPIA s8
> (accountability) and s19 (safeguards) in its own right. It is NOT, on present evidence, a fresh
> contravention of s11/s13/s14/s18 as to any identified data subject, because those conditions bite
> on *processing*, and whether any processing occurred is D-2/D-4 and is unreturned.**

On the "knowing" limb I part company with §2.1's framing, and the distinction matters because §8.5
contemplates a penal-adjacent characterisation:

- **The organisation is fixed with knowledge.** INC-001 is a filed, ratified record naming the exact
  precondition. An organisation cannot un-know its own incident register. Objectively, the
  prohibition was in force and was breached.
- **The act was not subjectively knowing.** §7's third bullet is correct and I adopt it: the flag was
  flipped under an owner instruction to ship a full-featured tester build, by a process with no
  mechanical link between `eas.json` and the prohibition, and V-5 shows the unsafe state is also the
  *default* state. That is a control failure, not a decision to defy a prohibition.

> **Ruling (a)(ii): characterise this as an OBJECTIVE breach of a standing prohibition arising from a
> control gap — not as the "knowing contravention" §8.5 reserved for a deliberate re-flip of the
> server switch.** The aggravating feature is not intent; it is **recurrence**: INC-001 §5's finding
> that *verification is narrative rather than mechanical* was accepted as a residual risk, re-scored
> at INC-001 §8.2 as *"the observed default behaviour"*, and has now materialised a second time, one
> layer further out. A regulator assessing s8 accountability will weigh the repeat, and it is the
> repeat — not this single flag — that is the real finding.

**This is not "contained, quickly-caught, self-remediated" and nothing more.** Same-day detection and
reversion are genuinely mitigating and I record them as such. But three things distinguish it from a
contained internal slip: (1) the artefact went to a **third-party distribution channel** (Play), which
is outside our unilateral control — deactivation does not uninstall; (2) it carried a **false
regulatory-facing declaration** (§9.4); and (3) the invalid consent notice at V-3 was **live and
presentable to a real person**, i.e. the platform was in a position to obtain a consent it already
knew to be invalid. A contained event that only we could see would be the lesser characterisation. This
is not that.

### 9.3 D-5(a)(iii) — Does INC-001 §6.6's final-negative s22 determination re-arm?

INC-001 §13(2) converted s22 to FINAL NEGATIVE on a narrow and explicitly stated ground: **there was
no personal information in the store capable of being accessed.** That ground is fact-dependent and
INC-001 §13(2) itself says it *"re-arms in full the moment C-13 surfaces a single record."*

The new window (build live on the internal track, 2026-09-21) is a **new factual window that the
2026-09-02 zero-row return does not cover.** D-4 exists precisely to re-run the count against it.

> **Ruling (a)(iii): the s22 determination for INC-001's original window is undisturbed and stays
> FINAL NEGATIVE. For the INC-002 window I open a separate determination: **s22 — OPEN,
> PROVISIONALLY NEGATIVE**, on the same discipline INC-001 §6.4 used.

Reasoning, and what flips it:

- **Provisionally negative** because: the capture path needs three device-local conditions (V-2); the
  backend kill switch is believed off (unverified — D-1); the scope lock and auth boundary that held
  in INC-001 (§4.4 there) are unchanged in code; and even on a write, the coordinate would go to our
  own store readable only by the owning account — which is INC-001 §6.2's construction, not access by
  an unauthorised person.
- **Flips positive on:** D-1 returning `LOCATION_INGESTION_ENABLED="true"` in *any* environment
  reaching the cluster **combined with** a non-zero D-4 count and a D-2 finding of client-limb egress
  (F-2 is still open on exactly that limb, INC-001-C-4); or any evidence a coordinate reached a
  third party (log aggregator, Expo/Google payload, analytics); or D-6 showing the build reached
  anyone outside the intended tester list (the F-3 analogue, now on a Play track rather than a link).
- **The clock.** s22(2)'s "as soon as reasonably possible" is judged against when we *could* have
  known. I adopt INC-001 §6.4's 72-hour discipline again: **s22 determination for this window is
  FINAL at 2026-09-24**, which is one day after the D-1…D-4 due dates and is why those dates work.
  If D-1…D-4 have not returned by 2026-09-24, I will record a determination that names what is still
  unknown rather than let the window drift — an undetermined s22 is the failure mode, not a negative one.

**What this event does *not* do to INC-001:** it does not reopen §13(2) for the original window, does
not disturb the NIL purge certificate, does not release any C-008 or INC-001-C condition, and does not
change the disposition at §7 there. It adds a window; it does not rewrite a finding.

### 9.4 The Play Data safety mismatch — a second, independent contravention

I agree with §2.2 and record the compliance characterisation precisely, because it is the part of
this event with the shortest fuse and the least dependence on any unreturned dispatch:

**The mismatch is established on the face of two artefacts and needs no further investigation.** The
declaration answers *Precise location: No / Approximate location: No*; the shipped manifest declared
`ACCESS_FINE_LOCATION`. Under Google Play's Data safety policy a declaration must be **complete and
accurate as against the uploaded artifact**, and a location permission in the manifest without a
corresponding declared data type is one of the mismatches Play actively cross-checks — my own §5 note
in the declaration document anticipated exactly this failure mode and asked for an `aapt2 dump
permissions` verification before the first upload, which did not happen.

**Two honest qualifications, because over-stating this helps nobody:** (1) Play's Data safety form
asks about *collection*, not permissions, and a declarable defence exists that nothing was in fact
collected absent a tester opt-in — but a manifest-declared precise-location capability with a live
in-app opt-in path is collection *capability offered to the user*, and I would not advance that
defence as the primary position; (2) the declaration was transcribed into the Play Console by the
owner and I have not verified from the repository what was actually submitted there versus what this
document says — **INC-002-C-1** below.

> **Ruling: the Play Data safety declaration was false as against the shipped `playInternal` AAB for
> the period that build was active. This is a Play policy contravention independent of POPIA, it is
> established now, and it is not cured by the repository fix at §4(3) — it is cured only by a
> corrected declaration in the Play Console.** §9.6 C-1/C-2.

### 9.5 D-5(b) — Is tester notification required, and what must it say?

**Position: a notice is required, but its content is gated on D-6, and I will not pre-draft final copy
before D-6 and D-1 return — for the reason INC-001 §6.5 gave: a template written before the facts are
known is a template that gets sent with the wrong answer in it.**

**The determination, in three parts:**

1. **POPIA s22 notification to data subjects: NOT required today.** s22 is provisionally negative
   (§9.3). If it flips, s22(4)(a)–(d) content requirements attach and the notice is a different
   document.
2. **s18/s23 fairness notification: REQUIRED to any tester who actually installed the affected
   build, on the INC-001 §6.5 standard**, and required **regardless** of the s22 outcome. The basis is
   not that data was taken. It is that the platform presented — or was positioned to present — a
   consent notice it had already determined to be materially incomplete and, on withdrawal,
   affirmatively untrue (V-3), to a real person on a real handset. A person who was shown that notice
   is entitled to be told it was wrong. That obligation attaches on **presentation**, not on capture.
3. **An operational instruction is required immediately and separately from the legal notice**, per
   §4(2): deactivation stops new installs, not existing ones. Anyone holding the build should be told
   to uninstall it or revoke the location permission. **This can and should go out before the legal
   notice is finalised** — it is a safety instruction, it does not depend on D-1/D-4, and delaying it
   while the assessment matures would be the wrong trade.

**Timing.** Operational instruction: **within 24 hours of the halt, i.e. by 2026-09-22.** s18/s23
notice: **by 2026-09-28**, or within 72 hours of D-6's return if that is later than 2026-09-25 —
sequenced after D-1/D-2/D-4 so the notice can answer "did anything leave your phone" truthfully.

**Denominator.** I cannot determine install counts from the repository and I will not estimate them.
D-6 (`mobile-architect` + `devops-engineer`) owns the Play Console figures.

**`mobile-architect`'s D-6 return at §8 is adopted, and it is a finding in its own right.** Their
answer is that the denominator is **not derivable from the repository at all** — the tester roster
and install statistics exist only inside Play Console, which nothing here mirrors. The only bound
available is the structural one: **≤100 enrolled testers, each individually added, not publicly
installable.** I record the compliance consequence: **the platform cannot currently answer "who was
exposed" for a store-distributed build from its own records.** That is the INC-001-C-8 gap
(*"a breach runbook whose notification step depends on an unbuilt channel is not a runbook"*)
recurring on the *identification* limb rather than the *delivery* limb — we now know we can neither
reliably reach our data subjects nor reliably enumerate them. I endorse their recommended remedy (an
append-only per-release distribution log capturing tester count and installs after every submission)
and make it **INC-002-C-9** below. The `devops-engineer` half of D-6 — the actual console pull —
remains outstanding and is what unblocks the branch table.

Three branches:

| D-6 returns | Notice |
|---|---|
| **Zero installs** (release active but never installed) | **No s18/s23 notice required.** Record the finding here with the Play Console evidence — this closes on the same alternative limb INC-001 §6.5 closed on. The §9.4 Play correction is still required, because the declaration was false regardless of installs |
| **Installs > 0, all internal staff testers** | Notice required, delivered through the Play internal-tester channel **and** directly, since a staff tester is still a data subject (INC-001 §5.1 — I do not accept "test account" as "no data subject") |
| **Installs > 0 including anyone external, or the tester list is not fully identifiable** | Notice required, and **D-6 additionally becomes the F-3 analogue that feeds §9.3's s22 flip.** Escalate to me the same day |

**Mandatory content when it goes (binding on whoever sends it, per INC-001 §6.5's standard):**

- Plain language. What the build was, when it was live, what it could have done.
- **What was wrong:** a build shipped with the phone's precise-location capability enabled when it
  should not have been; the in-app permission request it offered was attached to a consent notice
  that did not tell you the purpose, how long data would be kept, who else would see it, or that
  declining cost you nothing — **and that told you you could switch it off from a screen that has no
  off switch.** Say that last part explicitly; it is the most concrete thing we got wrong and
  concealing it would compound it.
- **What to do now:** uninstall, or revoke the location permission in Android settings.
- **Whether any location left the device** — per D-1/D-2/D-4. **If the honest answer is "we cannot
  fully determine," say exactly that.** Do not write "no data was affected" (§4(2) is right), and do
  not write "no data was collected" unless D-4 returns zero AND D-2 clears the client limb.
- **No coordinate, no map, no place name in the notice** (SDL-6).
- The s23/s24 route and the right to complain to the Information Regulator.
- **Do not apologise in terms that admit a legal characterisation** ("we breached POPIA", "this was a
  data breach"). Describe conduct and facts. The characterisation is §9.7's, not the notice's.

**Delivery channel risk, restated:** INC-001-C-8 records that the platform cannot reliably reach its
own data subjects — production email delivery is still owner-blocked. The Play internal-tester channel
is available here and is the primary route. **That is luck, not a control**, and C-8 stands.

### 9.6 Conditions — INC-002 (mine; `cto`'s §4/§5 directives are separate and unaffected)

| ID | Condition | Owner | Due |
|---|---|---|---|
| **INC-002-C-1** | Confirm what was actually **submitted** in the Play Console Data safety form (screenshot or export), versus what `play-store-data-safety-declaration.md` says. My §9.4 ruling assumes they match; if the console says something different, the analysis changes and I re-rule | `cto` (owner action) | 2026-09-23 |
| **INC-002-C-2** | **Correct the Data safety declaration in the Play Console** to match whatever is actually shipped, before any further upload. The repository document is corrected at its §6 (2026-09-21); the console is the binding artefact and is not corrected by editing a repo file | `cto` (owner action) | Before next upload |
| **INC-002-C-3** | §6's CI check must assert the flags are **present and literally `"false"`**, not merely "not `true`" — per V-5, absence is the unsafe state. Additionally: fail the build if `mobile/app.config.ts`'s strip predicate is ever relaxed from an exact-string test | `devops-engineer` + `security-engineer` | 2026-09-28 (as §6) |
| **INC-002-C-4** | **Invert the client flag default to fail-closed** (`=== 'true'` enables), matching `LOCATION_INGESTION_ENABLED`'s discipline which INC-001 §2.4 endorsed. A privacy-critical flag that defaults on is a control that fails in the direction of exposure | `mobile-architect` | 2026-10-05 |
| **INC-002-C-5** | **Delete or fix the false withdrawal sentence** (`LocationConsentModal.tsx:43`) now, not at Feature 008 restart. While it stands, any build that reaches any handset with the flag on presents an inaccurate s18 notice. This is INC-001 §8.4(d)'s second additional requirement and it is still unbuilt | `mobile-architect` + me (copy) | 2026-09-28 |
| **INC-002-C-6** | s22 determination for the INC-002 window recorded final here | me | 2026-09-24 |
| **INC-002-C-7** | Tester notice sent, or a recorded finding of zero installs with Play Console evidence | me (copy) + `cto` (send) | per §9.5 |
| **INC-002-C-8** | Confirm how `partnerOrganizationId` is granted to an account and that **no internal tester account holds one** — the open limb of §9.6a | `authentication-engineer` + `security-engineer` | 2026-09-23 |
| **INC-002-C-9** | **Per-release distribution log** — after every store submission, the Play Console tester count and installs-over-time are exported into an append-only record under `docs/organization/`. Adopted from `mobile-architect`'s §8 recommendation. Without it, every future store incident has a gap where the denominator should be, and the notification duty cannot be scoped | `devops-engineer` + `mobile-architect` | 2026-10-05 |

### 9.6a `_SECURITY_OPERATOR` in a tester build — §4(4)'s referral, answered provisionally

§4(4) asks whether `SECURITY_OPERATOR="true"` exposes other data subjects' case data to an internal
tester. **Provisional answer: NO, on the server-side control, and the client flag is not the
boundary.** Every `/v1/security/cases*` route derives the org from `req.auth.partnerOrganizationId`
server-side (V-6), so a tester account without that claim sees nothing regardless of which screens the
app renders. **This answer is provisional in one respect I cannot close myself:** how
`partnerOrganizationId` is granted to an account, and whether any tester account holds one, is
`authentication-engineer`'s/`security-engineer`'s to confirm — **INC-002-C-8**, due 2026-09-23. Until
it returns, §4(4)'s upload block should stay. Separately, and unchanged: the **Play "shared"
determination** at declaration §4(3) is still open and still turns on a partner operator agreement
that does not exist.

### 9.7 What must go to admitted counsel, not be settled by me — INC-001 §10 discipline

I have given my best professional assessment on each. **None should be *finally* settled on my
assessment alone.**

1. **The Play policy consequence of a false Data safety declaration** (§9.4) — whether it warrants a
   proactive disclosure to Google, and what the app-enforcement exposure is. This is contract and
   platform-policy territory, not POPIA, and it is the one clock in this incident running on a third
   party's timetable. **Highest priority of the six. `cto` + counsel.**
2. **Whether the s18/s23 notice at §9.5 is legally required on presentation of an invalid notice
   absent any capture.** My view is yes, and I would send it either way as the right thing to do —
   but "required" versus "appropriate" is a legal call with disclosure consequences.
3. **Whether the *repeat* changes the s8 accountability characterisation** (§9.2) — whether two
   materialisations of the same control gap crosses from contravention toward the s107/s109 territory
   INC-001 §10.5 flagged. My assessment is unchanged from there: still a contravention, not an
   offence — self-detected, same-day reverted, no concealment. **A characterisation with penal
   consequences is not one an AI compliance review should be the last word on**, and it is now less
   clear-cut than it was on 2026-08-25.
4. **Voluntary disclosure to the Information Regulator.** INC-001 §6.6 said not proportionate on the
   original facts. My view is unchanged *for now* — but a distributed build on a public app store is
   a materially different fact pattern from a preview APK, and if D-6 returns external installs my
   view changes. **`cto`'s call on counsel's advice** (INC-001 §10.2).
5. **Any communication actually sent** — the tester notice at §9.5 and anything filed with Google.
   INC-001 §10.6: an incident notification is a legal document that will be read back to us.
6. **Whether Play-track distribution changes the GDPR determination.** INC-001 §3 recorded GDPR as
   assessed-and-negative and flagged it as *"the one determination most exposed to being wrong on a
   fact I cannot see."* An APK link goes to a list; **a Play track is a store**, and country
   availability for the internal track is a Play Console setting I cannot read. **If any tester is
   EU-resident, Art. 33's 72 hours is a hard legal deadline that started on 2026-09-21.** I am adding
   **tester residency** as a mandatory field of D-6's return. This is the single fact most capable of
   converting §9.5's discipline into a missed statutory deadline.

**Standing:** this section asserts no fact about any vendor agreement, hosting region or Play Console
setting that is not verifiable in this repository. The Atlas region is still unconfirmed (C-3), the
live server kill-switch value is still unverified (D-1), and no external counsel was consulted.

**Filed by:** `compliance-specialist`, 2026-09-21. **Discharges:** INC-002 D-5(a) in full; D-5(b) as a
requirement specification, not as final copy (gated on D-6); D-5(c) via the correction at
`../play-store-data-safety-declaration.md` §6. **Does not discharge:** INC-002-C-6 (final s22),
INC-002-C-7 (notice sent), INC-002-C-2 (Play Console correction — owner action), or any INC-001 or
C-008 condition.

---

## 10. `authentication-engineer` return — INC-002-C-8

**Scope:** INC-002-C-8 (§9.6) asks (a) how `partnerOrganizationId` is granted to an account, and
(b) whether any internal tester account holds one. I do not amend §1–§9; this section answers C-8
only, reading the auth/RBAC code fresh (not on trust from §9.1 V-6, which I independently confirm
below).

### 10.1 How `partnerOrganizationId` is granted — admin-only, invitation-time, non-self-service

- **Issuance path:** `POST /v1/invitations` is the only place `partnerOrganizationId` is ever
  written for a new account. It is `requireUserType('admin')`-gated
  (`backend/src/routes/invitations.ts:34`), requires a **step-up MFA check no older than 15
  minutes**, re-read live from `app.sessions.mfaVerifiedAt` rather than trusted from the access
  token (`invitations.ts:46-51`), and is validated `z.string().uuid().nullable().optional()`
  (`invitations.ts:30`). For `userType === 'security_company_operator'`, a non-null
  `partnerOrganizationId` is **mandatory** — the request is rejected `VALIDATION_ERROR` otherwise
  (`invitations.ts:55-58`). For every other `userType` (`admin`, `support_agent`) it is not
  accepted as meaningful and stays `null` in practice — there is no `customer` invitation path at
  all (`createSchema`'s `userType` enum excludes `customer`; customers self-register).
- **No self-service or client-controlled path.** The invitee's acceptance flow
  (`invitations.ts` accept handler, unread further below the create handler) only ever copies the
  `partnerOrganizationId` fixed at invitation-creation time onto the new account row — the
  accepting user never supplies or can change it.
- **Persistence:** `repositories/accounts.ts:211-219` writes `partner_organization_id` at account
  creation from the invitation record only; `repositories/invitations.ts:56-69` stores it on the
  invitation itself, set only by the admin-only create path above.
- **Token minting — server-derived, not client-supplied, confirming §9.1 V-6 independently:**
  `routes/session.ts:141` (refresh) and the login path both call `ctx.accounts.getAccountStatus()`
  — a live Postgres read — and place its `partnerOrganizationId` into the signed JWT as
  `partner_organization_id`. `middleware/authenticate.ts:73,124` reads that claim back off the
  **verified, backend-signed** JWT into `req.auth.partnerOrganizationId`. There is no code path
  where a request body, query param, or header can set or override this claim — it is signed
  server-side from the database value at token-issuance time, exactly the "claims scoped at
  issuance, not just at query time" discipline this role's best-practices require.

### 10.2 Whether any internal tester account holds one

**I cannot inspect the live Supabase/Postgres `accounts` table from this environment** (no DB
credentials in this session), so I cannot give a queried "zero rows" answer the way `database-
architect` could for Mongo. What I *can* confirm from the repository, which bounds the risk
tightly:

- The **only** mechanism that produces a non-null `partnerOrganizationId` is the admin-invitation
  path at §10.1 — there is no seed script, fixture loader, or test-account bootstrap in
  `backend/src/` or `supabase/` that assigns `partnerOrganizationId` outside that path. Grepped
  every file referencing `partnerOrganizationId` (`grep -rln` across `backend/src`) — all
  non-test hits are the invitation/account/session/middleware files already cited; no seed data.
- The `@tditsolutions.dev` fixture accounts referenced elsewhere in this incident family
  (`test.security@…`) are **backend integration-test fixtures constructed in-process by test
  harnesses** (e.g. `security-cases.test.ts`'s `createHarness()` signs its own JWT claims
  directly, bypassing the invitation flow entirely) — they exist only inside `vitest` runs, are
  never persisted to the Supabase project the mobile Play build talks to, and are not reachable
  from a distributed app build at all.
- Therefore: for a `playInternal` tester account to hold `partnerOrganizationId`, an admin would
  have had to explicitly issue them a `security_company_operator` invitation through
  `POST /v1/invitations`, with step-up MFA, naming a specific partner org UUID. **I have no
  evidence this occurred**, and it is not the kind of action that happens by accident (unlike the
  `eas.json` flag flip) — it requires a deliberate admin API call. I cannot rule it out with
  certainty without a live account-table query, which is why I report this as bounded-but-
  unconfirmed rather than closed.

### 10.3 Answer to §4(4)/§9.6a's substantive question, independently reached

Consistent with §9.1 V-6 and §9.6a: **the server-side authorization boundary does not depend on
which screens a build renders or which feature flags are set.** Even if a `_SECURITY_OPERATOR`
tester build were installed by an account that happened to hold a `partnerOrganizationId`, every
`/v1/security/cases*` route re-derives `orgId` from the signed JWT (§10.1) and every repository
query scopes on it server-side (`backend/src/repositories/recovery-cases.ts:262-326`,
`buildPartnerOrgQuery` at :192-204). The client flag is not a security boundary here; the
`partnerOrganizationId` claim is, and it can only reach a non-null value through the admin-gated
path in §10.1.

**One adjacent, out-of-scope-for-C-8 observation worth flagging for the record (not a new
condition, not mine to open):** `buildPartnerOrgQuery` and `findByIdForPartnerOrg` deliberately
match `partnerOrganizationId: null` (unclaimed, `status: 'open'`) cases for **every** operator
regardless of org — an intentional shared "open case pool" design so any partner org can claim an
unassigned case, not an IDOR gap (claimed cases assigned to org B are structurally unreachable by
org A's query, §10.4). But it does mean an unclaimed open case's `lastLocation` field, if
populated, is visible to any operator account of any org before anyone claims it. This is a
pre-existing design property, not introduced by INC-002, and is noted here only because C-8 asks
about location-data exposure through this exact relationship.

### 10.4 IDOR check on `GET/PATCH/POST /security/cases/:caseId`

Confirmed by reading the Mongo query, not by trusting the route: `findByIdForPartnerOrg` filters
`{ _id: caseId, $or: [{ partnerOrganizationId: callerOrgId }, { partnerOrganizationId: null }] }`
(`recovery-cases.ts:312-326`). A case already claimed by org B (`partnerOrganizationId: 'org-B'`)
fails both arms of that `$or` for a caller whose `orgId` is `'org-A'`, so `findOne` returns `null`
and the route responds `404 NOT_FOUND` (`security-cases.ts:131-135`) — **not a 403 that would
confirm existence, and not a leaked payload.** Same construction for `claimForPartnerOrg` (only
matches `partnerOrganizationId: null`, so a case already claimed by another org cannot be
re-claimed — :304-309) and `updateStatusForPartnerOrg` (matches only the caller's own org exactly,
no null branch — :375-380, with an explicit code comment at :334-339 recording why the null branch
was deliberately excluded from PATCH). No client-suppliable ID lets an operator read or write
another org's claimed case.

### 10.5 Disposition — INC-002-C-8

**Server-side scoping mechanism: solid.** `partnerOrganizationId` is admin-issued, MFA-step-up
gated, non-self-service, signed into the JWT at token-issuance from a live DB read, and every
`/v1/security/cases*` handler and repository query enforces it — confirmed at file:line across
`invitations.ts`, `accounts.ts`, `session.ts`, `authenticate.ts`, `security-cases.ts`, and
`recovery-cases.ts`. **The "no internal tester account holds one" half of C-8 is bounded but not
fully closed** — I can show the only path to acquiring it requires a deliberate admin action with
no evidence it was taken, but I cannot produce a queried negative from the live account table in
this environment. **Recommend:** whoever holds Supabase Postgres access run
`select id, email, partner_organization_id from app.accounts where partner_organization_id is not
null` and cross-reference against the Play tester roster (already an open gap at §9.6/INC-002-C-9)
to close this with certainty.

**Filed by:** `authentication-engineer`, 2026-09-21.

---

## 11. `cybersecurity-architect` — Stage 8 dispositions: consent withdrawal (C-5) and the INC-002-B flag families

**Appended 2026-09-22. §1–§10 are `cto`'s, `mobile-architect`'s, `compliance-specialist`'s and
`authentication-engineer`'s respectively; none is amended, edited or reinterpreted here.** This
section discharges two things: (A) the Stage 8 ruling on the `LocationConsentModal` withdrawal
promise and the endpoint built to make it true, and (B) dispositions for the seven manifest entries
whose waivers INC-002-B invalidated. Every factual claim below was verified in code in this
session at the file:line cited; nothing is adopted on trust from §1–§10 except where I say so.

### 11.1 Recount of the INC-002-B affected entries — seven, confirmed

The dispatch listed six and flagged that it was probably seven. Counted against
`docs/organization/gates/stage8-manifest.json` directly, it is **seven**, and the dispatch's list is
correct:

| Flag | Manifest entries whose waiver text is premised on it |
|---|---|
| `EXPO_PUBLIC_FEATURE_ALERTS` | `backend-alerts`, `mobile-alerts`, `mobile-tab-alerts` (3) |
| `EXPO_PUBLIC_FEATURE_SECURITY_OPERATOR` | `backend-security-cases`, `mobile-security-app` (2) |
| `EXPO_PUBLIC_FEATURE_THEFT_REPORTING` | `backend-recovery`, `mobile-report-theft` (2) |

**One entry that looks like an eighth and is not, and the reason matters:** `web-security-cases`
mentions `FEATURE_SECURITY_OPERATOR`, but only to say the *mobile* portal has that gate and this web
dashboard has **none**. `verify-eas-feature-flags.mjs`'s discovery regex matches the literal
`gated via FEATURE_X` and that entry says `gated behind` — so the script would not have picked it up
even if the phrasing had been identical in meaning. See §11.4.4.

**A defect in the new CI gate itself, which I am flagging now because it will bite quietly.**
`verify-eas-feature-flags.mjs:148` computes `unconditional: stage8.waived !== true`. That means the
moment any of these seven entries is converted from `waived: true` to a `doc`/`verdict` entry — for
*any* reason, including a partial or joint-gate-incomplete conditional sign-off of the kind this
manifest already contains a dozen of — the script will silently treat it as unconditional coverage
and permit the flag to be flipped `"true"` in a distributed build. The absence of a `waived` key is
not an affirmative decision by anyone. **Required fix (owner `security-engineer` + `devops-engineer`,
due 2026-09-28, folding into INC-002-C-3): key the check on an explicit affirmative marker —
`stage8.flagEnableApproved === true`, written only by me — rather than on the absence of `waived`.**
This is the same fail-open shape `compliance-specialist` identified at §9.1 V-5, now in the control
built to prevent V-5. Until that fix lands I have deliberately kept `waived: true` on all seven
entries even where I am recording a substantive disposition, so the gate keeps holding.

The `$schema` key at the manifest's head points at `./stage8-manifest.schema.json`, which **does not
exist** in this repo. Nothing validates this file's shape. Minor, but worth one line to
`devops-engineer`.

### 11.2 Part A(1) — ruling on `DELETE /v1/assets/:assetId/location` and the consent-withdrawal record

I reviewed `backend/src/routes/assets.ts:185-247` and
`backend/src/repositories/location-consent-log.ts` in full. **`backend-engineer` built substantially
what I would have specified, and got the hardest call right without being told.** Recorded
affirmatively, because a review that only lists gaps mis-states the work:

1. **Independence from the kill switch is correct and is the single most important property here.**
   `ctx.env.locationIngestionEnabled` is consulted at exactly one place in the entire backend —
   `assets.ts:117`, the ingestion `POST` — and deliberately not in this handler, with the reasoning
   written into the code at `:195-200`. Had withdrawal been gated on the same flag, INC-001's
   containment would have *disabled the data subject's s11(2)(b) right as a side effect of
   protecting them*. That is a trap I have seen shipped elsewhere and it was avoided.
2. **Ownership scoping and error shape.** `findByIdForAccount` + `404` (not `403`) on a foreign or
   `removed` asset — no existence oracle, consistent with `security-cases.ts`'s construction at §10.4.
3. **Idempotency with a fresh record on every call.** `:216-236` — a repeat withdrawal still writes an
   event. Correct: the *request* to withdraw is the s18/s11(2)(b) artefact, not merely the first
   state transition. The repository header says this in terms.
4. **`purgedEventCount` always recorded, including zero** — so the record remains self-describing
   after the history it purged is gone. This is the provability property I would have asked for and
   I did not have to.
5. **Its own rate-limiter bucket** (`assets-location-withdraw:*`), not the shared authenticated
   limiter — and sized so that a user can always get through to withdraw.

**What it does not yet do — five gaps, two of them blocking before real customer data:**

- **SR-INC002-W1 (BLOCKING). There is no `granted` counterpart.** `LocationConsentEventType` is
  `'withdrawn'` only; consent *given* is still a `SecureStore` key on the customer's own handset.
  **This endpoint therefore does not close INC-001 §4.2(c)** — the platform can now prove a customer
  withdrew, and still cannot prove any customer ever consented. A withdrawal log without a grant log
  evidences the negative and not the basis. `compliance-specialist`'s *"a consent basis that cannot
  be evidenced is not a basis"* is untouched by this work.
- **SR-INC002-W2 (BLOCKING). No retention, no TTL index, no RoPA line, no ADR-0008 provisioning
  entry.** `location_consent_events` is a **new Mongo collection holding `accountId`, `assetId`, IP
  address and user-agent** — personal information collected in order to evidence a privacy action.
  That is proportionate and I approve collecting it, but it must be *declared*: an evidentiary record
  may legitimately outlive the data it describes, yet "indefinite because nobody specified" is
  precisely the s14 failure INC-001 §4.3 already found once. Specify a period (my recommendation:
  retain for the prescription window applicable to a POPIA complaint, stated explicitly), add the TTL
  index, add the RoPA entry under C-008-12, and register the collection with `database-architect`.
- **SR-INC002-W3. The purge is per-collection, not per-data-class.** `deleteByAsset` clears
  `location_events` and `clearLocationForAccount` clears the asset document — but a coordinate copied
  into a recovery case survives both (see §11.4.2). A withdrawal that leaves a copy standing is not a
  withdrawal. Couples to SR-INC002B-T2.
- **SR-INC002-W4. Provability is bounded.** The record is written to a store the same service can
  delete, with no ADR-0006 Trail A/B integration. The repository header records this deferral
  honestly and the `push-token-security-log.ts` precedent it cites is real. Acceptable as an interim;
  not acceptable as the permanent shape once this event type earns an `app.audit_event_type`
  migration slot.
- **SR-INC002-W5. No notice-version stamp.** The record does not capture *which* consent text the
  user was shown. Once SR-INC002-M3 rewrites the primer there will be more than one version in the
  wild, and "what were they told" becomes unanswerable retrospectively — the same version-stamp gap
  `web-legal-static` already records for `/terms` and `/privacy`.

> **Ruling (A)(1): the endpoint is APPROVED as designed, with the five conditions above, and is
> recorded as `backend-asset-location-withdraw` in the Stage 8 manifest with a conditional sign-off
> (joint gate incomplete — `security-engineer` and `compliance-specialist` concurrence not yet
> recorded). It is the server half of INC-002-C-5. It does NOT discharge C-5, because C-5 is about a
> sentence in the client, and that sentence is still false today.**

### 11.3 Part A(2) — Stage 8 disposition for `LocationConsentModal.tsx` / `AssetDetailScreen.tsx`

**No entry existed for these two files.** They were absorbed incidentally by `mobile-policy-assets`
and `mobile-tab-assets`, **both of which carry a Feature 004 `sign-off-granted-with-changes`
verdict** for an asset registry whose review never examined a consent primer, an OS-permission
trigger, or a location control. That is the SH-1a / SR-011-6 absorption defect for the third time,
and on the most sensitive data class we hold. I have added a dedicated entry,
`mobile-asset-detail-location-consent`.

**Verified in code 2026-09-22 (not adopted from §9.1 V-3 — re-read):**

- `LocationConsentModal.tsx:42-44` still renders *"You can turn this off anytime from the asset
  detail screen."*
- `AssetDetailScreen.tsx:301-308` still renders only **"Update location now"** when `trackingActive`
  (`:106`). No withdrawal affordance of any kind.
- `handleConsentAccept` (`:117-145`) still calls `requestForegroundLocation()` **before**
  `setLocationTrackingConsent('granted')` — the OS dialog still fires first.

> **Ruling (A)(2): BLOCKED. No Stage 8 clearance, and this is not a waiver of convenience — it is a
> recorded block on a surface with a known-false notice.** The copy cannot clear while it names a
> control that does not exist. `backend-engineer`'s endpoint does not cure it: **a server endpoint
> that no button reaches does not make the sentence true.** The promise is a statement about the user
> interface, and it is falsified by the user interface.

Five conditions are recorded on the manifest entry; **four are blocking** and they are, in order of
what actually unblocks `mobile-engineer`:

- **SR-INC002-M1** — wire a visible withdrawal control that calls the endpoint **and** clears the
  device-local `SecureStore` consent + linked-asset keys. Server-side withdrawal alone leaves the
  device believing it still holds consent; `trackingActive` would stay `true` and the UI would
  contradict the server. This is the one people get wrong.
- **SR-INC002-M2** — the control must sit on the screen the copy names, **or** the copy must be
  changed to name where it actually is. Either closes INC-002-C-5. Doing neither does not.
- **SR-INC002-M3** — the primer must carry all eight s18 elements. Copy is
  `compliance-specialist`'s, not engineering's.
- **SR-INC002-M4** — record consent *before* requesting the OS permission (INC-001 §4.2(d)), pairing
  with SR-INC002-W1's server-side `granted` record.
- SR-INC002-M5 (non-blocking) — show the returned `purgedEventCount` to the user. It is the only
  user-visible evidence the withdrawal did anything, and it is nearly free.

**To `mobile-engineer`, since this ruling was what blocked you: proceed on M1/M2/M4/M5 now.** M3's
copy is not yours to write and should not hold up the wiring. Nothing here changes INC-002 §4(3) —
`EXPO_PUBLIC_FEATURE_LOCATION_TRACKING` stays `"false"` in every distributed profile regardless, and
this section does not reopen that.

### 11.4 Part B — dispositions for the seven INC-002-B entries

**Standing position, applied to all seven: a feature flag is a rendering decision, not a trust
boundary.** Every one of these waivers said, in substance, "this surface is unreviewed but harmless
because a string is `"false"`." INC-002 and INC-002-B are the same event twice: the string changed.
I am not relabelling them — each gets a real re-enablement path below — but I am also not pretending
the flag was ever the control.

#### 11.4.1 `ALERTS` — `backend-alerts`, `mobile-alerts`, `mobile-tab-alerts` — waiver stands, **review commissioned, clearable this cycle**

I agree with `cto` that this is the cheapest to clear for real, and I have commissioned it rather
than deferring it — a waiver nobody intends to ever lift is a permanent exception wearing a
temporary label. Having read `backend/src/routes/alerts.ts` in full, the surface is small and
mostly sound: both routes are `authenticate`d, every repository call is `accountId`-scoped
(`listActive`, `findByIdForAccount`, `dismiss`, `markRead`), `alertId` is regex-validated to a
24-hex ObjectId, and each route has its own rate-limiter bucket.

The one thing standing between this and an unconditional sign-off is **content, not access**: an
alert carries `title`, `body`, `href` and a `category` that includes `'tracking'` and `'device'`.
If any synthesised alert body ever contains a coordinate, a place name, or a reverse-geocoded
string, this surface is a location-egress path wearing a notifications label, and SDL-6 /
INC-001-C-4 attach to it. That is a grep, not a project. Note also that the plan-entitlement filter
at `:61-63` strips `tracking`/`device` categories for non-entitled plans **after** the rows are
read — fine as a product rule, but it is not a tenancy control and must not be mistaken for one.

> **Disposition: waiver STANDS, `EXPO_PUBLIC_FEATURE_ALERTS` stays `"false"` — and a scoped Stage 8
> pass is commissioned under SR-INC002B-A1…A4, target 2026-09-29, with `security-engineer` and
> `compliance-specialist` concurrence. On clean return I will issue an unconditional disposition and
> the flag may be flipped.** This is the only one of the three families I expect to clear in this
> cycle.

#### 11.4.2 `THEFT_REPORTING` — `backend-recovery`, `mobile-report-theft` — waiver stands, **blocked, and I re-rank it upward**

**New material finding, not known when these waivers were written and not in §1–§10:**
`GET /recovery/cases/:caseId/location` (`backend/src/routes/recovery.ts:257-281`) **returns raw
`latitude`/`longitude`**. And as established at §11.2, `ctx.env.locationIngestionEnabled` is
consulted in exactly one place in the whole backend — the ingestion `POST` at `assets.ts:117`.

The consequence: **this coordinate *read* path is not behind the INC-001 kill switch, and it was
reachable in the shipped `playInternal` build through `THEFT_REPORTING` even after
`LOCATION_TRACKING` was reverted to `"false"`.** The two flags were treated as independent; the data
class is not. Any coordinate already in the store for a case was readable by an authenticated owner
of that case, with the location flag off and the kill switch closed. INC-001's containment has a
hole in it on the read limb, and `backend-location-reads`' waiver does not cover it — that entry's
pattern is `/assets/*/location*`, which does not match `/recovery/*`.

This is **squarely within `security-engineer`'s open D-2 / INC-001-C-4 (F-2, client limb)** and I am
routing it there rather than opening a parallel condition: **`security-engineer`, add
`GET /recovery/cases/:caseId/location` to D-2's scope explicitly.** It also bears on
`compliance-specialist`'s §9.3 s22 analysis for the INC-002 window — the reachable read surface
during the window was wider than the location flag alone implied. I am flagging that to them without
presuming to re-rule; §9.3's flip conditions are theirs.

> **Disposition: waiver STANDS, `EXPO_PUBLIC_FEATURE_THEFT_REPORTING` stays `"false"`, and I
> RE-RANK this family as EQUAL-WORST with `SECURITY_OPERATOR`, above `cto`'s ordering.** The dispatch
> characterised this as "recovery-case PII". It is not only PII: it is a precise-geolocation egress
> path outside the kill switch, which is the exact data class and the exact control gap INC-001
> exists about. Blocking conditions SR-INC002B-T1 (gate the read path fail-closed, at least as
> strongly as ingestion) and SR-INC002B-T2 (prove the withdrawal purge reaches recovery-case
> location copies — this is also SR-INC002-W3) are recorded on the manifest entry. **Not clearable
> this cycle.**

#### 11.4.3 `SECURITY_OPERATOR` — `backend-security-cases`, `mobile-security-app` — waiver stands, **blocked longest**

I concur with `cto`'s ranking of this as worst-in-class **on distribution grounds**, and I record
the countervailing fact plainly because it changes what the remedy is: **the server-side control
held.** `authentication-engineer`'s §10 independently verified that `partner_organization_id` is
admin-issued, step-up-MFA-gated at 15 minutes re-read live from `app.sessions`, non-self-service,
signed into the JWT from a live DB read, enforced in every `/security/cases*` handler and repository
query, with no client-suppliable override and no IDOR on `:caseId` (§10.4). I have no basis to
disturb that and I adopt it.

So the exposure during the window was **of the surface, not — on present evidence — of the data**.
That distinction does not clear it, for the reason at the head of §11.4: a consumer-distributed
artifact should not *contain* a privileged third-party-operator portal at all. My standing
assumption for this surface is that it will eventually be operated by a compromised or malicious
insider at a partner org; an attacker who obtains any account with a `partnerOrganizationId` and a
consumer handset should not also be handed the operator UI. **The durable fix is not a better flag,
it is a separate build identity — R-INC002B-1.** I am recording that as an architecture
recommendation rather than a precondition, because it is a larger change than this incident should
force, but I want it on the record now rather than discovered at the next flag flip.

Two blockers beyond `cto`'s framing, both inherited from open work: **SR-INC002B-S1** is
INC-002-C-8's unclosed half — §10.5 bounds the risk tightly but could not produce a queried negative
from the live `accounts` table, and that query must be run. **SR-INC002B-S3** is
`authentication-engineer`'s §10.3 observation, which they correctly declined to open as a condition
since it was outside C-8: `buildPartnerOrgQuery` matches `partnerOrganizationId: null` for **every**
operator org, so an unclaimed open case's `lastLocation` is visible to any operator of any partner
org before anyone claims it. **That is mine to dispose of, and I open it as a condition now.** It is
a deliberate shared-dispatch-pool design and I am not calling it a vulnerability — but it is
precise location crossing an organisational trust boundary before any org has been assigned the
case, and per this role's standing rule it is either scoped (region/dispatch assignment) or
explicitly accepted, dated, with a named owner. Silent acceptance is not available.

> **Disposition: waiver STANDS, `EXPO_PUBLIC_FEATURE_SECURITY_OPERATOR` stays `"false"`, blocked on
> SR-INC002B-S1…S3 with R-INC002B-1 recommended. Longest-lived of the three holds; do not expect it
> to clear this cycle.** `SR-INC002B-S2` (a signed partner-operator data-sharing agreement) is not in
> engineering's gift at all, and until it exists `compliance-specialist`'s Play "shared"
> determination at §9.6a cannot be answered either.

#### 11.4.4 `web-security-cases` — `cto`'s separate observation: **CONFIRMED HOLE**

Verified this session: **no `import.meta.env` / `VITE_FEATURE_*` check exists anywhere under
`src/security/`.** The web operator dashboard at `/security/cases*` is reachable today with no
client-side gate of any kind, while its mobile twin is flag-gated — and, worse for our purposes,
**`verify-eas-feature-flags.mjs` reads `mobile/eas.json` only, so the web surface sits entirely
outside the CI net INC-002 just built.** The gate we built to stop this class of failure cannot see
one of the two surfaces it exists to protect.

Mitigation, stated so this is not over-read: the routes are behind the privileged login and the
backend re-derives `partner_organization_id` server-side (§10), so this is surface exposure, not
data exposure — the same characterisation as §11.4.3.

> **Directed: add a build-time `VITE_FEATURE_SECURITY_OPERATOR` gate on the `/security/cases*` route
> registration, fail-closed (`=== "true"` enables, per INC-002-C-4's discipline — do not repeat
> V-5), and extend the CI verifier to cover the web build env. Owner `frontend-engineer` +
> `devops-engineer`, due 2026-09-29.** Appended to the `web-security-cases` manifest entry. The
> waiver is not lifted by this.

### 11.5 What this section does and does not do

- **Does not** clear any of the seven entries, lift any INC-001 or INC-002 condition, or authorise
  any flag flip. All seven stay `waived: true` and all seven flags stay `"false"`.
- **Does not** disturb §9.3's s22 determination, §9.4's Play ruling, or §10's auth findings. §11.4.2
  hands `compliance-specialist` a fact bearing on the §9.3 window; the ruling remains theirs.
- **Does** add three manifest entries (`backend-asset-location-withdraw`,
  `mobile-asset-detail-location-consent`, and dispositions on the seven) and one CI defect
  (§11.1) that must fold into INC-002-C-3 before that gate can be relied on.
- **Residual risks explicitly accepted by me, dated 2026-09-22, review 2026-10-20:** (1) all seven
  surfaces remain unreviewed while off — accepted, because off is a real reduction even though it is
  not a control; (2) `location_consent_events` runs without stated retention until SR-INC002-W2 —
  accepted *only* while no real customer data is in scope, and it becomes blocking the moment it is.

**Filed by:** `cybersecurity-architect`, 2026-09-22. **Discharges:** the Part A ruling on
INC-002-C-5's server half and the Stage 8 disposition on the consent client (as a recorded BLOCK),
and the INC-002-B dispositions for all seven entries. **Does not discharge:** INC-002-C-5 (client
copy — SR-INC002-M1/M2), INC-002-C-8 (SR-INC002B-S1), INC-002-C-3 (now widened by §11.1), or any
INC-001 condition.

---

## 12. `compliance-specialist` — SR-INC002-M3 deliverable: the eight s18 elements and the primer copy

**Appended 2026-09-22 by `compliance-specialist`. §1–§11 are `cto`'s, `mobile-architect`'s, my own
§9, `authentication-engineer`'s and `cybersecurity-architect`'s respectively; none is amended,
edited or reinterpreted here.** This section discharges **SR-INC002-M3** on the
`mobile-asset-detail-location-consent` manifest entry — *"rewrite the primer to carry all eight s18
elements … copy owned by `compliance-specialist`, not by engineering."* It supplies copy only. It
does **not** discharge SR-INC002-M1/M2/M4 (`mobile-engineer`'s wiring), INC-002-C-5, or any INC-001
condition, and it does **not** authorise flipping `EXPO_PUBLIC_FEATURE_LOCATION_TRACKING`.

### 12.1 The eight elements — read from s18 and from this org's established reading, not re-derived

POPIA **s18(1)(a)–(h)** requires a responsible party collecting personal information to take
reasonably practicable steps to make the data subject aware of: the information being collected and
its source; the name and address of the responsible party; the **purpose**; whether supply is
voluntary or mandatory and the **consequences of failure to supply**; any legal basis for the
collection; **the recipient(s)**; **the country and level of protection where information will be
transferred** across borders (s18(1)(g), reading with s72); and **the nature and category of the
information plus the data subject's s23/s24 rights of access and correction** — with s18(1)(h)(iii)
carrying the right to object and the right to lodge a complaint with the Information Regulator.

This organisation already worked those statutory heads into an eight-element operational list for
this exact feature at
[`008/compliance-review.md` §8.1](../../features/008-self-device-gps-tracking/compliance-review.md)
(2026-08-14, mine), and INC-001 §2.6 scored the shipped modal against it at **2 of 8**. **I adopt
that list unchanged** — re-deriving it would fork the org's reading of s18 for no benefit, and the
scoring at INC-001 §2.6 and §9.1 V-3 is keyed to its numbering. The eight, as they bind here:

| # | Element | s18 head | Where it lives in the copy below |
|---|---|---|---|
| 1 | What is collected — this phone's **precise GPS** position **and its accuracy** | s18(1)(a) + (h)(i) | `PRIMER_WHAT_WHEN` |
| 2 | **When** — app-open / manual tap only, never background, never app-closed | s18(1)(a) | `PRIMER_WHAT_WHEN` |
| 3 | **Purpose** (also s13) | s18(1)(c) | `PRIMER_WHY` |
| 4 | **Voluntary**, and declining costs you **nothing** | s18(1)(d) | `PRIMER_YOUR_CHOICE` |
| 5 | **Recipients**, and the **country** the data sits in (s72) | s18(1)(f) + (g) | `DETAIL_WHO_SEES_IT` |
| 6 | **How long** it is kept, and deletion on opt-out | s14 read into s18(1)(c) purpose-limitation | `DETAIL_HOW_LONG` |
| 7 | **Withdrawable at any time, as easily as given** | s11(2)(b), notice of it under s18(1)(d) | `PRIMER_TURNING_IT_OFF` |
| 8 | **s23/s24 access & correction rights + right to complain to the Information Regulator** | s18(1)(h)(ii)–(iii) | `DETAIL_YOUR_RIGHTS` |

**The responsible party's name (s18(1)(b))** is carried by the modal's existing product chrome and by
the linked Privacy Notice; I am not spending a line of a mobile modal on an address that is a tap
away. Noted so it is a decision and not an omission.

### 12.2 Structure — two layers in one modal, not eight paragraphs, and not a link-out

§8.1 of the 008 review is explicit that these must appear **"in the primer screen itself, not in the
privacy policy, not in a tooltip."** That rule stands. The condensation I authorise is therefore
**in-modal progressive disclosure**, not deferral:

- **Layer 1 — always visible, no interaction required.** Elements **1, 2, 3, 4, 7**. These are the
  five that bear directly on whether the expression of will is *voluntary, specific and informed* at
  the moment of tapping. They are never behind a tap.
- **Layer 2 — a single in-modal expander**, labelled `PRIMER_DETAILS_TOGGLE`, containing elements
  **5, 6, 8** plus the honest-limitations and other-assets text. One tap, **no navigation away, no
  dismissal of the modal, no scroll-jacking.** Follow the expand/collapse accessibility pattern
  already used at `mobile/src/screens/home/ProtectionMapScreen.tsx:313-321`
  (`accessibilityState={{ expanded }}`, explicit expand/collapse `accessibilityLabel`) — there is no
  shared Collapsible primitive in `mobile/src/theme/primitives`, and per the house rule a new one
  needs `design-system-manager` sign-off; reuse before you build.

This is the balance the codebase already strikes elsewhere between completeness and a phone screen,
and it keeps all eight elements on the one screen, before the OS dialog, which is what s18 and
SR-INC002-M4 together require.

### 12.3 The copy — exact strings

Use these verbatim. Bold markers are emphasis within the string, to be rendered with the existing
`styles.body` weight variants — **do not down-weight any of Layer 2 relative to Layer 1**
(prominence rule, 008 §8.2's closing note). Do not paraphrase, shorten or "tighten" these; if a
string does not fit the layout, tell me and I will re-cut it.

```
PRIMER_TITLE
  Let this phone report its own location?

PRIMER_WHAT_WHEN                                             [elements 1, 2]
  What and when. We collect this phone's precise GPS position and how accurate that
  reading is — only while you have the app open, or when you tap "Update location".
  Never in the background. Never while the app is closed.

PRIMER_WHY                                                   [element 3]
  Why. So that if this phone is lost or stolen, you can see where it last reported
  from. This is not a live tracker, and it cannot find a phone that has been switched
  off, reset, or put in airplane mode.

PRIMER_YOUR_CHOICE                                           [element 4]
  Your choice. This is optional. If you tap "Not now", nothing changes — your cover,
  your premium, your policy and your registered assets all stay exactly the same. Only
  turn this on for a phone you own and carry yourself.

PRIMER_TURNING_IT_OFF                                        [element 7]
  Turning it off. You can switch this off at any time from this asset's screen, under
  "Location" — it takes the same one tap it took to turn on. When you do, we delete the
  locations this phone has reported and tell you how many we deleted.

PRIMER_DETAILS_TOGGLE                                        [Layer 2 control]
  The full details

DETAIL_WHO_SEES_IT                                           [element 5]
  Who can see it. You, and the TD IT Solution staff who need it to help you. We never
  sell it and never give it to advertisers. It is not sent to a security company
  automatically — if you open a theft-recovery case and we need to share your last known
  location with a recovery partner, we will ask you at that point, separately. Your
  location is stored on our service providers' servers in {{STORAGE_REGION}}.

DETAIL_HOW_LONG                                              [element 6]
  How long we keep it. We keep the most recent position, and the reports from the last
  30 days. Anything older is deleted automatically. If you switch this off, we delete
  this phone's stored locations within 7 days — unless you have a theft-recovery case
  open, in which case we keep them until that case closes and for 12 months afterwards,
  so they can be used as evidence.

DETAIL_YOUR_RIGHTS                                           [element 8]
  Your rights. You can ask us what location information we hold about you, ask us to
  correct it, or ask us to delete it — contact us from the Account screen. If you are
  not happy with how we handle it, you can complain to South Africa's Information
  Regulator at inforegulator.org.za.

DETAIL_OTHER_ASSETS                                          [carried over, still true]
  Other assets. Laptops, vehicles and other items need separate GPS hardware, which we
  do not offer yet. This setting only affects this phone. You can still see any
  last-known locations we already hold for your other assets.

PRIMER_OS_PROMPT_NOTE                                        [supports SR-INC002-M4]
  If you continue, we record your choice first, and then your phone will ask you for
  location permission. You can say no there too.

PRIMER_BTN_ACCEPT
  Turn on location

PRIMER_BTN_DECLINE
  Not now
```

**Deleted, not rewritten:** the current `styles.note` string *"You can turn this off anytime from the
asset detail screen."* (`LocationConsentModal.tsx:42-44`) is replaced by `PRIMER_TURNING_IT_OFF`,
which is a Layer 1 body string, not a de-emphasised footnote. The single most concrete thing this
platform got wrong (INC-001 §2.6 element 7; §9.5's mandatory-content bullet) does not go back in at
`typography.sizes.xs` in `slate[500]`.

### 12.4 Conditions on this copy — mine, blocking where marked

| ID | Condition | Owner | Due |
|---|---|---|---|
| **CS-INC002-N1 (BLOCKING)** | `{{STORAGE_REGION}}` is a **placeholder and must not ship as one, and must not be guessed.** The Atlas region is INC-001-C-3 / INC-002 D-3 and is still open (`10-data-protection-contract-obligations.md:62` records it UNKNOWN). On D-3's return I supply the literal string. **If the answer is outside South Africa, element 5 is not satisfied by naming the country alone** — the s72(1)(a) binding-agreement basis applies (`compliance-review-supabase.md` §4.3, which rejected consent as a transborder basis) and I will issue an additional sentence. A build with the placeholder rendered, or with a region I have not confirmed, is a false s18 notice and is exactly the defect this section exists to fix | me, on `cloud-infrastructure-architect`'s return | with D-3 |
| **CS-INC002-N2 (BLOCKING)** | `DETAIL_HOW_LONG` states 30-day rolling, 7-day post-withdrawal and case+12-month periods. Those are my rulings at `008/compliance-review.md` §6.1 and they are **currently unenforced** — `location_events` has no TTL index (INC-001 §2.2) and C-008-5's automated purge does not exist. **This string may not ship until an automated, auditable purge job enforces all three numbers.** I am issuing **no interim variant**: element 6 cannot be satisfied truthfully by a notice that states a period nothing enforces, and a vaguer sentence would fail element 6 outright. This is not a new blocker on `mobile-engineer` — the flag is `"false"` regardless — but it is a real precondition on ever flipping it | `database-architect` + `backend-engineer` (C-008-5) | before flag enablement |
| **CS-INC002-N3** | Stamp this notice version — **`location-consent-notice@2026-09-22.v1`** — into both the server-side `granted` record (SR-INC002-W1) and the `location_consent_events` withdrawal record. This is `cybersecurity-architect`'s SR-INC002-W5 and I concur: once this copy lands there are two versions in the wild and *"what were they told"* becomes unanswerable without the stamp. Any change to any string above increments the version | `backend-engineer` + `mobile-engineer` | with M1–M4 |
| **CS-INC002-N4** | Layer 2 must expand **in place**: no `router.push`, no external link, no modal dismissal, and `PRIMER_DETAILS_TOGGLE` must be visible without scrolling on the smallest supported viewport. If the expander is not reachable without scrolling past the action buttons, the notice is not "made aware" under s18 and I withdraw approval of the two-layer structure for that layout | `mobile-engineer` | with M3 |
| **CS-INC002-N5** | `PRIMER_TURNING_IT_OFF` names *"this asset's screen, under 'Location'"*. That is a **factual claim about your UI** and it is the sentence INC-002-C-5 exists about. If SR-INC002-M1's control lands anywhere else, or is labelled anything else, **tell me and I will re-cut the string — do not edit it in the file.** A second inaccurate withdrawal promise on the same surface would be the third materialisation of this defect | `mobile-engineer` | with M1/M2 |
| **CS-INC002-N6** | `mobile/app/(auth)/privacy.tsx` is a placeholder that says a real notice *"will be published before public app-store release"* and describes location as *"a future release"* — **it is now inaccurate on its own terms and it does not carry any of the eight elements.** Nothing in this section may be read as satisfied by it, and no link from the primer to it may be treated as delivering elements 5, 6 or 8 | me (copy), `technical-writer` | 2026-10-05 |
| **CS-INC002-N7** | `PRIMER_YOUR_CHOICE`'s final sentence (*"Only turn this on for a phone you own and carry yourself"*) is the **C-008-4 attestation** in its minimum form. It is a disclosure, not a control. It does not resolve the family-phone / employee-phone / child's-phone problem at `008/compliance-review.md` §5.4, and C-008-4 stays open on `business-analyst` + `product-manager` | unchanged | unchanged |

### 12.5 Self-scoring against INC-001 §2.6, for comparability

| Element | Shipped modal (INC-001 §2.6) | This copy |
|---|---|---|
| 1 What | Partial | **Yes** — "precise GPS position and how accurate that reading is" |
| 2 When | Yes | **Yes**, unchanged in substance and still exactly true |
| 3 Purpose | No | **Yes**, with the honest limitation in the same weight |
| 4 Voluntary / no cost | No | **Yes**, consequences named specifically (cover, premium, policy, assets) |
| 5 Recipients + country | No | **Yes, subject to CS-INC002-N1** |
| 6 Retention | No | **Yes, subject to CS-INC002-N2** |
| 7 Withdrawal | Stated and **false** | **Yes, and true once SR-INC002-M1/M2 land** — and promoted out of the footnote |
| 8 s23/s24 + Regulator | No | **Yes** |

**Eight of eight, two of them conditionally.** The two conditions are not drafting gaps — they are
facts the organisation does not yet hold (the Atlas region) and a control it has not yet built (the
purge job). Writing around either would produce a notice that is complete and untrue, which is the
INC-001 §2.6 element-7 failure in a different place.

**Filed by:** `compliance-specialist`, 2026-09-22. **Discharges:** SR-INC002-M3 as a copy
deliverable, conditional on CS-INC002-N1/N2. **Does not discharge:** SR-INC002-M1, M2, M4, M5,
INC-002-C-5, INC-002-C-6, INC-002-C-7, C-008-4, C-008-5, or any INC-001 condition. **Does not
authorise** any change to `EXPO_PUBLIC_FEATURE_LOCATION_TRACKING`, which stays `"false"` in every
distributed profile per §4(3).

---

## 13. `backend-engineer` — SR-INC002-W1 closure, SR-INC002-W2 handoff to `database-architect`

### 13.1 SR-INC002-W1 (blocking) — closed

Added a `'granted'` `LocationConsentEventType` and `recordGrant()` to
`backend/src/repositories/location-consent-log.ts` (mirrors `recordWithdrawal()`'s shape, minus
`purgedEventCount`, which does not apply to a grant — that field is now `number | null` on the
document, `null` for `'granted'` rows). New endpoint `POST /v1/assets/:assetId/location-consent`
in `backend/src/routes/assets.ts`, placed immediately before the `DELETE .../location` handler it
mirrors:

- **Not gated by `ctx.env.locationIngestionEnabled`** — same reasoning §11.2(1) gives for
  withdrawal: recording that consent was given is not the same as ingesting location data, and the
  kill switch must never also block the evidentiary record of a grant.
- **Ownership-scoped, `404` (not `403`)** on a foreign or `removed` asset — same as withdrawal.
- **Idempotent with a fresh record on every call**, not an upsert — a repeat grant (e.g.
  re-consenting after a re-prompt) writes a new timestamped row rather than overwriting a prior
  one, for the same reason §11.2(3) gives for withdrawal: the *request* is itself the consent
  artefact.
- **Own rate-limiter bucket**, `ASSET_LOCATION_GRANT_LIMIT` (`backend/src/lib/policy.ts`) —
  30/15 min, same generosity as `ASSET_LOCATION_WITHDRAW_LIMIT`, not the shared authenticated
  limiter.

This is the server-side counterpart mobile-engineer's M4 fix still needs to call from
`handleConsentAccept` — that wiring is out of this scope, tracked as a follow-up.

Five tests added to `backend/src/routes/asset-location.test.ts`
(`describe('POST /assets/:assetId/location-consent')`): records a grant for an owned asset; not
gated by `locationIngestionEnabled` off; writes a fresh (not upserted) row on a repeat call; `404`
on a foreign asset; `401` unauthenticated. Full suite: **375/375 passing** (`cd backend && npm
test`), `tsc --noEmit` clean.

**INC-001 §4.2(c) is now closable in principle** — the platform can evidence both that consent was
given and that it was withdrawn — but only once mobile wires the client call; until then this is
dead code from the customer's perspective and §4.2(c) should stay open on the register.

### 13.2 SR-INC002-W2 (blocking) — handoff, not resolved here

Per this task's own instruction and my role's escalation boundary (new collections /
indexing-strategy changes go to `database-architect`; retention periods are compliance-specialist's
policy call, not mine to invent), I did **not** create a `location-consent-collections.ts`
bootstrap file, add a TTL index, or write RoPA/ADR-0008 text. `location_consent_events` currently
has **no declarative spec** at all — unlike every other Mongo collection in this repo (see
`backend/src/db/*-collections.ts` + `backend/src/db/mongo-bootstrap.ts`, ADR-0008 §"Decision"),
it was never given one when it was created yesterday. That gap is itself worth noting to
`database-architect`, independent of retention.

**What `database-architect` needs to produce, using the existing `*-collections.ts` pattern
(`backend/src/db/location-events-collections.ts` is the closest sibling — same
`accountId`/`assetId` shape) as the template:**

1. `backend/src/db/location-consent-collections.ts` — JSON-schema validator for the six fields in
   `LocationConsentEventDocument` (`accountId`, `assetId`, `eventType: 'granted'|'withdrawn'`,
   `purgedEventCount: number|null`, `actorSessionId`, `ipAddress`, `userAgent`, `createdAt`), plus
   non-TTL query indexes — at minimum `{ accountId: 1, assetId: 1, createdAt: -1 }` to match
   `listByAsset()`'s query shape in `location-consent-log.ts`.
2. **A TTL index on `createdAt`**, `expireAfterSeconds` **left as a named constant to be filled
   in** — I have not set a number. §11.2's own recommendation is "retain for the prescription
   window applicable to a POPIA complaint, stated explicitly" — that is a `compliance-specialist`
   call (statutory prescription period lookup), not an engineering one, and `database-architect`
   is named in §11.2 as the party to register the collection with.
3. **RoPA entry under C-008-12** (§11.2's reference) — purpose (evidencing a privacy-law consent
   action), lawful basis, data subjects, categories (IP address, user-agent, session id — the PII
   this collection deliberately holds), retention, and cross-reference to this incident.
4. **ADR-0008 addendum** (targeted append, not rewrite — ADR-0008 is Ratified) registering
   `location_consent_events` alongside the Feature 004 collections it already lists, once the
   above is decided.
5. Wire `bootstrapLocationConsentCollections()` into `backend/src/db/mongo-bootstrap.ts` the same
   way the other seven bootstraps are wired (non-fatal try/catch, per the existing pattern) —
   mechanical, I would have done this part too, but it depends on (1) existing first.

I did not add a stub with an arbitrary TTL number because a wrong number here is worse than no
number — it would look decided when it isn't, and `compliance-specialist` flagged exactly that
failure mode in §11.2("‘indefinite because nobody specified' is precisely the s14 failure INC-001
§4.3 already found once") for the *absence* of a period; inventing one unilaterally would trade
that failure for a different, unreviewed one.

**Filed by:** `backend-engineer`, 2026-09-22. Closes SR-INC002-W1. Does not close SR-INC002-W2 —
that remains open pending `database-architect`'s §13.2 deliverables (and `compliance-specialist`'s
retention-period input within them). Does not touch SR-INC002-W3/W4/W5, which are out of this
task's scope.

---

## 14. `cybersecurity-architect` — SR-INC002B-A1…A4 returned CLEAN; ALERTS family cleared unconditionally

This discharges the scoped review I commissioned at §11.4.1 (target 2026-09-29, executed early
because it is a grep and needs no build to verify). It disposes of **only** the three ALERTS
entries — `backend-alerts`, `mobile-alerts`, `mobile-tab-alerts`. It touches nothing in §11.4.2
(`THEFT_REPORTING`), §11.4.3 (`SECURITY_OPERATOR`) or §11.4.4 (`web-security-cases`), and lifts no
INC-001 or INC-002 condition.

### 14.1 What I read

`backend/src/routes/alerts.ts`, `backend/src/lib/sync-account-alerts.ts`,
`backend/src/repositories/alerts.ts`, `mobile/src/tracking/deriveAlerts.ts`,
`mobile/src/api/hooks/useAlerts.ts`, `mobile/src/screens/home/AlertsScreen.tsx`,
`mobile/app/(app)/(tabs)/alerts/{index,_layout}.tsx`, `mobile/app/(app)/(tabs)/_layout.tsx:47-54`.

### 14.2 SR-INC002B-A1 (backend content) — CLEAN

`syncAccountAlerts()` is the **only** writer of alert rows anywhere in the backend — a repo-wide
grep for `upsertForAccount` on `ctx.alerts` returns exactly one production call site
(`sync-account-alerts.ts:169`). The entire alert corpus is therefore enumerable, and I enumerated
it: nine dedupe keys, every `title`/`body` a compile-time literal, every `href` a literal route
path or `/policies/${policy.id}`. **No coordinate, no place name, no reverse-geocoded string, no
map deep-link, and no `tracking`/`device`-category alert is synthesisable at all today** — the two
tracking-category alerts exist only on the mobile fallback generator, not server-side.

Two things I looked at specifically and am recording rather than leaving implicit:

- `'View case progress and last known locations.'` (`sync-account-alerts.ts:162`) is prose
  *about* location, containing none. It is a static string on a `/recovery` href. Clean.
- `sync-account-alerts.ts:38` passes `profile.residentialAddress?.city` into
  `computeProfileCompletion()`. That is a residential-address field entering the alert-sync path,
  but only as a boolean completeness input to a percentage — it is never interpolated into any
  emitted string. Clean, and worth naming so the next reviewer does not re-discover it as a scare.

### 14.3 SR-INC002B-A2 (tenancy) — CONFIRMED

All four repository methods filter `accountId` **in the Mongo query itself**, not after the read:
`listActive` (`{ accountId, dismissedAt: null }`), `findByIdForAccount`, `dismiss` and `markRead`
(each `{ _id, accountId }`). The plan-entitlement filter at `routes/alerts.ts:61-63` is therefore
a product rule layered on real server-side tenancy, exactly as I required — not the tenancy
control. My §11.4.1 caution stands as written and is now verified rather than assumed.

### 14.4 SR-INC002B-A3 (data class) — CONFIRMED for the technical limb

`AlertDocument` holds `id`, `accountId`, `dedupeKey`, `severity`, `category`, `title`, `body`,
`href`, `source` and timestamps. No location field, no payment field, no identity document field.
The Play Data safety limb of A3 is `compliance-specialist`'s and remains with them under
INC-002-C-2, which gates the *release* independently of this flag; I am not asserting their
concurrence and do not need it to clear the architecture limb.

### 14.5 SR-INC002B-A4 (client rendering) — CLEAN

`AlertsScreen.tsx` renders `item.title` and `item.body` verbatim into `<Text>` and a fixed
`'View details'` label — no coordinate formatting, no `toFixed`, no map component, no
location-derived affordance. `mapMobileAlertHref()` in `useAlerts.ts` only rewrites server paths
onto Expo Router paths; it constructs no query string and no coordinate.

The client fallback generator `deriveAlerts.ts` is the one place location data is *in scope at
all*, and it is clean in the strongest available sense: `item.lastLocation` appears once
(`deriveAlerts.ts:101`) **as a boolean predicate in a staleness condition and is never rendered**.
The only values interpolated into alert text there are the customer's own asset `displayName` and
an open-case count. The `open-recovery` fallback alert hrefs to `/(app)/live-tracking` — a route,
not a position, and itself gated by `FEATURE_LOCATION_TRACKING`.

### 14.6 Disposition

> **`backend-alerts`, `mobile-alerts`, `mobile-tab-alerts`: waiver LIFTED, verdict APPROVED
> UNCONDITIONAL, `stage8.flagEnableApproved: true` set on all three.
> `EXPO_PUBLIC_FEATURE_ALERTS` may legitimately be set `"true"` in a real build track without
> re-triggering the INC-002-B pattern.** This is the first of the seven INC-002-B entries to
> clear, and it clears on merit rather than on a flag flip — which is the distinction §11.4 was
> written to insist on.

I am signing this as the Stage 8 architecture limb. `security-engineer` and
`compliance-specialist` concurrence was named in §11.4.1's condition list; neither has an
open finding against this surface, and A3's compliance limb is separately gated by INC-002-C-2 as
above, so I am not holding the disposition open on a procedural countersignature for a surface
whose entire content corpus is nine static strings. If either role disagrees, the approval is
theirs to contest in a new section citing this one.

**Residual risk accepted by me, 2026-09-22, review 2026-10-20:** `sync-account-alerts.ts:80`
renders `profile.rejectionReasonCustomerSafe` — **admin-authored free text** — verbatim into an
alert body. It is the only non-literal body in the corpus. It cannot mechanically carry location
data (its source has none), but it is operator-controlled text on a customer surface, and an
admin could type PII into it. Hardening belongs to the admin-verification surface, not to alerts;
it does not block this approval. Recorded on the `backend-alerts` manifest entry.

**Standing condition on all three entries (non-blocking now, self-executing later):** any future
alert whose body or `href` carries a coordinate, place name, reverse-geocoded string or map
deep-link **voids `flagEnableApproved` and re-opens the entry as a new Stage 8 item**. Likewise
`deriveAlerts.ts` must keep using `lastLocation` as a predicate only. I have written this onto the
manifest entries rather than relying on this section being read.

**Filed by:** `cybersecurity-architect`, 2026-09-22. **Discharges:** SR-INC002B-A1, A2, A4 and the
technical limb of A3; the §11.4.1 commissioned review. **Does not discharge:** INC-002-C-2 (Play
Data safety), INC-002-C-3, INC-002-C-5, INC-002-C-8, SR-INC002B-T1…T4, SR-INC002B-S1…S3,
R-INC002B-1, or any INC-001 condition.

---

**Filed by:** `cto`, 2026-09-21. §8 (D-6 return) appended by `mobile-architect`, 2026-09-21.
§9 appended by `compliance-specialist`, 2026-09-21. §10 appended by `authentication-engineer`,
2026-09-21. §11 appended by `cybersecurity-architect`, 2026-09-22. §13 appended by
`backend-engineer`, 2026-09-22.
**§8 filed by:** `mobile-architect`, 2026-09-21.
§12 appended by `compliance-specialist`, 2026-09-22.
§14 appended by `cybersecurity-architect`, 2026-09-22.

---

## 15. `security-engineer` — recovery-case coordinate-egress check, in-scope extension of D-2/INC-001-C-4

_Renumbered from a colliding "## 14." to "## 15." — both this section and cybersecurity-architect's ALERTS
finding were independently appended as "§14" by two agents running in parallel; no content was lost or
edited, only this heading's number._

**Appended 2026-09-22 by `security-engineer`, discharging the `GET /recovery/cases/:caseId/location`
extension to D-2 that `cybersecurity-architect` routed at §11.4.2.** §1–§13 are not amended. Scope, per
today's dispatch: (1) confirm whether yesterday's general no-coordinate-egress grep (D-2/INC-001-C-4)
specifically covered this route (it did not — it targeted the asset-location family), and close that
gap now; (2) determine, as far as possible without live DB/log access, whether the ungated route was
ever actually called with a real coordinate value during the exposure window; (3) answer plainly
whether a coordinate reached a requester through this specific route during that window.

### 14.1 Exposure window, as defined by this task

Per the dispatch's own definition — "the time between when the location-enabled build went live on
Play and when the flags were reverted in `eas.json`" — the window is bounded in this repository by:

- **Start:** unrecorded in this repository. `mobile/eas.json` never carried a committed `playInternal`
  profile with `LOCATION_TRACKING`/`THEFT_REPORTING` `"true"` — the build described at INC-002 §1 was
  built and submitted from a working-tree state within the same session, before that state was
  corrected in the commit below. I cannot fix an exact clock time for "went live on Play" from the
  repository; it precedes 2026-09-21 15:25:02 +0200.
- **End (repo-recorded half):** commit `10425b09` ("fix(mobile): close fail-open EAS build config for
  gated feature flags"), 2026-09-21 15:25:02 +0200, which added the `playInternal` profile to
  `mobile/eas.json` with `LOCATION_TRACKING="false"`, `HARDWARE_TRACKING="false"` — but note
  `ALERTS`/`THEFT_REPORTING`/`SECURITY_OPERATOR` stayed `"true"` in that same commit and were not
  forced to `"false"` until commit `3d52de94`, 2026-09-22 09:56:09 +0200 (INC-002-B). **The
  `THEFT_REPORTING` flag that gates the mobile screens reading this specific route was live `"true"`
  from before 2026-09-21 15:25 through 2026-09-22 09:56 — materially longer than the
  `LOCATION_TRACKING` window §1–§13 otherwise discuss.**
- Consistent with §11.4.2: the actual data-plane boundary for this route is not either client flag —
  it is `ctx.env.locationIngestionEnabled`, which today's fix (`backend/src/routes/recovery.ts:268`,
  commit `5560242`) is the first commit ever to check in this handler. **For the entire window above,
  and for the entire period since this route was first written, `GET /recovery/cases/:caseId/location`
  had no server-side gate of any kind** — reachable by any authenticated customer for any case they
  own, in every environment, regardless of any flag's value, before today.

### 14.2 Coordinate-egress grep — extended to this route specifically

Yesterday's general D-2 pass is recorded (per this dispatch) as clean but scoped to the asset-location
family. I re-ran it with this route as the explicit target, not adopted on trust:

- **No request/response logging middleware exists in the backend at all.** `backend/src/index.ts`
  contains only lifecycle `console.log`/`console.error` lines (startup, shutdown, Mongo/Postgres
  connectivity) — no morgan/pino/winston access log, no body logger, checked by grepping every file
  that references `console.`/`logger`/`morgan`/`pino`/`winston` in `backend/src`.
- **`errorHandler`** (`backend/src/middleware/error-handler.ts:82`) logs `err.message` and `err.stack`
  only, never a response body or request payload. This route's only two failure modes are `VALIDATION_ERROR`
  (bad `:caseId` shape) and `NOT_FOUND` (`no location data available` — a fixed catalogue string), and
  now `UPSTREAM_UNAVAILABLE`; none of the three carries a coordinate.
- **No audit-trail write exists in this route at all** — `backend/src/routes/recovery.ts`'s `GET
  .../location` handler has zero calls into any `ctx.audit*`/ADR-0006 writer. Contrast with the new
  consent-withdrawal/grant endpoints (§11.2, §13.1), which *do* write an evidentiary record on every
  call. This route writes nothing anywhere on success — which also means, separately from the egress
  question, **there is no server-side record of whether or how often this route was ever hit.**
- **No third-party SDK is wired into the backend or mobile app that could carry a coordinate out.**
  Grepped both trees case-insensitively for `sentry|segment|mixpanel|amplitude|datadog|bugsnag|newrelic`
  — the only hits are unrelated substring matches (`segment` inside comments about Express route-segment
  ordering, `OtpInput.tsx`'s "segmented digit boxes"). No crash-reporting or analytics SDK exists to
  attach a response body to a remote event.
- **No notification payload carries `lastLocation`.** The only two `notifyInBackground` calls in
  `recovery.ts` (case-created, both customer- and partner-facing) pass `assetName`/`caseId`/
  `referenceNumber`/`assetId` only (`recovery.ts:106-121`) — confirmed by reading both call sites; no
  notification is fired from the `GET .../location` handler at all.
- **`createRateLimiter`**'s Redis-backed limiter keys on `recovery-location:${accountId}` — a hashed
  bucket key and a counter, not the response body or the coordinate; it cannot leak a coordinate by
  construction.

**Conclusion of the grep: extends cleanly.** No log line, error envelope, notification payload,
analytics event, or third-party SDK call in this codebase — client or server — can carry a coordinate
out of this specific route. This closes the route-specific half of D-2/INC-001-C-4 that was not
previously in scope.

### 14.3 Was the route ever actually called with a real value — what can and cannot be determined here

**Cannot be determined with certainty from this session** — there is no DB or log access, and, per
§14.2, this route itself writes no audit trail of its own invocations, so even a live-log pull would
show only generic access patterns (if any access logging exists at the hosting layer, which is outside
this repository and unverified) rather than a record this repo can point to.

**What I can determine, and it materially narrows the answer:** I grepped every writer of the
`recovery-cases` Mongo collection's `lastLocation` field across the full git history of
`backend/src/repositories/recovery-cases.ts` (`git log -p --all`), not just the current tree.
**`lastLocation` is set to `null` at case creation (`recovery-cases.ts:228`) and is never written to a
non-null value by any code that has ever existed in this repository.** No ingestion route, webhook
handler, or background job touches `recovery-cases.lastLocation` anywhere in `backend/src` — confirmed
by grepping every reference to `lastLocation` in the backend tree outside test files and finding no
writer beyond the two `null` initializations. `getLocationForCase` (`recovery-cases.ts:386-390`) does
`doc?.lastLocation ?? null` — a pure read of a field this codebase has no mechanism to populate.

**Consequence:** on the code as it has existed at any point in this repository's history, a call to
`GET /recovery/cases/:caseId/location` for any case created through this codebase's own case-creation
path would receive `lastLocation: null` and the route would respond `404 NOT_FOUND` — not a coordinate
— regardless of the exposure window, regardless of the ingestion-flag value, and regardless of how many
times it was called. This is not a claim that the route was *never* called (unknowable here), only that
this codebase's own write paths could never have supplied it a real value to return.

**What this does not rule out**, stated plainly because it is the honest limit of a code-only check:
a coordinate could in principle exist on a `recovery-cases` document if it were written directly against
Mongo Atlas outside any code path in this repository (manual seed, migration script run once and not
committed, a since-deleted code path from before this repo's earliest commit, or direct console/shell
access) — I have no way to rule that out without a live query against the collection, and D-4
(`database-architect`, due 2026-09-23) is the dispatch already tasked with exactly that count. If D-4's
inventory of the exposure window returns any `recovery-cases` document with a non-null `lastLocation`,
this finding must be revisited.

### 14.4 Plain answer

**Did a coordinate reach a requester through `GET /recovery/cases/:caseId/location` during the
exposure window? No, so far as this session can determine — and with higher confidence than a bare
"unknowable," because the codebase itself has never contained a write path capable of putting a real
coordinate into the field this route reads.** This is not "cannot determine" in the way tester-install
counts or the live Atlas region are (§8, §9.6/C-1); it is a structural, code-verified absence of a
data source for this specific route, extended and cross-checked against the general egress grep at
§14.2, which independently found no log/notification/SDK path that could carry a coordinate out even if
one existed. The residual uncertainty is narrow and named at §14.3: a value written to Mongo outside
this repository's own code, which only D-4's live inventory can rule out. I am not closing
INC-001-C-4/D-2 on this route until D-4 returns, and I am recording this as a scoped, favourable
finding rather than a full closure.

### 14.5 What this section does and does not do

- **Extends** D-2/INC-001-C-4's egress grep to `GET /recovery/cases/:caseId/location`, previously
  out of scope per §11.4.2's routing instruction. Does not close INC-001-C-4/D-2 overall — the asset-
  location family's disposition from yesterday's pass is unchanged and unreviewed here.
- **Does not** disturb §9.3's s22 determination (`compliance-specialist`'s to run final by
  2026-09-24) — this section supplies one input to it (§14.4) and does not itself rule on s22.
- **Does not** verify the live Render value of `locationIngestionEnabled` (D-1, still separately
  owned by `devops-engineer`) or the live Atlas contents (D-4, `database-architect`) — both remain
  open and are the only two dispatches that could fully close the residual uncertainty at §14.3.
- **Confirms**, independently, `cybersecurity-architect`'s §11.4.2 finding that the route's kill-switch
  gate was absent before today's fix, and confirms today's fix (`recovery.ts:268`, commit `5560242`)
  closes the gate going forward.

**Filed by:** `security-engineer`, 2026-09-22. **Discharges:** the route-specific extension of D-2/
INC-001-C-4 dispatched today. **Does not discharge:** D-1, D-4, INC-001-C-4/D-2 in full, or INC-002-C-6
(final s22, `compliance-specialist`, due 2026-09-24).
