# INC-003 A-28 — Measuring and setting `TRUST_PROXY_HOPS` on Render (owner runbook)

**Status:** A-28 is **OPEN**. This runbook describes how to measure the right value. Nothing here has been run
against a deployed service yet. The code it relies on is described in
[`INC-003-web-password-reset-control-bypass.md`](INC-003-web-password-reset-control-bypass.md) §25.
**Authored:** `backend-engineer`, 2026-10-16.
**Contains no secrets.** Wherever a credential appears below it is a placeholder (`$INTERNAL_KEY`). Never paste a
real key into this file, a ticket, or chat.

---

## 1. Why this matters, and what not to do

`app.set('trust proxy', TRUST_PROXY_HOPS)` tells Express how many right-hand `X-Forwarded-For` (XFF) entries
were added by proxies we trust. Express takes `req.ip` from that position. Every per-IP rate limit (SR-7, via
`clientIp()` in `backend/src/middleware/rate-limit.ts`) and every `app.account_audit_log.ip_address` value comes
from `req.ip`.

- **Too low** (the current symptom, at `1`): `req.ip` is one of Render's internal `10.x` hops. All clients behind
  the same proxy node share one rate-limit bucket, and audit IPs are useless.
- **Too high**: `req.ip` is an entry the **client wrote itself**. Render appends to XFF without stripping what the
  client sent, so any caller can then pick their own IP. That defeats per-IP rate limiting completely (each request
  can claim a fresh IP) and makes audit IPs actively misleading. This is worse than too low.
- **Never set it to `true`**, and never pick a number from a forum post or by trial and error in production.
  Render does not document its hop count (a community report says 3). Measure it.

## 2. Prerequisites

1. **The backend build includes the A-28 code.** Check the deploy logs for this startup line:
   `[startup] Express 'trust proxy' = <n> hop(s) (TRUST_PROXY_HOPS). Verify via GET /api/v1/internal/diagnostics/proxy-trust ...`
   If the line is missing, the deployed build is older than this change.
2. **An internal service credential.** The endpoint uses the existing `X-Internal-Service-Key` mechanism (SR-13,
   `backend/src/middleware/internal-service-auth.ts`), configured by the `INTERNAL_SERVICE_KEYS` env var in Render.
   The format is a comma-separated list of `callerName:key` pairs. Recommended: add a dedicated
   `ops-diagnostic:<new random key>` entry so the diagnostic shows up under its own caller name. Generate the key
   locally, e.g. `openssl rand -base64 36 | tr -d '/+=' | cut -c1-40`, and enter it only in the Render dashboard.
   Then remove it again after §6 if you don't need it. If `INTERNAL_SERVICE_KEYS` is empty, the endpoint returns
   **503** (fails closed).
3. **A machine whose public IP you know** and that reaches the service directly: your own laptop on home or office
   internet. **Not** through a VPN, corporate proxy, or another cloud host that could add its own XFF hop.

## 3. Run the measurement

Do this separately for **production** and for **staging** (if a staging service is deployed). Hop counts can
differ by service, plan, or region, so don't copy one environment's result to the other.

```bash
# Production backend (per render.yaml). For staging, use the staging API service's URL from the Render
# dashboard (service td-it-insurance-api-staging in render-staging.yaml).
BASE=https://td-it-solution-insurance.onrender.com

# Read the key into a shell variable without echoing it or saving it to shell history.
read -rs INTERNAL_KEY; export INTERNAL_KEY

# 1. Your own public IPv4. Use -4 here and below so the address family matches.
MY_IP=$(curl -4 -s https://api.ipify.org); echo "$MY_IP"

# 2. Plain measurement.
curl -4 -s "$BASE/api/v1/internal/diagnostics/proxy-trust" \
  -H "X-Internal-Service-Key: $INTERNAL_KEY" \
  -H "X-Diagnostic-Expected-Client-Ip: $MY_IP" | jq .

# 3. Spoof-resistance probe: same call, with a fake leftmost XFF entry (RFC 5737 documentation address).
curl -4 -s "$BASE/api/v1/internal/diagnostics/proxy-trust" \
  -H "X-Internal-Service-Key: $INTERNAL_KEY" \
  -H "X-Diagnostic-Expected-Client-Ip: $MY_IP" \
  -H "X-Forwarded-For: 203.0.113.99" | jq .
```

The endpoint allows 10 requests per 60 seconds per caller. It writes nothing and changes no setting. Its log line
records only the caller name, the entry count, and the configured, suggested, and rightmost-public values. It never
logs the chain or any address.

## 4. Read the result

