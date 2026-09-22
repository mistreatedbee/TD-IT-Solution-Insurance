/**
 * INC-002 §12 — real POPIA s18 primer copy, two-layer disclosure
 * (Layer 1 always visible; Layer 2 behind an in-place expander).
 */
import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderWithProviders } from '../../test/renderWithProviders';
import { LocationConsentModal } from '../LocationConsentModal';

describe('LocationConsentModal', () => {
  it('renders Layer 1 (elements 1, 2, 3, 4, 7) without any interaction', async () => {
    await renderWithProviders(
      <LocationConsentModal visible onAccept={jest.fn()} onDecline={jest.fn()} />,
    );

    expect(screen.getByText('Let this phone report its own location?')).toBeTruthy();
    expect(screen.getByText(/We collect this phone's precise GPS position/)).toBeTruthy();
    expect(screen.getByText(/if this phone is lost or stolen/)).toBeTruthy();
    expect(screen.getByText(/This is optional/)).toBeTruthy();
    expect(
      screen.getByText(/You can switch this off at any time from this asset's screen, under/),
    ).toBeTruthy();

    // Layer 2 content is not visible until expanded.
    expect(screen.queryByText(/Who can see it/)).toBeNull();
    expect(screen.queryByText(/Your rights/)).toBeNull();
  });

  it('expands Layer 2 in place (elements 5, 8) without navigating or dismissing the modal', async () => {
    const onDecline = jest.fn();
    await renderWithProviders(
      <LocationConsentModal visible onAccept={jest.fn()} onDecline={onDecline} />,
    );

    const toggle = screen.getByText('The full details');
    await act(async () => {
      fireEvent.press(toggle);
    });

    expect(screen.getByText(/Who can see it/)).toBeTruthy();
    expect(screen.getByText(/Your rights/)).toBeTruthy();
    expect(screen.getByText(/Other assets/)).toBeTruthy();
    expect(onDecline).not.toHaveBeenCalled();

    // Does not render the two blocked lines (CS-INC002-N1/N2).
    expect(screen.queryByText(/STORAGE_REGION/)).toBeNull();
    expect(screen.queryByText(/How long we keep it/)).toBeNull();

    const collapse = screen.getByLabelText('Collapse the full details');
    await act(async () => {
      fireEvent.press(collapse);
    });
    expect(screen.queryByText(/Who can see it/)).toBeNull();
  });

  it('renders the real accept/decline button copy', async () => {
    await renderWithProviders(
      <LocationConsentModal visible onAccept={jest.fn()} onDecline={jest.fn()} />,
    );

    expect(screen.getByText('Turn on location')).toBeTruthy();
    expect(screen.getByText('Not now')).toBeTruthy();
  });
});
