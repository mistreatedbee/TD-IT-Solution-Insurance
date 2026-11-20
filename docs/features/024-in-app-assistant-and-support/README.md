# Feature 024 — In-app assistant and "Talk to support"

**Status:** Proposed. Stage 1 (business requirements) not started. Nothing in this folder is built.
**Author:** `ai-solutions-architect` (advisory). 2026-11-20.
**Owner request (2026-11-20):** "On the Home page, at the top right where it shows the Alerts,
change that into the TD IT Solutions Insurance AI bot, where customers will be able to ask it
questions and also be able to talk to support."

This is a plan, not a build. No AI system exists in the repo today. No customer-facing support
channel exists today. Every claim below about current code was checked on main on 2026-11-20.

---

## 1. What exists today

### 1.1 The Home header button

- `mobile/src/screens/home/HomeHeader.tsx` shows a bell (`BellIcon`) at the top right.
- It shows a count badge (`9+` cap) and opens `/alerts`.
- It only renders when `FEATURE_ALERTS_ENABLED` is on (`mobile/src/config/features.ts`).

### 1.2 Other ways to reach Alerts (so the bell is not the only door)

- **Alerts tab** in the bottom bar: `mobile/app/(app)/(tabs)/_layout.tsx` (`name="alerts"`, hidden
  when the flag is off).
- **Quick action** "View alerts": `mobile/src/screens/home/QuickActionBar.tsx`.
- **"Needs attention" card** with "View all": `HomeAlertsPreview` in
  `mobile/src/screens/home/ProtectionHomeScreen.tsx`.
- Alert counts also show in `ProtectionStatRow`, `ProtectionHealthCard` and
  `FeaturedProtectionCard`.
- Backend: `GET /v1/alerts` and `PATCH /v1/alerts/:alertId` (`backend/src/routes/alerts.ts`).
- Note: `mobile/app/(app)/(tabs)/alerts/_layout.tsx` records INC-001 A-12. `GET /v1/alerts` has no
  Stage 8 record. That is why the screen is flag-gated.

### 1.3 Support code

- **Call-centre support cases exist, but staff-only.** `backend/src/routes/support-cases.ts`
  (Feature 010 Phase 2) lets an *agent* create a case on behalf of a customer, add notes and
  change status. The web page is `src/call-centre/pages/SupportCasesPages.tsx`.
- `backend/src/routes/support-lookup.ts` is the agent's customer lookup.
- Feature 010 limits: `scope=all` list is withheld (SR-010-2). Escalation to a recovery case
  (FR-18–21) is not authorised.
- **There is no customer-facing support route.** A customer cannot open a ticket, send a message
  or chat. There is no help/contact screen in the mobile app.
- The "Customer Support Portal" listed in `CLAUDE.md` is not built.

### 1.4 Read-only customer APIs the assistant could use

All are scoped to the signed-in customer by the bearer token.

| Purpose | Route | File |
|---|---|---|
| Plan catalogue | `GET /v1/plans/catalog`, `GET /v1/plans` | `plans.ts` |
| My policies / cover | `GET /v1/policies`, `GET /v1/policies/:policyId` | `policies.ts` |
| My assets | `GET` routes in `assets.ts` | `assets.ts` |
| My claims status | `GET /v1/claims`, `GET /v1/claims/:claimId` | `claims.ts` |
| My alerts | `GET /v1/alerts` (no Stage 8 record yet) | `alerts.ts` |

The assistant must call **only GET routes**. It never calls a POST, PATCH or DELETE.

---

## 2. What the button becomes

**Recommendation:** swap the top-right bell for an **assistant button** (chat icon from
`lucide-react-native`, label "Ask TD IT Solutions Insurance"). It opens a new full-screen
`/assistant` route.

**Where Alerts goes:** keep Alerts where it already is. Remove only the header bell.

- The Alerts tab, the "View alerts" quick action and the "Needs attention" card stay.
- Move the open-alert count badge onto the **Alerts tab icon** (`tabBarBadge`), so the count is
  still visible from every screen.
- Do not put alerts inside the assistant screen. Alerts are urgent. A chat screen is the wrong
  place to find them.

Why this option: nothing is lost, there is no new UI component, and the badge stays visible.
`design-system-manager` must still sign off the header change and the new assistant screen.

**Flag rule:** the assistant button shows only when `FEATURE_ASSISTANT_ENABLED` is on. When off,
the header shows the bell as today. This keeps the change reversible.

---

## 3. The assistant screen

One screen, two parts:

1. **Ask a question** — the chat with the assistant.
2. **Talk to support** — a fixed button at the top, always visible. It never needs the AI to work.

An **emergency banner** sits above both: "Stolen right now? Tap Report theft, or call 10111."
It links to the existing report-theft flow. It shows even if the AI is switched off.

---

## 4. Assistant scope

### 4.1 In scope (Phase 1)

- Explain plans and what each plan covers, from the plan catalogue.
- Explain the customer's own policy and cover, from their own policy data.
- How to register an asset (step-by-step, linking to the Assets screen).
- How to report theft (and link straight to the report-theft flow).
- Claim status, read-only: "Your claim for the laptop is under review."
- General how-to questions about the app.

