import { fireEvent, screen } from '@testing-library/react-native';
import React from 'react';
import type { ProtectionChecklistView } from '../../../api/protectionChecklist';
import { renderWithProviders } from '../../../test/renderWithProviders';
import { ProtectionHealthCard } from '../ProtectionHealthCard';
import { checklistActionHref, isChecklistActionAvailable } from '../checklistActions';

const DISCLOSURE = 'This does not affect your premium, your cover or your claims.';

function item(id: string, done: boolean, action: string | null) {
  return {
    id,
    title: `Title ${id}`,
    benefit: `Benefit ${id}`,
    done,
    unavailable: false,
    points: 0,
    maxPoints: 10,
    nextStep: done || !action ? null : { label: `Do ${id}`, action },
  };
}

function view(items: unknown[], doneCount: number): ProtectionChecklistView {
  return {
    configVersion: 'v',
    points: 0,
    maxPoints: 100,
    band: 'getting_started',
    doneCount,
    totalCount: items.length,
    disclosure: DISCLOSURE,
    items,
  } as ProtectionChecklistView;
}

const noop = () => undefined;

describe('ProtectionHealthCard checklist mode', () => {
  it('new account: every item with CTA, benefit and the disclosure', async () => {
    const onAction = jest.fn();
    await renderWithProviders(
      <ProtectionHealthCard
        mode="checklist"
        checklist={view([item('mfa', false, 'open_security_settings'), item('plan_active', false, 'open_plans')], 0)}
        onAction={onAction}
        isActionAvailable={() => true}
      />,
    );
    expect(screen.getByText('Protection checklist')).toBeTruthy();
    expect(screen.getByText('0 of 2 done')).toBeTruthy();
    expect(screen.getByText('Benefit mfa')).toBeTruthy();
    expect(screen.getByText(DISCLOSURE)).toBeTruthy();
    fireEvent.press(screen.getByText('Do mfa'));
    expect(onAction).toHaveBeenCalledWith('open_security_settings');
  });

  it('full: no CTAs, disclosure still rendered, no dismiss control', async () => {
    await renderWithProviders(
      <ProtectionHealthCard
        mode="checklist"
        checklist={view([item('mfa', true, null), item('plan_active', true, null)], 2)}
        onAction={noop}
        isActionAvailable={() => true}
      />,
    );
    expect(screen.getByText('2 of 2 done')).toBeTruthy();
    expect(screen.queryByText(/^Do /)).toBeNull();
    expect(screen.getByText(DISCLOSURE)).toBeTruthy();
    expect(screen.queryByText(/dismiss|close/i)).toBeNull();
  });

  it('hides a CTA whose target is unavailable but keeps the item', async () => {
    await renderWithProviders(
      <ProtectionHealthCard
        mode="checklist"
        checklist={view([item('identity_verified', false, 'open_verification')], 0)}
        onAction={noop}
        isActionAvailable={(a) => a !== 'open_verification'}
      />,
    );
    expect(screen.getByText('Benefit identity_verified')).toBeTruthy();
    expect(screen.queryByText('Do identity_verified')).toBeNull();
  });

  it('legacy status mode renders unchanged', async () => {
    await renderWithProviders(
      <ProtectionHealthCard
        assetProtected={1}
        assetTotal={2}
        trackingOnline={0}
        trackingActive={0}
        alertCount={0}
        criticalAlertCount={0}
        profilePercent={50}
        operational
      />,
    );
    expect(screen.getByText('All systems operational')).toBeTruthy();
  });
});

describe('checklistActions', () => {
  it('maps every key to a route', () => {
    expect(checklistActionHref('add_asset')).toBe('/assets/register');
    expect(checklistActionHref('open_plans')).toBe('/(app)/policy');
    expect(isChecklistActionAvailable('add_asset')).toBe(true);
  });

  it('hides verification CTA when KYC flag is off', () => {
    jest.resetModules();
    jest.doMock('../../../config/features', () => ({ FEATURE_KYC_ENABLED: false }));
    const mod = require('../checklistActions');
    expect(mod.isChecklistActionAvailable('open_verification')).toBe(false);
    expect(mod.isChecklistActionAvailable('open_plans')).toBe(true);
    jest.dontMock('../../../config/features');
  });
});
