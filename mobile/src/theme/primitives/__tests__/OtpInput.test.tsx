import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { OtpInput } from '../OtpInput';

describe('OtpInput', () => {
  it('calls onComplete once all digits are entered', async () => {
    const onChange = jest.fn();
    const onComplete = jest.fn();

    await render(
      <OtpInput
        label="6-digit verification code"
        value=""
        onChange={onChange}
        onComplete={onComplete}
      />,
    );

    const input = screen.getByLabelText('6-digit verification code');
    fireEvent.changeText(input, '123456');

    expect(onChange).toHaveBeenCalledWith('123456');
    expect(onComplete).toHaveBeenCalledWith('123456');
  });

  it('strips non-digit characters and truncates to the configured length', async () => {
    const onChange = jest.fn();
    await render(<OtpInput label="Code" length={4} value="" onChange={onChange} />);

    fireEvent.changeText(screen.getByLabelText('Code'), '12a3456');

    expect(onChange).toHaveBeenCalledWith('1234');
  });

  it('does not call onComplete before the full length is reached', async () => {
    const onChange = jest.fn();
    const onComplete = jest.fn();
    await render(
      <OtpInput label="Code" length={6} value="" onChange={onChange} onComplete={onComplete} />,
    );

    fireEvent.changeText(screen.getByLabelText('Code'), '123');

    expect(onComplete).not.toHaveBeenCalled();
  });
});
