import React from 'react';
import { Platform, Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { GlassSurface, liquidGlassSolidFill } from '../GlassSurface';
import { designColorsDay, designColorsNight } from '../../theme/designTokens.generated';

describe('GlassSurface on Android', () => {
  const originalOS = Platform.OS;
  beforeEach(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'android' });
  });
  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => originalOS });
  });

  it('renders a solid token fill, never the translucent tint (no BlurView)', async () => {
    await render(
      <GlassSurface colorScheme="dark" tintColor="rgba(22, 26, 32, 0.32)">
        <Text>tabs</Text>
      </GlassSurface>,
    );
    const solid = screen.getByTestId('glass-surface-solid');
    const flat = Object.assign({}, ...[solid.props.style].flat(3).filter(Boolean));
    expect(flat.backgroundColor).toBe(designColorsNight.bgRaised);
  });

  it('honours an explicit solidFill', async () => {
    await render(
      <GlassSurface colorScheme="light" solidFill="#123456">
        <Text>header</Text>
      </GlassSurface>,
    );
    const solid = screen.getByTestId('glass-surface-solid');
    const flat = Object.assign({}, ...[solid.props.style].flat(3).filter(Boolean));
    expect(flat.backgroundColor).toBe('#123456');
  });

  it('maps day and night to design tokens', () => {
    expect(liquidGlassSolidFill(false)).toBe(designColorsDay.bgRaised);
    expect(liquidGlassSolidFill(true)).toBe(designColorsNight.bgRaised);
  });
});
