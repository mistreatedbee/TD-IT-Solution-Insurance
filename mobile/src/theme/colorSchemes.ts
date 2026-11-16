import { designColorsDay as d, designColorsNight as n } from './designTokens.generated';
/**
 * Light and dark color palettes for system appearance (useColorScheme).
 * Structural tokens (spacing, radius) stay in tokens.ts.
 */

export type TonePalette = {
  background: string;
  text: string;
  border: string;
  icon: string;
};

export type AppColors = {
  primary: string;
  primaryHover: string;
  accentBlue: string;
  accentBlueDeep: string;
  accentBlueTint: string;
  accentOrange: string;
  accentOrangeDeep: string;
  accentOrangeTint: string;
  accentGold: string;
  accentGoldDeep: string;
  accentGoldTint: string;
  surfaceNavy: string;
  surfaceNavyDeep: string;
  background: string;
  canvas: string;
  card: string;
  success: string;
  successLight: string;
  textPrimary: string;
  textSecondary: string;
  textInverse: string;
  border: string;
  hairline: string;
  fieldError: string;
  fieldErrorText: string;
  /**
   * OB-17 glass-redesign tokens (ob-17-glass-redesign-tokens.md §2, §7a).
   * Additive `glass*` namespace — does not replace `accentBlue*`/
   * `accentGold*`, which stay for anything not yet migrated screen-by-
   * screen per the tokens doc's incremental-rollout rule (§2.1, §9.4).
   */
  glassAccent: string;
  glassAccentDeep: string;
  glassAccentTint: string;
  glassActionSecondary: string;
  glassActionSecondaryText: string;
  glassStatusPositive: string;
  glassSurface: string;
  glassSurfaceStrong: string;
  glassSurfaceBorder: string;
  /** Opaque fallback fill for reduced-transparency / low-end-Android (§2.5/§5.2). */
  glassSurfaceOpaque: string;
  glassBgGradientStart: string;
  glassBgGradientMid: string;
  glassBgGradientEnd: string;
  glassTextPrimary: string;
  glassTextSecondary: string;
  glassTextOnAccent: string;
  tones: {
    info: TonePalette;
    success: TonePalette;
    warning: TonePalette;
    danger: TonePalette;
  };
  slate: {
    50: string;
    100: string;
    300: string;
    400: string;
    500: string;
    600: string;
    700: string;
    800: string;
    900: string;
  };
};

/**
 * Day palette. 2026-11-16: values come from the generated design tokens (design-system/tokens.json) so every
 * screen that still reads `useTheme().colors` follows the current design. Key names are unchanged.
 * The `accentGold*` slots stay on the blue family on purpose: legacy screens put white text on them, and the
 * new orange action colour takes dark text. New screens use `src/design` and the orange action directly.
 */
