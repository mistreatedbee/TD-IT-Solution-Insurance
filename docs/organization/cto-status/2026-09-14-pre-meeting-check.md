# CTO — Pre-client-meeting readiness check, 2026-09-14

**From:** `cto` · **To:** platform owner · **Type:** demo-readiness assessment. Not a gate, not a
release decision. Nothing here reverses Release Gate A, Stage 8/10, or any vendor decision.

**Method.** Read-only pass over `mobile/app/`, `mobile/src/screens/`, `mobile/src/config/`,
`mobile/eas.json`, `mobile/app.json`, `src/`, `render.yaml`, `backend/scripts/seed-test-accounts.ts`,
and `docs/features/012-employee-dashboard/`. Builds on the orchestrator's verified test results of
today (backend 370/370, web 31/31, mobile 151/151, production `/api/health` responding). I ran no
shell and no build; every claim below is code-evidenced or explicitly marked as unverified.

---

## 1. Headline: the app is not broken. It is *empty*, and the demo build is *thin*.

I went looking for embarrassing things — dead-end buttons, "coming soon" screens reached by
accident, Lorem ipsum, placeholder art, half-wired forms. **I did not find them.** The quality bar
here is genuinely good. What I found instead are two demo-staging problems that cost nothing to fix
and will cost a lot if missed.

### D-1 — The demo account is empty. **Highest-value hour of work available today.**

`backend/scripts/seed-test-accounts.ts` contains zero references to assets, policies, plans or
profiles (grep: 0 matches, case-insensitive). It seeds **login credentials only**.

A client watching a login into a freshly seeded account sees: Home with "0 assets protected", an
empty featured-asset card, a 0% profile-completion ring, no plan. Every screen renders its
empty state correctly — which is exactly the problem. **Correct empty states look identical to an
unfinished product to someone who doesn't know the difference.**

**Fix (no code):** before the meeting, log into the demo account in the app and register 2–3 assets
by hand (a vehicle, a laptop, a phone), pick a plan, and fill the profile. Fifteen minutes, and it
turns the strongest screen in the product from blank to convincing. Do this against the account you
will actually demo from, and log in once from the demo device beforehand so the session is live.

### D-2 — Choose the demo build deliberately. The preview APK hides most of the product.

`mobile/eas.json` sets all seven Release Gate A feature flags to `"false"` on the **preview** and
**production** profiles, `"true"` on **development**. `mobile/src/config/features.ts:17` defaults
unset vars to enabled, so a local `expo start` / Expo Go tunnel shows everything.

Concretely, on preview build `7f3694b9` — the Android APK currently in hand — these are all hidden
or replaced by a "coming soon" card: Map tab, Alerts tab, report theft, claims, profile editing,
identity verification, tracker activation, device health, installation guide, and the security
operator portal. What remains is auth, onboarding, Home, Assets, plan/policy, Account, notification
preferences. Coherent, honest, and **a fraction of what has actually been built.**

The gating itself is excellent work and I want that said plainly: `(tabs)/_layout.tsx:43,52` sets
`href: null` so disabled tabs vanish from the tab bar rather than appearing and failing;
`ProtectionHomeScreen.tsx:274,287,303,330,343` and `AccountHubScreen.tsx:156,207,218,256,268,280,292`
hide the *entry points* alongside the destinations. **There is not one dead-end CTA in the customer
app.** That is the difference between a product that degrades and one that looks broken.

**Recommendation:** demo from the **Expo Go tunnel or a `development`-profile build**, owner-driven,
on the owner's own device, signed in as a **seeded test account only**. Do **not** hand the client an
install, and do **not** flip the preview/production flags to `"true"` — those flags are the INC-001
A-12 / Gate A criterion 6 control, and flipping them exposes Stage-8-unreviewed surfaces against the
live production backend. A controlled demo of ungated surfaces on test data is a presentation
choice; shipping them is a gate breach. Those are different things and only the first is on offer.

### D-3 — Render free tier will cold-start in front of the client. **Fix: 30 seconds.**

`render.yaml:10` is `plan: free`. Free instances spin down after roughly 15 minutes idle and take
30–60s to wake. The mobile API client sets no explicit request timeout (nothing in `mobile/src/api/`),
so it inherits the platform fetch default — the first login will most likely *eventually* succeed
while looking frozen, which is worse than a clean error.

