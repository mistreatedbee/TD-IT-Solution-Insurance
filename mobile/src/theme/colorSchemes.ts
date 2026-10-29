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

export const lightColors: AppColors = {
  primary: '#2C3E50',
  primaryHover: '#24333F',
  accentBlue: '#3B82F6',
  accentBlueDeep: '#2563EB',
  accentBlueTint: '#EFF6FF',
  accentOrange: '#F5A022',
  accentOrangeDeep: '#D9720A',
  accentOrangeTint: '#FDECD2',
  accentGold: '#3B82F6',
  accentGoldDeep: '#2563EB',
  accentGoldTint: '#EFF6FF',
  surfaceNavy: '#0F1A2C',
  surfaceNavyDeep: '#0A1628',
  background: '#FFFFFF',
  canvas: '#FFFFFF',
  card: '#F8FAFC',
  success: '#059669',
  successLight: '#10B981',
  textPrimary: '#1C1917',
  textSecondary: '#6B6156',
  textInverse: '#FFFFFF',
  border: '#E4DDD1',
  hairline: 'rgba(44,62,80,0.08)',
  fieldError: '#EF4444',
  fieldErrorText: '#DC2626',
  // OB-17 glass tokens, light mode — ratified values, see colorSchemes.ts header note.
  glassAccent: '#00B5B5',
  glassAccentDeep: '#1E8F89',
  glassAccentTint: '#E3F6F4',
  glassActionSecondary: '#181F1F',
  glassActionSecondaryText: '#FFFFFF',
  glassStatusPositive: '#2E9E53',
  glassSurface: 'rgba(255,255,255,0.55)',
  glassSurfaceStrong: 'rgba(255,255,255,0.72)',
  glassSurfaceBorder: 'rgba(255,255,255,0.45)',
  glassSurfaceOpaque: '#FFFFFF',
  glassBgGradientStart: '#FCFCFC',
  glassBgGradientMid: '#F7F8F8',
  glassBgGradientEnd: '#FFFFFF',
  glassTextPrimary: '#0F1420',
  glassTextSecondary: '#4A5168',
  glassTextOnAccent: '#FFFFFF',
  tones: {
    info: {
      background: '#EFF6FF',
      text: '#1E40AF',
      border: '#BFDBFE',
      icon: '#2563EB',
    },
    success: {
      background: '#ECFDF5',
      text: '#065F46',
      border: '#A7F3D0',
      icon: '#059669',
    },
    warning: {
      background: '#FFFBEB',
      text: '#92400E',
      border: '#FDE68A',
      icon: '#D97706',
    },
    danger: {
      background: '#FEF2F2',
      text: '#991B1B',
      border: '#FECACA',
      icon: '#DC2626',
    },
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

export const darkColors: AppColors = {
  primary: '#E2E8F0',
  primaryHover: '#F8FAFC',
  accentBlue: '#60A5FA',
  accentBlueDeep: '#3B82F6',
  accentBlueTint: '#152238',
  accentOrange: '#F5A022',
  accentOrangeDeep: '#FBBF24',
  accentOrangeTint: '#422006',
  accentGold: '#60A5FA',
  accentGoldDeep: '#3B82F6',
  accentGoldTint: '#152238',
  surfaceNavy: '#0F1A2C',
  surfaceNavyDeep: '#0A1628',
  background: '#1C2128',
  canvas: '#000000',
  card: '#1C2128',
  success: '#34D399',
  successLight: '#10B981',
  textPrimary: '#F8FAFC',
  textSecondary: '#94A3B8',
  textInverse: '#0F172A',
  border: '#2D3748',
  hairline: 'rgba(255,255,255,0.12)',
  fieldError: '#F87171',
  fieldErrorText: '#FCA5A5',
  // OB-17 glass tokens, dark mode — the gradient pair is an unreferenced
  // extrapolation (tokens doc §2.2 honesty note); accent/status/surface
  // tokens otherwise mirror the ratified values.
  glassAccent: '#00B5B5',
  glassAccentDeep: '#1E8F89',
  glassAccentTint: '#163432',
  glassActionSecondary: '#E8EDED',
  glassActionSecondaryText: '#181F1F',
  glassStatusPositive: '#4ADE80',
  glassSurface: 'rgba(18,22,32,0.55)',
  glassSurfaceStrong: 'rgba(18,22,32,0.72)',
  glassSurfaceBorder: 'rgba(255,255,255,0.10)',
  glassSurfaceOpaque: '#151923',
  glassBgGradientStart: '#0B0F1A',
  glassBgGradientMid: '#121A2E',
  glassBgGradientEnd: '#070A12',
  glassTextPrimary: '#F3F5FA',
  glassTextSecondary: '#AEB4C4',
  glassTextOnAccent: '#FFFFFF',
  tones: {
    info: {
      background: '#1E3A5F',
      text: '#BFDBFE',
      border: '#1D4ED8',
      icon: '#60A5FA',
    },
    success: {
      background: '#064E3B',
      text: '#A7F3D0',
      border: '#059669',
      icon: '#34D399',
    },
    warning: {
      background: '#422006',
      text: '#FDE68A',
      border: '#B45309',
      icon: '#FBBF24',
    },
    danger: {
      background: '#450A0A',
      text: '#FECACA',
      border: '#B91C1C',
      icon: '#F87171',
    },
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
