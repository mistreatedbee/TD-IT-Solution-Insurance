# INC-003 — Owner console checklist: A-6 forensic check + A-22 live-config verification

**Purpose.** A single, self-contained, step-by-step checklist for the business owner (the only
person with production Supabase/Render access) to execute in one sitting, per `cto`'s merge
ruling at [`INC-003-web-password-reset-control-bypass.md`](INC-003-web-password-reset-control-bypass.md)
§20 (2026-10-16). It covers the two things only the owner can do before this branch merges to
`main`: the **A-6** production auth-log forensic check, and the **A-22** 12-item console/config
verification. `security-engineer` prepared this from the incident record; it does not re-derive
any ruling, it cites them.

**Prep status: drafting only.** This document was prepared by `security-engineer` without
production access, per instruction. Every value below is copied from the incident record's
rulings, not independently re-derived. If anything here looks wrong against what you actually
see in the console, stop and flag it back to `security-engineer`/`cto` rather than overriding it
silently — this is a security-incident remediation record, not routine configuration.

**Order matters.** Do Part 1 (A-6) completely before touching Part 2 (A-22), and before this
branch is merged/deployed. Reason (§20.2): this branch adds a backend Supabase sign-out that
mints a magic link, and every call writes a system-generated "login" row into
`auth.audit_log_entries` — the exact table A-6 searches. Deploying first pollutes the evidence.

---

## Part 0 — before you start

- [ ] Have production Supabase dashboard access ready (SQL Editor + Logs Explorer + Authentication
      settings + API settings), and Render production environment-variable access ready.
- [ ] Have the full list of staff emails ready: every `admin`, `security_company_operator`, and
      `support_agent` account's login email. (Source: your own account records / the
      `app.accounts` table filtered by role — ask `backend-architect` if you need the query to
      pull this list first.)
- [ ] Block out one uninterrupted session — this is designed to be run start to finish in one
      sitting (§20.3 step 3; §20.5 hard deadline **2026-10-22**, or the A-9 risk-acceptance that
      is currently covering this exposure lapses automatically).

---

## Part 1 — A-6: production auth-log forensic check

Cites: §20.2, §10 item 1, §19.5's A-6 row, A-5 doc §7 item 12.

### 1.1 Record your log retention window first

- [ ] In the Supabase dashboard, check your project's **plan tier** (Settings → Billing) and note
      what log retention that tier provides for the Logs Explorer (this varies by tier and is not
      hardcoded here — read it off your own project). **Write the retention window down** before
      you query anything: "a clean result only covers the period the logs cover" (§10 item 1) — if
      your plan only retains (for example) 7 days of Logs-Explorer history, a clean result there
      tells you nothing about events older than 7 days, even though the `auth.audit_log_entries`
      table itself (below) is not subject to that dashboard retention limit and may go back
      further.
- [ ] Record: plan tier = ______________, Logs Explorer retention = ______________ days/months,
      earliest `auth.audit_log_entries` row date you find in step 1.2 = ______________.

### 1.2 Query `auth.audit_log_entries` (SQL Editor) — do this first, not the Logs Explorer

Per §10 item 1: `auth.audit_log_entries` is a **database table**, not subject to dashboard
log-retention limits — confirm it's actually populated on this project before relying on it.

**Step A — confirm the table is populated and see its real date range:**

```sql
select min(created_at) as earliest_entry, max(created_at) as latest_entry, count(*) as total_rows
from auth.audit_log_entries;
```

If `total_rows` is 0 or `earliest_entry` is suspiciously recent (i.e., later than when web auth
went live), note that — it may mean retention has already purged older rows, which matters for
how much weight a "clean" result carries.

**Step B — list every event for your staff accounts, oldest first.** Replace the email list with
your actual full staff roster from Part 0:

```sql
select
  id,
  created_at,
  ip_address,
  payload->>'action'          as action,
  payload->>'actor_username'  as actor_email,
  payload->>'actor_id'        as actor_id,
  payload->>'log_type'        as log_type,
  payload
from auth.audit_log_entries
where payload->>'actor_username' in (
  'admin1@example.com',
  'admin2@example.com',
  'secops-operator1@example.com'
  -- add every admin / security_company_operator / support_agent email here
)
order by created_at asc;
```

**Step C — narrow to the specific event types A-6 and A-22 item 12 care about** (recovery
requests and user-record updates — email/password change — plus, for the customer-account
extension in A-22 item 12, `token_refreshed`):

```sql
select
  id,
  created_at,
  ip_address,
  payload->>'action'          as action,
  payload->>'actor_username'  as actor_email,
  payload
from auth.audit_log_entries
where payload->>'actor_username' in (
  'admin1@example.com',
  'admin2@example.com',
  'secops-operator1@example.com'
  -- full staff roster
)
and payload->>'action' in (
  'user_recovery_requested',
  'user_reset_password',
  'user_updated',
  'user_modified',
  'login'
)
order by created_at asc;
```