export const lightColors: AppColors = {
  primary: d.brandNavy,
  primaryHover: '#1F2D3D',
  accentBlue: d.actionSecondary,
  accentBlueDeep: d.link,
  accentBlueTint: d.infoBg,
  accentOrange: d.brandOrange,
  accentOrangeDeep: d.accentText,
  accentOrangeTint: d.warningBg,
  accentGold: d.actionSecondary,
  accentGoldDeep: d.link,
  accentGoldTint: d.infoBg,
  surfaceNavy: '#14253A',
  surfaceNavyDeep: '#0B1622',
  background: d.bgRaised,
  canvas: d.bgPage,
  card: d.bgRaised,
  success: d.success,
  successLight: d.success,
  textPrimary: d.ink,
  textSecondary: d.inkMuted,
  textInverse: '#FFFFFF',
  border: d.borderSubtle,
  hairline: 'rgba(44,62,82,0.08)',
  fieldError: d.danger,
  fieldErrorText: d.danger,
  glassAccent: d.brandOrange,
  glassAccentDeep: d.accentText,
  glassAccentTint: d.warningBg,
  glassActionSecondary: d.actionSecondary,
  glassActionSecondaryText: d.onActionSecondary,
  glassStatusPositive: d.success,
  glassSurface: d.glassFill,
  glassSurfaceStrong: d.glassFill,
  glassSurfaceBorder: d.glassBorder,
  glassSurfaceOpaque: d.bgRaised,
  glassBgGradientStart: d.bgTop,
  glassBgGradientMid: d.bgPage,
  glassBgGradientEnd: d.bgBottom,
  glassTextPrimary: d.ink,
  glassTextSecondary: d.inkMuted,
  glassTextOnAccent: d.onActionPrimary,
  tones: {
    info: { background: d.infoBg, text: d.link, border: '#B5D3EA', icon: d.link },
    success: { background: d.successBg, text: d.success, border: '#A9DABF', icon: d.success },
    warning: { background: d.warningBg, text: d.accentText, border: '#F2CF8E', icon: d.accentText },
    danger: { background: d.dangerBg, text: d.danger, border: '#F1B8B3', icon: d.danger },
  },
  slate: {
    50: '#F8FAFC',
    100: '#F1F5F9',
    300: '#CBD5E1',
    400: '#94A3B8',
    500: '#64748B',
    600: '#475569',
    700: '#334155',
    800: '#1E293B',
    900: '#0F172A',
  },
};

/** Night palette, from the same generated tokens. */
export const darkColors: AppColors = {
  primary: n.ink,
  primaryHover: '#FFFFFF',
  accentBlue: n.actionSecondary,
  accentBlueDeep: n.link,
  accentBlueTint: n.infoBg,
  accentOrange: n.brandOrange,
  accentOrangeDeep: n.accentText,
  accentOrangeTint: n.warningBg,
  accentGold: n.actionSecondary,
  accentGoldDeep: n.link,
  accentGoldTint: n.infoBg,
  surfaceNavy: n.bgTop,
  surfaceNavyDeep: n.bgPage,
  background: n.bgRaised,
  canvas: n.bgPage,
  card: n.bgRaised,
  success: n.success,
  successLight: n.success,
  textPrimary: n.ink,
  textSecondary: n.inkMuted,
  textInverse: n.onActionPrimary,
  border: n.borderSubtle,
  hairline: 'rgba(255,255,255,0.12)',
  fieldError: n.danger,
  fieldErrorText: n.danger,
  glassAccent: n.brandOrange,
  glassAccentDeep: n.accentText,
  glassAccentTint: n.warningBg,
  glassActionSecondary: n.actionSecondary,
  glassActionSecondaryText: n.onActionSecondary,
  glassStatusPositive: n.success,
  glassSurface: n.glassFill,
  glassSurfaceStrong: n.glassFill,
  glassSurfaceBorder: n.glassBorder,
  glassSurfaceOpaque: n.bgRaised,
  glassBgGradientStart: n.bgTop,
  glassBgGradientMid: n.bgPage,
  glassBgGradientEnd: n.bgBottom,
  glassTextPrimary: n.ink,
  glassTextSecondary: n.inkMuted,
  glassTextOnAccent: n.onActionPrimary,
  tones: {
    info: { background: n.infoBg, text: n.link, border: 'rgba(124,192,240,0.4)', icon: n.link },
    success: { background: n.successBg, text: n.success, border: 'rgba(82,201,143,0.4)', icon: n.success },
    warning: { background: n.warningBg, text: n.accentText, border: 'rgba(245,160,34,0.4)', icon: n.accentText },
    danger: { background: n.dangerBg, text: n.danger, border: 'rgba(255,138,128,0.4)', icon: n.danger },
  },
  slate: {
    50: '#0F172A',
    100: '#1E293B',
    300: '#475569',
    400: '#64748B',
    500: '#94A3B8',
    600: '#CBD5E1',
    700: '#E2E8F0',
    800: '#F1F5F9',
    900: '#F8FAFC',
  },
};
