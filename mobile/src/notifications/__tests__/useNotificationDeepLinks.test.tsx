/**
 * INC-003 C-11 / M-1: notification deep-link routing is deny-by-default,
 * ignores auth email-link paths, never passes a query through, and no longer
 * listens for raw `Linking` `url` events.
 */
import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import {
  __resetHandledNotificationResponses,
  routeFromDeepLink,
  useNotificationDeepLinks,
} from '../useNotificationDeepLinks';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));

const mockLinkingAddEventListener = jest.fn(() => ({ remove: jest.fn() }));
jest.mock('expo-linking', () => ({
  addEventListener: (...args: unknown[]) => mockLinkingAddEventListener(...(args as [])),
}));

const CASE_ID = '64b7f0c2a1b2c3d4e5f60718';

function response(deepLink: unknown, identifier = 'notif-1') {
  return {
    actionIdentifier: 'expo.modules.notifications.actions.DEFAULT',
    notification: {
      date: 0,
      request: { identifier, content: { data: { deepLink } }, trigger: null },
    },
  } as unknown as Notifications.NotificationResponse;
}

function Harness() {
  useNotificationDeepLinks();
  return null;
}

const addResponseListener = Notifications.addNotificationResponseReceivedListener as jest.Mock;
const getLastResponse = Notifications.getLastNotificationResponseAsync as jest.Mock;

beforeEach(() => {
  mockPush.mockReset();
  mockLinkingAddEventListener.mockClear();
  addResponseListener.mockClear();
  getLastResponse.mockReset();
  getLastResponse.mockResolvedValue(null);
  __resetHandledNotificationResponses();
});

describe('routeFromDeepLink allowlist', () => {
  it.each([
    ['tditinsurance://', '/(security-app)'],
    ['tditinsurance://security', '/(security-app)'],
    ['tditinsurance://profile', '/(security-app)/profile'],
  ])('routes %s', (link, expected) => {
    expect(routeFromDeepLink(link)).toBe(expected);
  });

  it('routes a partner case alert with a validated, typed caseId param', () => {
    expect(routeFromDeepLink(`tditinsurance://security/cases/${CASE_ID}`)).toEqual({
      pathname: '/(security-app)/cases/[caseId]',
      params: { caseId: CASE_ID },
    });
  });

  it.each([
    'tditinsurance://reset-password?token_hash=secret-hash&type=recovery&email=a%40b.co',
    'tditinsurance://verify-email?token_hash=secret-hash&type=signup&email=a%40b.co',
    'tditinsurance://invitations/accept?token=secret-invite',
    'tditinsurance://login?code=oauth-code',
    'tditinsurance://auth/callback?code=oauth-code',
    'tditinsurance://callback#access_token=secret',
    'TDITINSURANCE://reset-password?token_hash=secret-hash',
  ])('ignores auth / callback path %s', (link) => {
    expect(routeFromDeepLink(link)).toBeNull();
  });

  it.each([
    'tditinsurance://admin',
    'tditinsurance://claims/new',
    'tditinsurance://security/cases',
    'tditinsurance://security/cases/not-an-object-id',
    `tditinsurance://security/cases/${CASE_ID}/extra`,
    'tditinsurance://security/cases/..%2F..%2Fprofile',
    'tditinsurance://security//cases',
    // Customer-shell links are not routes in the security-operator shell.
    'tditinsurance://assets/abc',
    'tditinsurance://live-tracking/abc',
    'https://evil.example/security',
    'otherapp://security',
    '',
  ])('ignores unknown or malformed link %s', (link) => {
    expect(routeFromDeepLink(link)).toBeNull();
  });

  it.each([undefined, null, 42, { path: 'security' }])('ignores non-string payload %p', (value) => {
    expect(routeFromDeepLink(value)).toBeNull();
  });

  it('drops the query string and fragment instead of passing them through', () => {
    expect(routeFromDeepLink('tditinsurance://profile?next=/admin&token=x#frag')).toBe(
      '/(security-app)/profile',
    );
    const caseRoute = routeFromDeepLink(
      `tditinsurance://security/cases/${CASE_ID}?caseId=other&token_hash=secret`,
    );
    expect(caseRoute).toEqual({
      pathname: '/(security-app)/cases/[caseId]',
      params: { caseId: CASE_ID },
    });
    expect(JSON.stringify(caseRoute)).not.toContain('secret');
  });
});

describe('useNotificationDeepLinks', () => {
  it('does not subscribe to raw Linking url events', async () => {
    await render(<Harness />);
    expect(mockLinkingAddEventListener).not.toHaveBeenCalled();
  });

  it('navigates when an allowed notification is tapped', async () => {
    await render(<Harness />);
    const onResponse = addResponseListener.mock.calls[0][0] as (r: unknown) => void;
    onResponse(response(`tditinsurance://security/cases/${CASE_ID}`));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(security-app)/cases/[caseId]',
      params: { caseId: CASE_ID },
    });
  });

  it('does not navigate for an auth-path or unknown payload', async () => {
    await render(<Harness />);
    const onResponse = addResponseListener.mock.calls[0][0] as (r: unknown) => void;
    onResponse(response('tditinsurance://reset-password?token_hash=secret', 'n-a'));
    onResponse(response('tditinsurance://somewhere/else', 'n-b'));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('routes the cold-start notification once, not on every remount', async () => {
    getLastResponse.mockResolvedValue(response('tditinsurance://profile', 'cold-1'));
    const first = await render(<Harness />);
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/(security-app)/profile'));
    await first.unmount();
    await render(<Harness />);
    await waitFor(() => expect(getLastResponse).toHaveBeenCalledTimes(2));
    expect(mockPush).toHaveBeenCalledTimes(1);
  });
});
