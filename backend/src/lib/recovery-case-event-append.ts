/**
 * OB-04 shared append helper (SR-019-2(a), §12.2 A1(c) of
 * docs/features/019-case-history-timeline/backend-architecture-event-model.md).
 *
 * Every route that writes to `recovery_case_events` must go through this
 * helper rather than calling `ctx.recoveryCaseEvents.append(...)` directly, so
 * the flag check and the fail-open-to-the-caller failure handling live in one
 * place:
 *  - Checks `ctx.env.recoveryCaseEventsEnabled`. When off, this is a no-op
 *    (does not call `append`, does not log, returns `undefined`).
 *  - When on, runs `append()` in its own try/catch. On success, returns the
 *    inserted document.
 *  - On failure, emits exactly one `error`-level structured log line,
 *    `recovery_case_event_append_failed`, carrying ONLY the database caseId
 *    (never `req.params` or any other raw request data), `eventType`,
 *    `auditRequestId`, and the error's class name (`err.name`/constructor
 *    name) — no message text, no accountIds (SR-019-2(a), §10.3.3). It then
 *    swallows the error and returns `undefined` — it NEVER throws to the
 *    caller, so a case-history write failure can never turn a successful
 *    case mutation into a 5xx (§9.2's rejection of the original §4.1 design).
 *
 * Metrics: this codebase has no metrics/counter facility today (no
 * prom-client, statsd, or equivalent found under `backend/src`) — searched at
 * build time. SR-019-2(a)'s "bump a counter" is therefore not implemented;
 * the structured log line is the only interim detective control, as the
 * design doc's §9.3 SR-019-2(d) already anticipates ("the `append_failed`
 * alert is the interim detective control"). Add a counter increment here
 * once a metrics facility exists in this codebase.
 */
import type { AppContext } from '../context.js';
import type {
  NewRecoveryCaseEventInput,
  RecoveryCaseEventDocument,
} from '../repositories/recovery-case-events.js';

function errorClassName(err: unknown): string {
  if (err instanceof Error) return err.constructor.name || err.name || 'Error';
  return typeof err;
}

/**
 * Appends a case-history event if `recoveryCaseEventsEnabled` is on. Never
 * throws. `caseId` must be the database id (e.g. `result.id` / the pre-read's
 * `existing.id`), never `req.params.caseId`, even in the failure log
 * (SR-019-1, §10.3.3).
 */
export async function appendRecoveryCaseEvent(
  ctx: AppContext,
  caseId: string,
  input: NewRecoveryCaseEventInput,
): Promise<RecoveryCaseEventDocument | undefined> {
  if (!ctx.env.recoveryCaseEventsEnabled) return undefined;
  try {
    return await ctx.recoveryCaseEvents.append(input);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify({
        log: 'recovery_case_event_append_failed',
        caseId,
        eventType: input.eventType,
        auditRequestId: input.auditRequestId,
        errorClass: errorClassName(err),
      }),
    );
    return undefined;
  }
}
