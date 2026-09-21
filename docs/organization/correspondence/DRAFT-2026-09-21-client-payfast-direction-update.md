# DRAFT — Payment gateway direction update to TD IT Solution (Pty) Ltd

**Status: DRAFT. Not sent.** Prepared by `integration-architect`, 2026-09-21 (updated same day to
cover both vendors — see below), for the platform owner to review, correct, and send (or delegate
sending). No agent in this organisation has a channel to the Client. Filename stays `DRAFT-` until
the owner confirms dispatch; on dispatch, rename to `SENT-<date>-...` per `README.md` rule 2 and
record sender/recipient/channel at the top.

**Why this exists:** the owner has directed **PayFast and Ozow, pursued in parallel** (not a
choice between them) as the intended payment gateways for this platform (recorded at
[`../payment-gateway-vendor-scorecard.md`](../payment-gateway-vendor-scorecard.md) §8). This is a
short, honest status update telling the Client that direction — not an announcement that either
integration is built, live, or that compliance/security review is complete for either vendor.
None of those is true as of this date.

**Source of truth for every factual claim below:**
[`../payment-gateway-vendor-scorecard.md`](../payment-gateway-vendor-scorecard.md), particularly
§2 (Candidate E), §7 (sub-review status — not started, no artefacts on disk), and §8 (the owner
steer itself, and its explicit limits).

---

## §A — Pre-send checklist

Each row is a fact the letter asserts. Do not send past an unticked box.

| # | Fact the letter asserts | Verified? | Source / owner |
|---|---|---|---|
| A1 | PayFast is SA-domiciled (Cape Town-headquartered), part of Network International group | **YES** | `payment-gateway-vendor-scorecard.md` §2, Candidate E entry, research pass 2026-08-28 |
| A2 | PayFast is a PCI DSS Level 1 Service Provider | **YES (per public vendor documentation, not yet independently verified to first-party contract text)** | `payment-gateway-vendor-scorecard.md` §2, same entry |
| A3 | PayFast publishes a recurring/subscription billing API | **YES (per public vendor documentation)** | `payment-gateway-vendor-scorecard.md` §2, same entry |
| A4 | Ozow is SA-founded, Instant EFT (bank-to-bank) focused, also supports card via partners, redirect-based checkout | **YES** | `payment-gateway-vendor-scorecard.md` §2, Candidate C entry |
| A5 | Ozow's recurring/subscription-API maturity for a monthly-billing model is less proven than the stronger candidates and needs direct evaluation; its card-rail PCI posture depends on which partner it routes through | **YES** | `payment-gateway-vendor-scorecard.md` §2, Candidate C "Open questions" |
| A6 | No payment integration code exists in the platform yet, for either vendor | **YES** | `payment-gateway-vendor-scorecard.md`, "Current repo state note," and `CLAUDE.md` ("Not built: payments/billing") |
| A7 | POPIA operator-agreement review, PCI/hosted-fields review, and sandbox trial have not been done for PayFast or Ozow | **YES** | `payment-gateway-vendor-scorecard.md` §7 — "zero artefacts on disk" as of 2026-09-21 (§7 covers "each vendor" per §3, not PayFast alone) |
| A8 | This direction is an owner steer covering both vendors in parallel, not a joint `cto`/`solution-architect` ratification and not a choice between them (ADR-0010 does not yet exist) | **YES** | `payment-gateway-vendor-scorecard.md` §8 |
| A9 | Neither PayFast nor Ozow has been contractually engaged, and no merchant application has been submitted or credentials provisioned, as of send date | **TO CONFIRM AT SEND TIME** | `integration-architect` — paragraph 1's "applying with both" must not be read by the Client as "applications already lodged" if none have been |
| A10 | The letter states no date or timeline for completion of the compliance/security review | **YES** | Scorecard §9 — 2026-10-09/2026-10-16 is an unratified proposal and is excluded from this letter deliberately |

**Do not send if any of A1–A10 has changed since this draft was prepared without updating the
letter to match** — particularly A6/A7/A9; if engineering work or a sub-review has progressed for
either vendor by send time, or if an application has actually been lodged with either provider,
the letter's paragraph 1 and paragraph 3 should be updated to reflect that rather than sent stale.
**A9 in particular must be re-checked at the moment of sending, not assumed from this draft date.**

---

## §B — The letter (ready to send, subject to §A)

---

**To:** TD IT Solution (Pty) Ltd — attention: the signatory to contract TDIT-2026-09
**From:** NextWave Digital Solutions
**Date:** [DATE]
**Subject:** Payment gateway direction — PayFast and Ozow

Dear [NAME],

We want to keep you updated on how billing and payments will work on the platform, even though
that part of the build has not started yet.

**1. The direction we're building toward**

We are pursuing integration with **two** payment gateways in parallel — **PayFast** and
**Ozow** — for different reasons, not as a choice between them:

- **PayFast** is a South African-based provider (Cape Town-headquartered, part of the Network
  International group), is a PCI DSS Level 1 Service Provider — the highest tier of
  card-industry security certification — and publishes a recurring/subscription billing API,
  which matches how this platform's monthly plans need to bill.
