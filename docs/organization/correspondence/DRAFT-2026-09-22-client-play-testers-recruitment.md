# DRAFT — Google Play internal testing launch, tester recruitment ask to TD IT Solution (Pty) Ltd

**Status: DRAFT. Not sent.** Prepared by `product-manager`, 2026-09-22, for the platform owner to
review, correct, and send (or delegate sending). No agent in this organisation has a channel to the
Client. Filename stays `DRAFT-` until the owner confirms dispatch; on dispatch, rename to
`SENT-<date>-...` per `README.md` rule 2 and record sender/recipient/channel at the top.

**Why this exists:** the owner wants to tell the Client that a Google Play internal-testing build
of the mobile app exists, and that Google Play requires **at least 12 opted-in testers for at least
14 continuous days** before the app is eligible for production (public) access on the Play Store —
so the Client's help recruiting testers is needed now, not later, since the 14-day clock only runs
while enough testers are actually enrolled.

**Open question this draft deliberately does not resolve:** whether the Play Console build that is
live right now is the one testers should be pointed at, or whether a corrected build needs to be
uploaded first. That is being decided separately by `cto` and is **not settled as of this draft**
(see `docs/organization/incidents/INC-002-play-internal-location-reenablement.md` — a halt was
issued 2026-09-21 on the previously-live internal-testing release pending several conditions, and
as of this draft those conditions are not all closed). **Do not fill in §B's `[TIMING: ...]` block
until that call lands** — see §A.

---

## §A — Pre-send checklist

Each row is a fact the letter asserts, or a decision the letter depends on. Do not send past an
unticked box.

| # | Fact / decision the letter depends on | Verified? | Source / owner |
|---|---|---|---|
| A1 | A Google Play internal-testing release for this app exists in Play Console | **YES** | `docs/organization/cto-status/2026-09-21-status-and-dispatch.md` §8; `INC-002...md` §1 |
| A2 | Google Play's current publishing requirement (personal developer accounts created after 2023-11-13; reduced from 20 to 12 testers on 2024-12-11) is a minimum of 12 opted-in testers continuously enrolled for at least 14 days on a **Closed testing** track before the app becomes eligible for production access. **Internal testing does NOT count toward this requirement at all** — testers must be enrolled on a Closed test specifically, or the 14-day clock never starts. If even one tester drops below 12 enrolled before day 14, Google resets the counter to zero. | **CONFIRMED (2026-09-22, web search)** — but re-check the live Play Console "Production" tab requirements panel for this specific app before quoting the number, and confirm this Play Console account is actually a personal account created after 2023-11-13 (organization accounts, or personal accounts predating that date, are not subject to this rule at all) | verified this session; `product-manager` to re-verify account-type applicability against Play Console at send time |
| A2a | The build testers are pointed at must actually be promoted to a **Closed testing** track in Play Console, not left on Internal testing | **NOT DONE AS OF THIS DRAFT** — the currently-live release is on Internal testing only | owner action, blocks A3 |
| A3 | **Which build testers should be pointed at (current live release vs. a corrected re-upload) is not yet decided** | **OPEN — CTO decision pending** | `cto`, in parallel; see `INC-002-play-internal-location-reenablement.md` |
| A4 | If the current build is used: its Play Data Safety declaration accurately matches what the shipped build actually does (permissions, data collected) | **NOT CONFIRMED AS OF THIS DRAFT** | INC-002 §9.4, conditions INC-002-C-1/C-2 — declaration correction in the Play Console is an owner action, not yet confirmed done |
| A5 | Core features described as working (asset registration, policy viewing, GPS-assisted recovery for supported devices, theft reporting, alerts) are real, working app functionality, not aspirational | **YES, per current instruction to this draft's author** — re-confirm against the actual build testers will install before send, since flag configuration has changed more than once this week (INC-002) | `mobile-engineer` / `cto` status entries |
| A6 | This is a testing build with known follow-up work in progress — not a finished or final product | **YES** | `CLAUDE.md` house rules; HANDOFF.md "Not built" list |
| A7 | Who at the Client is the right contact to ask for tester names/emails, and who on our side collects them | **TO CONFIRM** — name a real recipient inbox before send, not a placeholder | owner |
| A8 | No banking details, contract pricing, or personal data beyond what's already documented in `docs/organization/` appears in the letter | **YES** | this draft — confirm again at send |

