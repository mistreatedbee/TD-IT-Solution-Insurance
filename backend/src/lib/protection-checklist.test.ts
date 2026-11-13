import { describe, it, expect } from 'vitest';
import { computeProtectionChecklist, type ProtectionChecklistInput } from './protection-checklist.js';
import {
  CHECKLIST_ITEM_IDS,
  PROTECTION_CHECKLIST_CONFIG as CFG,
  PROTECTION_CHECKLIST_DISCLOSURE,
} from './protection-checklist-config.js';

const NOW = new Date('2026-11-13T12:00:00Z');
const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);

const empty: ProtectionChecklistInput = {
  mfa: false,
  firstName: null,
  lastName: null,
  phone: null,
  policies: [],
  hasActiveAsset: false,
  verificationStatus: 'not_started',
};
const run = (o: Partial<ProtectionChecklistInput> = {}) =>
  computeProtectionChecklist({ ...empty, ...o }, NOW);
const item = (v: ReturnType<typeof run>, id: string) => v.items.find((i) => i.id === id)!;

describe('computeProtectionChecklist', () => {
  it('empty account scores 0, getting_started, 0/6 done', () => {
    const v = run();
    expect(v.points).toBe(0);
    expect(v.maxPoints).toBe(100);
    expect(v.band).toBe('getting_started');
    expect(v.doneCount).toBe(0);
    expect(v.totalCount).toBe(6);
    expect(v.disclosure).toBe(PROTECTION_CHECKLIST_DISCLOSURE);
    expect(v.configVersion).toBe(CFG.configVersion);
  });

  it('mfa on/off', () => {
    expect(item(run({ mfa: true }), 'mfa')).toMatchObject({ done: true, points: 20, nextStep: null });
    expect(item(run({ mfa: false }), 'mfa')).toMatchObject({ done: false, points: 0 });
    expect(item(run({ mfa: false }), 'mfa').nextStep?.action).toBe('open_security_settings');
  });

  it('mfa unavailable is excluded from max and never "not done"', () => {
    const v = run({ mfa: 'unavailable' });
    expect(item(v, 'mfa')).toMatchObject({ done: null, unavailable: true, points: 0, nextStep: null });
    expect(v.maxPoints).toBe(80);
    expect(v.totalCount).toBe(5);
  });

  it('banding uses the reduced max when mfa unavailable', () => {
    // 25+20+15 = 60 of 80 = 75% -> well_set_up; all but mfa + tenure 0 = 75/80 = 93% -> fully
    const v = run({
      mfa: 'unavailable',
      firstName: 'a',
      lastName: 'b',
      phone: '1',
      policies: [{ status: 'active', effectiveDate: daysAgo(1) }],
      hasActiveAsset: true,
      verificationStatus: 'verified',
    });
    expect(v.points).toBe(75);
    expect(v.band).toBe('fully_set_up');
  });

  it('profile_basics needs all three non-blank', () => {
    const ok = { firstName: 'A', lastName: 'B', phone: '082' };
    expect(item(run(ok), 'profile_basics')).toMatchObject({ done: true, points: 15 });
    expect(item(run({ ...ok, firstName: '   ' }), 'profile_basics').done).toBe(false);
    expect(item(run({ ...ok, lastName: null }), 'profile_basics').done).toBe(false);
    expect(item(run({ ...ok, phone: '' }), 'profile_basics').done).toBe(false);
  });

  it.each(['pending_activation', 'past_due', 'suspended', 'cancelled', 'expired'])(
    'plan_active is not done for %s',
    (status) => {
      const v = run({ policies: [{ status, effectiveDate: daysAgo(400) }] });
      expect(item(v, 'plan_active')).toMatchObject({ done: false, points: 0 });
      expect(item(v, 'plan_tenure')).toMatchObject({ done: false, points: 0, nextStep: null });
    },
  );

  it('plan_active done for active', () => {
    const v = run({ policies: [{ status: 'active', effectiveDate: daysAgo(1) }] });
    expect(item(v, 'plan_active')).toMatchObject({ done: true, points: 25, nextStep: null });
  });

  it('asset_registered', () => {
    expect(item(run({ hasActiveAsset: true }), 'asset_registered').points).toBe(20);
    expect(item(run(), 'asset_registered').nextStep?.action).toBe('add_asset');
  });

  it('identity_verified only for verified', () => {
    for (const s of ['not_started', 'in_progress', 'pending_review', 'rejected', 'action_required']) {
      expect(item(run({ verificationStatus: s }), 'identity_verified').done).toBe(false);
    }
    expect(item(run({ verificationStatus: null }), 'identity_verified').done).toBe(false);
    expect(item(run({ verificationStatus: 'verified' }), 'identity_verified')).toMatchObject({
      done: true,
      points: 15,
    });
    expect(item(run({ verificationStatus: 'pending_review' }), 'identity_verified').nextStep?.action).toBe(
      'open_verification',
    );
  });

  it.each([
    [0, 0],
    [89, 0],
    [90, 3],
    [364, 3],
    [365, 5],
    [1000, 5],
  ])('tenure at %i days = %i points', (days, pts) => {
    const v = run({ policies: [{ status: 'active', effectiveDate: daysAgo(days) }] });
    expect(item(v, 'plan_tenure').points).toBe(pts);
    expect(item(v, 'plan_tenure').nextStep).toBeNull();
  });

  it('earliest active policy wins; non-active ignored', () => {
    const v = run({
      policies: [
        { status: 'active', effectiveDate: daysAgo(10) },
        { status: 'active', effectiveDate: daysAgo(400) },
        { status: 'cancelled', effectiveDate: daysAgo(900) },
      ],
    });
    expect(item(v, 'plan_tenure').points).toBe(5);
  });

  it('new customer can reach 95 -> fully_set_up (tenure is not a loyalty penalty)', () => {
    const v = run({
      mfa: true,
      firstName: 'A',
      lastName: 'B',
      phone: '1',
      policies: [{ status: 'active', effectiveDate: daysAgo(0) }],
      hasActiveAsset: true,
      verificationStatus: 'verified',
    });
    expect(v.points).toBe(95);
    expect(v.band).toBe('fully_set_up');
  });

  it('maximum is 100 with long tenure', () => {
    const v = run({
      mfa: true,
      firstName: 'A',
      lastName: 'B',
      phone: '1',
      policies: [{ status: 'active', effectiveDate: daysAgo(500) }],
      hasActiveAsset: true,
      verificationStatus: 'verified',
    });
    expect(v.points).toBe(100);
    expect(v.doneCount).toBe(6);
  });

  it('band thresholds at 49/50 and 84/85', () => {
    // 20 mfa + 15 profile + ... build exact totals via combinations
    // 45 = plan(25)+mfa(20) ; +asset(20)=65 ; need 49/50: no combo hits exactly, test via bandForPercent
    expect(run({ mfa: true, policies: [{ status: 'active', effectiveDate: daysAgo(0) }] }).band).toBe(
      'getting_started',
    ); // 45
    expect(
      run({
        mfa: true,
        policies: [{ status: 'active', effectiveDate: daysAgo(100) }],
      }).band,
    ).toBe('getting_started'); // 48
    expect(
      run({
        mfa: true,
        policies: [{ status: 'active', effectiveDate: daysAgo(400) }],
      }).band,
    ).toBe('well_set_up'); // 50
    // 80 (no tenure, no verification) -> well_set_up; 85 -> fully
    expect(
      run({
        mfa: true,
        firstName: 'a',
        lastName: 'b',
        phone: '1',
        policies: [{ status: 'active', effectiveDate: daysAgo(0) }],
        hasActiveAsset: true,
      }).band,
    ).toBe('well_set_up'); // 80
    expect(
      run({
        mfa: true,
        firstName: 'a',
        lastName: 'b',
        phone: '1',
        policies: [{ status: 'active', effectiveDate: daysAgo(100) }],
        hasActiveAsset: true,
      }).band,
    ).toBe('well_set_up'); // 83
    expect(
      run({
        mfa: true,
        firstName: 'a',
        lastName: 'b',
        phone: '1',
        policies: [{ status: 'active', effectiveDate: daysAgo(400) }],
        hasActiveAsset: true,
      }).band,
    ).toBe('fully_set_up'); // 85
  });

  it('nextStep is null whenever done is true', () => {
    const v = run({ mfa: true, hasActiveAsset: true, verificationStatus: 'verified' });
    for (const i of v.items) if (i.done === true) expect(i.nextStep).toBeNull();
  });
});

