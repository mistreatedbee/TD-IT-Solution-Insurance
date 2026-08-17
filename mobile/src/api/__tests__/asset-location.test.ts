/**
 * Asset location API client — Feature 008 endpoints.
 */
import { useSessionStore } from '../../auth/session-store';
import {
  getAssetLocation,
  listAssetLocationSummary,
  reportAssetLocation,
} from '../asset-location';

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe('api/asset-location', () => {
  beforeEach(() => {
    useSessionStore.getState().setSignedIn({ accessToken: 'access-token', sessionId: 'sess-1' });
    jest.restoreAllMocks();
  });

  it('POST /assets/:id/location-report sends coordinates and trigger', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(200, {
        latitude: -26.2,
        longitude: 28.04,
        recordedAt: '2026-08-14T08:00:00.000Z',
        source: 'self_device',
      }),
    );

    await reportAssetLocation('507f1f77bcf86cd799439011', {
      latitude: -26.2,
      longitude: 28.04,
      accuracyMeters: 15,
      triggeredBy: 'manual_refresh',
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      'http://localhost:3000/api/v1/assets/507f1f77bcf86cd799439011/location-report',
    );
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toMatchObject({
      latitude: -26.2,
      longitude: 28.04,
      triggeredBy: 'manual_refresh',
    });
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer access-token');
  });

  it('GET /assets/:id/location uses bearer token', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(200, {
        latitude: -26.2,
        longitude: 28.04,
        recordedAt: '2026-08-14T08:00:00.000Z',
      }),
    );

    await getAssetLocation('507f1f77bcf86cd799439011');

    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://localhost:3000/api/v1/assets/507f1f77bcf86cd799439011/location');
  });

  it('GET /assets/location-summary returns all assets', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(200, {
        data: [
          {
            assetId: 'a1',
            displayName: 'My phone',
            assetType: 'smartphone',
            lastLocation: null,
          },
        ],
      }),
    );

    const page = await listAssetLocationSummary();

    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://localhost:3000/api/v1/assets/location-summary');
    expect(page.data).toHaveLength(1);
  });
});