- **Ozow** is a South African-founded provider focused on Instant EFT (direct bank-to-bank
  payment), using a redirect-based checkout so card and banking details are handled on Ozow's
  own page, not ours. It gives customers a local EFT payment option alongside card payment.

We are still evaluating how each fits our recurring-billing needs; applying with both, once the
reviews described below are complete, keeps our options open rather than committing to one before
that work is done. No application has been submitted to either provider yet.

**2. What this is, and isn't, yet**

To be clear about where things actually stand:

- **No payment integration exists in the platform today, for either provider.** This is a
  direction for the work ahead, not a description of something built or live.
- **We have not yet completed our compliance and security review of PayFast or Ozow** —
  specifically, the data-protection (POPIA) review of how and where each provider processes
  personal and payment information, and the security review of each checkout flow. Both reviews
  are outstanding for both providers.
- If either review turns up a problem we can't resolve for a given provider, we will come back to
  you before committing further — we are not treating either PayFast or Ozow as final until that
  work is done.

**3. Something we'd like from you, if applicable**

If TD IT Solution (Pty) Ltd already holds a merchant account with PayFast or Ozow, or has an
existing relationship with either, please let us know — it would change how we set up the
integration. If not, no action is needed from you at this stage; we will come back to you once
the compliance and security review is complete and before any live payment processing goes
ahead.

We're happy to talk through any of this if useful.

Yours sincerely,

[NAME]
[TITLE]
NextWave Digital Solutions
[DOMAIN EMAIL ADDRESS — not a personal webmail address]

---

## §C — Notes for the sender (do not include in what you send)

1. **Do not add or imply that the integration is built, tested, or live.** It is not. See A6.
2. **Do not claim the POPIA/PCI review is complete or "just a formality."** It has not started
   for either vendor as of this draft (§7 of the scorecard) — see A7.
3. **Do not include any banking details, merchant IDs, API keys, or contract pricing** — none of
   that exists yet and none belongs in correspondence per this directory's rule 3.
4. **If the Client replies with an existing PayFast or Ozow account, or a condition**, route the
   response to `integration-architect` (vendor relationship, either provider) and
   `compliance-specialist` (if the condition touches data handling) before agreeing to anything.
5. **On dispatch**, rename this file `SENT-<date>-...`, record sender/recipient/channel at the
   top, and update the table in `README.md`.

---

## §D — CTO review, 2026-09-21, `cto`. Append-only; corrections to §A/§C recorded here rather than edited into another role's sections.

**Verdict on §B (the letter): accurate and appropriately hedged — clear to send once §D1–§D3
below are resolved by the author.** Paragraph 1 attributes every vendor claim to public vendor
documentation territory rather than to our own verification; paragraph 2 states plainly that
nothing is built and that both reviews are outstanding for both providers; paragraph 3 asks a
question without committing us to a date. It quotes no timeline, which is correct — the
scorecard's 2026-10-09/2026-10-16 pair is an unratified proposal (scorecard §9) and must not
appear in client correspondence.

**§D1 — stale cross-references in §C (blocking, author to fix).** §C items 1 and 2 cite "A4" and
"A5". Those pointed to the correct rows before the checklist was expanded to cover Ozow. They now
point at Ozow *fit* claims instead of the honesty claims they are meant to enforce. Correct
targets: §C1 ("do not imply the integration is built") → **A6**; §C2 ("do not claim the POPIA/PCI
review is complete") → **A7**. A sender following the current pointers would be reassured by the
wrong evidence.

**§D2 — §C item 4 is PayFast-only (blocking, author to fix).** It reads "If the Client replies
with an existing PayFast account". The letter asks about **both** vendors in paragraph 3; the
routing instruction must cover an existing **Ozow** account or relationship identically.

**§D3 — two checklist rows missing (author to add to §A).** The letter asserts two facts §A does
not cover:

| # | Fact the letter asserts | Verified? | Source / owner |
|---|---|---|---|
| A9 | Neither PayFast nor Ozow has been contractually engaged, and no merchant application has been submitted or credentials provisioned, as of send date | **TO CONFIRM AT SEND TIME** | `integration-architect` — paragraph 1's "applying with both" must not be read by the Client as "applications already lodged" if none have been |
| A10 | The letter states no date or timeline for completion of the compliance/security review | **YES** | Scorecard §9 — 2026-10-09/2026-10-16 is an unratified proposal and is excluded from this letter deliberately |

A9 is the one genuine overclaim risk in the letter: "applying with both keeps our options open"
is present tense and could be heard as applications already in flight. If none has been lodged,
the author should soften to "applying with both, once the reviews below are complete, keeps our
options open" — or tick A9 with evidence that applications genuinely exist.

**§D4 — no CTO objection to the Client being told the two-vendor direction.** It is a true
statement of owner intent, it is bounded in paragraph 2, and telling the Client now is lower risk
than telling them later after work has visibly started. This section does not authorise dispatch;
only the owner does (§"Status", and this directory's rules).
