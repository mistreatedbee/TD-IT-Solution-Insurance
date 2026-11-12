import { login, mfaChallenge } from '../auth';
import { ApiError } from '../errors';

function res(status: number, body: unknown = { error: { code: 'X', message: 'm', requestId: 'r' } }) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) } as Response;
}
const ok = { accessToken: 'a', refreshToken: 'r', sessionId: 's' };
const params = { email: 'a@b.co', password: 'pw', deviceId: 'd' };

beforeEach(() => jest.restoreAllMocks());

describe('login transient retry', () => {
  it.each([502, 503, 504])('retries once on %i then succeeds', async (status) => {
    const f = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(res(status)).mockResolvedValueOnce(res(200, ok));
    await expect(login(params)).resolves.toEqual(ok);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('retries once on network failure, and only once', async () => {
    const f = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Network request failed'));
    await expect(login(params)).rejects.toMatchObject({ name: 'NetworkUnavailableError' });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('retries once on non-JSON 502 body', async () => {
    const html = { ok: false, status: 502, text: async () => '<html>' } as Response;
    const f = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(html).mockResolvedValueOnce(res(200, ok));
    await expect(login(params)).resolves.toEqual(ok);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it.each([400, 401, 423, 429, 500])('never retries on %i', async (status) => {
    const f = jest.spyOn(globalThis, 'fetch').mockResolvedValue(res(status));
    await expect(login(params)).rejects.toBeInstanceOf(ApiError);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('never retries the MFA challenge, even on 503', async () => {
    const f = jest.spyOn(globalThis, 'fetch').mockResolvedValue(res(503));
    await expect(mfaChallenge({ mfaChallengeToken: 't', code: '123456' })).rejects.toBeInstanceOf(ApiError);
    expect(f).toHaveBeenCalledTimes(1);
  });
});
