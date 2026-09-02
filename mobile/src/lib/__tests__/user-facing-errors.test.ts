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

  it('maps plan-change ApiError codes for policy context', () => {
    expect(
      mapUserFacingError(
        new ApiError(409, {
          error: {
            code: 'PLAN_DOWNGRADE_NOT_ALLOWED',
            message: 'This plan change is not allowed while you have more registered assets than the new plan allows.',
            requestId: 'r-plan',
          },
        }),
        { context: 'policy' },
      ),
    ).toContain('more registered assets than this plan allows');

    expect(
      mapUserFacingError(
        new ApiError(422, {
          error: {
            code: 'PLAN_REQUIRES_QUOTE',
            message: 'This plan requires a custom quote.',
            requestId: 'r-quote',
          },
        }),
        { context: 'policy' },
      ),
    ).toContain('custom quote');
  });
});