describe('protection checklist config', () => {
  it('only the whitelisted item ids exist (no tracker/hardware/photo/location/recovery)', () => {
    expect([...CFG.items.map((i) => i.id)].sort()).toEqual([...CHECKLIST_ITEM_IDS].sort());
    for (const id of CFG.items.map((i) => i.id)) {
      expect(id).not.toMatch(/tracker|hardware|photo|location|recovery/);
    }
    const v = run();
    expect(v.items.map((i) => i.id)).toEqual([...CHECKLIST_ITEM_IDS]);
  });

  it('weights sum to 100', () => {
    expect(CFG.items.reduce((s, i) => s + i.maxPoints, 0)).toBe(100);
  });

  it('disclosure is verbatim CR W-2', () => {
    expect(CFG.disclosure).toBe('This does not affect your premium, your cover or your claims.');
  });

  it('copy lint: no W-5 forbidden terms in any customer-facing string', () => {
    const forbidden = /\b(risk|rating|insurable|insurability|eligible|eligibility|qualify|approved|premium|discount|reward|benefit tier|claim|claims|underwrit\w*)\b/i;
    const strings: string[] = [];
    for (const i of CFG.items) {
      strings.push(i.title, i.benefit);
      if (i.nextStep) strings.push(i.nextStep.label);
    }
    for (const s of strings) expect(s, s).not.toMatch(forbidden);
    // Disclosure is the sole permitted exception for "premium"/"claims".
    expect(CFG.disclosure.replace(/premium|claims/g, '')).not.toMatch(forbidden);
  });
});
