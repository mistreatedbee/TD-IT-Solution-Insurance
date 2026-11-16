# 18GPS Open API: Agent Brief (v2021.5)

> Source: vendor document `开放式Api接口` (2021.5 version), converted and translated for the TD IT Solution Insurance agents.
> Companion file: `18gps-open-api-endpoints.md` (all 61 endpoints, parameters and example responses).
> Sample logins, tokens and phone numbers from the source were removed (`<MDS>`, `<PASSWORD>` etc.). Do not reintroduce them.

## 1. What this is and what it is not

- It is the **developer API of a Chinese GPS tracking platform (`api.18gps.net`)**. A third party registers trackers (by IMEI) on the platform and then reads positions, alarms and history, and sends commands, through this API.
- **It is not a vendor decision.** The repo's open decision (`docs/organization/gps-hardware-vendor-scorecard.md`, Feature 009 Phase 4) is still open, and `18gps` is not on that scorecard. Treat this document as **one candidate platform's API** and as input to that scorecard.
- Build against a **vendor-agnostic adapter** (the existing `HardwareProvider` / `DeviceCapabilitySet` shape in `mobile/src/tracking/providers/`). Do not let `18gps` field names leak into domain models.
- Location ingestion stays behind its kill-switch and ADR-0009 (self-asserted location trust boundary) until the owner decides.
- **Big caveat on scope.** Part 2 (mobile / end-user API) is the part written for use against the hosted platform. Part 3 (PC / admin API: create customers, bulk-add devices by IMEI, move or delete devices, user admin) opens with this note: *"These are for operators who run their own platform on their own server. **Not supported for use against the 18gps platform.**"* The wording is short and could be read more than one way, so **[VERIFY WITH VENDOR]** which Part 3 calls work on the hosted platform, or whether TD IT would need its own hosted instance. Until confirmed, plan to onboard devices through the vendor's own tools or a manual import, and do not build on Part 3.
- Part 4 (web pages) returns ready-made follow and playback pages, which are not useful for a custom app.
- Anything marked **[VERIFY WITH VENDOR]** below is not answered by this document.

## 1b. Fit against the requirements Nextwave gave the supplier (chat of 22 June)

The requirement list sent to the supplier is checked here against what this document actually shows. "Not documented" means the document is silent, not that the platform cannot do it.

| Requirement | What the document shows | Verdict |
|---|---|---|
| Real-time GPS tracking | Latest-position calls by polling (`heart_time`, `datetime`, speed) | Yes, polled. Latency unknown |
| Cloud platform or REST API | HTTP GET/POST API on `api.18gps.net` | Yes (older ASMX style, query-string parameters) |
| **Webhooks or MQTT (preferred)** | None. Alarms are polled about every 10 seconds | **Gap, not documented** |
| 4G/LTE connectivity | Not covered (device level; models like GT03, T3, SC20 appear only as `product_type`) | **Not documented** |
| Geofencing | Circular fences only, plus enter/leave alarms (codes 3, 4) | Partial (no polygon fences documented) |
| Location history | Yes, 1000 points per call, paged by time | Yes. Retention period unknown |
| Remote configuration | `SendCommands`, with model-specific command names | Partial, depends on tracker model |
| **Device status (battery, signal)** | Not documented; only ignition, power, charging, door flags and an unexplained `electric` field | **Gap, not documented** |
| Multiple devices under one account | Yes, one enterprise account with devices and sub-accounts | Yes |
| **Secure API authentication** | Password and session token travel in the URL, examples use `http://`, token lasts 20 minutes, no API key or OAuth | **Weak. Needs vendor answer on HTTPS** |

Two further points from that chat:
- The supplier's contact asked **"How many V?"** and, on 23 June, clarified **"I mean the power supply voltage"**. The reply in the chat ("2", then "How many boards do we want?") answered a different question, and the chat shows **no answer about the power supply voltage**. This is an open question to the supplier and needs the owner or hardware person to decide (for example a vehicle 12 V supply, a battery, or USB 5 V).
- The requirement was a **compact board**. This document describes a **hosted tracking platform for finished trackers**, not a bare module. Ask whether the board the supplier proposes speaks to this platform, and whether the supplier can give **webhook or MQTT** access and a **newer API document**.

## 2. Mental model

