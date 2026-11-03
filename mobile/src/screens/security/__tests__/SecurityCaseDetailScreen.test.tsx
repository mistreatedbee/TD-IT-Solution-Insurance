import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { SecurityCaseDetailScreen } from '../SecurityCaseDetailScreen';
import { ApiError, NetworkUnavailableError } from '../../../api/errors';

jest.mock('../../../theme/primitives', () => {
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
      disabled,
    }: {
      children: string;
      onPress?: () => void;
      disabled?: boolean;
    }) => (
      <Pressable onPress={disabled ? undefined : onPress} accessibilityRole="button">
        <Text>{children}</Text>
      </Pressable>
    ),
  };
});

jest.mock('../../recovery/MapPlaceholder', () => ({ MapPlaceholder: () => null }));

jest.mock('../../../api/security-cases', () => {
  const actual = jest.requireActual('../../../api/security-cases');
  return {
    ...actual,
    getSecurityCase: (...args: unknown[]) => mockGetSecurityCase(...args),
    claimSecurityCase: (...args: unknown[]) => mockClaimSecurityCase(...args),
    acceptSecurityCase: (...args: unknown[]) => mockAcceptSecurityCase(...args),
    declineSecurityCase: (...args: unknown[]) => mockDeclineSecurityCase(...args),
    releaseSecurityCase: (...args: unknown[]) => mockReleaseSecurityCase(...args),
    updateSecurityCaseStatus: (...args: unknown[]) => mockUpdateSecurityCaseStatus(...args),
    TERMINAL_SECURITY_CASE_STATUSES: ['recovered', 'closed'],
  };
});

let mockBack: jest.Mock;
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ caseId: 'case-1' }),
  useRouter: () => ({ back: mockBack }),
}));

jest.mock('../../../network/NetworkProvider', () => ({
  useIsOnline: () => mockIsOnline(),
}));

const mockGetSecurityCase = jest.fn();
const mockClaimSecurityCase = jest.fn();
const mockAcceptSecurityCase = jest.fn();
const mockDeclineSecurityCase = jest.fn();
const mockReleaseSecurityCase = jest.fn();
const mockUpdateSecurityCaseStatus = jest.fn();
const mockIsOnline = jest.fn(() => true);

function openCase() {
  return {
    id: 'case-1',
    assetId: 'asset-1',
    status: 'open' as const,
    referenceNumber: 'RC-1',
    reportedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('SecurityCaseDetailScreen — data minimisation (PDM-1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBack = jest.fn();
    mockIsOnline.mockReturnValue(true);
    mockGetSecurityCase.mockResolvedValue(openCase());
  });

  it('never renders a "Customer account" label — accountId must not reach the partner UI', async () => {
    await render(<SecurityCaseDetailScreen />);
    await screen.findByText('RC-1');

    expect(screen.queryByText('Customer account')).toBeNull();
  });

  // SR-009S-2 — upgrades the denylist check above to an allowlist-shaped regression:
  // the API client's type is a compile-time cast, not a runtime schema validator, so a
  // response that actually carries an unexpected extra field (e.g. a backend serializer
  // regression reintroducing `accountId`) is not stripped before it reaches this
  // screen's state. This test proves the screen never renders such a field anywhere,
  // against an adversarial payload, rather than trusting the type alone.
  it('SR-009S-2: a response carrying an unexpected extra field (e.g. accountId) is never rendered anywhere on screen', async () => {
    mockGetSecurityCase.mockResolvedValue({
      ...openCase(),
      accountId: 'LEAKED-ACCOUNT-ID-MUST-NOT-RENDER',
    });

    await render(<SecurityCaseDetailScreen />);
    await screen.findByText('RC-1');

    expect(screen.queryByText(/LEAKED-ACCOUNT-ID-MUST-NOT-RENDER/)).toBeNull();
  });
});

