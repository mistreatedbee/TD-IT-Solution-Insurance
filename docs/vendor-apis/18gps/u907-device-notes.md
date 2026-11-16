# U907 tracker — what the printed manual says

Source: `u907 user manual 20221125.pdf` (supplier "Operation Guideline", dated 2022-11-25).
Author: `cto` summary, 2026-11-16. Facts only; nothing here is verified on a live unit yet.

## 1. Device class

- Portable, magnetic, rechargeable "Miniature Chargeable Ultra-long Standby Positioning
  Terminal". Marketed for the purchaser's own vehicle anti-theft use.
- Nano SIM, prepaid, must have **GPRS data** active.
- Radio: **GSM/GPRS (2G) only** per the manual ("built-in GSM antenna and GPRS antenna").
  No LTE/4G or NB-IoT is mentioned. See §5.
- Positioning accuracy stated as ≤30 m. Operating range -20 °C to +60 °C.
- Buttons: ON/OFF (1 s on, 5 s off) and SOS (3 s hold triggers an SOS alarm).
- LEDs: yellow = GSM, blue = GPS, red = charging.
- Feature icons claimed: ultra-long standby, overspeed alarm, geo-fence, timer mode,
  vibration alarm, driving-route playback, real-time positioning, magnetic adsorption.

## 2. How it reports

The device opens a connection to a **server IP and port** configured by SMS. It does not
speak HTTP to us; it speaks a proprietary binary/text protocol (not documented in the
manual) to whatever server it is pointed at.

- Default server in the manual: `122.9.115.220:7711`. Reverse DNS resolves to a Huawei
  Cloud (China) compute host, consistent with the 18gps hosted platform.
- Change command: `SZCS#SERVIP=<ip>#SERVPORT=<port>`.
- This means two integration routes exist (see ADR-0018): leave the device pointed at the
  vendor's server and read via the 18gps API, or repoint it at a server we run and parse
  the device protocol ourselves (protocol spec needed from the supplier).

## 3. SMS command set (from the manual)

| Purpose | Command | Reply |
|---|---|---|
| Bind owner number | `SZCS#USER=<msisdn>` | — |
| Status query | `CXZT` | current status |
| Restart | `CQ` | `CQ ok` |
| Factory reset | `FORMAT` | asks to re-bind owner number |
| Set server | `SZCS#SERVIP=<ip>#SERVPORT=<port>` | — |
| APN, no auth | `SZCS#APN=<apn>` | — |
| APN with user | `SZCS#APN=<apn>#USERPPP=<user>` | — |
| APN with user+pass | `SZCS#APN=<apn>#USERPPP=<user>#PWPPP=<pass>` | — |
| Intelligent mode | `MODE1,<upload s>,<heartbeat s>#` e.g. `MODE1,60,180#` | `MODE1 OK` |
| Power-saving mode | `MODE2,<wake every n min>#` (n ≥ 30) | `MODE2 OK` |

No command authentication is described beyond "bind the owner number". Assume any phone
that knows the SIM number can reconfigure the device unless the supplier confirms
otherwise. This is a `cybersecurity-architect` item.

## 4. Working modes

- **Intelligent (default):** reports at the set interval while moving. After 3 minutes
  parked it sleeps, sends **no heartbeat by default**, and the platform shows it
  **offline**. A heartbeat can be enabled by SMS.
- **Power saving:** wakes on a fixed interval (≥30 min), reports for 3 minutes, sleeps.
  **Ignores remote commands while asleep.**

Product consequence: a parked, sleeping tracker looks identical to a dead or jammed one
unless heartbeat is enabled. Our "offline" rule and theft alerting must account for this.

## 5. Flags for the vendor decision

1. **2G-only radio.** South African operators and the regulator have announced a 2G/3G
   sunset programme; the exact switch-off dates have moved more than once. Before buying
   volume, `integration-architect` must confirm (a) which radio this exact batch has and
   (b) the current SA 2G switch-off timetable. A 2G-only recovery device is a stranded
   asset the day the network goes.
2. **Protocol is undocumented.** Self-hosting ingestion needs the device protocol document
   from the supplier (ask for "U907 communication protocol" or the platform's device
   protocol name, e.g. GT06-compatible). Not in the manual.
3. **Battery curve unknown.** "Ultra-long standby" is not a number. Ask for mAh and
   measured life at 60 s / 180 s / MODE2 settings.
4. **Power supply.** The supplier's "How many V?" question in the June chat was never
   answered (see brief §1b). The manual shows USB charging only.

## 6. Correction 2026-11-16 — radio is 4G (owner-confirmed)

The business owner confirmed the delivered units are **4G**. The printed manual (2022-11-25)
describes a GSM/GPRS radio, so the manual is for an older revision or the 2G variant of the
same shell. Treat §1's "2G only" and §5 item 1 as **void for the delivered lot**; the
supplier's shipped revision supersedes the manual. Still worth one line in the supplier
ask: "confirm LTE bands for South Africa (B1/B3/B7/B8/B20/B28) and whether the unit falls
back to 2G when LTE is absent", because a 4G unit that falls back to 2G behaves like a 2G
unit in rural dead zones once 2G is switched off.
