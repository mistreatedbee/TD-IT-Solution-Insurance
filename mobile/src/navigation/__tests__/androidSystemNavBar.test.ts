import { execSync } from 'child_process';
import path from 'path';

const appJson = require('../../../app.json');

/**
 * Android is edge-to-edge (SDK 57): the system nav bar is transparent and the app draws behind it. The
 * background/position/border setters of expo-navigation-bar do not exist under edge-to-edge, so the only
 * supported controls are the plugin's `enforceContrast` and the button style (`<NavigationBar style>`).
 */
describe('Android system navigation bar config', () => {
  it('turns the contrast scrim off through the expo-navigation-bar plugin', () => {
    const entry = (appJson.expo.plugins as unknown[]).find(
      (p) => Array.isArray(p) && p[0] === 'expo-navigation-bar',
    ) as [string, { enforceContrast?: boolean }] | undefined;
    expect(entry?.[1]?.enforceContrast).toBe(false);
  });

  it('does not use the deprecated androidNavigationBar key', () => {
    expect(appJson.expo.androidNavigationBar).toBeUndefined();
  });

  it('never calls nav-bar setters that are no-ops under edge-to-edge', () => {
    const root = path.resolve(__dirname, '../../..');
    const hits = execSync(
      `grep -rlE "setBackgroundColorAsync|setPositionAsync|setBorderColorAsync|setButtonStyleAsync|setBehaviorAsync" src app || true`,
      { cwd: root, encoding: 'utf8' },
    )
      .split('\n')
      .filter((f) => f && !f.includes('__tests__'));
    expect(hits).toEqual([]);
  });
});
