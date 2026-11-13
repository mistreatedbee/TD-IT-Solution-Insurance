import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { designColorsDay, designColorsNight, designMotion } from '../designTokens.generated';

const root = resolve(__dirname, '../../..');
const source = process.env.DESIGN_TOKENS_PATH ?? resolve(root, '../design-system/tokens.json');

describe('design tokens', () => {
  (existsSync(source) ? it : it.skip)('generated file is not stale vs design-system/tokens.json', () => {
    const r = spawnSync('node', ['scripts/gen-design-tokens.mjs', '--check'], { cwd: root, encoding: 'utf8' });
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });

  it('resolves aliases and converts alpha hex to rgba', () => {
    expect(designColorsDay.actionPrimary).toBe('#F5A022');
    expect(designColorsDay.warning).toBe(designColorsDay.accentText);
    expect(designColorsNight.warning).toBe('#F5A022');
    expect(designColorsDay.glassFill).toBe('rgba(255, 255, 255, 0.722)');
  });

  it('exposes motion durations', () => {
    expect(designMotion.duration).toEqual({ press: 160, state: 240, entrance: 420 });
  });
});