describe('SecurityCaseDetailScreen — offline-tolerance policy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBack = jest.fn();
    mockIsOnline.mockReturnValue(true);
    mockGetSecurityCase.mockResolvedValue(openCase());
  });

  it('blocks claiming when offline with a definite "has not been claimed" message', async () => {
    mockIsOnline.mockReturnValue(false);
    await render(<SecurityCaseDetailScreen />);
    await screen.findByText('Claim case');

    await act(async () => {
      fireEvent.press(screen.getByText('Claim case'));
    });

    await waitFor(() => expect(screen.getByText(/has not been claimed/)).toBeTruthy());
    expect(mockClaimSecurityCase).not.toHaveBeenCalled();
  });

  it('on NetworkUnavailableError, warns that retrying a successful claim will look unavailable, not success', async () => {
    mockClaimSecurityCase.mockRejectedValueOnce(new NetworkUnavailableError());
    await render(<SecurityCaseDetailScreen />);
    await screen.findByText('Claim case');

    await act(async () => {
      fireEvent.press(screen.getByText('Claim case'));
    });

    await waitFor(() =>
      expect(screen.getByText(/couldn.t confirm this claim was received/)).toBeTruthy(),
    );
  });

  it('on a 404 after claiming, re-fetches the case and shows it as claimed rather than erroring, if it is no longer open', async () => {
    mockClaimSecurityCase.mockRejectedValueOnce(
      new ApiError(404, { error: { code: 'NOT_FOUND', message: 'not found', requestId: 'req-1' } }),
    );
    mockGetSecurityCase
      .mockResolvedValueOnce(openCase())
      .mockResolvedValueOnce({ ...openCase(), status: 'investigating' });

    await render(<SecurityCaseDetailScreen />);
    await screen.findByText('Claim case');

    await act(async () => {
      fireEvent.press(screen.getByText('Claim case'));
    });

    // The claim action's own retry-ambiguity error must not be shown —
    // the refetch confirmed the original attempt actually succeeded.
    await waitFor(() => expect(screen.getByText('investigating')).toBeTruthy());
    expect(screen.queryByText(/couldn.t confirm/)).toBeNull();
  });

  it('still shows an error if a 404 refetch confirms the case really is still open (claim genuinely failed)', async () => {
    mockClaimSecurityCase.mockRejectedValueOnce(
      new ApiError(404, { error: { code: 'NOT_FOUND', message: 'This case could not be found. It may have been closed or reassigned.', requestId: 'req-1' } }),
    );
    mockGetSecurityCase.mockResolvedValueOnce(openCase()).mockResolvedValueOnce(openCase());

    await render(<SecurityCaseDetailScreen />);
    await screen.findByText('Claim case');

    await act(async () => {
      fireEvent.press(screen.getByText('Claim case'));
    });

    await waitFor(() => expect(screen.getByText('This case could not be found. It may have been closed or reassigned.')).toBeTruthy());
  });
});

describe('SecurityCaseDetailScreen — terminal status requires a close reason', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBack = jest.fn();
    mockIsOnline.mockReturnValue(true);
    mockGetSecurityCase.mockResolvedValue({ ...openCase(), status: 'tracking' });
  });

  it('does not call updateSecurityCaseStatus until a reason is picked for a terminal status', async () => {
    await render(<SecurityCaseDetailScreen />);
    await screen.findByText('Mark recovered');

    await act(async () => {
      fireEvent.press(screen.getByText('Mark recovered'));
    });

    expect(mockUpdateSecurityCaseStatus).not.toHaveBeenCalled();
    expect(await screen.findByText('Recovered intact')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByText('Recovered intact'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Confirm recovered'));
    });

    expect(mockUpdateSecurityCaseStatus).toHaveBeenCalledWith(
      'case-1',
      'recovered',
      'recovered-intact',
    );
  });

  it('does not show a reason picker for non-terminal status changes', async () => {
    await render(<SecurityCaseDetailScreen />);
    await screen.findByText('Start investigating');

    await act(async () => {
      fireEvent.press(screen.getByText('Start investigating'));
    });

    expect(mockUpdateSecurityCaseStatus).toHaveBeenCalledWith(
      'case-1',
      'investigating',
      undefined,
    );
    expect(screen.queryByText('Recovered intact')).toBeNull();
  });

  it('renders the stored close reason once the case is closed', async () => {
    mockGetSecurityCase.mockResolvedValue({
      ...openCase(),
      status: 'closed',
      closeReason: 'handed-to-police',
    });

    await render(<SecurityCaseDetailScreen />);

    expect(await screen.findByText('Handed to police')).toBeTruthy();
  });
});

