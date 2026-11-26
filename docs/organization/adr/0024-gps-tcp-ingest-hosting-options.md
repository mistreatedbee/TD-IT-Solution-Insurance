# ADR-0024: Hosting for the GT06 raw-TCP ingest listener (pilot options)

Status: **Proposed** (not Accepted). Advisory; needs `cto` + `solution-architect` ratification, with
`cybersecurity-architect` and `compliance-specialist` review of the security and POPIA rows.
Date: 2026-11-26
Author: `cloud-infrastructure-architect` (advisory)
Extends: ADR-0003 (Render hosts the HTTP backend), ADR-0018 Route B (self-host ingest).

## Context

- ADR-0018 Route B (now the target state) points the trackers at a server we control with
  `SZCS#SERVIP=<host>#SERVPORT=<port>`. The supplier has indicated GT06-family framing. The pilot
  is 2 devices (IMEIs in ADR-0018 item 6); it must be able to grow.
- GT06 is plaintext binary over TCP. TLS is not possible on the device side.
- `render.yaml` defines one Frankfurt `web` service. Render public traffic is HTTP(S) only, routed
  to a single port. Render documents extra ports as private-network only, and a Render staff reply
  in a community thread says only HTTP is exposed externally; a feature request for public non-HTTP
  access is open. A private service can run a TCP server but is reachable only from other Render
  services, not from a SIM on the internet. **Conclusion: Render itself cannot accept the tracker
  connection.** Caveat: the community and feedback evidence may be dated and I could not find a
  current docs page that states "no public TCP" outright. Confirm with Render support before
  treating this as final.
- The branch `spike/gt06-ingest-pilot` (decode, session, listener, storage sink, hardening, draft
  threat model, simulator) was **not readable** by this author (no git-object access in this
  session; it is not merged and there is no `gt06` source on main). Its listener port, memory use
  and sink design are therefore unverified here. Assumption: a single small Node process.

## Options

All prices are USD per month, approximate, and **not verified against live price pages** unless
stated. Pilot load (2 devices, one packet every 10 to 60 s) is negligible; any 1 vCPU / 0.5 to 1 GB
host is enough.