| Concept | Meaning |
|---|---|
| **Enterprise account** ("单位", unit) | A login that owns devices and can have sub-accounts (customers). Login type `ENTERPRISE`. |
| **Device login** | A login as a single device. Login type `USER`. |
| **`mds`** | The session token. Almost every call needs it. Valid **20 minutes**, extended by each request. `errorCode 403` means it expired: log in again. |
| **`id`** from login | With `ENTERPRISE` it is the **enterprise id**; with `USER` it is the **device id**. Mixing these up is the most common bug. |
| **`macid` / `sim_id`** | The device number (8 to 15 characters, usually the IMEI). |
| **device id (`user_id`)** | A 32-character GUID. Positions and history need the `macid` to device-id mapping, so call **Get device list first**. |
| Hierarchy | Enterprise to sub-customers to devices. Device list returns only the account's **direct** devices, not sub-accounts'. |

Typical flow: `login` to get `mds` and `id` ➜ `getDeviceList` ➜ `getUserAndGpsInfoByIDsUtc` (latest position) or `getHistoryMByMUtcNew` (history) ➜ `queryLocalAlarmInfoUtc` (alarms) ➜ `SendCommands` (commands).

## 3. Rules and traps agents must respect

1. **Call from the backend only.** Login is a **GET with `LoginName` and `LoginPassword` in the query string**, and `mds` also travels in the query string. Never call this from the mobile app or browser, never log full URLs, and prefer POST (the document says GET or POST both work). Examples in the source use plain `http://`. **[VERIFY WITH VENDOR]** that `https://api.18gps.net` works. If it does not, do not send customer location data over it.
2. **Time:** every timestamp is a **13-digit UTC millisecond** value.
3. **Coordinates and `mapType`:** valid values are `GOOGLECN`, `BAIDU`, `GAODE`, `QQ`. These are Chinese map systems. For South Africa use an **empty `mapType`, which returns raw WGS84** (confirmed on the batch-position endpoint). **[VERIFY WITH VENDOR]** what `GOOGLECN` returns outside China before using it.
4. **Online / offline / parked / moving is calculated by you.** If `server_time - heart_time` is **over 25 minutes** the device is offline; otherwise speed `0` means parked and non-zero means moving. Parked duration is `server_time - datetime`, offline duration is `server_time - heart_time` (both in ms). Speed `-9` plus over 25 minutes offline means "not activated". Expiry is `server_time - expire_date`.
5. **`latest position` is an array.** The `key` object only explains the positions, and the real values are in `records[i][index]`. An empty `records` array means the account has no devices.
6. **Wi-Fi and cell-tower fixes** are in `ljingdu` / `lweidu`, GPS in `jingdu` / `weidu`. Pick by fix type. `precision` is the error radius for cell/Wi-Fi fixes (the value `10` means a plain GPS fix).
6b. **The `status` field is a string of flags**, in order: ignition (acc) on/off, device armed/disarmed, oil/electric cut on/off, charging, door open/closed, has a position fix, main power state, platform-armed (meaningless), stealth mode. `statenumber` is a comma-separated string that starts with mileage, fuel level, weight and temperature. These are the fields to watch for tamper and main-power-cut detection. A field called `electric` also exists but is **not explained** in the source, so do not assume it is a battery percentage.
7. **History is capped at 1000 points per call.** If you get exactly 1000, call again with the last returned time as the new start, until you get fewer than 1000.
8. **Alarms are polled, not pushed.** Live alarms come from a cache (150 for enterprise login, 60 for device login). Poll roughly every 10 seconds with `max_time` set to the latest alarm time you have seen. History comes from `alarmOperation` (Get alarm details).
9. **Commands are asynchronous.** `SendCommands` returns a `CmdNo` receipt, and the result comes from `GetCommandResults`. If the device is offline the command is queued ("USER_LEAVE") and runs when it reconnects. Common commands: `SAFEON` / `SAFEOFF` (arm / disarm), `PASSTHROUGH`, `GETVERSION`. Real command names vary per tracker model. Ask the vendor for the model list.
10. **Unbinding does not delete.** `unbundlingDevice` returns the device to the account that first added it, and a bind can find it again.
11. **Response shapes are not fully standard JSON.** Read the example per endpoint. Some are JSONP (`callback`), some return delimited strings (history points are `lng,lat,time,speed,heading,...;` entries).
12. **Two error-code systems exist** (section 5). Failed calls can return HTTP 200 with `success:"false"` and an `errorCode`.
13. **Document age and quality:** version 2021.5, written for the vendor's own app and web client, with some endpoints marked deprecated (Part 5 of the reference). Expect gaps, and confirm anything you depend on against the live test host (`apitest.18gps.net`) with a test account from the vendor.

## 4. How it maps to TD IT features

