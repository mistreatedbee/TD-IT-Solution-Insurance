# ADR-0023: Anthropic (Claude API) as the In-App Assistant's Data Processor

Status: Proposed
Date: 2026-11-20
Deciders: `ai-solutions-architect` (author), `compliance-specialist`, `cybersecurity-architect`, `backend-architect`; to be ratified by `cto`
Related: Feature 024 (`docs/features/024-in-app-assistant-and-support/README.md`, §4, §5, §11 CTO condition 2), ADR-0001, ADR-0003 (Render), `docs/organization/incidents/OWNER-EXCEPTION-2026-11-17-test-only-build.md`

## Context

Feature 024 adds an in-app assistant that answers a customer's questions about their own policy,
assets, claims and recovery status, using read-only lookups. The CTO review (Feature 024 §11,
condition 2) requires an ADR before any assistant backend code merges, because Anthropic would be
a **new operator (processor) of customer personal information**, sitting outside South Africa.

On 2026-11-20 the owner approved: Claude via the Anthropic API, called from our backend only;
`claude-haiku-5-5` as the default model with `claude-sonnet-5-5` as the fallback; a spend cap of
about USD 50 per month; 90-day chat retention, subject to a `compliance-specialist` ruling.
`claude-opus-5-5` is not approved for this feature (cost not justified for read-only lookups).

Today there is no AI/ML system in the repo. This ADR approves a vendor and a set of controls. It
does not approve production use. Stage 8 and Stage 10 still apply in full.

## Decision

1. **Backend-only calls.** Only our Node.js backend (Render) calls the Anthropic Messages API, through
   `POST /v1/assistant/messages`. The web and mobile apps never call Anthropic directly.
2. **Key handling.** The Anthropic API key is a Render environment secret. It is never in the mobile
   app, `mobile/.env`, the web bundle, source control, logs or error reports. Use a dedicated key
   for this feature, so it can be revoked without touching anything else.
3. **Model in config, not code.** `ASSISTANT_MODEL` defaults to `claude-haiku-5-5`;
   `ASSISTANT_FALLBACK_MODEL` is `claude-sonnet-5-5`. A model change does not need an app release.
   Moving to the fallback needs the Feature 024 §7 evaluation set to show Haiku is not good enough,
   and a re-check of cost against the cap.
4. **Read-only, customer-scoped tools.** Each tool maps to an existing read-only GET route, called
   in-process with the signed-in customer's own auth context. No tool can write, create, cancel or
   approve anything. No tool takes an account ID as input; the account is always taken from the
   session. Tool output is length-capped. A tool whose route has no Stage 8 record (for example
   `GET /v1/alerts` today) stays out.
5. **Kill switch.** The backend runtime flag `ASSISTANT_ENABLED` is the real kill switch. When off,
   the route returns "The assistant is offline. Talk to support instead." The mobile build flag
   `FEATURE_ASSISTANT_ENABLED` hides the entry point. "Talk to support" works when both are off.
6. **Spend cap.** A monthly spend limit of about USD 50 is set in the Anthropic console, plus a
   daily backend counter that turns `ASSISTANT_ENABLED` off when hit. Per-customer limits per
   Feature 024 §5.4 (20 messages per hour, 60 per day, 1,000 characters per message, at most 5
   tool calls per turn, capped output length).
7. **Owner-test first.** The assistant runs only in the `owner-test` EAS profile, against the
   owner's own test account, until Stage 8 and Stage 10 pass and the open items below are closed.
   The `cto` must confirm that adding the flag stays inside the existing owner exception. The
   exception is not widened to any other profile.

## Data sent and minimisation

What may go to Anthropic in Phase 1:

- The customer's message text (after redaction, below).
- Our system prompt and tool definitions (no personal data).
- Redacted tool results: plan name, cover summary, asset type and nickname, claim status and
  dates, recovery-case status.

What must not go to Anthropic unless a later, reviewed change shows it is needed:

- South African ID numbers, passport numbers, phone numbers, email addresses, street addresses.
- Device coordinates, location history, live tracking data or geofences (Feature 024 §4: no
  location data in Phase 1).
- Claim documents, photos, police case numbers, bank details, payment data.
- Device serial numbers and IMEIs, beyond the last four characters if a customer needs to tell two
  assets apart.

Controls:

- **Redaction before the call.** A backend redaction step strips the fields above from tool
  results using an allow-list of fields per tool (not a block-list), then runs pattern redaction
  (SA ID, phone, email) over both tool results and the customer's own message.
- **Tests.** The redaction step has unit tests with real-shaped fixtures. Stage 8 checks it.
- **Customer notice.** The chat screen says answers come from an AI, that chats are logged, and
  that it should not be used to share ID numbers or bank details.

## Anthropic data handling terms (as read 2026-11-20)

Verified on Anthropic's own pages on 2026-11-20:

- **Training.** "Retained data is never used for model training without your express permission."
  ([API and data retention][ret])
