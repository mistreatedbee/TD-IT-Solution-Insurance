import { spacing } from '../../theme/tokens';
import {
  FLOATING_TAB_BAR_BAR_HEIGHT,
  floatingTabBarBottomPadding,
  floatingTabBarOffset,
} from '../tabBarMetrics';

describe('floating tab bar metrics', () => {
  it.each([0, 16, 48])('floats above the system inset of %i', (bottom) => {
    expect(floatingTabBarBottomPadding(bottom)).toBe(bottom + spacing.sm);
    expect(floatingTabBarOffset(bottom)).toBe(
      bottom + spacing.sm + FLOATING_TAB_BAR_BAR_HEIGHT,
    );
  });

  it('keeps content offset equal to bar padding plus bar height', () => {
    for (const b of [0, 16, 48]) {
      expect(floatingTabBarOffset(b) - floatingTabBarBottomPadding(b)).toBe(
        FLOATING_TAB_BAR_BAR_HEIGHT,
      );
    }
  });
});