(Note on the `login` action: this branch's own fix mints a system-generated GoTrue "login" on
every backend-driven sign-out, per §16.3/§12.1's design — see the caveat at §12, "fake logins in
the audit trail." Any `login` rows **after** this branch deploys are expected noise, not findings.
You are running this query **before** deploy specifically so none exist yet to confuse the
picture — see Part 0 ordering note above.)

**Step D — cross-reference against MFA enrolment.** Per §10 item 1 and the A-5 doc §7 item 1:
*"the original web path most likely failed for staff who already had a verified TOTP factor, and
succeeded for un-enrolled privileged accounts."* So:

- [ ] For every staff account that shows a `user_recovery_requested` or `user_updated` row in Step
      C, check whether that account had a TOTP factor enrolled **at the time of the event** (not
      today — some accounts may have enrolled since). Your backend's `mfa_enrolled` audit events
      (if available to you, ask `backend-architect`/`authentication-engineer` for the query) are
      the way to establish "at the time," not the account's current MFA status.
- [ ] **Concentrate scrutiny on accounts that were un-enrolled during the exposure window** — those
      are the accounts the bypass could actually have succeeded against.

### 1.3 Then check the Logs Explorer (secondary, shorter retention)

- [ ] Dashboard → Logs → Auth Logs (Logs Explorer). Search for `recovery` and `user_updated`
      events against the same staff email list, for whatever window the Explorer's retention
      covers (recorded in 1.1). This is a cross-check against the SQL table, not a replacement for
      it — use it mainly to sanity-check that the table query isn't missing something the raw logs
      show, and to extend coverage if the Explorer's retention happens to be *longer* for any
      reason (unlikely but check).

### 1.4 What "clean" vs "a finding" looks like

- [ ] **Clean:** every `user_recovery_requested` / `user_reset_password` / `user_updated` row for
      every staff account is one you can account for — e.g., it's inside a window where that
      account had TOTP enrolled (so GoTrue's AAL2 rule would have blocked the actual bypass, per
      §10 item 1), or it corresponds to a password reset the account holder has confirmed they
      personally performed and can explain the timing of. Record each row's disposition in a
      table, don't just eyeball the count.
- [ ] **A finding:** any `user_recovery_requested` / `user_reset_password` / `user_updated` row
      against a staff account that (a) was **not** TOTP-enrolled at that time, (b) you cannot
      attribute to that person's own, explained action, or (c) comes from an IP address or pattern
      the account holder doesn't recognize.

### 1.5 If you find something suspicious — do this immediately, same day

This is not a judgment call to make alone — the incident doc already specifies the response
(§20.2, citing §10):

- [ ] `security-engineer` force-resets the password and revokes all sessions for the affected
      account(s) **the same day** the finding is confirmed.
- [ ] `compliance-specialist` starts a **POPIA section 22** breach-notification assessment **the
      same day**.
- [ ] `cto` re-opens INC-003's severity rating (§10: "this incident is reclassified as having real
      victims").
- [ ] Do not wait for Part 2 (A-22) to be finished before triggering this — a finding here
      overrides the rest of the session's sequencing.

### 1.6 Record the result in the incident doc

- [ ] Once done, this belongs appended to `INC-003-web-password-reset-control-bypass.md` as a new
      dated section (append-only — do not edit §20 or any earlier section). Record: the retention
      window actually available, the query/queries run, the full list of staff accounts checked,
      every row found and its disposition, and the clean/finding conclusion. `security-engineer`
      should write this section once the owner has run the queries and reported results — the
      owner does not need to write it themselves.

---

## Part 2 — A-22: 12-item live-configuration verification

Cites: §19.5's A-22 row, A-5 doc §7 (source of the 12-item list), §20.4 (C-9 ruling — **supersedes
the A-5 doc's original item 10 value**).

**For each item: go to the dashboard location given, record the value you observe, compare to the
required value, set it if it isn't already there, and check the box.** Record every observed
value somewhere durable (the A-5 doc says `supabase/README.md` as the SR-5 baseline —
`devops-engineer` owns writing it there; you can jot values in this checklist first and hand them
over).

### Item 1 — Secure password change
- [ ] **Where:** Dashboard → Authentication → Settings (or Policies) → "Secure password change" /
      `update_password_require_reauthentication`.
