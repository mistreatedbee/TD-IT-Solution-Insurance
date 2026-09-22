#!/usr/bin/env node
/**
 * INC-002 CI guard — EAS build-profile feature-flag coverage.
 *
 * INC-002 (2026-09-21, docs/organization/incidents/INC-002-play-internal-
 * location-reenablement.md): a real EAS build profile (`playInternal`) had
 * `EXPO_PUBLIC_FEATURE_LOCATION_TRACKING` set to `"true"` — a value that
 * should never have shipped to a live Google Play internal-testing track —
 * and shipped silently because nothing in CI checked build-profile env
 * blocks against the flags `mobile/src/config/features.ts` actually reads.
 * The fail-open default in `features.ts` was fixed the same day
 * ("fix(mobile): close fail-open EAS build config for gated feature
 * flags") — this script is the CI-level net requested as the follow-up so a
 * profile can't omit or silently mis-set a flag again.
 *
 * Two checks, mirroring `scripts/verify-stage8-manifest.mjs`'s style
 * (discover-then-assert, clear FAIL block naming every offender):
 *
 *   1. Every non-development build profile in `mobile/eas.json` must
 *      *explicitly* set every `EXPO_PUBLIC_FEATURE_*` flag referenced in
 *      `mobile/src/config/features.ts`, once `extends` inheritance is
 *      resolved (a value inherited from a parent profile counts as
 *      "explicitly set" for that child; a flag missing from the whole
 *      inheritance chain does not).
 *   2. Every build profile targeting a real distribution track
 *      (`distribution: "internal"` or the EAS default `"store"`, i.e.
 *      anything that isn't the `development` client profile) that has a
 *      gated flag set to `"true"` must have that flag's corresponding
 *      surface in `docs/organization/gates/stage8-manifest.json` carry
 *      *unconditional* Stage 8 coverage — not one of the
 *      `"gated via FEATURE_<X>"` waivers that were only granted on the
 *      premise the flag stays off. Flipping the flag to `"true"` in a real
 *      build invalidates that premise; INC-002 is exactly this failure
 *      mode.
 *
 * eas.json `extends` semantics (verified against Expo's documented
 * behavior — no local eas-cli install to introspect at the time this was
 * written): a child profile inherits every field from its parent, and for
 * object-valued fields (including `env`) the merge is per-key — the
 * child's own keys override the parent's, but keys the child does not
 * redeclare are inherited, not dropped. This script's `resolveProfile()`
 * implements that same per-key merge so it doesn't misreport an inherited
 * flag as "missing".
 *
 * Usage: node scripts/verify-eas-feature-flags.mjs   (run from mobile/, or
 * anywhere — paths are resolved relative to this file).
 *
 * Exit 0 = every non-development profile sets every flag, and no real-track
 *          profile enables a flag beyond its Stage 8 waiver's premise.
 * Exit 1 = otherwise, with every offending profile/flag named.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const mobileRoot = join(__dirname, '..');
const repoRoot = join(mobileRoot, '..');

const easJsonPath = join(mobileRoot, 'eas.json');
const featuresPath = join(mobileRoot, 'src/config/features.ts');
const manifestPath = join(repoRoot, 'docs/organization/gates/stage8-manifest.json');

function loadJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

// --- 1. Discover the full set of EXPO_PUBLIC_FEATURE_* flags the app reads ---
function discoverFlags() {
  const content = readFileSync(featuresPath, 'utf8');
  const flags = new Set();
  for (const match of content.matchAll(
    /featureEnabled\(\s*['"](EXPO_PUBLIC_FEATURE_[A-Z0-9_]+)['"]\s*,?\s*\)/g,
  )) {
    flags.add(match[1]);
  }
  return [...flags].sort();
}

// --- 2. Resolve eas.json build profiles, following `extends` per-key merge ---
function resolveProfile(profiles, name, seen = new Set()) {
  if (seen.has(name)) {
    throw new Error(`eas.json build profile cycle detected involving "${name}"`);
  }
  const own = profiles[name];
  if (!own) {
    throw new Error(`eas.json references unknown build profile "${name}"`);
  }
  let base = {};
  if (own.extends) {
    base = resolveProfile(profiles, own.extends, new Set([...seen, name]));
  }
  const resolved = { ...base, ...own };
  // Per-key merge for object-valued fields so an inherited key isn't lost
  // just because the child redeclares the same field with other keys.
  for (const key of ['env', 'android', 'ios']) {
    if (base[key] || own[key]) {
      resolved[key] = { ...(base[key] ?? {}), ...(own[key] ?? {}) };
    }
  }
  return resolved;
}

function loadProfiles() {
  const easJson = loadJson(easJsonPath);
  const profiles = easJson.build ?? {};
  const resolved = {};
  for (const name of Object.keys(profiles)) {
    resolved[name] = resolveProfile(profiles, name);
  }
  return resolved;
}

function isDevelopmentProfile(resolved) {
  return resolved.environment === 'development';
}

// EAS defaults `distribution` to "store" when omitted — both "internal" and
// "store" produce a real, installable artifact (as opposed to the dev-client
// profile, which is the only profile expected to omit real distribution).
function isRealDistributionTrack(resolved) {
  const distribution = resolved.distribution ?? 'store';
  return !isDevelopmentProfile(resolved) && (distribution === 'internal' || distribution === 'store');
}

// --- 3. Map each flag to the Stage 8 manifest surface(s) whose waiver text
// names it, so a flag flip can be checked against the premise it was waived
// under, not just "some manifest entry exists".
function loadManifestWaiversByFlag() {
  const manifest = loadJson(manifestPath);
  const byFlag = new Map(); // flag -> [{ id, unconditional }]
  for (const surface of manifest.surfaces ?? []) {
    const stage8 = surface.stage8;
    if (!stage8) continue;
    const reason = stage8.reason ?? '';
    const match = reason.match(/gated via (EXPO_PUBLIC_FEATURE_[A-Z0-9_]+|FEATURE_[A-Z0-9_]+)/);
    if (!match) continue;
    const flag = match[1].startsWith('EXPO_PUBLIC_') ? match[1] : `EXPO_PUBLIC_${match[1]}`;
    if (!byFlag.has(flag)) byFlag.set(flag, []);
    byFlag.get(flag).push({
      id: surface.id ?? surface.pattern,
      // "Coverage" for a flag being ON means a reviewer explicitly approved
      // enabling this flag in a real build — not merely the absence of a
      // waiver flag. `stage8.waived !== true` was the original (defective)
      // signal here: it would have incorrectly treated any non-`waived`
      // entry — including a future CONDITIONAL sign-off shaped some other
      // way — as unconditional coverage. Require the explicit, positive
      // field instead.
      unconditional: stage8.flagEnableApproved === true,
    });
  }
  return byFlag;
}

function main() {
  const flags = discoverFlags();
  const profiles = loadProfiles();
  const waiversByFlag = loadManifestWaiversByFlag();

  const missingFlagErrors = [];
  const uncoveredEnabledErrors = [];

  for (const [name, resolved] of Object.entries(profiles)) {
    if (isDevelopmentProfile(resolved)) continue; // check (1) scope: non-development profiles only

    const env = resolved.env ?? {};
    for (const flag of flags) {
      if (!(flag in env)) {
        missingFlagErrors.push({ profile: name, flag });
      }
    }

    if (!isRealDistributionTrack(resolved)) continue; // check (2) scope: real distribution tracks only

    for (const flag of flags) {
      if (env[flag] !== 'true') continue;
      const waivers = waiversByFlag.get(flag) ?? [];
      const hasUnconditionalCoverage = waivers.some((w) => w.unconditional);
      if (!hasUnconditionalCoverage) {
        uncoveredEnabledErrors.push({
          profile: name,
          flag,
          waivers: waivers.map((w) => w.id),
        });
      }
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    `[verify-eas-feature-flags] ${flags.length} flag(s) discovered in features.ts; ${Object.keys(profiles).length} build profile(s) in eas.json.`,
  );

  let failed = false;

  if (missingFlagErrors.length > 0) {
    failed = true;
    // eslint-disable-next-line no-console
    console.error(
      '\n[verify-eas-feature-flags] FAIL — non-development build profile(s) missing explicit flag(s) (own env or inherited via `extends`):\n',
    );
    for (const { profile, flag } of missingFlagErrors) {
      // eslint-disable-next-line no-console
      console.error(`  - profile "${profile}": missing ${flag}`);
    }
  }

  if (uncoveredEnabledErrors.length > 0) {
    failed = true;
    // eslint-disable-next-line no-console
    console.error(
      '\n[verify-eas-feature-flags] FAIL — real-distribution-track profile(s) enable a gated flag beyond its Stage 8 waiver premise (INC-002):\n',
    );
    for (const { profile, flag, waivers } of uncoveredEnabledErrors) {
      const coverage =
        waivers.length > 0
          ? `only conditional waiver(s) ${waivers.join(', ')} (premised on the flag staying off)`
          : 'no docs/organization/gates/stage8-manifest.json entry names this flag at all';
      // eslint-disable-next-line no-console
      console.error(`  - profile "${profile}": ${flag}="true" — ${coverage}`);
    }
    // eslint-disable-next-line no-console
    console.error(
      '\nSet the flag back to "false" for this profile, or obtain an unconditional Stage 8 sign-off for the surface and update stage8-manifest.json before flipping it to "true" here.',
    );
  }

  if (failed) {
    process.exit(1);
  }

  // eslint-disable-next-line no-console
  console.log(
    '[verify-eas-feature-flags] PASS — every non-development profile sets every flag; no real-track profile exceeds its Stage 8 waiver.',
  );
}

main();
