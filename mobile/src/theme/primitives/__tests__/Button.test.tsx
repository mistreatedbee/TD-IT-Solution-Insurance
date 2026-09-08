import { fireEvent, screen } from '@testing-library/react-native';
import React from 'react';
import { renderWithProviders } from '../../../test/renderWithProviders';
import { Button } from '../Button';

describe('Button', () => {
  it('calls onPress when tapped', async () => {
    const onPress = jest.fn();
    await renderWithProviders(<Button onPress={onPress}>Log in</Button>);

    fireEvent.press(screen.getByRole('button', { name: 'Log in' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not call onPress while loading', async () => {
    const onPress = jest.fn();
    await renderWithProviders(
      <Button onPress={onPress} loading>
        Log in
      </Button>,
    );

    fireEvent.press(screen.getByRole('button', { name: 'Log in' }));

    expect(onPress).not.toHaveBeenCalled();
  });

  it('does not call onPress while disabled', async () => {
    const onPress = jest.fn();
    await renderWithProviders(
      <Button onPress={onPress} disabled>
        Log in
      </Button>,
    );

    fireEvent.press(screen.getByRole('button', { name: 'Log in' }));

    expect(onPress).not.toHaveBeenCalled();
  });
});