- [ ] **Required:** ON.
- [ ] **Caveat (record this, don't just flip the switch and move on):** this control only takes
      effect for sessions older than 24 hours (upstream Supabase behavior) — it's a partial
      control, not a full fix for C-8 (password change from any logged-in browser) on a fresh
      session.

### Item 2 — Secure email change
- [ ] **Where:** Dashboard → Authentication → Settings → "Secure email change" (double
      confirmation: both old and new address must confirm).
- [ ] **Required:** ON.

### Item 3 — Signup / magic-link / OTP sign-in
- [ ] **Where:** Dashboard → Authentication → Providers / Settings → "Allow new users to sign up"
      (`enable_signup`), and the email OTP / magic-link sign-in toggle.
- [ ] **Required:** Record the current value of `enable_signup` — it **cannot** be turned off (a
      known open gap, L1-1, would make signup unusable if disabled; that's not this session's
      problem to fix).
- [ ] **Magic-link / OTP sign-in: leave ON. Do NOT disable it.** The A-5 doc's original item 3
      suggested turning this OFF if separable from signup. **That recommendation was withdrawn**
      by `cto`'s §20.4 ruling (C-5): *"withdrawn, per `cybersecurity-architect`'s recommendation —
      do not disable magic-link sign-in in the console; it would silently break this branch's
      revocation sign-out."* Rely instead on the code-level type allow-list (A-17) as the control
      here, not a console toggle.

### Item 4 — Exposed schemas, public tables, storage buckets, realtime publications
- [ ] **Where:** Dashboard → Project Settings → API → "Exposed schemas"; also check Table Editor
      for anything in `public`, Storage for buckets, and Database → Replication for Realtime
      publications.
- [ ] **Required:** No `app` schema exposed via the API. `public` schema either empty or RLS-on
      with no `anon`/`authenticated` grants. No storage buckets. No Realtime publications.
- [ ] **Also run:** Dashboard → Advisors → Security Advisor. Record its output in full (don't just
      note "ran it" — paste or summarize the findings).

### Item 5 — Refresh-token rotation
- [ ] **Where:** Dashboard → Authentication → Settings → Sessions → "Refresh token rotation" and
      "Reuse interval."
- [ ] **Required:** Rotation ON. Reuse interval set to the minimum the dashboard allows. Record
      the exact value.

### Item 6 — JWT expiry and session time-box / inactivity timeout
- [ ] **Where:** Dashboard → Authentication → Settings → "JWT expiry limit" (access-token TTL),
      and Sessions → time-box / inactivity timeout (availability is plan-dependent).
- [ ] **Required:** JWT expiry ≤ 3600 seconds (record the actual value).
- [ ] **Required:** Session time-box ≤ 90 days, and inactivity timeout set, **if your plan offers
      either setting**. If your plan does not expose one or both, record that unavailability
      explicitly — do not leave it blank.
- [ ] **Why 90 days and not just "≤ 12 months":** the incident doc's later sections (§15.2, §19.5)
      state the audit-retention residual only requires time-box ≤ 12 months. The A-5 doc's
      original item 6 sets a stricter bar, ≤ 90 days, which already satisfies the looser 12-month
      requirement — use 90 days, the stricter value governs.

### Item 7 — URL Configuration: Site URL and redirect allow-list
- [ ] **Where:** Dashboard → Authentication → URL Configuration → Site URL and Redirect URLs.
- [ ] **Required:** Exact URLs only — **no wildcards** on any host you don't control (e.g., do not
      allow-list `*.vercel.app/**`). Must include the production web password-reset redirect URL
      (`PASSWORD_RESET_REDIRECT_URL_WEB`).
- [ ] **Also do while you're in here (§20.3 step 3, same session, not technically one of the 12
      numbered items but bundled into this console pass):** confirm the web reset-redirect URL has
      actually been added — §8a/§18.2 note "no record either was ever actually done" — and confirm
      `EMAIL_VERIFICATION_REDIRECT_URL_WEB` is set correctly in **Render production** (and
      staging, if one exists).

### Item 8 — Rate limits
- [ ] **Where:** Dashboard → Authentication → Rate Limits.
- [ ] **Required:** Tighten sign-in/sign-up, token refresh, "email sent," and OTP/verify limits to
      the tightest values compatible with your actual traffic volume. Record each value you set.
      This is currently **the only limiter** standing between the published anon key and abuse of
      the direct GoTrue password grant (A-8) — treat it as load-bearing, not cosmetic.
- [ ] Note the user-facing copy in the web app currently claims "~30 emails/hour" — check your
      actual configured value matches what the UI tells users, or update one to match the other.

### Item 9 — MFA factor types and enrolment
- [ ] **Where:** Dashboard → Authentication → Multi-Factor Authentication.
- [ ] **Required:** TOTP enrol + verify must stay **enabled** — the backend depends on it. Do not
      disable TOTP as a response to A-19; that is not a valid fix and would break the product.
- [ ] **Required:** Check whether any non-TOTP factor types (phone, WebAuthn) are enabled. The
      product only ever issues TOTP factors; if phone/WebAuthn enrolment is possible directly
      against GoTrue, that's an open path for a GoTrue-direct factor enrolment that the backend's
      reconciliation currently can't see (A-19). **Confirm those factor types are disabled**, or
      flag back to `authentication-engineer` if they can't be.
