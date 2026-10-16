# INC-003 A-28 — Measuring and setting `TRUST_PROXY_HOPS` on Render (owner runbook)

**Status:** A-28 is **OPEN**. This runbook describes how to measure the right value. Nothing here has been run
against a deployed service yet. The code it relies on is described in
[`INC-003-web-password-reset-control-bypass.md`](INC-003-web-password-reset-control-bypass.md) §25, with the
Stage 8 conditions in §26 addressed in §27.
**Authored:** `backend-engineer`, 2026-10-16. **Revised** 2026-10-16 per INC-003 §26 (C-1 to C-5). Superseded
statements are kept struck through and marked VOID so the change can be audited.
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
- **Too high**: `req.ip` is an entry the **client wrote itself**. ~~Render appends to XFF without stripping what the
  client sent, so any caller can then pick their own IP.~~ *[VOID 2026-10-16, `backend-engineer` — superseded per INC-003 §26 §26.4(1); replacement follows. Original text retained struck through for audit.]*
  **Assumption, unverified until probe 3 (§3) confirms it:** Render appends to XFF without stripping what the
  client sent. If that holds, any caller can pick their own IP under a too-high count. That defeats per-IP rate
  limiting completely (each request can claim a fresh IP) and makes audit IPs actively misleading. This is worse
  than too low.
- **Never respond to an alert or a symptom by incrementing `TRUST_PROXY_HOPS`; re-measure per §3.** A non-public
  `req.ip` can also be caused by a count that is too *high* combined with a client-supplied private XFF entry
  (INC-003 §26 K-3).
- **Never set it to `true`**, and never pick a number from a forum post or by trial and error in production.
  Render does not document its hop count (a community report says 3). Measure it.

## 2. Prerequisites

1. **The backend build includes the A-28 code.** Check the deploy logs for this startup line:
   `[startup] Express 'trust proxy' = <n> hop(s) (TRUST_PROXY_HOPS). Verify via GET /api/v1/internal/diagnostics/proxy-trust ...`
   If the line is missing, the deployed build is older than this change.
2. **An internal service credential.** The endpoint uses the existing `X-Internal-Service-Key` mechanism (SR-13,
   `backend/src/middleware/internal-service-auth.ts`), configured by the `INTERNAL_SERVICE_KEYS` env var in Render.
   The format is a comma-separated list of `callerName:key` pairs. ~~Recommended: add a dedicated
   `ops-diagnostic:<new random key>` entry so the diagnostic shows up under its own caller name.~~ ~~Then remove it
   again after §6 if you don't need it.~~ *[VOID 2026-10-16, `backend-engineer` — superseded per INC-003 §26 C-1; replacement follows. Original text retained struck through for audit.]*
   **Required:** add a dedicated `ops-diagnostic:<new random key>` entry. The caller name must be exactly
   `ops-diagnostic`: the route allows only that caller, and any other valid key gets **403**. Since INC-003 §27,
   allowlists are enforced per route, so this key **cannot** call `/internal/policies/:id/activate`,
   `/internal/accounts/:id/status` or `/api/internal/health` (those return 403). Generate the key locally, e.g.
   `openssl rand -base64 36 | tr -d '/+=' | cut -c1-40`, and enter it only in the Render dashboard. Note the time
   you add it. **Removing it after §6 is mandatory** (§6 step 5). If `INTERNAL_SERVICE_KEYS` is empty, the endpoint
   returns **503** (fails closed). Repeated wrong keys from one IP get **429** for up to 5 minutes (20 failures per
   5 minutes). While A-28 is open that bucket is shared across Render's proxy hop, so wait out a 429 rather than
   retrying.
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

# 3. Spoof-resistance probe: same call, with a fake leftmost XFF entry (RFC 5737 documentation address;
#    it classifies as "documentation", so it can never be mistaken for your public IP).
curl -4 -s "$BASE/api/v1/internal/diagnostics/proxy-trust" \
  -H "X-Internal-Service-Key: $INTERNAL_KEY" \
  -H "X-Diagnostic-Expected-Client-Ip: $MY_IP" \
  -H "X-Forwarded-For: 203.0.113.99" | jq .
