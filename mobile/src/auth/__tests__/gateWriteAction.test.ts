import { gateWriteAction } from '../gateWriteAction';
import { fetchLiveAccountForGating } from '../useAccountQuery';

jest.mock('../useAccountQuery', () => ({
  fetchLiveAccountForGating: jest.fn(),
}));

const fetchLiveAccountForGatingMock = fetchLiveAccountForGating as jest.Mock;

describe('gateWriteAction', () => {
  const push = jest.fn();
  const router = { push } as never;

  beforeEach(() => {
    push.mockReset();
    fetchLiveAccountForGatingMock.mockReset();
  });

  it('returns verified for active accounts', async () => {
    fetchLiveAccountForGatingMock.mockResolvedValue({
      accountState: 'active',
      email: 'user@example.com',
    });

    const result = await gateWriteAction(router);

    expect(result).toBe('verified');
    expect(push).not.toHaveBeenCalled();
  });

  it('redirects pending verification to verification gate', async () => {
    fetchLiveAccountForGatingMock.mockResolvedValue({
      accountState: 'pending_verification',
      email: 'pending@example.com',
    });

    const result = await gateWriteAction(router);

    expect(result).toBe('verification_required');
    expect(push).toHaveBeenCalledWith({
      pathname: '/verification-gate',
      params: { email: 'pending@example.com' },
    });
  });

  it('returns error when live account fetch fails', async () => {
    fetchLiveAccountForGatingMock.mockRejectedValue(new Error('network'));

    const result = await gateWriteAction(router);

    expect(result).toBe('error');
  });
});
