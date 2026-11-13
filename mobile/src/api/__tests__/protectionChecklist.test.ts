import { useSessionStore } from '../../auth/session-store';
import { shouldPersistQuery } from '../../query/persistPolicy';
import { getProtectionChecklist } from '../protectionChecklist';

const mockSetItem = jest.fn();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { setItem: (...a: unknown[]) => mockSetItem(...a), getItem: jest.fn(), removeItem: jest.fn() },
}));

describe('api/protectionChecklist', () => {
  beforeEach(() => {
    useSessionStore.getState().setSignedIn({ accessToken: 'tok', sessionId: 's1' });
    jest.restoreAllMocks();
  });

  it('GETs the contract path with bearer and writes nothing to AsyncStorage', async () => {
    const body = { configVersion: 'v', items: [] };
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(body),
    } as Response);

    await expect(getProtectionChecklist()).resolves.toEqual(body);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://localhost:3000/api/v1/account/protection-checklist');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(mockSetItem).not.toHaveBeenCalled();
  });

  it('is excluded from the persisted query cache', () => {
    expect(shouldPersistQuery({ queryKey: ['protection-checklist'] } as never)).toBe(false);
  });
});
