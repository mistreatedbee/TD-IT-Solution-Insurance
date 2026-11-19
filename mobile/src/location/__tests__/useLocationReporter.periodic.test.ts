/**
 * Owner-test 2-minute periodic foreground reporting (FEATURE_LAUNCH_LOCATION_PROMPT_ENABLED).
 * Stops on background, on consent withdrawal, and on unmount (sign-out); never double-sends on
 * resume + tick; a server validation rejection of 'periodic_foreground' is quiet and non-fatal.
 */
import * as Location from 'expo-location';
import { AppState, type AppStateStatus } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';
import { reportAssetLocation } from '../../api/asset-location';
import { ApiError } from '../../api/errors';
import {
  clearLocationTrackingConsent,
  setLinkedSmartphoneAssetId,
  setLocationTrackingConsent,
} from '../consent';
import {
  PERIODIC_REPORT_INTERVAL_MS,
  __resetLocationReporterStateForTests,
  canReportLocation,
  getLastLocationSentAt,
  markLocationSent,
  maybeReportForegroundLocation,
  useLocationReporter,
  wasLocationSentRecently,
} from '../useLocationReporter';

jest.mock('../../api/asset-location', () => ({ reportAssetLocation: jest.fn(async () => ({})) }));
jest.mock('../../config/features', () => ({
  FEATURE_LOCATION_TRACKING_ENABLED: true,
  FEATURE_LAUNCH_LOCATION_PROMPT_ENABLED: true,
}));

const report = reportAssetLocation as jest.Mock;
let appStateHandler: ((s: AppStateStatus) => void) | null = null;

function triggers(): string[] {
  return report.mock.calls.map((c) => (c[1] as { triggeredBy: string }).triggeredBy);
}

