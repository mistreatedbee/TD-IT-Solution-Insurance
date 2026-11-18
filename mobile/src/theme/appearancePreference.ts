/**
 * User's manual light/dark choice (Settings > Appearance). 'system' follows the phone's setting.
 * Stored on the device only; it is a display preference, not account data.
 */
export type AppearancePreference = 'system' | 'light' | 'dark';

const KEY = 'td-appearance-preference';

export function isAppearancePreference(value: unknown): value is AppearancePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

// Loaded lazily so importing the theme never touches native storage (keeps tests and previews light).
function storage() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@react-native-async-storage/async-storage').default as {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
  };
}

export async function loadAppearancePreference(): Promise<AppearancePreference> {
  try {
    const raw = await storage().getItem(KEY);
    return isAppearancePreference(raw) ? raw : 'system';
  } catch {
    return 'system';
  }
}

export async function saveAppearancePreference(value: AppearancePreference): Promise<void> {
  try {
    await storage().setItem(KEY, value);
  } catch {
    // preference still applies for this session
  }
}