**Fix (no code, no deploy):** hit `https://td-it-solution-insurance.onrender.com/api/health` a few
times in the ten minutes before the meeting and again just before you open the app, and do one real
login on the demo device beforehand. Upgrading the Render plan is the durable fix and is a cost
decision for you, not an engineering one — do not attempt it today.

---

## 2. What I checked and found clean

- **No Lorem ipsum, no placeholder imagery, no stray TODOs in user-visible copy** anywhere in
  `mobile/app/` or `src/`. Every "coming soon" string in mobile is an intentional, flag-gated
  Gate A control with real explanatory copy, not an unfinished screen.
- **The two web "coming soon" strings are honest and correct** and I would leave them exactly as
  they are: `CustomerDashboardPage.tsx:191` ("Pending activation — payment integration coming soon")
  and `CustomerChangePlanPage.tsx:80` ("Billing integration is coming soon — no payment was taken").
  Payments genuinely are not built. Saying so is right.
- **The app icon is branded, not an Expo default.** `mobile/assets/icon.png` is the real blue/amber
  chevron mark, with a full Android adaptive-icon set (foreground/background/monochrome) and a
  splash screen on `#2C3E50`. **Root `CLAUDE.md` is stale on this point** and should be corrected.
- **The bundle ID is already configured** — `app.json:13,24` carries `co.za.tditsolutions.insurance`
  on both platforms. T-01 is a confirmation of a string that is already in the repo, not missing work.
- **`signup.tsx:33`'s "placeholder" comment is a comment, not UI.** The password checklist it
  describes is real, renders correctly, and the comment honestly records that it is illustrative
  rather than an enforced client-side policy. No action.
- **The marketing-site waitlist form is a deliberate, documented honest failure**
  (`src/lib/waitlistApi.ts`, `WaitlistForm.tsx:66-72`): it renders "Not connected yet / Nothing you
  entered was stored" plus a real contact address rather than faking success. I ratify that choice —
  but **do not demo the waitlist form**, and be ready for it if the client browses the site
  unprompted. Do not "quickly wire it up" before the meeting; §12.3.6 requires a POPIA operator
  review of whatever vendor it posts to, and that review has not happened.

---

## 3. Reprioritising the 09-14 task register through a client-demo lens

Most of `2026-09-14-task-assignment.md` is correctly prioritised for **go-live** and correctly
*de*-prioritised for **a demo**. The two lenses genuinely differ and conflating them would waste the
next hour. Nothing below changes any item's go-live priority.

**Matters for the demo (do these):** D-1 seed data · D-2 build choice · D-3 backend warm-up.

