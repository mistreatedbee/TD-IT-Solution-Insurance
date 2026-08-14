import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Toggle } from '../Toggle';

describe('Toggle', () => {
  it('calls onValueChange with the flipped value when tapped', async () => {
    const onValueChange = jest.fn();
    await render(
      <Toggle value={false} onValueChange={onValueChange} accessibilityLabel="Push alerts" />,
    );

    fireEvent(screen.getByLabelText('Push alerts'), 'valueChange', true);

    expect(onValueChange).toHaveBeenCalledWith(true);
  });

  it('renders as checked when value is true', async () => {
    await render(
      <Toggle value onValueChange={jest.fn()} accessibilityLabel="Push alerts" />,
    );

    expect(screen.getByLabelText('Push alerts').props.value).toBe(true);
  });

  it('shows the disabled hint when disabled', async () => {
    await render(
      <Toggle
        value
        onValueChange={jest.fn()}
        accessibilityLabel="Theft push"
        disabled
        disabledHint="Required — cannot be turned off"
      />,
    );

    expect(screen.getByText('Required — cannot be turned off')).toBeTruthy();
  });

  it('does not show the disabled hint when enabled', async () => {
    await render(
      <Toggle
        value
        onValueChange={jest.fn()}
        accessibilityLabel="Theft push"
        disabledHint="Required — cannot be turned off"
      />,
    );

    expect(screen.queryByText('Required — cannot be turned off')).toBeNull();
  });
});
