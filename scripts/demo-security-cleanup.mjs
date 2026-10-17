// Deletes .env.demo.local (only) and reports leftover demo artifacts. Never opens, reads or
// writes .env.local or any other env file.
import { existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export function cleanup(root) {
  const file = join(root, '.env.demo.local');
  const removed = existsSync(file);
  if (removed) rmSync(file);
  let leftovers = [];
  try {
    const out = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    leftovers = out
      .split('\n')
      .filter(Boolean)
      .filter((l) => /demo/i.test(l) && !/src\/security\/demo\//.test(l) && !/demo-security|security-dashboard-local-demo|demo-screenshots/.test(l));
  } catch {
    /* not a git checkout */
  }
  return { removed, leftovers };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { removed, leftovers } = cleanup(join(dirname(fileURLToPath(import.meta.url)), '..'));
  console.log(removed ? 'Deleted .env.demo.local.' : '.env.demo.local not present (nothing to delete).');
  console.log(
    leftovers.length
      ? `Unexpected demo-related changes:\n${leftovers.join('\n')}`
      : 'No demo artifacts outside the committed demo code. Demo data was in-memory only. Stop the dev server and close the tab.',
  );
}
