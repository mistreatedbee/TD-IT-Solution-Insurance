import { ApiError, NetworkUnavailableError } from '../../api/errors';
import { mapUserFacingError } from '../user-facing-errors';

describe('mapUserFacingError', () => {
  it('maps ApiError codes to actionable copy', () => {
    const err = new ApiError(401, {
      error: { code: 'INVALID_CREDENTIALS', message: 'Incorrect email or password.', requestId: 'r1' },
    });
    expect(mapUserFacingError(err, { context: 'auth' })).toContain('Incorrect email');
  });

  it('never surfaces raw fetch failures', () => {
    expect(mapUserFacingError(new Error('TypeError: fetch failed'))).not.toContain('TypeError');
  });

  it('passes through NetworkUnavailableError friendly text', () => {
    const err = new NetworkUnavailableError();
    expect(mapUserFacingError(err)).toContain('Could not reach the server');
  });

  it('maps supabase-like login errors', () => {
    expect(mapUserFacingError(new Error('Invalid login credentials'), { context: 'auth' })).toContain(
      'Incorrect email',
    );
  });

  it('uses context fallback for unknown errors', () => {
    expect(mapUserFacingError({ weird: true }, { context: 'claim' })).toContain('claim');
  });
});
