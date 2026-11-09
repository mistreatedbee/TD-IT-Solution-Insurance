/**
 * OB-04 shared append helper — SR-019-2(a) (flag on/off, never throws, correct
 * failure-log shape). See backend-architecture-event-model.md §12.2 A1(c).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { appendRecoveryCaseEvent } from './recovery-case-event-append.js';
import type { AppContext } from '../context.js';
import type { NewRecoveryCaseEventInput } from '../repositories/recovery-case-events.js';

function fakeCtx(opts: {
  enabled: boolean;
  appendImpl?: (input: NewRecoveryCaseEventInput) => Promise<unknown>;
}): AppContext {
  return {
    env: { recoveryCaseEventsEnabled: opts.enabled },
    recoveryCaseEvents: {
      append: opts.appendImpl ?? (async (input: NewRecoveryCaseEventInput) => ({ id: 'evt-1', ...input })),
    },
  } as unknown as AppContext;
}

const sampleInput: NewRecoveryCaseEventInput = {
  eventType: 'case_created',
  caseId: '507f1f77bcf86cd799439011',
  occurredAt: new Date('2026-08-01T12:00:00.000Z'),
  actor: { type: 'customer', accountId: null, partnerOrganizationId: null },
  fromStatus: null,
  toStatus: null,
  fromPartnerOrganizationId: null,
  toPartnerOrganizationId: null,
  closeReason: null,
  auditRequestId: 'req-123',
};

describe('lib/recovery-case-event-append', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls append and returns the result when the flag is on', async () => {
    const ctx = fakeCtx({ enabled: true });
    const result = await appendRecoveryCaseEvent(ctx, sampleInput.caseId, sampleInput);
    expect(result).toMatchObject({ id: 'evt-1', eventType: 'case_created' });
  });

  it('is a no-op (does not call append) when the flag is off', async () => {
    const append = vi.fn();
    const ctx = fakeCtx({ enabled: false, appendImpl: append });
    const result = await appendRecoveryCaseEvent(ctx, sampleInput.caseId, sampleInput);
    expect(append).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });

  it('never throws when append fails, and returns undefined', async () => {
    const ctx = fakeCtx({
      enabled: true,
      appendImpl: async () => {
        throw new TypeError('db unavailable');
      },
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const result = await appendRecoveryCaseEvent(ctx, sampleInput.caseId, sampleInput);
    expect(result).toBeUndefined();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('logs recovery_case_event_append_failed with only caseId, eventType, auditRequestId, errorClass', async () => {
    const ctx = fakeCtx({
      enabled: true,
      appendImpl: async () => {
        throw new TypeError('db unavailable with sensitive detail: account 12345');
      },
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await appendRecoveryCaseEvent(ctx, sampleInput.caseId, sampleInput);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(errorSpy.mock.calls[0]![0] as string) as Record<string, unknown>;
    expect(logged).toEqual({
      log: 'recovery_case_event_append_failed',
      caseId: sampleInput.caseId,
      eventType: sampleInput.eventType,
      auditRequestId: sampleInput.auditRequestId,
      errorClass: 'TypeError',
    });
    // No accountId, no message text, no req.params leakage.
    expect(JSON.stringify(logged)).not.toContain('sensitive detail');
    expect(JSON.stringify(logged)).not.toContain('account 12345');
  });
});