| TD IT need | API capability | Endpoint(s) |
|---|---|---|
| Show where a protected device is | Latest position, single or batch | `getUserAndGpsInfoByIDsUtc`, `getDeviceListByCustomId` |
| Admin map of all customers' devices | Batch positions per enterprise or sub-account | `getDeviceListByCustomId` (Part 2), `GetCustomTreeById` (Part 3) |
| Route history / case timeline | History track, stop points | `getHistoryMByMUtcNew`, `StayDetail` |
| Theft / tamper / movement alerts | Alarm feed and alarm filter | `queryLocalAlarmInfoUtc`, `alarmOperation`, `setFilterAlarmInfo` |
| Geofence ("home" zone) | Circular fences | `CircularFenceSave`, `…GetList`, `…Delete` |
| Lost mode / remote actions | Commands to device | `SendCommands`, `GetCommandResults`, `GetSendCmdList` |
| Provisioning stock | Bind a device to a customer (Part 2); bulk import by IMEI is Part 3 | `ActiveAndAddDevice`, `MoveDevice`; `importIMEI` (**Part 3, see caveat**) |
| Ownership transfer / resale | Unbind / re-bind (Part 2); batch move is Part 3 | `unbundlingDevice`, `ActiveAndAddDevice`; `moveUser` (**Part 3, see caveat**) |
| Customer sub-accounts | Create, edit, delete users (**Part 3, see caveat**); account registration also exists in Part 2 | `RegisterUser` (Part 2); `registerCustomer`, `modifyEnterprise`, `deleteEnterprise` (Part 3) |
| Share with family or security company | Per-device authorisation (owner / guest) | `EmpowerAdd`, `EmpowerGetList`, `EmpowerDelete` |
| Vehicle health (vehicle trackers only) | OBD fault codes, trips | `getCurCodeV3`, `OBDLatestCarCondition`, `getStrokeV3` |

Map capabilities to the repo's `DeviceCapabilitySet` (liveLocation, periodicLocation, battery, cellularSignal, speed, heading, ignition, geofencing, tripHistory, remoteCommands): position, speed and heading are in the position record, geofencing and commands exist as endpoints. **Battery and cellular signal** are not documented (only the unexplained `electric` field), so they need a vendor check.

## 5. Error codes (read from screenshots in the source)

Failed calls carry `errorCode`. **Two numbering schemes coexist**, so check both tables. A few source rows were cut off in the screenshots and are marked.

**Newer, grouped codes**

| Code | Meaning |
|---|---|
| 200 | Success |
| 400 | Username already exists |
| 401 | Trial account verification (operation not allowed) |
| 403 | `mds` verification failed or expired (log in again) |
| 500 | Failure |
| 505 | Login type does not exist |
| 506 | Security question not set |
| 507 | Verification information failed |
| 508 | Receipt (command) number expired |
| 509 | App needs no update |
| 510 | Wait for the previous order to complete |
| 511 | Verification code wrong |
| 512 | Verification code expired |
| 513 | Already bound by someone else |
| 514 | Operation target does not exist |
| 1000 | User does not exist |
| 1001 | Username already exists |
| 1002 | Superior unit does not exist (no parent) |
| 1003 / 1004 | Security answer 1 / 2 wrong |
| 1005 | Account or password empty |
| 2000 | Device does not exist |
| 2001 | Cannot add device |
| 2003 | Device already exists |
| 2004 | Vehicle record does not exist |
| 2005 / 2006 / 2007 | Frame number / engine number / plate verification failed |
| 2008 | Vehicle record already exists |

**Older numeric codes (still returned by some endpoints, for example bind returns `9`)**

| Code | Meaning | Code | Meaning |
|---|---|---|---|
| 1 | Authentication failed | 21 | Verification code expired |
| 2 | Cannot add device | 22 | Verification code wrong |
| 3 | Device information wrong, verification failed | 23 | Phone format not supported |
| 4 | SIM card error | 24 | Plate number already exists |
| 5 | Device already exists (text cut off in source) | 25 | QR code does not exist |
| 6 | Do not activate sub-user devices; activation failed (cut off) | 26 | QR code already bound |
| 7 | User does not exist | 27 | QR codes exceed 50,000 |
| 8 | Unregistered users cannot unbind (cut off) | 28 | QR code not bound |
| 9 | Already bound by someone else | 29 | Account or password empty |
| 10 | Device password incorrect | 30 | Old password wrong |
| 11 | Username already exists | 31 | QR code unused |
| 12 | Device does not exist | 32 | Account is not a law-enforcement or administration account |
| 13 | Superior unit does not exist | 33 | Timeout |
| 14 | Passwords do not match | 34 | Insufficient balance |
| 15 | IMEI already registered or entered wrongly (cut off) | 35 | QR code to bind user |
| 16 | Authorisation expired | 36 | Notifications limited to one per minute |
| 17 | Authorised account password wrong | 37 | More than 200 test devices |
| 18 | No permission | 38 | Daily QR-code add limit reached |
| 19 | Authorised account already exists | 39 | Not a direct sub-user |
| 20 | Password must combine letters and numbers (minimum 6 characters, per the translated note) | | |

