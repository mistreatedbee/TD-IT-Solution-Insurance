# Feature 012 — UX Research (Stage 3, light validation)

**Lifecycle stage:** 3 — UX Research (light validation per Stage 1 §6 / Stage 2 §6, not a full study)
**Owner:** `ux-researcher`
**Status:** Complete — feeds Stage 4 UI Design
**Scope:** Validate FR-2's per-role quick-link set and sanity-check FR-4's per-role operational
counts, grounded in the actual nav/page structure of each dashboard (not the Stage 1 doc's
nav-order inference alone). No user interviews conducted — internal staff sample is thin
pre-launch (0 DAU, no dedicated admin/security/support headcount to recruit from yet); this is a
structural/heuristic review against the real codebase plus domain judgment about each role's job,
consistent with how Feature 004's M-03 Home screen validation was scoped.

**Method:** Read the live route/layout/page source for all three dashboards
(`src/admin/layout/AdminLayout.tsx`, `AdminRoutes.tsx`, `AdminVerificationPages.tsx`,
`AdminAnalyticsPage.tsx`; `src/security/layout/SecurityLayout.tsx`, `SecurityCasePages.tsx`;
`src/call-centre/layout/CallCentreLayout.tsx`, `SupportCasesPages.tsx`,
`CustomerLookupPage.tsx`) rather than trusting the Stage 1 doc's paraphrase of nav order.

---

## Verdict (top line)

**FR-2 confirmed for all three roles, with one structural refinement for admin (differentiate the
two links, don't render them as equal-weight cards) and one copy note for security.** **FR-4
confirmed for the verification-pending, open-case, and my-cases-open counts — these reduce a real
repeated action. The Stage 1 doc's illustrative "count of active policies" example for admin should
be dropped or deprioritized** — it doesn't map to a repeated admin action the way the other three
counts do. Nothing found here blocks Stage 4; no severity-1/2 usability issue identified.

---

## 1. Admin (`/admin/*`)

**Confirmed nav (read from `AdminLayout.tsx`):** Customers, Verification, Policies, Assets, Plans,
Analytics — six flat items, matches Stage 1 §1's table.

**FR-2 as proposed:** "Review verification queue," "View DAU analytics."

**Finding:** These are not the same *kind* of task, and treating them as two equal-weight quick-link
cards understates that difference:

- **Verification queue** is a work queue an admin clears repeatedly — new pending-review accounts
  arrive continuously, each visit is "how many are waiting, let me work through them." This is
  exactly the kind of destination a quick link earns its keep on: it's the thing an admin comes back
  to multiple times in a session, and today it's buried as the 2nd of 6 flat nav items with no signal
  of queue depth until you click in.
- **DAU analytics** (`AdminAnalyticsPage` — confirmed real `GET` against a session-dedup endpoint,
  not a mock) is a periodic/monitoring check, not a repeated action — an admin looks at it to answer
  "how are we trending," then leaves. It's still worth surfacing (it's currently the *last* item in a
  6-item nav, easy to forget exists), but it's an "info" link, not an "action" link.

