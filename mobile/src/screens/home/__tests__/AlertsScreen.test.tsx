import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithProviders } from '../../../test/renderWithProviders';
import { AlertsScreen } from '../AlertsScreen';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }) }));

jest.mock('../../../tracking/useProtectionDashboard', () => ({
  useProtectionDashboard: () => ({ data: { clientAlerts: [] }, refetchAll: jest.fn(), isRefetching: false }),
}));

const mockMutateAsync = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../api/hooks/useAlerts', () => ({
  useAlertsWithFallback: jest.fn(),
  useDismissAlertMutation: () => ({ mutateAsync: mockMutateAsync, isPending: false, variables: undefined }),
}));
const { useAlertsWithFallback } = jest.requireMock('../../../api/hooks/useAlerts') as { useAlertsWithFallback: jest.Mock };

const alert = (over: Record<string, unknown> = {}) => ({
  id: 'a1',
  severity: 'warning',
  category: 'tracking',
  title: 'Tracker quiet for 3 hours',
  body: 'Your Toyota Hilux tracker has not reported since this morning.',
  href: '/(app)/assets/x1',
  ...over,
});

function state(alerts: unknown[], over: Record<string, unknown> = {}) {
  useAlertsWithFallback.mockReturnValue({
    alerts,
    isLoading: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
    isRefetching: false,
    source: 'server',
    ...over,
  });
}

describe('AlertsScreen', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockMutateAsync.mockClear();
  });

  it('shows the counts, a severity word per alert, and navigates to the alert link', async () => {
    state([alert(), alert({ id: 'a2', severity: 'critical', title: 'Possible tampering', href: undefined })]);
    await renderWithProviders(<AlertsScreen />);
    expect(screen.getByText('Alerts')).toBeTruthy();
    expect(screen.getByText('1 urgent · 2 open — review and act when you can.')).toBeTruthy();
    expect(screen.getByText('Warning')).toBeTruthy(); // the word, not just a colour
    expect(screen.getByText('Critical')).toBeTruthy();
    fireEvent.press(screen.getByText('Tracker quiet for 3 hours'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/assets/x1');
  });

  it('dismisses a server alert', async () => {
    state([alert()]);
    await renderWithProviders(<AlertsScreen />);
    fireEvent.press(screen.getByLabelText('Dismiss'));
    expect(mockMutateAsync).toHaveBeenCalledWith('a1');
  });

  it('offers no dismiss for locally derived alerts and says where they came from', async () => {
    state([alert()], { source: 'client' });
    await renderWithProviders(<AlertsScreen />);
    expect(screen.queryByLabelText('Dismiss')).toBeNull();
    expect(screen.getByText(/locally derived alerts/i)).toBeTruthy();
  });

  it('shows the all-clear card when there is nothing to act on', async () => {
    state([]);
    await renderWithProviders(<AlertsScreen />);
    expect(screen.getByText('All clear')).toBeTruthy();
    expect(screen.getByText(/all caught up/i)).toBeTruthy();
  });

  it('opens notification preferences', async () => {
    state([]);
    await renderWithProviders(<AlertsScreen />);
    fireEvent.press(screen.getByText('Notification preferences'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/notification-preferences');
  });

  it('shows an error instead of an empty state when loading fails', async () => {
    state([], { isError: true, error: new Error('boom') });
    await renderWithProviders(<AlertsScreen />);
    expect(screen.queryByText('All clear')).toBeNull();
  });
});