## 6. Alarm codes (`type_id`)

The source gives alarm codes 0 to 115 as screenshots, and a longer Chinese name list beyond that (the vendor's `wtype` array). The meaning below is translated from the Chinese column. The source also had Portuguese annotations; a few of those were mistranslations, so the Chinese was used as the source of truth.

For TD IT, the likely relevant ones are **1 SOS, 2 anti-theft, 3 / 4 leaving or entering a geofence, 5 power cut, 9 vibration, 10 movement, 33 / 34 GPS or GSM jamming, 37 offline, 38 tamper or removal, 67 lost contact, 69 wire cut, 91 device unplugged**.

| # | Hex | Meaning |
|---|---|---|
| 0 | 0x00 | Reserved |
| 1 | 0x01 | SOS |
| 2 | 0x02 | Anti-theft |
| 3 | 0x03 | Left geofence (out of bounds) |
| 4 | 0x04 | Entered geofence |
| 5 | 0x05 | Power cut |
| 6 | 0x06 | Overspeed |
| 7 | 0x07 | Low speed |
| 8 | 0x08 | Low battery |
| 9 | 0x09 | Vibration / shock |
| 10 | 0x0A | Movement |
| 11 | 0x0B | Reset |
| 12 | 0x0C | Entered blind zone |
| 13 | 0x0D | Left blind zone |
| 14 | 0x0E | Car door opened |
| 15 | 0x0F | Car door closed |
| 16 | 0x10 | Vehicle started |
| 17 | 0x11 | Collision |
| 18 | 0x12 | Rollover |
| 19 | 0x13 | GEO (X) (unused) |
| 20 | 0x14 | Idling |
| 21 | 0x15 | Fatigue driving |
| 22 | 0x16 | Gateway (X) (unused) |
| 23 | 0x17 | Tow (X) (unused) |
| 24 | 0x18 | Overstay (parked too long) |
| 25 | 0x19 | 4S rescue |
| 26 | 0x1A | OBD fault |
| 27 | 0x1B | Fuel level alarm |
| 28 | 0x1C | Safe-driving tip |
| 29 | 0x1D | High voltage |
| 30 | 0x1E | OBD serious fault |
| 31 | 0x1F | Out-of-control alarm (lost supervision) |
| 32 | 0x20 | Bluetooth module alarm |
| 33 | 0x21 | GPS signal jamming |
| 34 | 0x22 | GSM signal jamming |
| 35 | 0x23 | Photoelectric (light sensor) alarm |
| 36 | 0x24 | Abnormal alarm |
| 37 | 0x25 | Offline alarm |
| 38 | 0x26 | Tamper / removal alarm |
| 39 | 0x27 | Parking alarm |
| 40 | 0x28 | Interference alarm |
| 41 | 0x29 | Illegal start alarm |
| 42 | 0x2A | Sunroof not closed |
| 43 | 0x2B | Window not closed |
| 44 | 0x2C | Door unlocked |
| 45 | 0x2D | Lights not turned off |
| 46 | 0x2E | Vehicle not armed |
| 47 | 0x2F | Plug in/out alarm |
| 48 | 0x30 | Magnetic alarm |
| 49 | 0x31 | Move-car reminder |
| 50 | 0x32 | High temperature |
| 51 | 0x33 | Low temperature |
| 52 | 0x34 | Gas leak |
| 53 | 0x35 | Tyre low pressure |
| 54 | 0x36 | Tyre high pressure |
| 55 | 0x37 | Power-on reminder |
| 56 | 0x38 | Entered second pledge point |
| 57 | 0x39 | Stayed at second pledge point |
| 58 | 0x3A | Device separation alarm |
| 59 | 0x3B | False address alarm |
| 60 | 0x3C | Annual inspection due |
| 61 | 0x3D | Insurance expired |
| 62 | 0x3E | Service due-date reminder |
| 63 | 0x3F | Mileage service reminder |
| 64 | 0x40 | Left second pledge point |
| 65 | 0x41 | Route deviation |
| 66 | 0x42 | Route speed limit |
| 67 | 0x43 | Lost contact |
| 68 | 0x44 | Fake base station |
| 69 | 0x45 | Wire cut |
| 70 | 0x46 | Timeout alarm |
| 71 | 0x47 | Vehicle idling reminder |
| 72 | 0x48 | Engine coolant overheating |
| 73 | 0x49 | Harsh acceleration |
| 74 | 0x4A | Harsh braking (deceleration) |
| 75 | 0x4B | Sharp turn |
| 76 | 0x4C | Rapid lane change |
| 77 | 0x4D | Route restriction |
| 78 | 0x4E | Manhole cover opened |
| 79 | 0x4F | Manhole cover closed |
| 80 | 0x50 | Emergency braking |
| 81 | 0x51 | Vehicle armed |
| 82 | 0x52 | Engine off |
| 83 | 0x53 | Discharge overcurrent |
| 84 | 0x54 | Charge overcurrent |
| 85 | 0x55 | MOS over-temperature |
| 86 | 0x56 | Low capacity |
| 87 | 0x57 | BMS fault |
| 88 | 0x58 | Abnormal operation |
| 89 | 0x59 | Normal operation |
| 90 | 0x5A | Device plugged in |
| 91 | 0x5B | Device unplugged |
| 92 | 0x5C | Voice-activated alarm |
| 93 | 0x5D | Ignition on (vehicle started) |
| 94 | 0x5E | Battery over-temperature |
| 95 | 0x5F | Magnetic alarm |
| 96 | 0x60 | Anti-jamming alarm |
| 97 | 0x61 | Jamming fuel cut-off alarm |
| 98 | 0x62 | Charging MOSFET fault |
| 99 | 0x63 | Discharging MOSFET fault |
| 100 | 0x64 | Battery low temperature |
| 101 | 0x65 | Excessive battery voltage difference |
| 102 | 0x66 | Charging fault |
| 103 | 0x67 | LED fault |
| 104 | 0x68 | GNSS module fault |
| 105 | 0x69 | GNSS antenna disconnected or cut |
| 106 | 0x6A | Abnormal fuel consumption |
| 107 | 0x6B | Low fuel |
| 108 | 0x6C | 3D collision alarm |
| 109 | 0x6D | Braking warning |
| 110 | 0x6E | Operating-licence annual review reminder |
| 111 | 0x6F | Operating-licence expiry reminder |
| 112 | 0x70 | Stay inside fence |
| 113 | 0x71 | Stay outside fence |
| 114 | 0x72 | Room door opened |
| 115 | 0x73 | Room door closed |

## 7. Questions to ask the vendor before building on this

1. Does the API support HTTPS, and which TLS version?
2. Is there a **push / webhook** option, so we do not have to poll? What are the **rate limits**?
3. Where is the data hosted (server country)? We need this for POPIA cross-border transfer and a **data processing agreement**.
4. Which tracker models and firmware are supported, and what is the exact **command list per model**?
5. Does the API report **battery level and cellular signal**, and what is the `electric` field?
6. Is there a **white-label** or reseller arrangement for South Africa, and who gives support, in what language and hours?
7. Is there an uptime commitment and a data-retention period for history?
8. Is this 2021.5 document still current? Ask for a newer version and a test account on `apitest.18gps.net`.
9. Can sub-accounts be created per TD IT customer, or should all devices live in one TD IT enterprise account with our own backend enforcing who sees what?

## 8. Suggested instructions for the agents

```
Act as cto. Read CLAUDE.md, HANDOFF.md and docs/organization/gps-hardware-vendor-scorecard.md.

Task: file this vendor API document in the repo and prepare an adapter.
1. Add 18gps-open-api-brief.md and 18gps-open-api-endpoints.md under docs/ (a vendor-apis folder).
2. Append an entry to the GPS vendor scorecard as an additional candidate, using sections 3, 4 and 7 of the brief. Do not decide the vendor.
3. Treat Part 3 of the vendor document as unconfirmed (see the caveat in section 1). Design (do not enable) a backend adapter behind the existing HardwareProvider / DeviceCapabilitySet, with
   login/token refresh on 403, WGS84 only, 1000-point history paging, polling alarms and a 25-minute offline rule.
4. Keep all vendor credentials server-side in secrets, never in the mobile app, and never log full request URLs.
5. Route compliance review (location + personal data + cross-border) per the RACI. Keep location ingestion kill-switched.
6. Use append-only roadmap entries and do not widen Release Gate A.
```