| | A. EC2 in af-south-1 (Cape Town) | B. Local SA VPS (Xneelo / Afrihost / similar) | C. Fly.io machine with TCP service | D. EU VPS (Hetzner, Falkenstein/Helsinki) |
|---|---|---|---|---|
| Cost | about 10 to 14 (t4g.micro or t3.micro on-demand, plus public IPv4 about 3.65, small EBS). Unverified. | about 8 to 20 (R150 to R350). Unverified. | about 5 to 8 (small shared machine plus a dedicated IPv4 at $2, which Fly's pricing page lists). Whether a Johannesburg region exists: unverified. | about 5 to 6. Unverified. |
| Setup effort | Medium. af-south-1 is an opt-in region, needs an AWS account, security group, Elastic IP, systemd or Docker. About half a day. | Medium-low. Manual server, firewall, Docker. Billing in ZAR. About half a day. | Low-medium. `fly.toml` with a `[[services]]` TCP block, deploy from the repo. Hours. | Low. Same as B. |
| Security posture | Security group allows only the tracker TCP port (and SSH from a fixed admin IP or SSM only). Cloud-level firewall, CloudWatch, IaC-able. | Provider firewall quality varies; rely on host `nftables`/`ufw`. | Public IP exposes only the declared TCP port. No host-level firewall control beyond that. Shared platform. | Hetzner cloud firewall, comparable to A. |
| POPIA residency | Raw fixes land in South Africa. Strongest story for the ingest hop. | In South Africa. | Depends on region. If not in SA, location data crosses a border at the first hop (s72). | EU: a cross-border transfer at the first hop. Needs a DPA and an adequacy argument. |
| Handoff to backend | HTTPS POST to the Render API (Frankfurt) or direct Mongo write | Same | Same | Same |

Note on residency: MongoDB Atlas and the Render backend are already outside SA (Render is in
Frankfurt per `render.yaml`; confirm the Atlas region). Keeping the ingest hop in SA does not by
itself make the end-to-end flow SA-resident, but it avoids adding a new unmanaged cross-border hop.
`compliance-specialist` should rule on the whole path.

Not offered: Render TCP (not supported, see Context), Cloudflare Spectrum or ngrok-style TCP
tunnels (a tunnel adds a third-party hop that carries plaintext location packets and an extra
dependency on SIM-reconfigurable hosts; Spectrum raw TCP is paid enterprise-tier, unverified).
Lightsail in Cape Town: availability unverified, and I believe it is not offered there.

## Mitigations common to every option (TLS is impossible on GT06)

1. Firewall: allow inbound only the tracker port. Management access by SSM or an IP-restricted SSH key
   only. No other open ports.
2. Registry allowlist: the listener accepts a login only from a pre-registered IMEI. This is already
   drafted in the spike (login timeout, frame-rate cap, IP block, jump check per its commit log).
   `cybersecurity-architect` to confirm against ADR-0018 item 5.
3. Never trust the device identity alone: location from a tracker stays `device_attested`-class
   data, and per ADR-0009 hardware location alone does not trigger dispatch without a case.
4. Rate limits and idle/connection caps per source IP, with a global connection cap; drop on
   malformed framing.
5. Restrict who can reconfigure the SIMs (SMS server-change risk is in ADR-0018 item 5): use
   private APN or SIM-level SMS whitelist if the carrier offers it.
6. Transport from the listener onward is TLS (the HTTPS call to the backend), so the plaintext
   exposure is limited to the device-to-listener hop.
7. Honour the existing ingestion kill switch; unset means off.

## Recommendation (pilot): Option A, a single small EC2 instance in af-south-1

Run the spike's listener as a container or systemd service on a t4g.micro (or t3.micro) in Cape
Town with an Elastic IP and a security group limited to the tracker port. Reasons: keeps the
plaintext device hop in South Africa and close to the SIMs (lowest latency); real cloud firewall and
IaC story; same provider can later host the autoscaled ingest tier; about 10 to 14 USD per month is
acceptable for a two-device pilot.

**Handoff (recommended):** the listener does not hold MongoDB credentials. It POSTs decoded fixes
over HTTPS to a new internal ingest endpoint on the Render backend, authenticated with a dedicated
key from the existing `INTERNAL_SERVICE_KEYS` scheme, so the kill switch, validation and audit stay
in one place and Atlas needs no allowlist change for the VM. Fallback if backend-architect rejects a
new endpoint: write directly to Atlas using a least-privilege user limited to
`location_events` and `device_telemetry`, with the VM's Elastic IP allowlisted.

Cheapest acceptable alternative if the AWS account setup is a blocker: Option B (local VPS), same
design.

## What changes at scale

- Put the listener behind a Network Load Balancer (TCP) with several stateless listener instances
  in an autoscaling group; the listener does decode and ack only.
- Insert a queue (SQS or equivalent) between listener and backend so ping storms do not hit the
  API or Mongo directly, with backpressure and a dead-letter queue (ADR-0001/0003 note this is
  `cloud-infrastructure-architect` scope with `backend-architect`).
- Move toward the vendor's recommended per-device auth (or a private APN and VPN) if a production
  GPS hardware vendor is chosen, since GT06 has none.
- Consider moving the Render API to a region closer to SA, or accept the added hop; revisit once
  device count and POPIA ruling are known.
- Add budgets and tags (cost governance) before enabling autoscaling; load-test with a simulated
  fleet (the spike has a simulator) via `performance-engineer`.
- Provide a second listener in another AZ/region and a documented failover (DNS or NLB) for DR.

## Open items

| # | Item | Owner |
|---|---|---|
| 1 | Verify current prices (EC2 af-south-1 and Lightsail availability, Fly jnb) | `cloud-infrastructure-architect` |
| 2 | Read and review the spike code (listener port, sink, hardening) | `backend-architect`, `gps-integration-engineer` |
| 3 | Confirm Render has no public raw-TCP offering with Render support | `cloud-infrastructure-architect` |
| 4 | POPIA ruling for the end-to-end path incl. Atlas and Render regions | `compliance-specialist` |
| 5 | Approve internal ingest endpoint vs direct Mongo write | `backend-architect`, `cybersecurity-architect` |
| 6 | Ratify spend and provider | `cto` |