| Field | Meaning |
|---|---|
| `configuredTrustProxyHops` | What is live now (`TRUST_PROXY_HOPS`). |
| `forwardedForEntryCount` | How many XFF entries arrived. In probe 3 it should be one more than in probe 2. If it is the same, Render stripped your XFF; record that, since it is good news for spoofing. |
| `socketRemoteAddressClass` | Class of the TCP peer (expect `private`; it is Render's last hop). |
| `chainClassesFromRight` | Classes only. Index 0 = socket peer, index *k* = *k*-th XFF entry from the right. |
| `reqIp.class` / `reqIp.value` / `reqIp.matchesExpectedClientIp` | What `req.ip` is under the **current** setting. `value` is shown only if public. |
| `expectedClientIpPositionFromRight` = **`suggestedTrustProxyHops`** | The index at which your own IP sits. This is the hop count that makes `req.ip` your real address. |
| `rightmostPublicIndex` | Index of the first public address counting from the server outward. An independent cross-check. |
| `currentSettingMatchesSuggestion` | `true` once the setting is right. |
| `notes` | Machine-readable caveats (see below). |

**Accept the suggestion only if all of these hold:**

1. `suggestedTrustProxyHops` is a number (not `null`). It must be **the same in probe 2 and probe 3**.
2. `suggestedTrustProxyHops == rightmostPublicIndex` in probe 2. In probe 3, `rightmostPublicIndex` should still
   equal it too, because the spoofed address sits further left.
3. Every entry in `chainClassesFromRight` below the suggested index is non-public (`private`, `shared_cgnat`,
   `loopback`, and so on).
4. You get the same result on at least **three calls spread over a few minutes**, ideally after a redeploy or
   restart as well, so a different Render edge or proxy node gets exercised.

**Stop and escalate (`backend-architect` + `devops-engineer`) instead of changing anything if:**

- `notes` contains `expected_client_ip_not_in_chain`. Usual causes: IPv4/IPv6 mismatch (re-run with `-4` for both
  the lookup and the call), VPN or NAT, or a stale `MY_IP`.
- `notes` contains `suggestion_disagrees_with_rightmost_public`. A public address sits between you and the service
  (a CDN, or a second proxy layer).
- The suggestion differs between calls or between probe 2 and probe 3.

## 5. Set the value

1. In the Render dashboard, open the backend service → **Environment** → set `TRUST_PROXY_HOPS` to the measured
   `suggestedTrustProxyHops`. Do this **per service**: production `td-it-solution-insurance` from the prod
   measurement, and the staging API service from its own measurement.
2. Make the same change in the blueprint so the next blueprint sync doesn't revert it: `render.yaml` and/or
   `render-staging.yaml`, `TRUST_PROXY_HOPS` `value:`. Commit through normal review. A change to this value is a
   cross-cutting middleware change (see §7 on the Stage 8 gate).
3. Redeploy and confirm the startup line shows the new value.

## 6. Confirm afterwards

1. Re-run probe 2 and probe 3. You should see `currentSettingMatchesSuggestion: true`,
   `reqIp.matchesExpectedClientIp: true` and `reqIp.class: "public"` in **both**. Probe 3 is the important one: if
   `reqIp.value` is `203.0.113.99`, the setting is **too high**. Revert immediately and escalate.
2. **Audit log:** do a fresh login (or another audited action) from the known machine. Then check the newest
   `app.account_audit_log` rows (read-only, per the C-2 access controls in INC-003 §21). `ip_address` should be
   your public IP, not `10.x`. Over the next day, new rows should show a spread of public addresses rather than a
   handful of `10.x` values. Rows written before the change keep their proxy IPs, and the §24.3 caveat still
   applies to them.
3. **Alert:** search the Render logs for `[ALERT:trust_proxy_misconfigured]`. Before the fix it fires at most once
   per 15 minutes per instance whenever proxied traffic resolves to a non-public `req.ip`. After the fix it should
   stop entirely. If it keeps firing, re-measure. Note that the alert only catches a count that is **too low**. A
   count that is too high cannot be detected from a single request; only probe 3 catches it.
4. Remove the temporary `ops-diagnostic` credential from `INTERNAL_SERVICE_KEYS` if you don't need it any more.

## 7. Closing A-28

A-28 closes only when all of these are recorded as a dated section in INC-003:

- the measured values, as field values only and without IP addresses, for each environment;
- the setting change;
- the §6 confirmation;
- a Stage 8 review of the code in INC-003 §25 and of the new value by `cybersecurity-architect` /
  `security-engineer`.

## 8. When to re-check

Repeat §3–§6 after any of the following:

- a Render plan change (e.g. Free → paid), a region move, or a custom domain being added or removed;
- putting a CDN or WAF (e.g. Cloudflare) in front of the service. This **adds** a hop, and with Cloudflare the
  right answer may be its own header rather than a bigger count; escalate before changing anything;
- Render announcing load-balancer or edge changes;
- `[ALERT:trust_proxy_misconfigured]` reappearing in the logs;
- in any case, at least once a quarter as part of routine security hygiene.
