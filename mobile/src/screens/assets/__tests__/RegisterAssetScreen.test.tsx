import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '../../../test/renderWithProviders';
import { mapUserFacingError } from '../../../lib/user-facing-errors';
import { RegisterAssetScreen } from '../RegisterAssetScreen';

const mockMutateAsync = jest.fn();
let mockMutationError: unknown = null;

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock('../../../api/hooks/useAssets', () => ({
  useCreateAssetMutation: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
    error: mockMutationError,
  }),
}));

jest.mock('../../../api/hooks/usePlanUsage', () => ({
  usePlanUsage: () => ({ policy: null, currentPlan: { name: 'Basic', maxAssets: 5 } }),
}));

jest.mock('../../../screens/home/assetVisuals', () => ({ AssetTypeImage: () => null }));

async function press(label: string) {
  await fireEvent.press(screen.getByText(label));
}

describe('RegisterAssetScreen', () => {
  beforeEach(() => {
    mockMutateAsync.mockReset();
    mockMutationError = null;
  });

  it('blocks Continue and shows the error beside the display-name field', async () => {
    await renderWithProviders(<RegisterAssetScreen />);
    await press('Continue');
    expect(screen.getByText('Enter a display name for this asset.')).toBeTruthy();
    expect(screen.getByText('Step 1 of 3')).toBeTruthy();
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('renders vehicle fields and shows per-field errors on the right inputs', async () => {
    await renderWithProviders(<RegisterAssetScreen />);
    await fireEvent.changeText(screen.getByTestId('input-display-name'), 'My Car');
    await press('Continue');

    for (const id of ['make', 'model', 'year', 'vin', 'license-plate', 'color']) {
      expect(screen.getByTestId(`input-${id}`)).toBeTruthy();
    }
    await press('Continue');
    expect(screen.getByText('Enter make.')).toBeTruthy();
    expect(screen.getByText('Enter vin.')).toBeTruthy();
    expect(screen.queryByText('Enter color.')).toBeNull();
    expect(screen.getByTestId('input-make').props['aria-invalid']).toBe(true);
    expect(screen.getByTestId('input-color').props['aria-invalid']).toBeUndefined();
    expect(screen.getByText('Enter make.').props.accessibilityLiveRegion).toBe('polite');
    expect(mockMutateAsync).not.toHaveBeenCalled();

    // Typing clears that field's error only.
    await fireEvent.changeText(screen.getByTestId('input-make'), 'Toyota');
    expect(screen.queryByText('Enter make.')).toBeNull();
    expect(screen.getByText('Enter vin.')).toBeTruthy();
  });

  it('rejects a non-numeric year on the year field', async () => {
    await renderWithProviders(<RegisterAssetScreen />);
    await fireEvent.changeText(screen.getByTestId('input-display-name'), 'My Car');
    await press('Continue');
    await fireEvent.changeText(screen.getByTestId('input-make'), 'Toyota');
    await fireEvent.changeText(screen.getByTestId('input-model'), 'Corolla');
    await fireEvent.changeText(screen.getByTestId('input-year'), 'abc');
    await fireEvent.changeText(screen.getByTestId('input-vin'), 'VIN123');
    await press('Continue');
    expect(screen.getByText('Enter a valid year.')).toBeTruthy();
  });

  it('renders non-vehicle fields (no vehicle fields) and blocks submit when empty', async () => {
    await renderWithProviders(<RegisterAssetScreen />);
    await press('Laptop');
    await fireEvent.changeText(screen.getByTestId('input-display-name'), 'Work laptop');
    await press('Continue');

    expect(screen.getByTestId('input-brand')).toBeTruthy();
    expect(screen.getByTestId('input-serial-number')).toBeTruthy();
    expect(screen.getByTestId('input-operating-system')).toBeTruthy();
    expect(screen.queryByTestId('input-vin')).toBeNull();

    await press('Register asset');
    expect(screen.getByText('Enter brand.')).toBeTruthy();
    expect(screen.getByText('Enter serial number.')).toBeTruthy();
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('shows API errors in the form-level alert, not beside a field', async () => {
    mockMutationError = new Error('boom');
    await renderWithProviders(<RegisterAssetScreen />);
    expect(
      screen.getByText(mapUserFacingError(mockMutationError, { context: 'asset' })),
    ).toBeTruthy();
  });

  it('submits valid non-vehicle details', async () => {
    mockMutateAsync.mockResolvedValue({ id: 'a1' });
    await renderWithProviders(<RegisterAssetScreen />);
    await press('Laptop');
    await fireEvent.changeText(screen.getByTestId('input-display-name'), 'Work laptop');
    await press('Continue');
    await fireEvent.changeText(screen.getByTestId('input-brand'), 'Dell');
    await fireEvent.changeText(screen.getByTestId('input-model'), 'XPS');
    await fireEvent.changeText(screen.getByTestId('input-serial-number'), 'SN1');
    await press('Register asset');
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
  });
});
