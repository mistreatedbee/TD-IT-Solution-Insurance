#!/usr/bin/env node
/**
 * CI-1 — Stage 8 manifest verification (INC-001 §6).
 *
 * Discovers backend API routes and mobile Expo Router screens, then fails if
 * any discovered surface is not covered by docs/organization/gates/stage8-manifest.json
 * with either a filed Stage 8 record or an explicit waived entry.
 *
 * Usage:
 *   node scripts/verify-stage8-manifest.mjs
 *
 * Exit 0 = all discovered surfaces are manifest-covered.
 * Exit 1 = one or more surfaces are missing from the manifest.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, '..');
const manifestPath = join(repoRoot, 'docs/organization/gates/stage8-manifest.json');
const backendRoutesDir = join(repoRoot, 'backend/src/routes');
const mobileAppDir = join(repoRoot, 'mobile/app');

const ROUTER_PATH_RE =
  /router\.(?:get|post|patch|put|delete)\(\s*(?:\/\*[\s\S]*?\*\/\s*)?['"](\/[^'"]+)['"]/g;

function discoverBackendRoutes() {
  const routes = new Set();
  const files = readdirSync(backendRoutesDir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));

  for (const file of files) {
    const content = readFileSync(join(backendRoutesDir, file), 'utf8');
    for (const match of content.matchAll(ROUTER_PATH_RE)) {
      routes.add(match[1]);
    }
  }

  return [...routes].sort();
}

function discoverMobileScreens(dir = mobileAppDir, prefix = '') {
  const screens = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__') continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      const segment = entry.name.startsWith('(') ? entry.name : entry.name;
      const nextPrefix = prefix ? `${prefix}/${segment}` : segment;
      screens.push(...discoverMobileScreens(fullPath, nextPrefix));
      continue;
    }
    if (!entry.name.endsWith('.tsx') || entry.name === '_layout.tsx') continue;
    const routePath =
      entry.name === 'index.tsx'
        ? prefix
        : prefix
          ? `${prefix}/${entry.name.replace(/\.tsx$/, '')}`
          : entry.name.replace(/\.tsx$/, '');
    screens.push(routePath);
  }
  return screens.sort();
}

function loadManifest() {
  const raw = JSON.parse(readFileSync(manifestPath, 'utf8'));
  return raw.surfaces ?? [];
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function globToRegExp(glob) {
  let re = '^';
  for (let i = 0; i < glob.length; ) {
    if (glob[i] === '{') {
      const end = glob.indexOf('}', i);
      const alts = glob
        .slice(i + 1, end)
        .split(',')
        .map(escapeRegex)
        .join('|');
      re += `(${alts})`;
      i = end + 1;
      continue;
    }
    if (glob.slice(i, i + 4) === '[id]') {
      re += '[^/]+';
      i += 4;
      continue;
    }
    if (glob[i] === '*') {
      re += '.*';
      i += 1;
      continue;
    }
    re += escapeRegex(glob[i]);
    i += 1;
  }
  re += '$';
  return new RegExp(re);
}

function patternCovers(manifestPattern, discovered) {
  if (manifestPattern.includes('*') && !manifestPattern.includes('{')) {
    const prefix = manifestPattern.replace(/\*+$/, '');
    return discovered.startsWith(prefix);
  }

  return globToRegExp(manifestPattern).test(discovered);
}

function surfaceCovers(surfaces, kind, discovered) {
  return surfaces.some((surface) => {
    const pattern = surface.pattern;
    if (!pattern) return false;

    if (surface.kind === 'backend_route' && kind === 'backend_route') {
      if (pattern.startsWith('GET ') || pattern.startsWith('POST ')) {
        const path = pattern.split(' ').slice(1).join(' ');
        return path === discovered || patternCovers(path, discovered);
      }
      return pattern === discovered || patternCovers(pattern, discovered);
    }

    if (surface.kind.startsWith('backend') && kind === 'backend_route') {
      return patternCovers(pattern, discovered) || discovered.startsWith(pattern.replace(/\*$/, ''));
    }

    if (surface.kind.startsWith('mobile') && kind === 'mobile_route') {
      return patternCovers(pattern, discovered);
    }

    return false;
  });
}

function main() {
  const surfaces = loadManifest();
  const backendRoutes = discoverBackendRoutes();
  const mobileScreens = discoverMobileScreens();

  const missing = [];

  for (const route of backendRoutes) {
    if (!surfaceCovers(surfaces, 'backend_route', route)) {
      missing.push({ kind: 'backend_route', path: route });
    }
  }

  for (const screen of mobileScreens) {
    if (!surfaceCovers(surfaces, 'mobile_route', screen)) {
      missing.push({ kind: 'mobile_route', path: screen });
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    `[verify-stage8-manifest] Discovered ${backendRoutes.length} backend routes, ${mobileScreens.length} mobile screens; manifest has ${surfaces.length} entries.`,
  );

  if (missing.length > 0) {
    // eslint-disable-next-line no-console
    console.error('[verify-stage8-manifest] FAIL — surfaces missing from stage8-manifest.json:\n');
    for (const item of missing) {
      // eslint-disable-next-line no-console
      console.error(`  - ${item.kind}: ${item.path}`);
    }
    // eslint-disable-next-line no-console
    console.error(
      '\nAdd each surface to docs/organization/gates/stage8-manifest.json with a Stage 8 doc reference or an explicit waived entry (INC-001 CI-1).',
    );
    process.exit(1);
  }

  // eslint-disable-next-line no-console
  console.log('[verify-stage8-manifest] PASS — all discovered surfaces are manifest-covered.');
}

main();