- **Default retention.** Two Anthropic pages say different things. The platform docs say
  conversation content is "not retained by default", with an exception for "Covered Models",
  which require 30-day retention ([API and data retention][ret]). The commercial privacy article
  says Anthropic will "automatically delete inputs and outputs on our backend within 30 days of
  receipt or generation" ([commercial retention][cret]). **We plan on the stricter reading: assume
  up to 30 days at Anthropic.**
- **Covered Models.** The listed Covered Models are the Claude Fable 5.x and Claude Mythos 5.x
  families. `claude-haiku-5-5` and `claude-sonnet-5-5` are not on the list as read on 2026-11-20
  ([API and data retention][ret]). Re-check before switching models.
- **Zero data retention (ZDR).** Available per organisation on request through Anthropic sales.
  Under ZDR, prompts and responses are not stored at rest after the response is returned. ZDR
  does not cover Console/Workbench use. ZDR organisations cannot call the API from a browser,
  which fits our backend-only design ([API and data retention][ret]; [ZDR scope][zdr]).
- **Trust and safety exception.** Even with ZDR, content flagged by Anthropic's automated trust and
  safety systems may be kept for up to 2 years, and classification scores for up to 7 years, and
  data may be kept where the law requires ([API and data retention][ret]; [commercial
  retention][cret]).
- **DPA.** Anthropic's Data Processing Addendum, including EU Standard Contractual Clauses, is
  incorporated into its Commercial Terms of Service; accepting the Commercial Terms accepts the
  DPA. Anthropic acts as processor for API customer data ([DPA article][dpa]; [processor
  article][proc]; [Legal Center][legal]).

Assumed, not verified (must be confirmed by `compliance-specialist` from the signed documents):

- The exact wording of the Commercial Terms on training, ownership of outputs, governing law and
  sub-processors. The PDF could not be read as text in this session.
- The current DPA version and date. Search results showed two different dates (Feb 2025 and
  Jan 2026). Read the live PDF.
- The DPA's breach-notice period and sub-processor objection window (reported in search summaries
  as 48 hours and 15 days; not read in the document itself).
- Where inference runs. We assume the United States (and possibly other regions) unless US-only
  routing is chosen (Feature 024 §5.3 notes it costs about 10% more). Either way, data leaves
  South Africa.
- Whether ZDR is offered to an account of our size. Not asked yet.

## POPIA

- **Operator (s20, s21).** Anthropic processes personal information on our behalf, so it is an
  operator. Section 21 requires a written contract that obliges the operator to keep the security
  measures in s19 and to tell us at once of any suspected breach. Section 20 requires the operator
  to process only with our knowledge or authorisation and to treat the data as confidential.
  `compliance-specialist` must confirm the Anthropic DPA meets s20/s21, or list what is missing.
- **Cross-border transfer (s72).** Personal information leaves South Africa. Section 72 allows this
  only on a listed ground, for example the recipient being bound by law, binding corporate rules or
  a binding agreement giving protection substantially similar to POPIA, or the data subject's
  consent. The likely route is the DPA and its SCCs as the binding agreement, possibly with a clear
  customer consent screen as a second ground. **This is a ruling for `compliance-specialist`, not
  this ADR.**
- **No automated decisions (s71).** The assistant makes no decision about cover, claims or
  recovery. It only reads and explains. Any change to that reopens this ADR.
- **Data subject rights.** Customers can delete their chat history. Deletion on our side does not
  reach copies Anthropic holds under its own retention (up to 30 days, or longer if flagged). The
  privacy notice must say so.

## Prompt injection and abuse controls

- Treat every tool result and customer message as untrusted text. The system prompt says tool
  output is data, not instructions. Tools are read-only and customer-scoped, so a successful
  injection can at most make the assistant say something wrong to the customer about their own
  account. It cannot reach another customer's data or change anything.
- Account scope comes from the session, never from the model's tool arguments.
- Emergency check runs in our backend before the model (Feature 024 §4): "Call 10111 now. Then tap
  Report theft."
- Off-topic and abuse: the system prompt declines non-account topics; per-customer rate limits and
  the daily cost counter limit abuse and cost attacks.
- Output: replies are rendered as plain text in the app (no HTML, no links the model makes up, no
  auto-actions).
- Free-text fields that other people can set (for example asset nicknames, claim notes from staff)
  are length-capped and treated as data.
- `cybersecurity-architect` reviews these controls at Stage 8, including a red-team prompt set.

## Logging and retention

- Store each chat in MongoDB tied to the account: redacted customer messages, assistant replies,
  tool names called, model ID, token counts. No raw tool payloads.
- Keep chats for **90 days**, then delete (TTL index). A chat that becomes a support request is
  kept with that request under its own rule. Both periods are subject to the `compliance-specialist`
  ruling.
- Application logs carry request IDs, latency, token counts and error codes only, never message
  text or tool payloads.
- The API key is never logged.

## Alternatives Considered

- **Other LLM providers (OpenAI, Google Gemini).** Similar capability and similar cross-border
  issue. Rejected for now: the owner chose Anthropic, and the feature design (tool loop, model
  IDs, pricing) is written for it. Not ruled out for later.
