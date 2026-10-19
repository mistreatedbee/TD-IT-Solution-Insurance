# Demo Security Partner Profile — Entirely Fictional

**This company, every person named in it, and its registration number are entirely fictional.**
They exist only to make the local-only Security Company Dashboard demo
(`src/security/demo/`, [`security-dashboard-local-demo.md`](security-dashboard-local-demo.md),
[ADR-0013](adr/0013-security-dashboard-client-demo-exception.md)) feel realistic when shown to a
prospective client. No such company is registered with PSIRA, no such PSIRA registration number
exists or has been looked up against the real PSIRA register, and no real person holds the role
described below. This profile replaces only the placeholder string `DEMO_ORG_NAME` in
`src/security/demo/data.ts` — it does not imply any real partner-org agreement, PDM-6 partner
registry entry, or G-7 dispatch-model decision. Do not use this name, number, or any detail below
outside the local demo described in the two documents linked above.

**Collision check performed before finalizing this name:** grepped `docs/` and `src/` for
"Vukani" (and several other candidate names — "Thusong", "Khanyisa", "Isivuno", "Mzansi Shield",
"Protea Guard", "Sentinel") — no matches as a company/party name anywhere in this codebase. Also
confirmed "NextWave" (the real engineering org building this platform, per
`docs/organization/contract-tdit-2026-09-scope-summary.md`) is not reused. A web search for
"Vukani Security" South Africa found no real company by that name (closest unrelated match:
"Vuco Security Solutions," a different, unrelated word) and no confusion with well-known real
firms (ADT, Fidelity, Chubb, G4S).

## Company name

**Vukani Asset Protection & Recovery (Pty) Ltd**, trading as **Vukani Recovery**.

"Vukani" is an isiZulu/isiXhosa imperative meaning roughly "wake up" / "arise" — a common word in
public and commercial use in South Africa (e.g. township newspaper names, slogans), not a
distinctive mark belonging to any known security company, which keeps it both locally plausible
and clear of any specific real brand.

## PSIRA registration number

**PSIRA Reg. No. 9284671** (displayed in the demo as "PSIRA Reg. No. 9284671 — registration
status not independently verified; demo data only").

I could not confirm PSIRA's official registration-number format from public sources in this
session (searches turned up guidance on *looking up* a registration by number/name, and one
unverified 5-digit number glimpsed on a third-party certificate PDF, but no authoritative
documentation of digit count or structure — see Sources below). **This number is therefore
constructed, not researched-and-confirmed**: a plain 7-digit numeric string with a "PSIRA Reg.
No." label, which matches the general shape PSIRA certificates are commonly shown with in
public-facing material, but should be treated as illustrative formatting only, not a confirmed
official pattern. It is deliberately not formatted to resemble any specific real company's
certificate.

## Founding year & headquarters

- **Founded:** 2011 (presented in-demo as "14 years of operation" relative to the demo's 2026
  setting).
- **Headquarters:** Rosebank, Johannesburg, Gauteng.

## Service areas

Presented as covering the same metros already used in the demo case data
(`src/security/demo/data.ts`):

- Gauteng — Johannesburg (incl. Sandton), Pretoria (incl. Centurion)
- Western Cape — Cape Town (incl. CBD)
- KwaZulu-Natal — Durban (incl. Umhlanga)
- Free State — Bloemfontein
- Eastern Cape — Gqeberha
- Limpopo — Polokwane

Tagline for this coverage: "Regional response, seven provinces reached — Vukani Recovery
coordinates locally, tracks nationally."

## Company description / tagline (for dashboard display)

**Tagline:** "Vukani Recovery — Asset tracing and recovery coordination, wherever it's taken."

**One-to-two-sentence description** (suitable for a dashboard header or about panel):
> Vukani Asset Protection & Recovery (Pty) Ltd is a PSIRA-registered private security and asset
> recovery partner coordinating with insurers and law enforcement across seven South African
> provinces. We specialise in rapid-response tracing for vehicles, electronics, and business
> equipment reported lost or stolen.

## Primary contact / demo operator

- **Name:** Lindiwe Mahlangu
- **Title:** Recovery Operations Manager
- **Demo account:** maps to the existing fictional demo operator account in
  `src/security/demo/data.ts` (`demo.operator@example.invalid`, user type
  `security_company_operator`) — this profile gives that existing fictional account a name and
  title for display purposes only; it does not change the account's technical shape, email, or
  permissions.

## Logo / visual direction (colors and style only — no asset produced)

- **Primary color:** deep charcoal navy (`#1C2430`-ish) — authority, night-ops association.
- **Accent color:** a warm amber/gold (`#E8A33D`-ish) — echoes SA security-industry convention of
  amber hazard/response lighting, and reads well as a status-accent color against navy without
  clashing with the existing dashboard's own status badge palette (open/investigating/tracking/
  recovered/closed).
- **Secondary/neutral:** off-white or light grey for backgrounds, so the navy/amber pairing stays
  legible with the dashboard's existing demo yellow banner rather than competing with it.
- **Style direction:** simple geometric wordmark (no literal shield/badge iconography, to avoid
  resembling any real security company's visual identity) — a compass-point or radiating-signal
  motif would fit the "tracing/recovery" positioning without copying anyone's existing mark.

## Short "about" blurb (longer form, for an about page if needed)

> Founded in 2011 and headquartered in Rosebank, Johannesburg, Vukani Asset Protection & Recovery
> has grown from a single regional response unit into a seven-province recovery coordination
> network. We work alongside insurers, individual policyholders, and SAPS to trace and recover
> vehicles, electronics, and business equipment reported lost or stolen — combining on-the-ground
> patrol relationships in Johannesburg, Pretoria, Cape Town, Durban, Bloemfontein, Gqeberha, and
> Polokwane with case coordination handled through partner dashboards. Vukani Recovery is
> PSIRA-registered and operates under standard private-security-industry conduct obligations.

---

### Sources consulted (PSIRA format research — inconclusive, noted above)

- [PSIRA registration process: the step-by-step guide](https://briefly.co.za/28163-psira-registration-step-by-step-guide-2019.html)
- [How to do PSIRA business verification online](https://youverify.co/en/blogs/how-to-do-psira-business-verification-online)
- [PSIRA registrations — Company Partners](https://companypartners.co.za/psira-registrations/)
