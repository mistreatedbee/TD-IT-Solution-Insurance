# Feature 020 Protection Checklist - Security Review (Stage 8, security-engineer)

Scope: backend 03fd32b, mobile 266e514. Date 2026-11-13. Read-only review, no code changed.

## Findings

| # | Sev | Area | Finding |
|---|-----|------|---------|
| F1 | Medium (condition) | Abuse / upstream | Every call runs `resolveMfaStatus`: `admin.generateLink(magiclink)` + GoTrue `/verify` (creates a real GoTrue session) + factor list. No cache; limiter is `DEFAULT_AUTHENTICATED_LIMIT` (100/min/account). A buggy client (focus refetch loop) or a hostile customer can mint ~100 GoTrue sessions/min, load Supabase auth, and each generateLink overwrites the user's pending magic-link/recovery token (can invalidate an in-flight email link). Rate limit is per account, so no cross-account amplification. |
| F2 | Low | Staleness | `authenticate` trusts JWT claims (<=10 min staleness) and does not re-read account status. Suspended/deactivated accounts can read their own booleans for that window. Same as other read routes; response carries no PII. Accepted. |
| F3 | Info | Fail behaviour | Supabase down -> mfa item `unavailable`, excluded from points (honest, fail-safe). Mongo down -> 500 via error handler (no wrong score). Missing profile -> items "not done" (correct). |
| F4 | Info | Authz/IDOR | Subject is `req.auth.accountId` only, no params, `requireUserType('customer')`, `Cache-Control: private, no-store`. Account-not-found -> 401. Clean. |
| F5 | Info | Leaks/logging | Response is booleans/points/static copy. Transient token is a local variable, never logged/returned/persisted. No log statements in the route or libs. Errors flow through the standard handler. |
| F6 | Info | Mobile | Query key `protection-checklist` excluded from persistence (`persistPolicy.ts`). Flag is `false` in all four eas.json profiles; true only in `.env.example`/local. Disclosure is rendered from the server string on every render and is not dismissible; unavailable items show neutral copy. No claim/pricing/cover wording found in the card. |
| F7 | Info | OWASP API | API1 BOLA ok; API2 ok; API3 ok (no PII); API4 see F1; API5 ok (customer only); API6 ok; API8/9 ok (route mounted, flag-gated in UI only, read-only). |

## Required condition (F1)

Before enabling `EXPO_PUBLIC_FEATURE_PROTECTION_CHECKLIST` in any distributed profile, add either:
1. a dedicated tight limiter on this route (suggest 6/min/account), and
2. a short per-account KV cache of the MFA result (suggest 60-120 s TTL, boolean only, never the token).

Also: the mobile hook should set `staleTime` >= 60 s and `refetchOnWindowFocus: false`. Confirm in QA that the client does not refetch in a loop.

Optional follow-up: consider replacing the magiclink mint with `auth.admin.mfa.listFactors(userId)` (service-role, no session creation), which removes the session churn and the token-overwrite side effect. Needs cybersecurity-architect agreement only if it changes the trust boundary (it should not).

## Verdict

- Backend: CLEAR-WITH-CONDITIONS (F1 limiter + cache before the flag goes on anywhere distributed; safe to leave dark as is).
- Mobile: CLEAR-WITH-CONDITIONS (flag must remain false in eas.json until the backend F1 condition is met; set hook staleTime/no focus refetch).