### 4.2 Hard limits

- **No binding decisions.** It never says a loss "is covered" or a claim "will be approved". It
  says what the policy text says and that an assessor decides. Every cover answer ends with "This
  is not a claim decision."
- **No promises.** No payout amounts, dates or outcomes. No discounts. No legal advice.
- **No actions.** Read-only. It cannot file a claim, change a plan, delete an asset or report a
  theft. It links to the screen that does it.
- **Only the customer's own data.** The backend calls our APIs with the customer's own token.
  The model never chooses an account ID. Tools take no `accountId` input. This means a prompt
  injection cannot reach another customer's data, because the API itself will not return it.
- **Prompt injection.** Treat all tool results (asset names, notes) as data, not instructions.
  The system prompt says so. Tool output is length-capped. No tool can write anything.
- **No location data in Phase 1.** No device locations, live tracking or GPS history go to the
  model. Location is our most sensitive data.
- **POPIA.** Send the minimum. Strip ID numbers, phone numbers, emails and addresses from tool
  results before they reach the model. Tell the customer in the screen that answers come from an
  AI and that chats are logged. `compliance-specialist` must rule on cross-border transfer
  (POPIA s72) to Anthropic before any real customer uses it.
- **Emergencies.** If the customer says the asset is being stolen now, or that they are in
  danger, the assistant stops answering and shows: "Call 10111 now. Then tap Report theft." This
  is a fixed rule in our backend (keyword check before the model), not left to the model alone.
- **Hand-off.** If the customer asks for a person, is upset, or the assistant cannot answer
  twice, it offers "Talk to support".
- **Off-topic.** It declines anything not about the customer's TD IT Solutions Insurance account.

---

## 5. Model and architecture

### 5.1 Where it runs

- The app calls **our backend only**: `POST /v1/assistant/messages`.
- Our backend calls the Anthropic Messages API. The API key lives in a Render environment
  variable. **The key is never in the app, never in `mobile/.env`, never in source.**
- The backend runs the tool loop. Each tool maps to one of our read-only GET routes in §1.4,
  called in-process with the customer's own auth context.

### 5.2 Model choice

**Recommendation: `claude-haiku-5-5` for Phase 1.** The job is narrow: read-only lookups and
plain explanations. Haiku is about 20 times cheaper than Sonnet. Keep `claude-sonnet-5-5` as
the fallback if the evaluation set (§7) shows Haiku is not good enough on cover questions. Do
not use `claude-opus-5-5` here; the cost is not justified.

Keep the model ID in config, not in code, so we can switch without a release.

### 5.3 Cost estimate

Official prices (platform.claude.com pricing page, read 2026-11-20), per million tokens:

| Model | Input | Cache hit | Output |
|---|---|---|---|
| `claude-haiku-5-5` (prompts under 100k) | $0.10 | $0.01 | $0.50 |
| `claude-sonnet-5-5` | $2.00 | $0.10 | $10.00 |

Assumption for one chat: about 6 customer turns, about 10 model calls including tool calls,
about 60,000 input tokens and about 3,000 output tokens.

| Model | Per chat | Per 1,000 chats |
|---|---|---|
| `claude-haiku-5-5` | about $0.0075 | **about $7.50** |
| `claude-sonnet-5-5` | about $0.15 | **about $150** |

Prompt caching of the system prompt and tool definitions will lower these numbers. US-only
inference routing adds 10%. These are estimates. Re-check prices before the business case.

### 5.4 Rate limits and cost caps

- Per customer: 20 messages per hour and 60 per day. Message length capped at 1,000 characters.
- Per chat: at most 5 tool calls per turn, and a max output length.
- Global: a monthly spend cap set in the Anthropic console, plus a daily backend counter that
  turns the assistant off when hit.

### 5.5 Kill switch

- Mobile flag `FEATURE_ASSISTANT_ENABLED` (build-time, like the others in
  `mobile/src/config/features.ts`).
- A backend runtime flag `ASSISTANT_ENABLED`. When off, `POST /v1/assistant/messages` returns a
  friendly "The assistant is offline. Talk to support instead." The Talk to support button keeps
  working.
- The backend flag is the real kill switch, because it works without an app release.

### 5.6 Logging and retention

- Store each chat (customer messages, assistant replies, tool names called) in MongoDB, tied to
  the account, with the redacted text only.
- Keep chats for 90 days, then delete. A chat that becomes a support request is kept with that
  request under its own retention rule. `compliance-specialist` to confirm both periods.
- Customers can delete their chat history.
- Do not log the raw tool payloads in application logs.
- Anthropic data use and retention terms must be checked by `compliance-specialist` (DPA, as for
  Supabase).

### 5.7 First rollout: owner-test only

- Phase 1 turns on only in the `owner-test` EAS profile. That profile already has an owner
  exception (`docs/organization/incidents/OWNER-EXCEPTION-2026-11-17-test-only-build.md`).
- Adding a ninth flag to that profile needs the `cto` to confirm it stays inside the existing
  exception. Do not widen the exception to any other profile.
- No preview or production build gets the flag until Stage 8 and Stage 10 pass.