**Recommendation:** Confirm both links, but ask `ui-designer` to render them with different visual
weight/framing at Stage 4 rather than as two identical cards — verification as a primary,
count-carrying action card (pairs directly with FR-4's pending-verification count, see §4 below);
analytics as a smaller secondary link ("View analytics" or similar, no count attached). This is a
presentation note, not a scope change — both stay in FR-2's set as-is.

No case for adding Customers/Policies/Assets/Plans as quick links instead: those are lookup/browse
surfaces an admin visits *because* something specific brought them there (a support escalation, a
verification review that needs policy context), not surfaces an admin opens cold from a landing
screen the way a queue or a trend dashboard is. FR-2's two-link set for admin is the right shape.

---

## 2. Security Company Operator (`/security/*`)

**Confirmed nav (read from `SecurityLayout.tsx`):** exactly one item — "Case queue" — matching
Stage 1 §1's table precisely. There is no second nav destination to compare it against; the FR-2
quick link for this role isn't really a *choice* among candidates, it's the dashboard's only
content surface.

**FR-2 as proposed:** "Open case queue."

**Finding:** Confirmed — there is nothing else to link to. The value of FR-2 here is smaller than for
the other two roles (a one-item nav is already about as fast to reach as a landing-page link), but
it's not zero: it still gives the security operator a landing screen with identity + a link instead
of the current bare redirect straight into the case list, and it pairs with FR-4's open/unassigned
count (see §4), which *is* the part of this role's Home screen that carries real value.

**Minor copy note (not a structural finding):** "Open case queue" is ambiguous next to the case
status vocabulary already in the product — `SecurityCasePages.tsx` uses `open` as an actual case
*status* value (`STATUS_ACTIONS`, `recoveryCase.status === 'open'`). A quick link labeled "Open case
queue" sitting next to a Home-screen count of "N open cases" risks a reader parsing "Open" as the
verb once and the status once in the same screen. Recommend "Go to case queue" or "View case queue"
at Stage 4 to avoid the collision — flagging for `ui-designer`/copy, not blocking Stage 3.

---

## 3. Support Agent / Call Centre (`/call-centre/*`)

**Confirmed nav (read from `CallCentreLayout.tsx`):** Customer lookup, My cases — two items, in
that order, matching Stage 1 §1's table.

**FR-2 as proposed:** "Look up a customer," "My cases" — same order as the existing nav.

**Finding:** This order is not just nav-order inference here — the *code itself* encodes the
call-to-call workflow sequence. `SupportCasesPages.tsx`'s case-creation flow reads a
`?accountId=…` query param "pre-filled from a customer-lookup result" (confirmed inline comment,
`CustomerLookupPage.tsx` → `SupportCasesPages.tsx`), meaning the product was already built assuming
lookup happens first and cases get opened *from* a lookup result, not the reverse. That matches the
real-world call shape: an agent doesn't know who's calling until they look the person up; case work
follows identification. Confirmed — no reordering.

No case for a third quick link here beyond FR-2's two. "Recent lookups" (Stage 1 §4.3 Idea C-2) is
explicitly out of scope for this feature per Stage 1 §7 and is a reasonable future addition, not a
gap in FR-2 today.

---

## 4. FR-4 operational counts — value check

Sanity-checking each proposed count against "does this reduce a real repeated action, or is it
redundant with something already one click away":

| Role | Proposed count | Verdict | Reasoning |
|---|---|---|---|
| Admin | Pending verification count | **Confirmed, high value** | Verification is a queue admins clear repeatedly; today the only way to know queue depth is opening `VerificationQueuePage` and counting/scanning rows (confirmed — page renders a list with an empty-state message, no headline count of its own). A Home-screen number answers "is there work waiting" in one glance, which is the single most common question an admin re-asks each session. |
| Admin | Active policies count (Stage 1's illustrative example) | **Recommend drop / deprioritize** | This is Stage 1's own hedge ("if cheaply derivable") not a committed FR-4 item, and on inspection it doesn't map to a repeated admin *action* the way the other three counts do — an admin doesn't repeatedly ask "how many active policies exist" as part of their job the way they ask "how many verifications are waiting" or "how many cases are open." It reads as a vanity metric competing for the same screen space as the count that actually matters. If FR-4 ships exactly one admin count for v1, it should be the verification-pending count; don't spend Stage 6/7 backend-aggregate budget on a policy count nobody is shown to need. |
| Security | Open/unassigned case count | **Confirmed, high value** | This is literally the number a security operator is checking every time they open the dashboard — "how much is on my queue right now." Today's flat, unfiltered case list (Stage 1 §4.2 Idea S-1 independently notes there's no status filter or count-by-status breakdown yet) makes this a real, repeated manual-count action the Home screen would eliminate. This is the strongest FR-4 case of the three roles. |
| Support agent | "My cases" open count | **Confirmed, moderate-high value** | `scope=mine` is already server-enforced (confirmed comment in `SupportCasesPages.tsx`: "there is no control anywhere in this component that can request `scope=all`"), so this count is cheap to derive from a response the agent's own dashboard already fetches, and "how many of my cases are still open" is a plausible per-shift check, especially for an agent alternating between lookup and case work across calls. Slightly lower urgency than the security queue count (a support agent's open-case count changes less moment-to-moment than a security operator's queue), but still a legitimate glance value. |

**Net:** FR-4 as a mechanism is confirmed. Of the specific counts named or implied in Stage 1, three
are strong (verification-pending, open-case, my-cases-open) and one (admin active-policies count)
should be dropped from the v1 candidate list rather than sized at Stage 6/7 — it was only ever an
illustrative "if cheap" example, not a committed requirement, and this review finds no job-based
reason to build it.

---

## 5. Accessibility note (light touch, not a full WCAG audit)

Not a full accessibility audit — Stage 1/2 scoped this as light validation and the Home screen is a
small, mostly-static surface reusing `DashboardShell`. Two things worth carrying into Stage 4 so they
aren't accidentally lost in implementation, both tied to AC-8/AC-9:

- Quick-link cards (FR-2) must be real `<a>`/`<Link>` elements (as `AdminNavLink` and the existing
  `DashboardShell` nav already are), not `<div onClick>` — keyboard and screen-reader operability for
  a "landing page whose whole job is to route you somewhere" is not optional here.
- FR-4's degrade-gracefully state (AC-9, "—" or skeleton on failure) needs a text alternative
  announced to assistive tech, not just a visual placeholder — a skeleton with no accessible label
  reads as nothing to a screen-reader user, silently hiding a failure state.

Neither is a blocker; both are one-line notes for `ui-designer`/`frontend-architect` to carry into
Stage 4/9, consistent with the accessibility flag pattern in this role's checklist.

---

## 6. What this does not cover

- No moderated usability test — thin pre-launch staff headcount makes recruiting a real sample
  impractical right now; the qualitative post-launch check-in `product-manager` committed to
  (Stage 2 §4) is the right point to get real usage signal on FR-2's link choices and FR-4's counts,
  not this Stage 3 pass.
- No SUS/CSAT baseline — not proportionate for a small internal-tool landing screen; not attempted.
- Cross-role visibility, unified activity feed, per-role backlog ideas (§4 of Stage 1 doc) — all
  explicitly out of scope for this feature per Stage 1 §7; not reviewed here.

---

## Summary for `product-manager` / `ui-designer`

1. **FR-2 quick-link sets confirmed for all three roles** — same destinations, same order. Admin's
   two links should get differentiated visual treatment (primary/action vs. secondary/info) at
   Stage 4, not identical cards. Security's link label should avoid the word "Open" given
   "open"'s existing meaning as a case status — use "Go to"/"View case queue" instead.
2. **FR-4 confirmed for verification-pending, open-case, and my-cases-open counts** — these
   genuinely save a repeated queue-depth check, not just a click. **Drop the admin active-policies
   count** from the v1 candidate list; it doesn't reduce a real repeated action and isn't worth
   Stage 6/7 backend-aggregate sizing.
3. Two accessibility notes (real link elements, accessible failure-state text) carried forward for
   Stage 4/9, not a blocker.

No critical or high-severity usability/accessibility risk found. This feature is clear to proceed
to Stage 4 (UI Design).

**Signed:** `ux-researcher`, 2026-09-09.
