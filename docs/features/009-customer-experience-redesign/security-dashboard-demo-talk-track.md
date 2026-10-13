# Security Company Dashboard — Client Demo Talk Track

Drafted per ADR-0013 (proposed, not yet authorized). For use only if/when the business owner
approves the time-boxed production demo exception in that ADR. Purpose: make sure the demo can't
be mistaken, by the client or by anyone replaying a recording later, for a claim that a partner
integration exists, that location-sharing with partners is live, or that the dispatch model is
decided.

## What to say, in plain language

- "This is a pre-launch product preview, not a live customer environment." Say this before showing
  anything, not as a caveat afterward.
- "The security partner you're about to see is a fictional stand-in we created for this demo —
  'DEMO – Fictional Security Partner.' We haven't signed or onboarded a real partner yet; that's a
  separate legal step that comes after this kind of product conversation."
- "The theft cases you'll see are fake data we seeded for this walkthrough — no real customer's
  information is in this view."
- "How a case gets routed to a partner — whether every partner can see an unclaimed case, or
  whether our team assigns it — is a decision we haven't finalized yet. What you're seeing today is
  one candidate flow, not the final design."
- If asked about live GPS tracking or real-time location sharing with the partner: "That's not part
  of what you're seeing today — location/GPS ingestion for partners is still gated behind further
  security work (ADR-0009) and isn't live."

## What NOT to say or imply

- Do not describe the fictional partner org by a real company's name, even hypothetically, in a way
  that could be repeated back as "we're working with X."
- Do not say or imply the dispatch model, the partner agreement, or the audit/compliance work is
  "done" — say "in progress" or "designed, not yet executed" if asked directly.
- Do not screen-share or mention real customer accounts, real theft cases, or any production data
  outside the seeded demo set during the same session.

## If something looks broken mid-demo

The Security Operations slice passed a conditional Stage 8 security review, not a full production
pilot sign-off — if something behaves unexpectedly, that's consistent with its current status, not
a surprise. Don't improvise an explanation about data correctness live; note it and move on.

## After the demo (same day, per ADR-0013)

The demo flag and demo accounts/org must be removed the same day this talk track is used — this
document existing is not itself authorization to run the demo; see ADR-0013 for the actual go/no-go
and teardown steps.