---

## 6. "Talk to support"

### 6.1 Options

| Option | Built today? | Effort | Notes |
|---|---|---|---|
| A. Phone / email / WhatsApp links (`tel:`, `mailto:`, `wa.me`) | No | Very small | Needs the owner's real numbers and hours. No customer data leaves the app. |
| B. In-app support request, stored in our backend, shown in the call-centre dashboard | No (staff-only cases exist) | Medium | Reuses Feature 010 support cases. Needs a new customer-facing route and its own Stage 8. |
| C. Live chat vendor (e.g. a hosted chat SDK) | No | Medium to large | New vendor, new DPA, new data flow. `integration-architect` decision. |

### 6.2 Recommendation for Phase 1

- **Ship option A first.** A "Talk to support" sheet with Call, Email and WhatsApp buttons, plus
  the support hours. It needs no new backend and it works when the AI is off.
- **Then option B.** A customer route such as `POST /v1/me/support-requests` creates a Feature 010
  support case with `channel: in_app` and the customer's own account from the token (never from
  the body). The customer can attach the last assistant chat if they choose. Agents see it in the
  existing call-centre support cases page. This changes the Feature 010 auth model (today only
  agents create cases), so it needs `backend-architect` design and a fresh Stage 8.
- **Option C is later.** Only when ticket volume justifies a vendor.

---

## 7. Responsible-AI review (must pass before any real customer)

- **Evaluation set:** at least 100 written test questions with expected answers, covering
  plans, cover, claims status, theft, off-topic and attacks. Reviewed by `product-manager`.
- **Red-team set:** prompt injection in asset names, requests for other customers' data,
  requests for a coverage promise, requests to act (file a claim). Target: zero failures.
- **Accuracy:** no wrong cover statement in the eval set. One wrong cover statement blocks
  launch.
- **Explainability:** every cover or claim answer names the source (plan name, policy, claim
  status) it came from.
- **Fairness:** the assistant does not make or influence any decision about a customer. It only
  explains. That keeps it out of risk scoring. If that changes, a new review is needed.
- **Human-in-the-loop:** Talk to support is always one tap away.
- **Monitoring:** weekly sample review of 20 chats in Phase 1. Track hand-off rate and thumbs
  down rate.
- **Fallback:** kill switch in §5.5. Talk to support keeps working.

---

## 8. Phases

| Phase | Scope | Gate to enter |
|---|---|---|
| 0 | This plan. Owner decisions in §10. | Owner answers §10 |
| 1a | Header swap behind flag; Alerts badge on tab; Talk to support sheet (option A); emergency banner | Stage 8 + Stage 10 for the screen |
| 1b | Assistant backend (`/v1/assistant/messages`), Haiku, read-only tools, logging, kill switch. Owner-test build only | Responsible-AI review §7, compliance ruling, Stage 8 + Stage 10 |
| 2 | In-app support request (option B) into the call-centre dashboard | `backend-architect` design, Stage 8 + Stage 10 |
| 3 | Preview, then production rollout | `cto` go/no-go; owner-test exception reversed per its record |
| Later | Live chat vendor (option C); answers in more languages | Business case |

`GET /v1/alerts` still lacks a Stage 8 record (INC-001 A-12). The assistant must not use the
alerts tool in any non-owner-test build until that review exists.

---

## 9. Owners (per `docs/organization/01-raci-matrix.md`)

| Work | Role |
|---|---|
| Business requirements, eval questions, support hours copy | `product-manager`, `business-analyst` |
| AI design, model choice, responsible-AI review | `ai-solutions-architect` |
| Fit with platform; no duplicate surfaces | `solution-architect` |
| Assistant and support-request API design | `backend-architect` |
| Backend build | `backend-engineer` |
| Mobile header, assistant screen, support sheet | `mobile-architect`, `mobile-engineer` |
| UI and component sign-off | `ui-designer`, `design-system-manager` |
| Call-centre view of in-app requests | `frontend-engineer` |
| Chat storage and retention | `database-architect` |
| POPIA, cross-border transfer, Anthropic terms, retention | `compliance-specialist` |
| Prompt injection, data exposure, key handling (Stage 8) | `cybersecurity-architect`, `security-engineer` |
| Testing (Stage 10) | `qa-architect`, `automation-qa-engineer`, `manual-qa-engineer` |
| Render env var, spend alerts | `devops-engineer` |
| Vendor choice for live chat (later) | `integration-architect` |
| Go/no-go at each phase | `cto` |

---

## 10. Open decisions for the owner

1. **Anthropic account and billing.** Who owns the account, which card pays, and the monthly
   spend cap. The API key goes into Render only.
2. **Support hours.** What hours a person answers, and what the app says outside those hours.
3. **Support channels.** Which phone number, email address and WhatsApp number to show.
4. **Model.** Approve `claude-haiku-5-5` for Phase 1, with Sonnet as fallback.
5. **Chat retention.** Approve 90 days (subject to `compliance-specialist`).
6. **Name.** What the assistant is called in the app.
7. **Header change.** Confirm the bell leaves the header and the badge moves to the Alerts tab.