async function advance(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

async function setAppState(next: AppStateStatus) {
  await act(async () => {
    appStateHandler?.(next);
    await jest.advanceTimersByTimeAsync(0);
  });
}

async function mount() {
  const hook = await renderHook(() => useLocationReporter());
  await advance(0);
  return hook;
}

describe('useLocationReporter — periodic foreground reporting', () => {
  let addListener: jest.SpyInstance;

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    __resetLocationReporterStateForTests();
    Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
    addListener = jest.spyOn(AppState, 'addEventListener').mockImplementation(((
      _type: string,
      handler: (s: AppStateStatus) => void,
    ) => {
      appStateHandler = handler;
      return { remove: jest.fn() };
    }) as never);
    (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(true);
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true, canAskAgain: true });
    report.mockImplementation(async () => ({}));
    await setLocationTrackingConsent('granted');
    await setLinkedSmartphoneAssetId('asset-1');
  });

  afterEach(async () => {
    addListener.mockRestore();
    appStateHandler = null;
    jest.useRealTimers();
    await clearLocationTrackingConsent();
  });

  it("reports on open, then every 2 minutes with triggeredBy 'periodic_foreground'", async () => {
    await mount();
    expect(triggers()).toEqual(['foreground_open']);
    await advance(PERIODIC_REPORT_INTERVAL_MS);
    expect(triggers()).toEqual(['foreground_open', 'periodic_foreground']);
    await advance(PERIODIC_REPORT_INTERVAL_MS);
    expect(triggers()).toEqual(['foreground_open', 'periodic_foreground', 'periodic_foreground']);
    expect(report).toHaveBeenCalledWith('asset-1', expect.objectContaining({ triggeredBy: 'periodic_foreground' }));
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });

  it('stops when the app goes to the background', async () => {
    await mount();
    await setAppState('background');
    await advance(PERIODIC_REPORT_INTERVAL_MS * 3);
    expect(triggers()).toEqual(['foreground_open']);
  });

  it('does not double-send on resume + tick: the timer restarts from the resume report', async () => {
    await mount();
    await advance(PERIODIC_REPORT_INTERVAL_MS - 20_000);
    await setAppState('background');
    await setAppState('active');
    expect(triggers()).toEqual(['foreground_open', 'foreground_open']);
    // The original tick time passes — nothing fires alongside the resume report.
    await advance(20_000);
    expect(triggers()).toEqual(['foreground_open', 'foreground_open']);
    // A full interval after the resume, the periodic report comes.
    await advance(PERIODIC_REPORT_INTERVAL_MS - 20_000);
    expect(triggers()).toEqual(['foreground_open', 'foreground_open', 'periodic_foreground']);
  });

  it('never runs two sends at once (in-flight guard)', async () => {
    let release: () => void = () => {};
    report.mockImplementationOnce(() => new Promise<void>((resolve) => (release = resolve)));
    const first = maybeReportForegroundLocation('foreground_open');
    await jest.advanceTimersByTimeAsync(0);
    expect(await maybeReportForegroundLocation('periodic_foreground')).toBe('skipped_in_flight');
    release();
    expect(await first).toBe('sent');
    expect(report).toHaveBeenCalledTimes(1);
  });

  it('stops as soon as consent is withdrawn', async () => {
    await mount();
    await act(async () => {
      await clearLocationTrackingConsent();
      await jest.advanceTimersByTimeAsync(0);
    });
    // Put the value back WITHOUT a change notification: if the withdrawal had not stopped the
    // timer itself (immediately, not just on the next tick's gate), the next tick would send.
    const SecureStore = require('expo-secure-store');
    await SecureStore.setItemAsync('td_insurance.location_tracking_consent', 'granted');
    await advance(PERIODIC_REPORT_INTERVAL_MS * 3);
    expect(triggers()).toEqual(['foreground_open']);
  });

  it('restarts the timer when consent is granted while the app is open', async () => {
    await clearLocationTrackingConsent();
    await mount();
    expect(triggers()).toEqual([]);
    await act(async () => {
      await setLocationTrackingConsent('granted');
      await jest.advanceTimersByTimeAsync(0);
    });
    await advance(PERIODIC_REPORT_INTERVAL_MS);
    expect(triggers()).toEqual(['periodic_foreground']);
  });

  it('re-checks the gate on every tick (consent changed without notification → no send, timer stops)', async () => {
    await mount();
    const SecureStore = require('expo-secure-store');
    await SecureStore.deleteItemAsync('td_insurance.location_tracking_consent');
    await advance(PERIODIC_REPORT_INTERVAL_MS);
    // restoring consent silently must not revive the stopped timer
    await SecureStore.setItemAsync('td_insurance.location_tracking_consent', 'granted');
    await advance(PERIODIC_REPORT_INTERVAL_MS * 2);
    expect(triggers()).toEqual(['foreground_open']);
  });

  it('stops on unmount (sign-out)', async () => {
    const hook = await mount();
    await act(async () => {
      await hook.unmount();
    });
    await advance(PERIODIC_REPORT_INTERVAL_MS * 3);
    expect(triggers()).toEqual(['foreground_open']);
  });

  it("treats a server validation rejection of 'periodic_foreground' as quiet and non-fatal (no retry storm)", async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await mount();
    report.mockRejectedValue(
      new ApiError(422, { error: { code: 'validation_error', message: 'lat -26.2041 bad trigger', requestId: 'r' } } as never),
    );
    await advance(PERIODIC_REPORT_INTERVAL_MS);
    await advance(PERIODIC_REPORT_INTERVAL_MS * 5);
    expect(triggers()).toEqual(['foreground_open', 'periodic_foreground']);
    const logged = warn.mock.calls.map((c) => c.join(' ')).join(' ');
    expect(logged).toContain('periodic report failed: ApiError');
    expect(logged).not.toMatch(/26\.2041|bad trigger/);
    warn.mockRestore();
  });

  it('exposes a shared gate and last-sent timestamp for a future background sender', async () => {
    expect(await canReportLocation()).toEqual({ ok: true, assetId: 'asset-1' });
    expect(getLastLocationSentAt()).toBeNull();
    markLocationSent(1_000);
    expect(wasLocationSentRecently(PERIODIC_REPORT_INTERVAL_MS, 1_000 + PERIODIC_REPORT_INTERVAL_MS - 1)).toBe(true);
    expect(wasLocationSentRecently(PERIODIC_REPORT_INTERVAL_MS, 1_000 + PERIODIC_REPORT_INTERVAL_MS)).toBe(false);
    await clearLocationTrackingConsent();
    expect(await canReportLocation()).toEqual({ ok: false, reason: 'no_consent' });
  });
});
