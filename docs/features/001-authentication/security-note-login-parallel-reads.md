# Security note: parallel reads on /auth/login (commit fa00053)

Author: security-engineer. Date: 2026-11-12. Scope: Stage 8 login-path review requested by CTO.
Files: backend/src/lib/login-lockout.ts, backend/src/routes/auth.ts.

## 1. Anti-enumeration / timing (OI-11 / SR-15)
Neutral to slightly better. Previously the locked path skipped the account lookup, so a locked
response was faster than an unlocked one and carried no DB latency. Now both paths perform the
lookup, so the lock response no longer differs by an account-lookup step. The unlocked path is
unchanged in structure: verifyPassword still runs only when the account exists, which is the
dominant known timing delta. OI-11/SR-15 live-timing verification stays OPEN; this change neither
closes nor widens it. The lookup result is never returned on the locked path.

## 2. Behavioural change (findByEmail runs when locked)
As committed, a DB fault in findByEmail rejected Promise.all and produced 5xx instead of
ACCOUNT_LOCKED. Not acceptable: a DB outage would mask an enforced lock and change the
client-visible response. Fix applied (uncommitted): Promise.allSettled in auth.ts. Rules:
lock-check rejection is rethrown (fail closed, 5xx); locked result wins over any lookup fault;
lookup fault is rethrown only when not locked (same as before). isLoginLocked's inner
Promise.all is fine: both peeks hit the same store, and a failure of either is a lock-check
failure that fails closed.

## 3. Rate-limit / lockout bypass
None found. The lock decision is computed from the same two counters and is still evaluated before
any credential check (verifyPassword, recordLoginFailure). The peeks are read-only, so no new
race on counters (the increment path is unchanged and atomic in the store). The per-IP
createRateLimiter middleware is untouched. Extra DB read per locked attempt is a minor
amplification (bounded by the per-IP limiter); acceptable.

## 4. Verdict: CLEAR-WITH-CONDITION
Condition: the allSettled tweak (section 2) is included before push. Verified:
`npx tsc --noEmit` clean; vitest auth.test.ts, session.test.ts, src/lib: 40 files, 401 tests pass.
Recommend adding a regression test (findByEmail throws while locked -> 429 ACCOUNT_LOCKED);
non-blocking.