- **Claude through a cloud provider (Amazon Bedrock, Google Cloud).** The cloud provider becomes
  the processor, and a region choice may help with residency. Rejected for Phase 1: adds a second
  cloud account and billing next to Render. Revisit if `compliance-specialist` needs a specific
  region.
- **Self-hosted open-weights model.** Keeps data in our control, but needs GPU hosting, ops and
  safety work we do not have. Rejected; cost and effort not justified for read-only lookups.
- **No LLM: scripted FAQ and menu.** Lowest risk and no new processor. Still the fallback if the
  compliance ruling is negative. The "Talk to support" path does not depend on the assistant.
- **Calling Anthropic from the app.** Rejected outright: the key would ship in the app.

## Consequences

- Anthropic is added to the platform's list of operators, next to Supabase and MongoDB Atlas, and
  needs the same DPA and s72 treatment.
- We take on a running cost (about USD 50 per month cap) and a dependency on an outside API; the
  kill switch and "Talk to support" keep the app usable when it is down or off.
- Customer data leaves South Africa for every assistant message. Minimisation and redaction limit
  what that data is.
- Exit plan: the model is behind one backend module and config. Turning off `ASSISTANT_ENABLED`
  and revoking the key stops all transfer at once. Switching provider means replacing that module
  and re-running the §7 evaluation; no app change.

## Open Items

1. **Compliance ruling** (`compliance-specialist`): s72 ground, s20/s21 adequacy of the Anthropic
   DPA, 90-day chat retention, privacy-notice wording, and whether to request ZDR. Needed before
   any real customer uses the assistant; not needed for owner-test.
2. **DPA signature / acceptance** (owner): confirm the Commercial Terms and DPA are accepted on the
   account, keep a dated copy, and record the version. Mirrors the open Supabase DPA item.
3. **Owner account** (owner): create the Anthropic organisation in the business's name, owner as
   admin, business card for billing, set the USD 50 monthly limit, create the dedicated key and
   put it into Render.
4. **Price re-check** before the business case (Feature 024 §5.3 figures were read 2026-11-20).
5. **Covered Models re-check** before any model change.
6. **`cto` ratification** of this ADR before Phase 1b assistant backend code merges.

## Revisit Trigger

Reopen this ADR if: a tool would send location data, documents or ID numbers; the assistant would
take any write action or influence a decision; the model moves to a Covered Model or to
`claude-opus-5-5`; Anthropic changes its retention, training or DPA terms; the compliance ruling
requires a region or ZDR; or monthly spend goes past the cap.

## Sources (read 2026-11-20)

[ret]: https://platform.claude.com/docs/en/manage-claude/api-and-data-retention
[cret]: https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data
[zdr]: https://privacy.claude.com/en/articles/8956058-i-have-a-zero-data-retention-agreement-with-anthropic-what-products-does-it-apply-to
[dpa]: https://privacy.claude.com/en/articles/7996862-how-do-i-view-and-sign-your-data-processing-addendum-dpa
[proc]: https://privacy.claude.com/en/articles/9267385-does-anthropic-act-as-a-data-processor-or-controller
[legal]: https://www.anthropic.com/legal

- API and data retention: https://platform.claude.com/docs/en/manage-claude/api-and-data-retention
- Commercial data retention: https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data
- ZDR scope: https://privacy.claude.com/en/articles/8956058-i-have-a-zero-data-retention-agreement-with-anthropic-what-products-does-it-apply-to
- DPA: https://privacy.claude.com/en/articles/7996862-how-do-i-view-and-sign-your-data-processing-addendum-dpa
- Processor or controller: https://privacy.claude.com/en/articles/9267385-does-anthropic-act-as-a-data-processor-or-controller
- Legal Center: https://www.anthropic.com/legal

## CTO review (2026-11-20, `cto`)

**Ruling: the content is sound. Merge it as Proposed. Do not ratify yet.**

1. **What must happen before ratification:** Open Items 2 and 3 must be closed by the owner. That means the Anthropic organisation is opened in the business's name, the Commercial Terms and DPA are accepted with a dated copy and version on file, the USD 50 limit is set, and the dedicated key is in Render. We do not ratify a processor that has no contract in place. When those are done, `cto` changes the status to Accepted, scoped to owner-test.
2. **The compliance ruling (Open Item 1) does not block ratification.** It does block any real customer, any profile other than owner-test, and the 90-day retention becoming final. That condition carries into the Accepted status.
3. **Decision 7, the owner-test flag:** this is confirmed under Feature 024 §11 item 1. It needs the exception-record addendum and a Stage 8 waiver entry. No other profile is covered.
4. **Who builds first:** `backend-engineer` builds the assistant module, the redaction step and its tests, and the kill switch and counters. `ai-solutions-architect` owns the prompt, the tool allow-lists and the §7 evaluation set. `backend-architect` reviews. Code may be written now, but it merges only after ratification. Its first run in owner-test can happen before the compliance ruling. The Stage 8 review of the redaction step and the injection controls comes before any profile other than owner-test.
