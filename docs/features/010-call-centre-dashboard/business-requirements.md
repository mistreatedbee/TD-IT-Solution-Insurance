# Feature 010 — Call Centre Dashboard

**Lifecycle stage:** 1 — Business Requirements  
**Stage owner (A):** `business-analyst`  
**Contributors:** `product-manager`, `compliance-specialist`, `ux-researcher`  
**Status:** Draft — Stage 1 opened per contract TDIT-2026-09 Schedule A (Call Centre Dashboard in retainer scope). Sequenced **after Release Gate A** per `contract-tdit-2026-09-scope-summary.md` §3 — not a Gate A blocker.  
**Related system areas (RACI):** Call Centre Dashboard web surface (A: `frontend-architect`, R: `frontend-engineer`), Backend read APIs (A: `backend-architect`, R: `backend-engineer`), Identity/RBAC (A: `authentication-engineer`)

---

## 1. Business problem / goal

TD IT Solution Insurance operates a customer support and recovery coordination function. Today, privileged operators use the **Admin Dashboard** (platform staff) or **Security Company Dashboard** (field-recovery partners). Contract TDIT-2026-09 adds a third operator persona: **call-centre agents** who handle inbound customer calls — policy lookups, theft-report intake assistance, case status updates, and escalation to security partners — without granting full admin power or security-field-operator tools.

**Goal of this Stage 1 slice:** define the minimum call-centre operator capabilities for Phase 1 of Feature 010 so `product-manager` can confirm scope intent and engineering can proceed through Stages 2–5 without inventing requirements.

---

## 2. User type in scope

| User type | Surface | Phase 1 capability (proposed — pending `product-manager` sign-off) |
|---|---|---|
| **Call-centre agent** | Call Centre Dashboard (`/call-centre/*`, new web surface) | Authenticated operator with a dedicated `user_type`; search customer by policy number, email, or phone; view read-only policy + asset summary; view recovery-case status; log a call note against a case or customer record; escalate/open recovery case when customer reports theft on a call |

**Explicitly not in Phase 1 (defer unless `product-manager` promotes):**

- Editing policy/asset data (admin-only writes stay on Admin Dashboard)
- Viewing precise GPS coordinates or live maps (security-operator / future GPS vendor scope)
- Processing payments or activating policies (M2 / payment gateway dependency)
- Claims filing (no claims backend exists)

---

## 3. Functional requirements (Phase 1 — proposed)

### 3.1 Authentication and RBAC

- FR-1: Call-centre agents authenticate via the same privileged web auth stack as Admin/Security dashboards (Feature 001 MFA, idle timeout FR-21).
- FR-2: `user_type = support_agent` (existing enum — maps to call-centre operators per Feature 001). Agents without this type cannot access `/call-centre/*`.
- FR-3: Every read and write in this surface is audit-logged per ADR-0006 (Trail A for account-scoped actions; purpose/case reference on case-linked reads per C-16).

### 3.2 Customer lookup (read-only)

- FR-4: Agent can search by **policy reference**, **customer email**, or **registered phone** (exact match or prefix — UX TBD Stage 3).
- FR-5: Search results show: customer account id (truncated), policy status, asset count, active recovery-case flag — **no** full PII dump in list view.
- FR-6: Detail view shows policy tier, asset list (type + nickname/identifier fields already exposed on admin reads), and billing status (`not_configured` shown honestly).

### 3.3 Recovery case assistance

- FR-7: Agent can view recovery cases linked to the customer/policy (status, reference number, reported date) — same fields Security Dashboard exposes minus partner-internal notes if any.
- FR-8: Agent can add a **call-centre note** to an existing case (append-only text + timestamp + agent id) — does not change case status (status changes remain security-operator actions unless `product-manager` rules otherwise).
- FR-9: Agent can initiate a **theft report on behalf of customer** only when customer is verified on the call (verification workflow TBD Stage 2 — must not bypass Feature 001 identity assurances).

### 3.4 Escalation

- FR-10: Agent can flag a case for security-partner pickup (sets case to `open` / unassigned queue visible on Security Dashboard) when mobile self-serve theft report is unavailable.

---

## 4. Non-functional requirements

- NFR-1: Web UI must be usable on a desktop call-centre workstation (1280×800 minimum). Tablet layout is out of scope for this surface (contract tablet scope applies to Security Dashboard only).
- NFR-2: POPIA: purpose-limited access — agents see only records they searched for, not bulk customer lists (contrast with admin unfiltered list endpoints; C-14 posture).
- NFR-3: Stage 8 Security Review is a hard gate before any production operator uses real customer PII.

---

## 5. Dependencies and sequencing

| Dependency | Owner | Blocks |
|---|---|---|
| Release Gate A closed (M0) | `technical-project-manager` | Client-facing sequencing expectation |
| Platform RoPA + operator reviews (M1) | `compliance-specialist` | Real customer PII on call-centre workstations |
| Recovery case API (`recovery.ts`, `security-cases.ts`) | `backend-engineer` | FR-7–FR-10 (API exists today — verify Stage 8 disposition before reuse) |
| New RBAC role + invitation flow | `authentication-engineer` | FR-1–FR-3 |

---

## 6. Open questions for `product-manager` (OQ-010)

1. **OQ-010-1:** Is call-centre note storage a new Mongo collection (`call_centre_notes`) or an extension of `recovery_cases` audit trail?
2. **OQ-010-2:** What customer verification is required before agent-initiated theft report (voice match, OTP to registered phone, other)?
3. **OQ-010-3:** Should agents see notification delivery history (Feature 007) or stay policy/asset/case only?

---

## 7. Out of scope (this feature folder)

- Native phone CTI integration, dialler pop, or recording storage
- WhatsApp/SMS channels (notification-engineer scope)
- AI assist / suggested responses (`ai-solutions-architect` future track)

---

**Next lifecycle step:** `product-manager` scope confirmation on §3 and OQ-010 → Stage 2 product planning → `ux-researcher` journey map for inbound theft-call flow.
