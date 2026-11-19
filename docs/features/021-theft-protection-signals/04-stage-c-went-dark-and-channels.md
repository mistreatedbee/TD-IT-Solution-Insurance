# Feature 021 stage (c): went-dark detection and alert channels

**Author:** `backend-engineer`. **Date:** 2026-11-17. **Status:** built and unit-tested with fakes; not wired to any scheduler or real data source; nothing enabled. Append-only: later roles add sections, they do not rewrite this one.
**Governing:** design note sections 1, 3, 7, 9; ADR-0020 (D2, D3, D5, D7); ADR-0009 SDL-2; roadmap TP-03, TP-14. Gate A is not widened; `LOCATION_INGESTION_ENABLED` is untouched.

## 1. What was built

| Piece | File (`backend/src/lib/` unless noted) |
|---|---|
| Alert types (went_dark + 6 reserved), fixed wording | `safety-alert-copy.ts` |
| Channel dispatcher: push, then SMS, then email | `safety-alert-dispatcher.ts` |
| SMS port + `NotConfiguredSmsSender` | `sms-sender.ts` |
| Adapters to existing infra (Expo push, Resend, accounts, audit log, KeyValueStore) | `safety-alert-adapters.ts` |
| Pure evaluator `evaluateWentDark(input, policy)` | `went-dark-evaluator.ts` |
| Job runner `runWentDarkCheck(deps, now)` + state stores | `went-dark-job.ts` |
| Policy constants (`SAFETY_ALERT_*`, `WENT_DARK_*`) | `policy.ts` |
| New preference category `safety_alerts` (default push on, email on, SMS off; older stored documents are filled from defaults) | `repositories/notification-preferences.ts`, `routes/notifications.ts` (non-breaking: one optional PATCH key) |
| Push template `safety.alert`; email `buildSafetyAlertEmail` | `notification-brand.ts`, `domain-email-templates.ts` |
| Audit event `safety_alert_dispatch` + `safety_alert_detail` column | `repositories/audit-log.ts`, `migrations/042_feature021_stage_c_safety_alert_audit.sql` (**written, not applied**) |

No public route was added. No change to `tracking-profile.ts`, `tracking-device-types.ts` or the tracking-devices repository.

## 2. Channel rules

Order PUSH, SMS, EMAIL; stop at the first delivery. Move on when a channel is unavailable (no push token, SMS not configured, no phone/email on file), did not deliver, threw, or is switched off in the customer's `safety_alerts` preferences. SMS is opt-in only (`sms: false` by default) because it is paid and the vendor is undecided. `NotConfiguredSmsSender` reports `not_configured`, never throws and never pretends to send; the dispatcher records it and falls through. Every attempt writes one audit row (`alertType|channel|outcome|deviceId`; no label, message text, location or contact detail); an audit failure never blocks delivery. De-duplication: one alert per account + type + device + variant per 6 h; a per-account, per-type cap of 6 a day. A total delivery failure releases the de-dup key so the next run retries; a cap hit also releases it.

## 3. Went-dark rules

Silent for no more than expected interval + grace (default 15 min + 10 min) is fine. Beyond that: `quiet`. Beyond 12 intervals + grace: `lost_contact`. If the last movement state was `moving` and was reported within one interval + grace of the last contact: priority `high` and the lost-contact threshold is halved. No heartbeat ever means `unknown`: never alerted, never cleared. Paused / planned-travel devices (`isSuppressed`, default none) are skipped with state untouched. The idempotency key is device + silence start (+ severity, so quiet then lost_contact is exactly one extra alert). A device that reports on time again has its state cleared. Only timestamps and the movement state are read; nothing location-like is in any type. Wording: "We stopped hearing from this device"; the lock-screen push never names the asset; nothing says stolen.

**Stage (d) extension point:** "away from known places" is not here. It is a sibling pure evaluator over coarse zones, merged in `went-dark-job.ts` (marked in the file header). It must not widen `DeviceHeartbeat` with location.

## 4. Safety-alert preference rule applied, and the compliance question

**Rule applied:** safety alerts respect the customer's own preferences on every channel, with no override. Only protection-change notices (stage (b), out-of-band by design) bypass preferences. If a customer turns off push and email for `safety_alerts`, a went-dark alert is audited as `skipped_preference` and not sent.

**Question for `compliance-specialist`:** is a went-dark or behaviour alert a "security-critical" notice that must reach the customer on at least one channel despite opt-outs (as POPIA/ECTA direct-marketing rules do not apply to service messages, but the contract may promise protection)? Alternatives: (a) as built; (b) a non-disableable email floor; (c) force a one-time confirmation when the customer disables the last channel ("you will no longer be told when we stop hearing from your device"). Also: SMS operator agreement and cross-border transfer, and retention of `safety_alert_dispatch` audit rows.

## 5. Ports and who implements them

| Port | Implementer |
|---|---|
| `DeviceHeartbeatSource.listActiveHeartbeats()` (deviceId, accountId, assetId, lastSeenAt, expectedIntervalSeconds, lastMovementState, lastReportedAt) | **GT06 ingest branch (`spike/gt06-ingest-pilot`)** once merged; the tracking-devices repository has no heartbeat fields on this branch. Vendor mapping stays inside that adapter. |
| `SmsSender` | New **SMS vendor decision** (owner cost, `integration-architect`, `compliance-specialist`). Until then `NotConfiguredSmsSender`. |
| `IsSuppressed` | Planned-travel / pause feature (later). Default `NEVER_SUPPRESSED`. |
| `WentDarkStateStore`, `AlertThrottle` | Done over `KeyValueStore` (Redis in production; in-memory store is per-process, so tests only). |

**Scheduling:** existing jobs are standalone scripts under `backend/scripts/` run by an external scheduler; there is no in-process scheduler. A thin script (not written, because there is no real heartbeat source yet) should build the ports and call `runWentDarkCheck` every few minutes from a Render cron job, one instance at a time. Apply migration 042 before the first real dispatch (enum value and column); until then the audit sink would fail and only log.

## 6. Honest limits

- There is no power-off blocker and none is implied.
- A silent device may simply be switched off, flat or out of coverage; the alert says "we stopped hearing", not "stolen".
- Absence of a heartbeat is `unknown`, never "safe" and never "dark".
- Expo "accepted" is not "shown on the handset"; push `delivered` means accepted.
- A device suppressed while silent alerts once the suppression ends, if it is still silent.
- Sensitivity, quiet hours and per-customer thresholds are not built; thresholds are global constants.
- Needs Stage 8 (security review) and Stage 10 (QA) before any enablement. Stage 8 should look at: the preference-override question, audit vocabulary, and the cap values.