function offeredCase() {
  return { ...openCase(), dispatchStatus: 'pending' as const };
}

function heldCase() {
  return { ...openCase(), status: 'investigating' as const, dispatchStatus: 'accepted' as const };
}

describe('SecurityCaseDetailScreen — dispatch mode: offered (dispatchStatus "pending")', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBack = jest.fn();
    mockIsOnline.mockReturnValue(true);
    mockGetSecurityCase.mockResolvedValue(offeredCase());
  });

  it('renders only Accept and Decline — no Claim and no STATUS_ACTIONS', async () => {
    await render(<SecurityCaseDetailScreen />);
    await screen.findByText('Accept');

    expect(screen.getByText('Decline')).toBeTruthy();
    expect(screen.queryByText('Claim case')).toBeNull();
    expect(screen.queryByText('Start investigating')).toBeNull();
    expect(screen.queryByText('Mark recovered')).toBeNull();
    expect(screen.queryByText('Close case')).toBeNull();
  });

  it('accepts the case and shows the resulting held state', async () => {
    mockAcceptSecurityCase.mockResolvedValue(heldCase());
    await render(<SecurityCaseDetailScreen />);
    await screen.findByText('Accept');

    await act(async () => {
      fireEvent.press(screen.getByText('Accept'));
    });

    expect(mockAcceptSecurityCase).toHaveBeenCalledWith('case-1');
    await waitFor(() => expect(screen.getByText('Release')).toBeTruthy());
  });

  it('blocks accepting when offline with a definite "has not been accepted" message', async () => {
    mockIsOnline.mockReturnValue(false);
    await render(<SecurityCaseDetailScreen />);
    await screen.findByText('Accept');

    await act(async () => {
      fireEvent.press(screen.getByText('Accept'));
    });

    await waitFor(() => expect(screen.getByText(/has not been accepted/)).toBeTruthy());
    expect(mockAcceptSecurityCase).not.toHaveBeenCalled();
  });

  it('on NetworkUnavailableError, warns to refresh before retrying rather than reporting failure', async () => {
    mockAcceptSecurityCase.mockRejectedValueOnce(new NetworkUnavailableError());
    await render(<SecurityCaseDetailScreen />);
    await screen.findByText('Accept');

    await act(async () => {
      fireEvent.press(screen.getByText('Accept'));
    });

    await waitFor(() =>
      expect(screen.getByText(/couldn.t confirm this accept was received/)).toBeTruthy(),
    );
  });

  it('on a 409 after accepting, re-fetches and shows the held state if the original attempt landed', async () => {
    mockAcceptSecurityCase.mockRejectedValueOnce(
      new ApiError(409, { error: { code: 'CONFLICT', message: 'conflict', requestId: 'req-1' } }),
    );
    mockGetSecurityCase.mockResolvedValueOnce(offeredCase()).mockResolvedValueOnce(heldCase());

    await render(<SecurityCaseDetailScreen />);
    await screen.findByText('Accept');

    await act(async () => {
      fireEvent.press(screen.getByText('Accept'));
    });

    await waitFor(() => expect(screen.getByText('Release')).toBeTruthy());
    expect(screen.queryByText(/couldn.t confirm/)).toBeNull();
  });

  it('requires picking a fixed-enum reason before confirming decline, then declines and navigates back', async () => {
    mockDeclineSecurityCase.mockResolvedValue({ caseId: 'case-1', status: 'returned_to_queue' });
    await render(<SecurityCaseDetailScreen />);
    await screen.findByText('Decline');

    await act(async () => {
      fireEvent.press(screen.getByText('Decline'));
    });

    const confirmDecline = await screen.findByText('Confirm decline');
    // Confirm is disabled until a reason chip is chosen.
    await act(async () => {
      fireEvent.press(confirmDecline);
    });
    expect(mockDeclineSecurityCase).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(screen.getByText('No capacity'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Confirm decline'));
    });

    expect(mockDeclineSecurityCase).toHaveBeenCalledWith('case-1', 'no_capacity');
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });
});

