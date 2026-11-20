import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithProviders } from '../../../test/renderWithProviders';
import { HomeHeader } from '../HomeHeader';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }) }));

const mockFlags = { assistant: true, alerts: true };
jest.mock('../../../config/features', () => ({
  get FEATURE_ASSISTANT_ENTRY_ENABLED() {
    return mockFlags.assistant;
  },
  get FEATURE_ALERTS_ENABLED() {
    return mockFlags.alerts;
  },
}));

function renderHeader() {
  return renderWithProviders(
    <HomeHeader greeting="Good morning" name="Sam" subtitle="" alertCount={3} initials="S" />,
  );
}

describe('HomeHeader assistant entry', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockFlags.assistant = true;
    mockFlags.alerts = true;
  });

  it('replaces the bell with the assistant button when the flag is on, with no badge', async () => {
    await renderHeader();
    expect(screen.queryByLabelText(/^Alerts/)).toBeNull();
    expect(screen.queryByText('3')).toBeNull();
    await fireEvent.press(screen.getByLabelText('TD IT Solutions Insurance assistant'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/assistant');
  });

  it('keeps the alerts bell and badge when the flag is off', async () => {
    mockFlags.assistant = false;
    await renderHeader();
    expect(screen.queryByLabelText('TD IT Solutions Insurance assistant')).toBeNull();
    expect(screen.getByText('3')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Alerts, 3 open'));
    expect(mockPush).toHaveBeenCalledWith('/alerts');
  });
});