**Matters only if the client asks (have the answer ready, don't do work):**
- **T-02 / verification email.** Real signup verification email does not work today. **Do not demo a
  live signup.** Demo a login to a pre-existing account. If asked: the sending path is built, the
  Supabase hook is one owner toggle away, and it is a pre-go-live gate item.
- **T-24 payments / GPS vendor.** Both open by design. The honest and genuinely strong answer is that
  Feature 008/009 is deliberately vendor-agnostic (`backend/src/lib/tracking-profile.ts`) so the
  platform is not hostage to a vendor chosen under time pressure. Sub-reviews due 2026-09-25,
  decision 2026-10-02.

**Does not matter for the demo — resist the urge to touch any of it today:** T-05, T-06, T-12, T-13,
T-15, T-16, T-18 (compliance documentation) · T-19/T-20 (Mongo rename, ADR-0008 observability) ·
T-21, T-22, T-23, T-26, T-32. All are real and several are overdue; none is visible to a client and
none should displace §1 in the next hour.

**One item that is both:** **T-17 / CT-11** (client-side SA ID checksum + truncation, due
2026-09-19). It is the compliance deadline nearest at hand *and* it directly overlaps the new SA ID
verification feature the owner has just requested — see §5.

---

## 4. Feature 012 (Employee Dashboard) is complete. There is nothing to carry on with.

Recorded here because it was asked about directly. I verified this against the feature folder, not
from memory. All ten lifecycle stages are closed, both hard gates passed — Stage 8 security review
(`security-review.md`, chaired, with findings SR-012-1 through SR-012-6 raised and resolved) and
Stage 10 QA (`qa-report.md`, both automation and manual passes). The code is merged and shipped:
shared `HomeScreen` with `AdminHomePage` / `SecurityHomePage` / `CallCentreHomePage`, plus three
backend count endpoints.

I also did my own post-Stage-10 independent review (`cto-review.md`, 2026-09-10) and concluded the
process was substantive rather than review-theatre — it caught a real production bug (route
shadowing that would have hung a Home badge permanently on a "—" placeholder), an unaudited
subject-keyed oracle, an unsatisfiable acceptance criterion, and a platform-wide CI gate blind spot.

Six CTO conditions (CTO-1 … CTO-6) remain, and I want to be precise about what they are: **none
blocks the merged code, and none is unfinished feature work.** They are follow-ups — an accessibility
restructure of one Retry control, a stale source comment, a Mongo index for scale, a CI-scanner fix,
a house rule, and a pre-existing audit-trail gap that is bigger than this feature.

**Feature 012 is done.** The only thing left to do with it is add *new* features to it, if wanted.

---

## 5. The gap nobody has asked about: SA ID validation is being built into a surface that is turned off

The owner has correctly identified SA ID validity + duplicate-account prevention as a real need, and
a dispatch to `business-analyst` is already in flight. I am not duplicating it. But there is a
sequencing collision that will not be visible from inside that dispatch, and it is mine to name:

1. **The natural home for SA ID entry is KYC — and KYC is flag-gated off in every client build**
   (`EXPO_PUBLIC_FEATURE_KYC=false` in preview and production). A new feature built into
   `account/profile` and `account/verification` ships **invisible** unless the KYC surface first gets
   the Stage 8 review that INC-001 A-12 gated it for. **That Stage 8 review is the real prerequisite,
   and it is not currently on anyone's list.** It should be scoped now, not discovered later.
2. **It collides with T-17 / CT-11, due 2026-09-19.** CT-11 requires that the SA ID be checksummed
   **client-side and truncated before transmission**; `customer-profile-validation.ts:17` still
   accepts a full `idNumber` server-side today. Duplicate-account prevention, done naively, requires
   comparing ID numbers **server-side** — which is the precise thing CT-11 is closing off. These two
   requirements point in opposite directions and will produce a contradiction unless resolved
   together, by design, up front. The resolution is almost certainly a **salted hash comparison
   against a stored digest** rather than storage of the ID itself, but that is
   `cybersecurity-architect` + `compliance-specialist`'s call to make jointly, not mine to impose.
3. **SA ID numbers are a POPIA special-category-adjacent identifier**, and duplicate detection is by
   construction a cross-account lookup. This needs Stage 7 compliance input **before** Stage 6
   design, not after.

**Recommendation:** when the `business-analyst` requirements land, I will route Stage 5/6 with
`cybersecurity-architect` and `compliance-specialist` as Consulted *from the start*, and fold T-17
into the same feature rather than shipping the two separately into conflict.

---

## 6. Dispatch

**Owner, before the meeting (no engineer can do these):**
1. Populate the demo account with 2–3 assets, a plan, and a filled profile (D-1).
2. Demo from Expo Go / development build, not the preview APK; test account only (D-2).
3. Warm the backend and do one real login on the demo device beforehand (D-3).

**Dispatched now — genuinely quick, genuinely valuable, none of it demo-blocking:**
- `technical-writer` → correct root `CLAUDE.md`: the app icon is **not** Expo defaults (branded icon
  and full adaptive set are in `mobile/assets/`). Also fold in CTO-5's append-only house rule if the
  owner gives the go-ahead — it still needs that go-ahead and I have not made the edit myself.
- `mobile-architect` → record the demo-profile guidance from D-2 in `mobile/docs/DEPLOY.md`, so the
  next person to demo does not rediscover it under time pressure.

**Deliberately not dispatched.** I found no pre-demo polish work worth doing in code. The app does
not need fixing before this meeting; it needs **data in it** and **the right build running**. I would
rather say that plainly than invent a ticket to look busy.

---

**Filed by:** `cto`, 2026-09-14. Standing constraints unchanged: Stage 8 and Stage 10 remain hard
gates, no build ships before Gate A closes, payment and GPS vendors remain open, and nothing in this
document commits a date to the Client.
