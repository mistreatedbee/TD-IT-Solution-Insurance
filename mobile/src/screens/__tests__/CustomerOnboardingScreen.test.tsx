import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react-native';
import { CustomerOnboardingScreen } from '../onboarding/CustomerOnboardingScreen';
import type { PlanCatalogItem } from '../../api/plans';
import { ApiError } from '../../api/errors';

jest.mock('../../theme/primitives', () => {
  const React = require('react');
  const { Text, View, Pressable } = require('react-native');
  return {
    Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    Alert: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
    Badge: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
    Card: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    Button: ({
      children,
      onPress,
      loading,
    }: {
      children: string;
      onPress?: () => void;
      loading?: boolean;
    }) => (
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ busy: loading }}>
        <Text>{children}</Text>
      </Pressable>
    ),
    Input: () => null,
  };
});

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock('../../auth/useAccountQuery', () => ({
  useAccountQuery: jest.fn(),
  fetchLiveAccountForGating: jest.fn(),
}));

jest.mock('../../onboarding/OnboardingProgress', () => ({
  OnboardingProgress: () => null,
}));

jest.mock('../../onboarding/onboardingStorage', () => ({
  loadAccountType: jest.fn().mockResolvedValue(null),
  loadAssetDraft: jest.fn().mockResolvedValue(null),
  loadSignupProfileDraft: jest.fn().mockResolvedValue(null),
  saveAccountType: jest.fn().mockResolvedValue(undefined),
  saveAssetDraft: jest.fn().mockResolvedValue(undefined),
  saveSignupProfileDraft: jest.fn().mockResolvedValue(undefined),
  clearAssetDraft: jest.fn().mockResolvedValue(undefined),
  markOnboardingComplete: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../onboarding/marketing/components/TrackingConnectionDiagram', () => ({
  TrackingConnectionDiagram: () => null,
}));

jest.mock('../../api/plans', () => ({
  ...jest.requireActual('../../api/plans'),
  listPlans: jest.fn(),
}));

jest.mock('../../api/policies', () => ({
  listPolicies: jest.fn(),
  createPolicy: jest.fn(),
}));

jest.mock('../../api/assets', () => ({
  listAssets: jest.fn(),
  createAsset: jest.fn(),
}));

const { useAccountQuery } = jest.requireMock('../../auth/useAccountQuery') as {
  useAccountQuery: jest.Mock;
};

const { listPlans } = jest.requireMock('../../api/plans') as {
  listPlans: jest.Mock;
};

const { listPolicies, createPolicy } = jest.requireMock('../../api/policies') as {
  listPolicies: jest.Mock;
  createPolicy: jest.Mock;
};

const { listAssets } = jest.requireMock('../../api/assets') as {
  listAssets: jest.Mock;
};

const standardPlan: PlanCatalogItem = {
  id: '507f1f77bcf86cd799439011',
  slug: 'standard',
  name: 'Standard',
  tagline: 'Up to 10 devices',
  maxAssets: 10,
  monthlyAmountCents: 40_000,
  currency: 'ZAR',
  isCustomPricing: false,
  isActive: true,
  sortOrder: 2,
  features: ['Up to 10 registered assets', 'GPS-assisted recovery when hardware is paired'],
  accountTypes: ['both'],
};

function mockSignedInResume() {
  useAccountQuery.mockReturnValue({
    data: { email: 'customer@example.com', accountState: 'active' },
  });
  listPolicies.mockResolvedValue({
    data: [],
    pagination: { nextCursor: null, hasMore: false },
  });
  listAssets.mockResolvedValue({
    data: [],
    pagination: { nextCursor: null, hasMore: false },
  });
}

describe('CustomerOnboardingScreen — plan step', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSignedInResume();
  });

  it('renders the plan selection step with catalog cards after plans load', async () => {
    listPlans.mockResolvedValue({ data: [standardPlan] });

    await render(<CustomerOnboardingScreen signedIn />);

    await waitFor(() => {
      expect(screen.getByText('Choose an insurance plan')).toBeTruthy();
    });

    expect(screen.getByText('Standard')).toBeTruthy();
    expect(screen.getByText('R400/month')).toBeTruthy();
    expect(screen.getByText('Select plan')).toBeTruthy();
    expect(listPlans).toHaveBeenCalled();
  });

  it('shows a loading hint while plans are being fetched', async () => {
    let resolvePlans!: (value: { data: PlanCatalogItem[] }) => void;
    listPlans.mockReturnValue(
      new Promise((resolve) => {
        resolvePlans = resolve;
      }),
    );

    await render(<CustomerOnboardingScreen signedIn />);

    await waitFor(() => {
      expect(screen.getByText('Choose an insurance plan')).toBeTruthy();
    });
    expect(screen.getByText('Loading plans…')).toBeTruthy();

    await act(async () => {
      resolvePlans({ data: [standardPlan] });
    });

    await waitFor(() => {
      expect(screen.queryByText('Loading plans…')).toBeNull();
    });
    expect(screen.getByText('Standard')).toBeTruthy();
  });

  it('renders no plan cards when the catalog fetch fails', async () => {
    listPlans.mockRejectedValue(new Error('network down'));

    await render(<CustomerOnboardingScreen signedIn />);

    await waitFor(() => {
      expect(screen.getByText('Choose an insurance plan')).toBeTruthy();
    });

    await waitFor(() => {
      expect(screen.queryByText('Loading plans…')).toBeNull();
    });

    expect(screen.queryByText('Standard')).toBeNull();
    expect(screen.queryByText('Select plan')).toBeNull();
  });

  it('selects a plan and advances to the asset category step', async () => {
    listPlans.mockResolvedValue({ data: [standardPlan] });
    createPolicy.mockResolvedValue({
      id: '507f1f77bcf86cd799439099',
      planTier: 'standard',
      status: 'pending_activation',
    });

    await render(<CustomerOnboardingScreen signedIn />);

    await waitFor(() => {
      expect(screen.getByText('Select plan')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByText('Select plan'));
    });

    await waitFor(() => {
      expect(createPolicy).toHaveBeenCalledWith({
        planCatalogId: standardPlan.id,
        planTier: standardPlan.slug,
      });
    });

    await waitFor(() => {
      expect(screen.getByText("Let's protect your first asset")).toBeTruthy();
    });
  });

  it('surfaces an error when plan selection fails', async () => {
    listPlans.mockResolvedValue({ data: [standardPlan] });
    createPolicy.mockRejectedValue(
      new ApiError(409, {
        error: {
          code: 'POLICY_ALREADY_EXISTS',
          message: 'You already have an active policy.',
          requestId: 'r-plan',
        },
      }),
    );

    await render(<CustomerOnboardingScreen signedIn />);

    await waitFor(() => {
      expect(screen.getByText('Select plan')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByText('Select plan'));
    });

    await waitFor(() => {
      expect(screen.getByText('You already have an active policy.')).toBeTruthy();
    });
    expect(screen.getByText('Choose an insurance plan')).toBeTruthy();
  });
});
