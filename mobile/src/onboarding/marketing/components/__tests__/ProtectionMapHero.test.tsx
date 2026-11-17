import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '../../../../theme/ThemeProvider';
import { ProtectionMapHero } from '../ProtectionMapHero';

jest.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));

describe('ProtectionMapHero', () => {
  it('shows what is being tracked, without an Example tag, and shows what is being tracked', async () => {
    await render(
      <ThemeProvider>
        <ProtectionMapHero height={300} />
      </ThemeProvider>,
    );
    expect(screen.queryByText('Example')).toBeNull();
    expect(screen.getByLabelText(/car, phone and laptop shown on a map/)).toBeTruthy();
    expect(screen.getByText('Car')).toBeTruthy();
  });
});