```

**Sampling (INC-003 §26 C-2(iii)).** Take **at least five samples of probe 2 + probe 3 on each of at least two
different client networks**, for example home broadband and a phone hotspot. Re-run step 1 (`MY_IP`) whenever you
switch network. Each `curl` command opens a fresh connection; don't use a client that reuses connections. Record
every sample's `forwardedForEntryCount`, `suggestedTrustProxyHops`, `rightmostPublicIndex` and `notes` (field
values only, never IPs).

The endpoint allows 10 requests per 60 seconds per caller, so spread the samples over a few minutes. It writes nothing and changes no setting. Its log line
records only the caller name, the entry count, and the configured, suggested, and rightmost-public values. It never
logs the chain or any address.

## 4. Read the result

| Field | Meaning |
|---|---|
| `configuredTrustProxyHops` | What is live now (`TRUST_PROXY_HOPS`). |
| `forwardedForEntryCount` | How many XFF entries arrived. Hard requirements in §4 below. |
| `socketRemoteAddressClass` | Class of the TCP peer (expect `private`; it is Render's last hop). |
| `chainClassesFromRight` | Classes only. Index 0 = socket peer, index *k* = *k*-th XFF entry from the right. |
| `reqIp.class` / `reqIp.value` / `reqIp.matchesExpectedClientIp` | What `req.ip` is under the **current** setting. `value` is shown only if public. |
| `expectedClientIpPositionFromRight` = **`suggestedTrustProxyHops`** | The index at which your own IP sits. This is the hop count that makes `req.ip` your real address. |
| `rightmostPublicIndex` | Index of the first public address counting from the server outward. An independent cross-check. |
| `currentSettingMatchesSuggestion` | `true` once the setting is right. |
| `notes` | Machine-readable caveats (see below). |

~~**Accept the suggestion only if all of these hold:**~~

~~1. `suggestedTrustProxyHops` is a number (not `null`). It must be **the same in probe 2 and probe 3**.~~
~~2. `suggestedTrustProxyHops == rightmostPublicIndex` in probe 2. In probe 3, `rightmostPublicIndex` should still
   equal it too, because the spoofed address sits further left.~~
~~3. Every entry in `chainClassesFromRight` below the suggested index is non-public (`private`, `shared_cgnat`,
   `loopback`, and so on).~~
~~4. You get the same result on at least **three calls spread over a few minutes**, ideally after a redeploy or
   restart as well, so a different Render edge or proxy node gets exercised.~~

*[VOID 2026-10-16, `backend-engineer` — superseded per INC-003 §26 C-2 / §26.3 / §26.4(2); replacement follows. Original text retained struck through for audit.]* (A restart or redeploy changes the origin instance, not the edge path
your connection takes, so it does not exercise a different edge.)

**Accept the suggestion only if every one of these hard requirements holds in every sample:**

1. **Probe 2** (no client XFF): `suggestedTrustProxyHops`, `rightmostPublicIndex` and `forwardedForEntryCount`
   are **all the same number**, and it is not `null`.
2. **Probe 3** (spoofed leftmost entry):
   - `forwardedForEntryCount` is probe 2's count **+ 1**. That confirms the §1 assumption that Render appends
     without stripping. Alternatively it **equals** probe 2's count; record that as **"Render strips"** in the
     INC-003 record.
   - `suggestedTrustProxyHops` and `rightmostPublicIndex` are **unchanged** from probe 2.
   - Nothing else differs from probe 2 except `chainClassesFromRight` gaining one leftmost `documentation` entry
     (or not, if Render strips).
3. Every entry in `chainClassesFromRight` below the suggested index is non-public (`private`, `shared_cgnat`,
   `loopback`, and so on).
4. All samples (≥ 5 per network, ≥ 2 networks, fresh connections) give the **same** number.

**Stop and escalate (`backend-architect` + `devops-engineer`) instead of changing anything if:**

- `notes` contains `expected_client_ip_not_in_chain`. Usual causes: IPv4/IPv6 mismatch (re-run with `-4` for both
  the lookup and the call), VPN or NAT, or a stale `MY_IP`.
- `notes` contains `suggestion_disagrees_with_rightmost_public`. A public address sits between you and the service
  (a CDN, or a second proxy layer).
- `notes` contains `configured_hops_exceeds_entry_count`. The live count is already too high. Escalate now; do
  not wait for the rest of the measurement.
- **Any disagreement in any sample**: between calls, between networks, between probe 2 and probe 3, or between
  the three numbers in requirement 1. **Do not pick the larger value or the more frequent value.** Different edge
  paths with different hop counts need an architectural answer (see INC-003 §26 K-8), not a number.

## 5. Set the value

1. In the Render dashboard, open the backend service → **Environment** → set `TRUST_PROXY_HOPS` to the measured
   `suggestedTrustProxyHops`. Do this **per service**: production `td-it-solution-insurance` from the prod
   measurement, and the staging API service from its own measurement. Since INC-003 §27 (C-5), the backend
   **refuses to start** with a value above 5. If the measurement says more than 5, escalate; don't work around it.
2. Make the same change in the blueprint so the next blueprint sync doesn't revert it: `render.yaml` and/or
   `render-staging.yaml`, `TRUST_PROXY_HOPS` `value:`. Commit through normal review. A change to this value is a
   cross-cutting middleware change (see §7 on the Stage 8 gate).
3. Redeploy and confirm the startup line shows the new value.

## 6. Confirm afterwards

1. Re-run probe 2 and probe 3. You should see `currentSettingMatchesSuggestion: true`,
   `reqIp.matchesExpectedClientIp: true` and `reqIp.class: "public"` in **both**. Probe 3 is the important one:
   ~~if `reqIp.value` is `203.0.113.99`, the setting is **too high**.~~ *[VOID 2026-10-16, `backend-engineer`:
   since §27, `203.0.113.99` classifies as `documentation`, so `reqIp.value` is `null` for it.]* If probe 3 shows
   `reqIp.class: "documentation"` or `reqIp.matchesExpectedClientIp: false`, the setting is **too high**. Revert
   immediately and escalate.
2. **Audit log:** do a fresh login (or another audited action) from the known machine. Then check the newest
   `app.account_audit_log` rows (read-only, per the C-2 access controls in INC-003 §21). `ip_address` should be
   your public IP, not `10.x`. Over the next day, new rows should show a spread of public addresses rather than a
   handful of `10.x` values. Rows written before the change keep their proxy IPs, and the §24.3 caveat still
   applies to them.
3. **Alerts:** ~~search the Render logs for `[ALERT:trust_proxy_misconfigured]`. Before the fix it fires at most
   once per 15 minutes per instance whenever proxied traffic resolves to a non-public `req.ip`. After the fix it
   should stop entirely. If it keeps firing, re-measure. Note that the alert only catches a count that is **too
   low**. A count that is too high cannot be detected from a single request; only probe 3 catches it.~~
   *[VOID 2026-10-16, `backend-engineer` — superseded per INC-003 §26 K-2 / K-3 / C-3 / C-4; replacement follows. Original text retained struck through for audit.]*
   Search the Render logs for both tags. Each fires at most once per 15 minutes per instance:
   - `[ALERT:trust_proxy_misconfigured]`: proxied traffic resolved to a non-public `req.ip`. Usually the count is
     too low. It **may also indicate a count that is too HIGH combined with a client-supplied private XFF entry.**
   - `[ALERT:trust_proxy_too_high]`: a proxied request carried fewer XFF entries than `TRUST_PROXY_HOPS`. Ordinary
     clients send no XFF, so they arrive with exactly Render's hop count. This alert therefore means the configured
     count exceeds what Render adds on at least one path, and clients may be able to choose `req.ip`. Treat it as
     urgent.

   After the fix, **both** should stop entirely. **Never respond to either alert by incrementing (or decrementing)
   `TRUST_PROXY_HOPS`; re-measure per §3.**
4. **Remove the `ops-diagnostic` credential from `INTERNAL_SERVICE_KEYS`. This is mandatory, not optional**
   (INC-003 §26 C-1). Record the add and remove times (never the key) in the INC-003 record. Then confirm there are
   no `privileged_data_access` rows in `app.account_audit_log` with `actor_service = 'ops-diagnostic'` in that
   window. Per-route scoping should make such rows impossible; the check confirms it.

## 7. Closing A-28

A-28 closes only when all of these are recorded as a dated section in INC-003:

- the measured values, as field values only and without IP addresses, for each environment;
- the setting change;
- the §6 confirmation;
- a Stage 8 review of the code in INC-003 §25 and of the new value by `cybersecurity-architect` /
  `security-engineer`;
- Stage 8 re-review of the §27 fixes (INC-003 §26 C-1, C-3, C-5) and the separate value sign-off (§26 C-6).

## 8. When to re-check

Repeat §3–§6 after any of the following:

- a Render plan change (e.g. Free → paid), a region move, or a custom domain being added or removed;
- putting a CDN or WAF (e.g. Cloudflare) in front of the service. This **adds** a hop, and with Cloudflare the
  right answer may be its own header rather than a bigger count; escalate before changing anything;
- Render announcing load-balancer or edge changes;
- `[ALERT:trust_proxy_misconfigured]` or `[ALERT:trust_proxy_too_high]` reappearing in the logs (re-measure; never
  increment);
- in any case, at least once a quarter as part of routine security hygiene.
