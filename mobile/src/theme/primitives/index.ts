/**
 * TEMPORARY BRIDGE — see mobile/src/theme/tokens.ts header. Barrel export
 * only; do not add new primitives here without a corresponding web
 * equivalent to port from (or an explicit design-system-manager flag, per
 * architecture.md §1.5, for the few cases like OtpInput where the web
 * component doesn't exist yet either and this mobile build is going first).
 */
export * from './Screen';
export * from './Button';
export * from './Input';
export * from './Card';
export * from './Alert';
export * from './OtpInput';
export * from './Badge';
export * from './FormField';
export * from './SelectChip';
export * from './Toggle';
export {
  canvasColor,
  defaultDividerInset,
  elevation,
  elevationSoft,
  surfaceStyles,
  tabScreenStyle,
} from '../surfaces';
export {
  ThemeProvider,
  useColors,
  useTheme,
  type ColorSchemeName,
  type ThemeContextValue,
} from '../ThemeProvider';
export { useSurfaceStyles, createSurfaceStyles } from '../useSurfaceStyles';
export { lightColors, darkColors, type AppColors } from '../colorSchemes';
export {
  AppScreenSection,
  InlineStatBar,
  InsetDivider,
  SurfaceGroup,
  type AppScreenSectionProps,
  type InlineStatBarProps,
  type InlineStatItem,
  type InsetDividerProps,
  type SurfaceGroupProps,
} from '../../components/SurfaceGroup';
