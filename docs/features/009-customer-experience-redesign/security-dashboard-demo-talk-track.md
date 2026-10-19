# Security Company Dashboard — Client Demo Talk Track

Drafted per ADR-0013. Originally written for the time-boxed production demo exception in that
ADR, which was never executed — the actual demo surface this talk track now applies to is the
local-only demo (`docs/organization/security-dashboard-local-demo.md`), run on the owner's own
laptop with no production access at all. Purpose unchanged either way: make sure the demo can't be
mistaken, by the client or by anyone replaying a recording later, for a claim that a partner
integration exists, that location-sharing with partners is live, or that the dispatch model is
decided.

**Update (2026-10-19):** the fictional partner org now has a real, fleshed-out identity —
"Vukani Asset Protection & Recovery (Pty) Ltd," trading as "Vukani Recovery"
(`docs/organization/demo-security-partner-profile.md`), checked against this codebase and against
real companies for name collisions. Use that name specifically in the script below instead of a
generic placeholder — naming it makes the demo feel concrete, and it's cleared precisely so it's
safe to say out loud.

## What to say, in plain language

- "This is a pre-launch product preview, not a live customer environment." Say this before showing
  anything, not as a caveat afterward.
- "The security partner you're about to see — Vukani Recovery — is a fictional stand-in we created
  for this demo, not a real company we've signed. We haven't signed or onboarded a real partner
  yet; that's a separate legal step that comes after this kind of product conversation."
- "The theft cases you'll see are fake data we seeded for this walkthrough — no real customer's
  information is in this view."
- "How a case gets routed to a partner — whether every partner can see an unclaimed case, or
  whether our team assigns it — is a decision we haven't finalized yet. What you're seeing today is
  one candidate flow, not the final design."
- If asked about live GPS tracking or real-time location sharing with the partner: "That's not part
  of what you're seeing today — location/GPS ingestion for partners is still gated behind further
  security work (ADR-0009) and isn't live."

## What NOT to say or imply

- Do not imply Vukani Recovery is a real company, or that any real security-industry partner has
  been signed, onboarded, or even approached — "fictional stand-in" every time it's introduced, not
  just the first time.
- Do not say or imply the dispatch model, the partner agreement, or the audit/compliance work is
  "done" — say "in progress" or "designed, not yet executed" if asked directly.
- Do not screen-share or mention real customer accounts, real theft cases, or any production data
  outside the seeded demo set during the same session.

## If something looks broken mid-demo

The Security Operations slice passed a conditional Stage 8 security review, not a full production
pilot sign-off — if something behaves unexpectedly, that's consistent with its current status, not
a surprise. Don't improvise an explanation about data correctness live; note it and move on.

## After the demo

For the local-only demo this talk track now applies to: stop the dev server
(`security-dashboard-local-demo.md` "After the demo" steps) — nothing persists, nothing was
deployed, no production account or setting exists to clean up. (ADR-0013's own after-demo/teardown
steps only apply if the never-executed production exception is ever actually run instead.)
