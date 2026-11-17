import AsyncStorage from '@react-native-async-storage/async-storage';
import { renderHook, waitFor } from '@testing-library/react-native';
import { useSessionStore } from '../../auth/session-store';
import { useAppShellGate } from '../useAppShellGate';

const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async (k: string) => mockStore.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      mockStore.set(k, v);
    },
    clear: async () => mockStore.clear(),
  },
}));

const mockGetCurrentAccount = jest.fn();
jest.mock('../../api/auth', () => ({ getCurrentAccount: () => mockGetCurrentAccount() }));
jest.mock('../useOnboardingGate', () => ({ resolveCustomerOnboardingGate: async () => 'app' }));
jest.mock('../../api/generated/identity-service', () => ({}), { virtual: true });
jest.mock('../onboardingStorage', () => ({ isOnboardingComplete: async () => true }));

beforeEach(async () => {
  await AsyncStorage.clear();
  mockGetCurrentAccount.mockReset();
  useSessionStore.getState().setSignedIn({ accessToken: 't', sessionId: 's1' });
});

it('shows the cached shell immediately, without waiting for the server', async () => {
  await AsyncStorage.setItem('td-app-shell-cache', JSON.stringify({ sessionId: 's1', gate: 'security-app' }));
  mockGetCurrentAccount.mockReturnValue(new Promise(() => {})); // cold server: never answers
  const { result } = await renderHook(() => useAppShellGate());
  await waitFor(() => expect(result.current).toBe('security-app'));
});

it('ignores a cache from a different session and corrects a stale one', async () => {
  await AsyncStorage.setItem('td-app-shell-cache', JSON.stringify({ sessionId: 'other', gate: 'web-portal' }));
  mockGetCurrentAccount.mockResolvedValue({ userType: 'customer' });
  const { result } = await renderHook(() => useAppShellGate());
  await waitFor(() => expect(result.current).toBe('app'));
});

it('replaces a stale cached shell once the server answers', async () => {
  await AsyncStorage.setItem('td-app-shell-cache', JSON.stringify({ sessionId: 's1', gate: 'web-portal' }));
  mockGetCurrentAccount.mockResolvedValue({ userType: 'customer' });
  const { result } = await renderHook(() => useAppShellGate());
  await waitFor(() => expect(result.current).toBe('app'));
});
