import { useMemo } from 'react';
import type { ViewStyle } from 'react-native';
import { useSafeAreaInsets, type Edge } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { lightColors } from '../theme/colorSchemes';
import { spacing } from '../theme/tokens';

/**
 * Vertical space reserved above the floating tab bar.
 * Applied once via `sceneStyle.paddingBottom` in `app/(app)/_layout.tsx` — do not
 * duplicate on tab-root screens (causes ~2× bottom gap when scrolling).
 */
/** Visual height of the frosted tab bar pill (`FloatingTabBar` `minHeight`). */
export const FLOATING_TAB_BAR_BAR_HEIGHT = 72;

/**
 * Minimum scroll clearance for tab-root screens. Prefer `useFloatingTabBarOffset()`
 * when positioning overlays on the map tab — this constant ignores the home-indicator inset.
 */
export const FLOATING_TAB_BAR_CLEARANCE = 96;

/** Distance from the screen bottom to the top edge of the floating tab bar. */
export function useFloatingTabBarOffset(): number {
  const insets = useSafeAreaInsets();
  return Math.max(insets.bottom, spacing.sm) + FLOATING_TAB_BAR_BAR_HEIGHT;
}

/**
 * Tab-root screens: top safe area only. Bottom inset is handled by
 * `TAB_SCENE_STYLE.paddingBottom` and the floating tab bar — not SafeAreaView bottom.
 */
export const TAB_SCREEN_SAFE_AREA_EDGES: Edge[] = ['top'];

/** Light-mode fallback for non-React modules and tests. */
export const TAB_SCENE_STYLE: ViewStyle = {
  backgroundColor: lightColors.canvas,
  paddingBottom: FLOATING_TAB_BAR_CLEARANCE,
};

/** Dynamic tab scene style — content scrolls behind the floating glass tab bar. */
export function useTabSceneStyle(): ViewStyle {
  const { colors } = useTheme();
  return useMemo(
    () => ({
      backgroundColor: colors.canvas,
      paddingBottom: 0,
    }),
    [colors.canvas],
  );
}

/** Map tab uses a muted canvas without tab-bar clearance padding. */
export function useMapTabSceneStyle(): ViewStyle {
  const { colors } = useTheme();
  return useMemo(() => ({ backgroundColor: colors.card, paddingBottom: 0 }), [colors.card]);
}
