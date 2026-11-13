import { useFonts } from 'expo-font';

/** Registered family names match designFontFamilies in designTokens.generated.ts. */
export const designFontSources = {
  'ZillaSlab-400': require('../../assets/fonts/ZillaSlab-400.ttf'),
  'ZillaSlab-500': require('../../assets/fonts/ZillaSlab-500.ttf'),
  'ZillaSlab-600': require('../../assets/fonts/ZillaSlab-600.ttf'),
  'ZillaSlab-700': require('../../assets/fonts/ZillaSlab-700.ttf'),
  'PlusJakartaSans-Regular': require('../../assets/fonts/PlusJakartaSans-Regular.ttf'),
  'PlusJakartaSans-Medium': require('../../assets/fonts/PlusJakartaSans-Medium.ttf'),
  'PlusJakartaSans-SemiBold': require('../../assets/fonts/PlusJakartaSans-SemiBold.ttf'),
  'PlusJakartaSans-Bold': require('../../assets/fonts/PlusJakartaSans-Bold.ttf'),
} as const;

/**
 * Starts loading the design-system fonts. Deliberately non-blocking: callers
 * ignore the result and render immediately (system font until loaded, and
 * existing screens do not use these families yet).
 */
export function useDesignFonts(): boolean {
  const [loaded] = useFonts(designFontSources);
  return loaded;
}
