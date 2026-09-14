# CTO Status — 2026-09-14: payment-gateway deadline day, and four days of no movement

**Date:** 2026-09-14 · **From:** `cto` · **To:** owner (direct), cc `technical-project-manager`, `compliance-specialist`
**Type:** status only. No gate, scope, or vendor decision is made or reversed here.
**Previous entry:** [`2026-09-10-sprint-3-checkin.md`](2026-09-10-sprint-3-checkin.md) and its same-day addendum — both still accurate; this records only what four days of elapsed time changed.

---

## 1. Today is the payment-gateway decision date. Missing it costs nothing commercially.

Confirmed by reading the document, not by memory: `payment-gateway-vendor-scorecard.md` is still
**"In progress — scorecard kickoff, no vendor selected"**, last updated **2026-08-28**. The scoring
table in §1 is empty. No sub-review artefact exists anywhere in the repo — the only file in
`docs/organization/` matching "payment" is the scorecard itself, and no `ADR-0010` file exists.

So we are not missing today's deadline by a day. The **Week 2 work due 2026-09-04** — the POPIA
operator-agreement review, the PCI/hosted-fields review, the sandbox trial of the subscription and
webhook APIs — never started. Today's date is downstream of a three-week-old slip.

**Is there vendor-side time pressure? No.** I looked specifically. §2 records that the shortlist
(Peach, Paystack, Ozow, Netcash, PayFast) was built entirely from **public vendor documentation**
and is "not yet independently verified to first-party contract text." No vendor has been contacted,
no quote requested, no pricing held open, no trial clock running. §6's revisit triggers are all
internal-evidence triggers, not expiring-offer triggers. There is no relationship to damage and no
rate to lose.

**Real cost, stated plainly:** a planning-schedule slip that needs re-baselining, nothing more today.
The longer-term cost is real but slow — no payment code exists in this repo at all, so every week
the scorecard sits unscored is a week the first invoice the business can actually issue moves right.
That matters for revenue, not for risk, and it is not urgent this week.

**One correction to my own 09-10 note.** I wrote that the scorecard "needs owner commercial input to
finish honestly." True, but incomplete in a way that mattered: your input was never the *only*
missing piece, and it is not the binding one. Even with your fee tolerance, settlement bank and
lock-in appetite in hand today, C1/C2/C3/C5 still cannot be scored, because the compliance, security
and sandbox sub-reviews have not been done. Please do not read today's date as a reason to rush an
answer on payments.

## 2. Four days, six items — does my risk read change?

**On owner latency: no, and I won't manufacture urgency.** Four days on six items is unremarkable.
Two of the six are genuinely slow by nature — the CT-1 cross-border consent conversation is a
conversation with another company, and the payment commercial constraints deserve thought (and per
§1 above, are not on the critical path anyway). A four-day gap on those is normal, not a warning sign.

**On something else, yes — and it is not about you.** With zero commits in four days, artefact-based
deadlines that were *not* owner-blocked have lapsed on our side:

- **CT-3** (breach-notification runbook), **CT-5** (`seed-test-accounts.ts` teardown) and **CT-8**
  (ADR-0003 compliance appendix) were due **2026-09-12**. All three require a committed file. No
  commits exist. They are **overdue**.
- **CT-4** (documented Client instructions, §19(a)) goes overdue **tomorrow, 2026-09-15**.
- **CT-2** (Atlas region confirmation) has now been overdue since 2026-08-31 — **two weeks**.

That is the deterioration in this period, and it is engineering's to own, not yours. The contract
register, not your inbox, is the item moving in the wrong direction.

**Criterion 6, factual update:** preview build `426e5c01` **expired 2026-09-11**. A rebuild is now
required unconditionally, not "if this drags on." Note this does not make the bundle-ID answer
urgent by itself, because `manual-qa-engineer`'s documented negative still stands — a fresh build
would land in an org with no device, no proxy and no backend log access to verify it with. Rebuilding
before that capability exists produces a second artefact that also expires unverified.

## 3. If I could have one of the six today: **OI-R-5.**

Does a live Resend account exist, who owns it, and has it ever sent to a real address?

It is one sentence from you and costs nothing. It is the only one of the six whose answer changes
what kind of problem we have rather than how fast we fix it: `compliance-review-resend.md` found ~20
Feature 007 templates carrying theft/recovery-case and IP-address content that were never in scope of
any email review, all 22 Resend sub-processors US-domiciled, and CT-1 unmet. If nothing has ever been
sent, we are prospectively clean and everything else is sequencing. If something has been sent, we
are in a live contravention that has been accruing since the day it started — and the response,
including whether a notification obligation exists, is a different piece of work entirely.

Every other item on the list is a decision whose cost is a delay. This one is a fact whose cost, if
it is the bad answer, grows while it stays unanswered. Please answer it even if you answer nothing
else this week.
