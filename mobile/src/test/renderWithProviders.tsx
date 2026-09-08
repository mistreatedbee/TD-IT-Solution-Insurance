import { render, type RenderOptions } from '@testing-library/react-native';
import React from 'react';
import { ThemeProvider } from '../theme/ThemeProvider';

export function renderWithProviders(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
) {
  return render(ui, {
    wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
    ...options,
  });
}
