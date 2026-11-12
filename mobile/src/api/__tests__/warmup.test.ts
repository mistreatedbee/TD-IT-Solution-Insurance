import { _resetWarmUpForTests, warmUpBackend } from '../warmup';

describe('warmUpBackend', () => {
  beforeEach(() => {
    _resetWarmUpForTests();
    jest.restoreAllMocks();
  });

  it('fires once to the readiness endpoint, unauthenticated, and swallows errors', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('down'));
    warmUpBackend();
    warmUpBackend();
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/health\/ready$/);
    expect(init.headers).toBeUndefined();
    expect(init.body).toBeUndefined();
  });

  it('does not throw if fetch throws synchronously', () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('boom');
    });
    expect(() => warmUpBackend()).not.toThrow();
  });
});
