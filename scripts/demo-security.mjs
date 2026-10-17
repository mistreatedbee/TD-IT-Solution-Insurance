// Starts the local-only Security Dashboard demo: `vite --mode demo`.
// Writes ONLY .env.demo.local (if absent). Never reads or writes .env.local or any other env
// file. Vite itself auto-loads .env.local in every mode; the demo neutralises that by
// overriding the real-service variables via process env and blocking all external fetches.
import { existsSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const demoFile = join(root, '.env.demo.local');
if (!existsSync(demoFile)) {
  writeFileSync(demoFile, 'VITE_DEMO_MODE=true\nVITE_FEATURE_SECURITY_OPERATOR=true\n');
}
const child = spawn(
  process.execPath,
  [join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--mode', 'demo'],
  {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_DEMO_MODE: 'true',
      VITE_FEATURE_SECURITY_OPERATOR: 'true',
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_ANON_KEY: '',
      VITE_API_BASE_URL: 'http://demo.invalid',
    },
  },
);
child.on('exit', (code) => process.exit(code ?? 0));