- [ ] Record max factors per user and whether an MFA-verification hook is configured.

### Item 10 — Minimum password length and leaked-password protection
- [ ] **Where:** Dashboard → Authentication → Settings → "Minimum password length" and
      "Leaked password protection" (HaveIBeenPwned check).
- [ ] **Required value — SUPERSEDED, use this one:** set the floor to **10**, not 14. Turn
      **leaked-password protection ON**.
  - The A-5 doc's original item 10 said minimum length = 14. **That was superseded** by `cto`'s
    §20.4 ruling (C-9, option (b)): *"Set the Supabase floor to 10 now, with leaked-password
    protection; the backend stays the only authority for 14 on staff accounts."* The reasoning: no
    legitimate web/mobile flow writes passwords directly to Supabase anymore (after this branch),
    so the console floor is now only a backstop against the direct-to-Supabase bypass path, not
    the product's real policy floor — the backend enforces 14 for staff and whatever the current
    customer minimum is for customers.
  - **Condition attached to this ruling, for the record (not your action item, `backend-architect`
    owns it):** Supabase's `weak_password` error must get mapped to the backend's
    `VALIDATION_ERROR` response shape. If you notice raw/unmapped Supabase errors surfacing to
    users after lowering this floor, flag it — it means that mapping hasn't shipped yet.
  - **Leaked-password protection may require a paid Supabase plan.** If your project's current
    plan doesn't offer it, this is a cost decision for you as the owner, not something
    `security-engineer` can authorize. Record whichever way you decide, with the reason.

### Item 11 — API key format
- [ ] **Where:** Dashboard → Project Settings → API.
- [ ] **Check:** whether this project is on **legacy** `anon`/`service_role` keys, or the newer
      **publishable**/**secret** key format, and whether the legacy anon key can be disabled
      independently of the newer keys.
- [ ] **Required:** Record which format you're on. This determines whether retiring the published
      browser-facing anon key (ADR-0014 Phase 4, target 2026-11-30) is actually feasible as
      designed.
- [ ] **Before relying on this for anything:** verify that the backend's own Supabase calls use
      the **service-role** key as the `apikey` header (this is asserted in the incident record
      against `backend/src/lib/supabase.ts:171-172`, but verify against your actual deployed
      backend config/environment, not just the code citation) — if so, disabling the
      browser-facing anon key later should not break the backend. Don't act on this now; just
      confirm the premise and record it for whoever executes Phase 4.

### Item 12 — Customer-account audit log sweep
- [ ] **Where:** SQL Editor, same `auth.audit_log_entries` table as Part 1.
- [ ] **Required:** Extend the same style of query from Part 1, but now across **customer**
      accounts (not just staff), looking for `factor_in_progress` / `mfa_factor_*`,
      `user_updated`, and `token_refreshed` events that have **no corresponding backend audit
      event**. This is a retrospective check for abuse of the console items above (secure
      password/email change, MFA) rather than a forward-looking control.
- [ ] This is a larger query than Part 1's staff-only sweep (it's every customer account, not a
      short staff roster) — if you don't have a ready way to diff "GoTrue event with no matching
      backend audit row," flag this back to `security-engineer`/`backend-architect` to build the
      diff query rather than eyeballing a large result set. It is acceptable to timebox this item
      and report "ran the query, found N candidate rows, handed them to `security-engineer` for
      triage" rather than fully triaging it yourself in this session.
- [ ] **Report the coverage window** for this query the same way Part 1 required — i.e., how far
      back `auth.audit_log_entries` actually goes for this project, since that bounds what this
      item can tell you.

---

## Part 3 — close out

- [ ] Confirm every checkbox above is checked, every "Required" value either matches or has an
      explicit, recorded reason it doesn't (e.g., plan-tier limitation).
- [ ] Hand your recorded values to `devops-engineer` to write into `supabase/README.md` as the
      SR-5 baseline (per the A-5 doc §7 instruction).
- [ ] Hand your A-6 results and A-22 results to `security-engineer`, who will append the findings
      to `INC-003-web-password-reset-control-bypass.md` as a new dated section (do not edit
      existing sections — this document is append-only).
- [ ] Confirm the date you completed this session. **Deadline: 2026-10-22** — per §19.4's Q-1
      condition (ii) and §20.5, the current acceptance of the published-anon-key residual risk
      (A-9) lapses automatically if this slips past that date, and the decision returns to `cto`.

---

*Prepared by `security-engineer`, 2026-10-16, on branch `claude/nice-bardeen-0j5x8y`. This is a new
file, not an edit to the incident record — it does not carry the incident doc's append-only
constraint itself, but it cites that document throughout and should be kept in sync with it if
rulings change. Not committed — left for review per instruction.*