**Do not send until A3 is resolved and §B's `[TIMING: ...]` block is replaced with the actual
framing** (either "here is the install link, please start now" or "we're finishing one more round
of hardening; the link follows"). Sending with the placeholder still in place is not permitted.

---

## §B — The letter (ready to send, subject to §A)

---

**To:** TD IT Solution (Pty) Ltd — attention: the signatory to contract TDIT-2026-09
**From:** NextWave Digital Solutions
**Date:** [DATE]
**Subject:** Mobile app testing has started on Google Play — we need your help finding testers

Dear [NAME],

Good news to share: the mobile app now has an internal testing build live on Google Play. This is
an early but real milestone — it means the app is genuinely installable and usable on a real
Android phone, not just running in a development environment.

**1. What's working in this build**

Testers can already exercise account creation and sign-in, onboarding, and viewing policy and asset
details. GPS-assisted recovery, theft reporting, and alerts are built but intentionally switched off
for this first testing round while we finish a security/compliance review on those specific
features — they'll follow in a later testing update, not this one. We want to be upfront that this
is a **testing build, not a finished product** — there is known follow-up work still in progress,
and things may change or get fixed as testing continues. It is genuinely ready to be tried for what
it does cover; it is not the final version of the app.

**2. Why we need your help — Google Play's testing requirement**

Before Google Play will allow this app to move from internal testing to full production access (so
it can be published for the general public), Google requires **at least 12 testers to opt in and
stay enrolled continuously for at least 14 days**. This isn't a target we can shortcut — it's a
Google Play platform requirement that applies to every app before its first production release, and
the 14-day clock only counts while at least 12 people are actively opted in.

The sooner we have enough testers enrolled, the sooner that 14-day window starts running toward
production eligibility.

**3. What we need from you**

This is the ask: could you help us recruit testers? The easiest way is names and email addresses of
people willing to install a test version of the app on an Android phone and use it for a couple of
weeks — colleagues, staff, or anyone who'd be a good fit to try it and give feedback. We don't need
a large number — just enough people to comfortably clear Google's 12-tester minimum and keep them
enrolled for the full 14 days.

[TIMING: pending CTO decision — see below. To be replaced with one of:
(a) "We've included the install link below — testers can join and start right away."; or
(b) "We're finishing one more round of hardening on this build before sending the install link, so
please hold off sharing this with anyone until we follow up with the link and instructions —
we just wanted you to know this milestone has been reached and to get testers lined up in the
meantime."]

Happy to answer any questions or hop on a call if useful.

Yours sincerely,

[NAME]
[TITLE]
NextWave Digital Solutions
[DOMAIN EMAIL ADDRESS — not a personal webmail address]

---

## §C — Notes for the sender (do not include in what you send)

1. **Do not send with the `[TIMING: ...]` placeholder still in the letter.** Replace it with the
   CTO's resolved framing (§A3) — either the install link and a "start now" instruction, or a
   "hold off, link to follow" instruction. Both are legitimate outcomes; picking neither and sending
   the placeholder text is not.
2. **Do not describe the app as finished, final, or launched to the public.** It is an internal
   testing build. Google Play internal testing is invite-only and capped (per
   `docs/organization/incidents/INC-002-play-internal-location-reenablement.md`, up to 100
   individually-enrolled testers) — it is not a public release.
3. **Re-verify the 12-tester/14-day figure against the live Play Console requirements panel for
   this app at send time**, not from this draft alone — Google can and does adjust publishing
   requirements, and the panel in Play Console for this specific app is the authoritative source.
4. **If A4 (Data Safety declaration accuracy) has not been confirmed closed, do not send a build
   link to external, non-technical testers.** Route to `cto` first — INC-002 is the live record.
5. **Do not include any banking details, merchant information, or contract pricing** — none belongs
   in correspondence per this directory's rule 3.
6. **Name a real point of contact for collecting tester emails** (§A7) before sending — do not leave
   this vague in the actual letter; testers need a concrete next step.
7. **On dispatch**, rename this file `SENT-<date>-...`, record sender/recipient/channel at the top,
   and update the table in `README.md`.
