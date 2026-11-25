/**
 * "Locate now" requesting side: asking -> answered (refreshes the map) / expired -> "didn't
 * answer" / consent_required / rate limited.
 */
import { act, renderHook } from '@testing-library/react-native';
import { getLatestLocateRequest, requestLocate } from '../../api/locate-requests';
import { ApiError } from '../../api/errors';
import { LOCATE_NOW_COPY, LOCATE_POLL_INTERVAL_MS, locateNowMessage, useLocateNow } from '../useLocateNow';

jest.mock('../../api/locate-requests', () => ({
  requestLocate: jest.fn(),
  getLatestLocateRequest: jest.fn(),
}));
const ask = requestLocate as jest.Mock;
const latest = getLatestLocateRequest as jest.Mock;

function req(status: string, extra: Record<string, unknown> = {}) {
  return {
    requestId: 'r1',
    assetId: 'a1',
    status,
    requestedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
    answeredAt: null,
    locationRecordedAt: null,
    notificationSent: true,
    ...extra,
  };
}

describe('useLocateNow', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });
  afterEach(() => jest.useRealTimers());

  it('shows "Asking your phone…" then "Updated just now" and refreshes the location reads', async () => {
    ask.mockResolvedValue(req('pending'));
    latest.mockResolvedValueOnce(req('pending')).mockResolvedValueOnce(req('answered', { locationRecordedAt: new Date().toISOString() }));
    const onAnswered = jest.fn();
    const { result } = await renderHook(() => useLocateNow('a1', onAnswered));
    await act(async () => {
      await result.current.locate();
    });
    expect(locateNowMessage(result.current.state)).toBe(LOCATE_NOW_COPY.asking);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(LOCATE_POLL_INTERVAL_MS * 2);
    });
    expect(locateNowMessage(result.current.state)).toBe(LOCATE_NOW_COPY.answered);
    expect(onAnswered).toHaveBeenCalledTimes(1);
  });

  it('says the phone did not answer once the request expires', async () => {
    ask.mockResolvedValue(req('pending'));
    latest.mockResolvedValue(req('expired'));
    const { result } = await renderHook(() => useLocateNow('a1'));
    await act(async () => {
      await result.current.locate();
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(LOCATE_POLL_INTERVAL_MS);
    });
    expect(locateNowMessage(result.current.state)).toBe(LOCATE_NOW_COPY.no_answer);
  });

  it('reports consent_required straight from the request', async () => {
    ask.mockResolvedValue(req('consent_required'));
    const { result } = await renderHook(() => useLocateNow('a1'));
    await act(async () => {
      await result.current.locate();
    });
    expect(locateNowMessage(result.current.state)).toBe(LOCATE_NOW_COPY.consent_required);
    expect(latest).not.toHaveBeenCalled();
  });

  const stepUpError = () =>
    new ApiError(401, { error: { code: 'STEP_UP_REQUIRED', message: 'x', requestId: 'r' } } as never);

  it('opens the step-up prompt on STEP_UP_REQUIRED, then re-sends the request once', async () => {
    ask.mockRejectedValueOnce(stepUpError()).mockResolvedValueOnce(req('pending'));
    const { result } = await renderHook(() => useLocateNow('a1'));
    await act(async () => {
      await result.current.locate();
    });
    expect(result.current.stepUpOpen).toBe(true);
    expect(locateNowMessage(result.current.state)).toBe(LOCATE_NOW_COPY.step_up);
    await act(async () => {
      await result.current.onStepUpVerified();
    });
    expect(ask).toHaveBeenCalledTimes(2);
    expect(ask).toHaveBeenLastCalledWith('a1');
    expect(result.current.stepUpOpen).toBe(false);
    expect(locateNowMessage(result.current.state)).toBe(LOCATE_NOW_COPY.asking);
  });

  it('does not loop when step-up is still required after confirming', async () => {
    ask.mockRejectedValue(stepUpError());
    const { result } = await renderHook(() => useLocateNow('a1'));
    await act(async () => {
      await result.current.locate();
    });
    await act(async () => {
      await result.current.onStepUpVerified();
    });
    expect(ask).toHaveBeenCalledTimes(2);
    expect(result.current.stepUpOpen).toBe(false);
    expect(locateNowMessage(result.current.state)).toBe(LOCATE_NOW_COPY.step_up_failed);
  });

  it('sends nothing when the customer cancels the step-up prompt', async () => {
    ask.mockRejectedValueOnce(stepUpError());
    const { result } = await renderHook(() => useLocateNow('a1'));
    await act(async () => {
      await result.current.locate();
    });
    await act(async () => {
      result.current.onStepUpCancel();
    });
    expect(ask).toHaveBeenCalledTimes(1);
    expect(result.current.stepUpOpen).toBe(false);
    expect(locateNowMessage(result.current.state)).toBe(LOCATE_NOW_COPY.step_up_cancelled);
  });

  it('explains a rate limit', async () => {
    ask.mockRejectedValue(new ApiError(429, { error: { code: 'RATE_LIMITED', message: 'x', requestId: 'r' } } as never));
    const { result } = await renderHook(() => useLocateNow('a1'));
    await act(async () => {
      await result.current.locate();
    });
    expect(locateNowMessage(result.current.state)).toBe(LOCATE_NOW_COPY.rate_limited);
  });
});
