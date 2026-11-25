/**
 * "Locate now" target-phone responder (owner-test, FEATURE_REMOTE_LOCATE_ENABLED): answers an
 * open request with one 'remote_request' report only when consent + permission allow; otherwise
 * declines ('consent_required') without sending any location. Shows the transparency notice
 * locally when no server push reached the phone.
 */
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { reportAssetLocation } from '../../api/asset-location';
import { declineLocateRequest, listPendingLocateRequests } from '../../api/locate-requests';
import { useSessionStore } from '../../auth/session-store';
import {
  clearBackgroundLocationConsent,
  setBackgroundLocationConsent,
  setLinkedSmartphoneAssetId,
  setLocationTrackingConsent,
} from '../consent';
import { __resetLocationReporterStateForTests } from '../useLocationReporter';
import {
  REMOTE_LOCATE_NOTICE_BODY,
  __resetRemoteLocateStateForTests,
  answerPendingLocateRequests,
  isLocateRequestPayload,
} from '../remoteLocate';

const mockFlags = { remote: true };
jest.mock('../../config/features', () => ({
  FEATURE_LOCATION_TRACKING_ENABLED: true,
  FEATURE_BACKGROUND_LOCATION_ENABLED: true,
  get FEATURE_REMOTE_LOCATE_ENABLED() {
    return mockFlags.remote;
  },
}));
jest.mock('../../api/asset-location', () => ({ reportAssetLocation: jest.fn(async () => ({})) }));
jest.mock('../../api/client', () => ({ refreshAccessToken: jest.fn(async () => 'new-access') }));
jest.mock('../../api/locate-requests', () => ({
  listPendingLocateRequests: jest.fn(),
  declineLocateRequest: jest.fn(async () => ({ resolved: 1 })),
}));

const report = reportAssetLocation as jest.Mock;
const listPending = listPendingLocateRequests as jest.Mock;
const decline = declineLocateRequest as jest.Mock;
(Notifications as unknown as { scheduleNotificationAsync: jest.Mock }).scheduleNotificationAsync = jest.fn(async () => 'id');
const schedule = (Notifications as unknown as { scheduleNotificationAsync: jest.Mock }).scheduleNotificationAsync;

function pending(notificationSent = true) {
  return {
    data: [
      {
        requestId: 'r1',
        assetId: 'asset-1',
        status: 'pending',
        requestedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
        answeredAt: null,
        locationRecordedAt: null,
        notificationSent,
      },
    ],
  };
}

describe('answerPendingLocateRequests', () => {
  let warn: jest.SpyInstance;
  beforeEach(async () => {
    jest.clearAllMocks();
    mockFlags.remote = true;
    __resetLocationReporterStateForTests();
    __resetRemoteLocateStateForTests();
    jest.replaceProperty(Platform, 'OS', 'android');
    (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(true);
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true, canAskAgain: true });
    (Location.getBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    useSessionStore.setState({ status: 'signed-in', accessToken: 'access-token', sessionId: 's' });
    await setLocationTrackingConsent('granted');
    await setLinkedSmartphoneAssetId('asset-1');
    await setBackgroundLocationConsent();
    listPending.mockResolvedValue(pending());
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it("sends one fix with triggeredBy 'remote_request' and no remoteContext claim", async () => {
    expect(await answerPendingLocateRequests('foreground')).toBe('sent');
    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith('asset-1', expect.objectContaining({ triggeredBy: 'remote_request' }));
    expect(report.mock.calls[0][1]).not.toHaveProperty('remoteContext');
    expect(decline).not.toHaveBeenCalled();
  });

  it.each(['foreground', 'background'] as const)(
    'needs background consent + "all the time" even when answering in the %s',
    async (context) => {
      expect(await answerPendingLocateRequests(context)).toBe('sent');

      report.mockClear();
      await clearBackgroundLocationConsent();
      expect(await answerPendingLocateRequests(context)).toBe('declined_no_consent');
      expect(report).not.toHaveBeenCalled();
      expect(decline).toHaveBeenCalledWith('asset-1');

      decline.mockClear();
      await setBackgroundLocationConsent();
      (Location.getBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false });
      expect(await answerPendingLocateRequests(context)).toBe('declined_no_consent');
      expect(report).not.toHaveBeenCalled();
      expect(decline).toHaveBeenCalledWith('asset-1');
    },
  );

  it('declines on iOS (no background consent path there)', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    expect(await answerPendingLocateRequests('foreground')).toBe('declined_no_consent');
    expect(report).not.toHaveBeenCalled();
    expect(decline).toHaveBeenCalledWith('asset-1');
  });

  it('declines without sending a location when local consent is missing', async () => {
    await setLocationTrackingConsent('denied');
    expect(await answerPendingLocateRequests('foreground')).toBe('declined_no_consent');
    expect(report).not.toHaveBeenCalled();
    expect(decline).toHaveBeenCalledWith('asset-1');
  });

  it('declines when the OS permission is gone', async () => {
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false, canAskAgain: true });
    expect(await answerPendingLocateRequests('foreground')).toBe('declined_no_consent');
    expect(report).not.toHaveBeenCalled();
  });

  it('does nothing when there is no open request', async () => {
    listPending.mockResolvedValue({ data: [] });
    expect(await answerPendingLocateRequests('foreground')).toBe('none_pending');
    expect(report).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
  });

  it('shows the transparency notice locally only when no server push reached the phone', async () => {
    await answerPendingLocateRequests('foreground');
    expect(schedule).not.toHaveBeenCalled();
    listPending.mockResolvedValue(pending(false));
    await answerPendingLocateRequests('foreground');
    expect(schedule).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.objectContaining({ body: REMOTE_LOCATE_NOTICE_BODY }) }),
    );
  });

  it('is inert with the flag off (no network, no location)', async () => {
    mockFlags.remote = false;
    expect(await answerPendingLocateRequests('foreground')).toBe('flag_off');
    expect(listPending).not.toHaveBeenCalled();
    expect(report).not.toHaveBeenCalled();
  });

  it('a server CONSENT_REQUIRED refusal is quiet', async () => {
    report.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'CONSENT_REQUIRED', status: 403 }));
    const outcome = await answerPendingLocateRequests('foreground');
    expect(['server_refused', 'send_failed']).toContain(outcome);
  });
});

describe('isLocateRequestPayload', () => {
  it('finds the wake-up event in the shapes the platforms deliver', () => {
    expect(isLocateRequestPayload({ event: 'location.locate.request' })).toBe(true);
    expect(isLocateRequestPayload({ data: { event: 'location.locate.request' } })).toBe(true);
    expect(isLocateRequestPayload({ data: { body: JSON.stringify({ event: 'location.locate.request' }) } })).toBe(true);
    expect(isLocateRequestPayload({ event: 'location.tracking.enabled' })).toBe(false);
    expect(isLocateRequestPayload(null)).toBe(false);
  });
});
