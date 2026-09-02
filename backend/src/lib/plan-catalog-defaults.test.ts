/**
 * Pricing model v2 — canonical defaults and legacy slug normalization.
 *
 * QA run 2026-09-02: backend 270 passed, mobile 130 passed, web typecheck clean.
 */
import { describe, it, expect } from 'vitest';
import {
  LEGACY_PLAN_SLUG_MAP,
  PLAN_CATALOG_DEFAULTS,
  normalizePlanSlug,
} from './plan-catalog-defaults.js';

describe('normalizePlanSlug', () => {
  it('maps legacy starter → essential', () => {
    expect(normalizePlanSlug('starter')).toBe('essential');
  });

  it('maps legacy standard → plus', () => {
    expect(normalizePlanSlug('standard')).toBe('plus');
  });

  it('maps legacy enterprise → business', () => {
    expect(normalizePlanSlug('enterprise')).toBe('business');
  });

  it('passes through current tier slugs unchanged', () => {
    for (const slug of ['essential', 'plus', 'pro', 'business'] as const) {
      expect(normalizePlanSlug(slug)).toBe(slug);
    }
  });

  it('exports the full legacy map for migration tooling', () => {
    expect(LEGACY_PLAN_SLUG_MAP).toEqual({
      starter: 'essential',
      standard: 'plus',
      enterprise: 'business',
    });
  });
});

describe('PLAN_CATALOG_DEFAULTS', () => {
  it('defines four active tiers in sort order', () => {
    expect(PLAN_CATALOG_DEFAULTS).toHaveLength(4);
    expect(PLAN_CATALOG_DEFAULTS.map((p) => p.slug)).toEqual([
      'essential',
      'plus',
      'pro',
      'business',
    ]);
  });

  it('sets asset limits Essential 5, Plus 10, Pro 25, Business unlimited', () => {
    const bySlug = Object.fromEntries(PLAN_CATALOG_DEFAULTS.map((p) => [p.slug, p]));
    expect(bySlug.essential?.maxAssets).toBe(5);
    expect(bySlug.plus?.maxAssets).toBe(10);
    expect(bySlug.pro?.maxAssets).toBe(25);
    expect(bySlug.business?.maxAssets).toBeNull();
  });

  it('sets platform subscription prices in ZAR cents', () => {
    const bySlug = Object.fromEntries(PLAN_CATALOG_DEFAULTS.map((p) => [p.slug, p]));
    expect(bySlug.essential?.monthlyAmountCents).toBe(19_900);
    expect(bySlug.plus?.monthlyAmountCents).toBe(39_900);
    expect(bySlug.pro?.monthlyAmountCents).toBe(69_900);
    expect(bySlug.business?.isCustomPricing).toBe(true);
    expect(bySlug.business?.monthlyAmountCents).toBeNull();
  });

  it('marks Plus as most popular', () => {
    const popular = PLAN_CATALOG_DEFAULTS.filter((p) => p.isMostPopular);
    expect(popular).toHaveLength(1);
    expect(popular[0]?.slug).toBe('plus');
  });
});
