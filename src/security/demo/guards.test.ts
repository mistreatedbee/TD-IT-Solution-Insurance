// @vitest-environment node
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../../..');
const viteBin = join(root, 'node_modules', 'vite', 'bin', 'vite.js');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe('demo cleanup script', () => {
  it('deletes only .env.demo.local and never touches .env.local', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'demo-cleanup-'));
    writeFileSync(join(dir, '.env.demo.local'), 'VITE_DEMO_MODE=true\n');
    writeFileSync(join(dir, '.env.local'), 'SENTINEL=do-not-touch\n');
    writeFileSync(join(dir, '.env'), 'OTHER=1\n');
    const modPath = join(root, 'scripts', 'demo-security-cleanup.mjs');
    const mod = (await import(/* @vite-ignore */ modPath)) as { cleanup: (r: string) => { removed: boolean } };
    expect(mod.cleanup(dir).removed).toBe(true);
    expect(existsSync(join(dir, '.env.demo.local'))).toBe(false);
    expect(readFileSync(join(dir, '.env.local'), 'utf8')).toBe('SENTINEL=do-not-touch\n');
    expect(readFileSync(join(dir, '.env'), 'utf8')).toBe('OTHER=1\n');
    expect(mod.cleanup(dir).removed).toBe(false);
  });

  it('script source has no file-read capability and only names .env.demo.local', () => {
    const src = readFileSync(join(root, 'scripts', 'demo-security-cleanup.mjs'), 'utf8');
    expect(src).not.toMatch(/readFile|createReadStream|openSync|writeFile|appendFile/);
    expect(src.replace(/\/\/.*$/gm, '')).not.toMatch(/\.env\.local['"]/);
  });
});

describe('demo build guard', () => {
  it('vite build fails with VITE_DEMO_MODE=true', () => {
    const r = spawnSync(process.execPath, [viteBin, 'build', '--outDir', mkdtempSync(join(tmpdir(), 'g-'))], {
      cwd: root,
      env: { ...process.env, VITE_DEMO_MODE: 'true' },
      encoding: 'utf8',
    });
    expect(r.status).not.toBe(0);
    expect(`${r.stdout}${r.stderr}`).toContain('VITE_DEMO_MODE=true');
  }, 60_000);

  it('a normal production build contains no demo strings', () => {
    const out = mkdtempSync(join(tmpdir(), 'prod-'));
    mkdirSync(out, { recursive: true });
    const env = { ...process.env, VITE_FEATURE_SECURITY_OPERATOR: 'true' } as NodeJS.ProcessEnv;
    delete env.VITE_DEMO_MODE;
    execFileSync(process.execPath, [viteBin, 'build', '--outDir', out, '--emptyOutDir'], { cwd: root, env, stdio: 'pipe' });
    const hay = walk(out).filter((f) => /\.(js|css|html)$/.test(f)).map((f) => readFileSync(f, 'utf8')).join('\n');
    expect(hay).not.toContain('Fictional Security Partner');
    expect(hay).not.toContain('demo.operator@example.invalid');
    expect(hay).not.toContain('REC-DEMO-');
  }, 240_000);
});
