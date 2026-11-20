import { ApiError } from '../../api/errors';
import { mapUserFacingError } from '../user-facing-errors';

function apiError(status: number, code: string) {
  return new ApiError(status, { error: { code, message: code, requestId: 'r1' } });
}

describe('mapUserFacingError — location reports', () => {
  it('503 UPSTREAM_UNAVAILABLE on a location report says tracking is paused, not "waking up"', () => {
    const msg = mapUserFacingError(apiError(503, 'UPSTREAM_UNAVAILABLE'), { context: 'location-report' });
    expect(msg).toBe("Location tracking is paused on our side. We'll keep trying.");
    expect(msg).not.toMatch(/waking up/i);
  });

  it('other contexts keep the cold-start copy for UPSTREAM_UNAVAILABLE', () => {
    expect(mapUserFacingError(apiError(503, 'UPSTREAM_UNAVAILABLE'), { context: 'auth' })).toMatch(/waking up/);
  });

  it('DEVICE_MISMATCH on location says the asset is linked to another phone', () => {
    for (const context of ['location', 'location-report'] as const) {
      expect(mapUserFacingError(apiError(403, 'DEVICE_MISMATCH'), { context })).toMatch(
        /^This asset is linked to another phone/,
      );
    }
    expect(mapUserFacingError(apiError(403, 'DEVICE_MISMATCH'), { context: 'claim' })).toMatch(
      /device you used to sign in/,
    );
  });
});
