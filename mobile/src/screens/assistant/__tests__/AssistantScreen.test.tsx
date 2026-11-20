import React from 'react';
import { Linking } from 'react-native';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithProviders } from '../../../test/renderWithProviders';
import { AssistantScreen } from '../AssistantScreen';
import { TalkToSupportSheet } from '../TalkToSupportSheet';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
}));

const mockFlags = { theft: true };
jest.mock('../../../config/features', () => ({
  get FEATURE_THEFT_REPORTING_ENABLED() {
    return mockFlags.theft;
  },
}));

describe('AssistantScreen', () => {
  let openURL: jest.SpyInstance;
  beforeEach(() => {
    mockPush.mockReset();
    mockFlags.theft = true;
    openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  });
  afterEach(() => openURL.mockRestore());

  it('shows the title, an honest coming-soon state and the emergency banner', async () => {
    await renderWithProviders(<AssistantScreen />);
    expect(screen.getByText('TD IT Solutions Insurance assistant')).toBeTruthy();
    expect(screen.getByText('The assistant is coming soon')).toBeTruthy();
    expect(screen.getByText('Is something being stolen right now?')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Report theft'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/report-theft');
    await fireEvent.press(screen.getByLabelText('Call 10111'));
    expect(openURL).toHaveBeenCalledWith('tel:10111');
  });

  it('hides Report theft when theft reporting is off but keeps 10111', async () => {
    mockFlags.theft = false;
    await renderWithProviders(<AssistantScreen />);
    expect(screen.queryByLabelText('Report theft')).toBeNull();
    expect(screen.getByLabelText('Call 10111')).toBeTruthy();
  });

  it('opens the support sheet, which says details are being set up when none are configured', async () => {
    await renderWithProviders(<AssistantScreen />);
    await fireEvent.press(screen.getByLabelText('Talk to support'));
    expect(screen.getByText('Support contact details are being set up.')).toBeTruthy();
    expect(screen.queryByLabelText('Call support')).toBeNull();
    expect(screen.queryByLabelText('Email support')).toBeNull();
    expect(screen.queryByLabelText('WhatsApp support')).toBeNull();
  });
});

describe('TalkToSupportSheet', () => {
  let openURL: jest.SpyInstance;
  beforeEach(() => {
    openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  });
  afterEach(() => openURL.mockRestore());

  it('shows only the configured options and opens the right link', async () => {
    await renderWithProviders(
      <TalkToSupportSheet
        visible
        onClose={jest.fn()}
        contacts={{ phone: '+27 11 000 0000', email: null, whatsapp: '+27 82 000 0000' }}
      />,
    );
    expect(screen.queryByLabelText('Email support')).toBeNull();
    expect(screen.queryByText('Support contact details are being set up.')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Call support'));
    expect(openURL).toHaveBeenLastCalledWith('tel:+27110000000');
    await fireEvent.press(screen.getByLabelText('WhatsApp support'));
    expect(openURL).toHaveBeenLastCalledWith('https://wa.me/27820000000');
  });

  it('opens a mailto link for email and closes on Close', async () => {
    const onClose = jest.fn();
    await renderWithProviders(
      <TalkToSupportSheet visible onClose={onClose} contacts={{ phone: null, email: 'help@example.test', whatsapp: null }} />,
    );
    await fireEvent.press(screen.getByLabelText('Email support'));
    expect(openURL).toHaveBeenLastCalledWith('mailto:help@example.test');
    await fireEvent.press(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });
});
