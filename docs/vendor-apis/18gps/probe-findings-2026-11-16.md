# 18gps platform — read-only probe findings, 2026-11-16

Who: `cto`, acting on behalf of `integration-architect` (evaluation only, per scorecard §6:
scratch script, nothing merged into the ingestion path).
What: logged in once with the supplier-issued enterprise login, listed devices and latest
positions, listed sub-accounts, pulled seven days of alarms, logged out. No writes, no
commands sent, no device changed. Token redacted from every output; nothing persisted
except the summary below.

## 1. Transport and TLS

| Host | Result |
|---|---|
| `https://api.18gps.net` (documented production host) | **No TLS.** Port 443 resets the connection. |
| `http://api.18gps.net` | Works. Plaintext. |
| `https://apitest.18gps.net` and `http://` | Connection reset on both. Test host appears down. |
| `https://www.18gps.net/GetDataService.aspx?method=...` | **Works over TLS** and serves the same API, same responses. |

TLS certificate on `www.18gps.net`: wildcard DV cert issued by "Xcc Trust DV SSL CA"
(Beijing Xinchacha), valid 2026-05-06 to **2026-11-21**. It expires five days after this
probe. Watch whether it is renewed; an expired cert would break any HTTPS integration.

Hosting: `api.18gps.net` and `www.18gps.net` resolve to 183.36.25.41-43 (China Telecom,
Guangdong). The U907's default report server 122.9.115.220 is a Huawei Cloud host in China.
**All device location data therefore lands in mainland China first.** This is a POPIA
cross-border transfer and needs a `compliance-specialist` ruling and a data-processing
agreement before any customer device is activated on this platform.

Answer to brief §7 Q1: HTTPS exists, but only on the `www` host and only with a DV cert
from a CA that is not in every default trust store. Verify the chain validates from Render
before relying on it.

## 2. Authentication

- `loginSystem` with `LoginType=ENTERPRISE` succeeded; `grade: 4`.
- Password travels in the query string / form body as documented. No API key, no OAuth.
- The same login works on the plaintext host, so a credential leak over HTTP is one
  misconfigured base URL away. The adapter must hard-code the HTTPS host and refuse
  `http://`.

## 3. What the account contains

The login the supplier gave is **not a TD IT account. It is the supplier's own master
engineering account.**

| Fact | Value |
|---|---|
| Direct devices under the login | **602** |
| Sub-accounts | **36**, holding a further **336** devices |
| Distinct `product_type` values | 30 (GT06 180, U9 115, M728 78, Y2 76, M119 48, Y6 29, …) |
| Devices that have **never reported** (`heart_time` 0) | **466** of 602 |
| Devices online at probe time (< 25 min) | **0** |
| Devices with a position inside South Africa | **0** |

Every positioned device sits in Shenzhen (113.8 E, 22.5 N). Device names include the
supplier's lab tests ("rooftop high-temperature waterproof test", "solar charging test")
and other customers' deployments ("Y2-Ghana-…", "E502-Brasil-…", "E502 Ecuador",
"U10-Brasil-…"). Sub-account names are phone numbers and dealer codes.

The U907 manual's device appears on the platform as `product_type: "U9"` (115 units, most
never activated, names like `U94040012945`). **TD IT's arrived units are probably among the
never-activated U9 rows, or are not on the platform at all.** Confirmation needs the IMEIs
printed on the physical units.

## 4. API behaviour confirmed

- Empty `mapType` returns raw WGS84 as the brief predicted (brief §3 rule 3 confirmed).
- Latest-position record now has 34 columns (indices 0–33, through `extendedState`), more
  than the 2021.5 document's 25. The adapter must read by `key` name, never by fixed index.
- `statenumber` carries battery (field 5) and GSM level (field 8) for the U9 units that
  have reported (e.g. `100` battery, `50` GSM on an E502 U9). So **battery and signal are
  available** for this device family, answering brief §7 Q5 for U9 at least.
- Alarm poll works; 13 alarms in the last 7 days, types 93 (ignition on) and 82 (engine
  off) on one device. Alarm feed is account-wide, not per-device.
- `getUserTypes` (Part 3) returned an empty list: consistent with the brief's caveat that
  Part 3 admin calls are not supported on the hosted platform.
- `getDeviceList` and the batch position call return the entire account in one response
  (hundreds of KB). No paging. At fleet scale this is a polling cost, not just latency.

## 5. Security and compliance consequences (hard blockers)

1. **Do not use this login anywhere.** It exposes the supplier's and other customers'
   device locations to us, and ours to anyone else the supplier hands it to. Using it in
   any TD IT environment would make TD IT a processor of third parties' location data
   with no lawful basis. TD IT needs its **own enterprise account** (or a dedicated
   sub-account with only our IMEIs), provisioned by the supplier.
2. **The credential was shared in a chat message.** Treat it as exposed. Ask the supplier
   to rotate it. It is also a weak password pattern (name + digits).
3. **Data residency.** China-hosted platform, DV cert, plaintext production host. This
   needs `compliance-specialist` (cross-border, DPA, retention) and
   `cybersecurity-architect` (trust boundary for `assertionMode: device_attested` per
   ADR-0009) before Stage 8 can pass.
4. **No push.** Alarms and positions are polled. For a theft alert this is a latency floor
   of our poll interval plus the device's upload interval, plus sleep behaviour
   (`u907-device-notes.md` §4).

## 6. What this changes for the scorecard

The scorecard's §9 Standing Decision Rule defaulted to Digital Matter / Teltonika after
2026-10-05. Physical U907 units are now in hand, so the practical question is no longer
"which vendor" in the abstract but "do we build the first recovery pilot on this hardware,
and if so via the vendor platform or by self-hosting the device protocol". ADR-0018 frames
that choice. This probe does not decide it.

## 7. Delivered-unit IMEI check (appended 2026-11-16, later the same day)

The business supplied the IMEIs of the two delivered units: `869890083100051` ("Device One")
and `869890083130629` ("Device Two"). A second read-only probe searched the master account's
**direct** device list only. Sub-accounts were deliberately not enumerated: they belong to the
supplier's other customers and reading them is not ours to do.

- **Neither IMEI is in the master account's direct list.** They are either in one of the 36
  sub-accounts, or not registered on the platform at all. Only the supplier can say which.
- The one device in the direct list sharing the `86989008` IMEI prefix is registered as
  model **GT06N**. The 18gps catalogue treats the GT06 family as its most common device
  protocol (180 GT06 plus 8 GT06N units in this account). If the delivered U907 units speak a
  GT06-family protocol, Route B in ADR-0018 gets much cheaper: open-source parsers for GT06
  exist and the "protocol document" ask to the supplier becomes "confirm it is GT06 and which
  variant". **[VERIFY WITH VENDOR]**: the prefix match is a hint, not proof.

Consequence for ADR-0018 open item 6: the IMEIs are now known; the remaining ask to the
supplier is "under which account are these two IMEIs registered, and what protocol do they
speak". Nothing else in §§1–6 changes.
