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

**Filed by:** `cto`, 2026-09-21. §8 (D-6 return) appended by `mobile-architect`, 2026-09-21.
§9 appended by `compliance-specialist`, 2026-09-21.
**§8 filed by:** `mobile-architect`, 2026-09-21.
