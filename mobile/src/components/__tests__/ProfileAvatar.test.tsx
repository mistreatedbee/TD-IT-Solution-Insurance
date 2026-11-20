/**
 * Android bug: RN's Image.android.js forwards `headers` to the native view only when `source` is
 * an array, so a single `{ uri, headers }` object lost the Bearer token and the authenticated
 * GET /account/profile/picture returned 401 (blank avatar on the APK).
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { sessionStore } from '../../auth/session-store';
import { ProfileAvatar } from '../ProfileAvatar';

describe('ProfileAvatar', () => {
  beforeEach(() => {
    sessionStore.setState({ status: 'signed-in', accessToken: 'tok-123', sessionId: 's1' });
  });
  afterEach(() => {
    sessionStore.setState({ status: 'signed-out', accessToken: null, sessionId: null });
  });

  it('passes the picture as an array source so Android sends the Authorization header', async () => {
    await render(<ProfileAvatar initials="AB" profilePictureUrl="/account/profile/picture?v=1" />);
    const source = screen.getByTestId('profile-avatar-image').props.source;
    expect(Array.isArray(source)).toBe(true);
    expect(source[0].uri).toMatch(/\/api\/v1\/account\/profile\/picture\?v=1$/);
    expect(source[0].headers).toEqual({ Authorization: 'Bearer tok-123' });
  });

  it('falls back to initials when the picture fails to load', async () => {
    await render(<ProfileAvatar initials="AB" profilePictureUrl="/account/profile/picture?v=1" />);
    await fireEvent(screen.getByTestId('profile-avatar-image'), 'error');
    expect(screen.queryByTestId('profile-avatar-image')).toBeNull();
    expect(screen.getByText('AB')).toBeTruthy();
  });

  it('shows initials when there is no picture', async () => {
    await render(<ProfileAvatar initials="AB" profilePictureUrl={null} />);
    expect(screen.getByText('AB')).toBeTruthy();
  });
});