describe('SecurityCaseDetailScreen — dispatch mode: held (dispatchStatus "accepted")', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBack = jest.fn();
    mockIsOnline.mockReturnValue(true);
    mockGetSecurityCase.mockResolvedValue(heldCase());
  });

  it('renders STATUS_ACTIONS plus Release, and no Claim/Accept/Decline', async () => {
    await render(<SecurityCaseDetailScreen />);
    await screen.findByText('Release');

    expect(screen.getByText('Begin tracking')).toBeTruthy();
    expect(screen.getByText('Mark recovered')).toBeTruthy();
    expect(screen.getByText('Close case')).toBeTruthy();
    expect(screen.queryByText('Claim case')).toBeNull();
    expect(screen.queryByText('Accept')).toBeNull();
    expect(screen.queryByText('Decline')).toBeNull();
  });

  it('requires picking a fixed-enum reason before confirming release, then releases and navigates back', async () => {
    mockReleaseSecurityCase.mockResolvedValue({ caseId: 'case-1', status: 'returned_to_queue' });
    await render(<SecurityCaseDetailScreen />);
    await screen.findByText('Release');

    await act(async () => {
      fireEvent.press(screen.getByText('Release'));
    });

    const confirmRelease = await screen.findByText('Confirm release');
    await act(async () => {
      fireEvent.press(confirmRelease);
    });
    expect(mockReleaseSecurityCase).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(screen.getByText('Recovered independently'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Confirm release'));
    });

    expect(mockReleaseSecurityCase).toHaveBeenCalledWith('case-1', 'recovered_independently');
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it('on a 404 after releasing, treats the case leaving this org visibility as confirmation and navigates back', async () => {
    mockReleaseSecurityCase.mockRejectedValueOnce(
      new ApiError(404, { error: { code: 'NOT_FOUND', message: 'not found', requestId: 'req-1' } }),
    );
    mockGetSecurityCase
      .mockResolvedValueOnce(heldCase())
      .mockResolvedValueOnce({ ...heldCase(), dispatchStatus: undefined });

    await render(<SecurityCaseDetailScreen />);
    await screen.findByText('Release');

    await act(async () => {
      fireEvent.press(screen.getByText('Release'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Recovered independently'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Confirm release'));
    });

    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });
});

describe('SecurityCaseDetailScreen — pool mode (dispatchStatus absent) stays byte-identical to today', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBack = jest.fn();
    mockIsOnline.mockReturnValue(true);
  });

  it('renders Claim case for an open, unassigned case with no dispatchStatus', async () => {
    mockGetSecurityCase.mockResolvedValue(openCase());
    await render(<SecurityCaseDetailScreen />);

    expect(await screen.findByText('Claim case')).toBeTruthy();
    expect(screen.queryByText('Accept')).toBeNull();
    expect(screen.queryByText('Decline')).toBeNull();
    expect(screen.queryByText('Release')).toBeNull();
  });

  it('renders STATUS_ACTIONS once claimed, with no Release button', async () => {
    mockGetSecurityCase.mockResolvedValue({
      ...openCase(),
      status: 'investigating',
      partnerOrganizationId: 'org-1',
    });
    await render(<SecurityCaseDetailScreen />);

    expect(await screen.findByText('Begin tracking')).toBeTruthy();
    expect(screen.queryByText('Release')).toBeNull();
  });
});
