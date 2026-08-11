import { useSessionStore } from '../session-store';

describe('auth/session-store', () => {
  beforeEach(() => {
    useSessionStore.setState({
      status: 'hydrating',
      accessToken: null,
      sessionId: null,
      account: null,
    });
  });

  it('starts hydrating with no token', () => {
    const state = useSessionStore.getState();
    expect(state.status).toBe('hydrating');
    expect(state.accessToken).toBeNull();
  });

  it('setSignedIn stores the access token in memory and flips status', () => {
    useSessionStore.getState().setSignedIn({ accessToken: 'tok', sessionId: 'sess' });
    const state = useSessionStore.getState();
    expect(state.status).toBe('signed-in');
    expect(state.accessToken).toBe('tok');
    expect(state.sessionId).toBe('sess');
  });

  it('setSignedOut clears the access token and account cache', () => {
    useSessionStore.getState().setSignedIn({ accessToken: 'tok', sessionId: 'sess' });
    useSessionStore.getState().setAccount({
      id: '1',
      email: 'a@b.com',
      userType: 'customer',
      accountState: 'active',
      mfaRequired: false,
      mfaEnrolled: false,
      partnerOrganizationId: null,
      createdAt: new Date().toISOString(),
    });

    useSessionStore.getState().setSignedOut();

    const state = useSessionStore.getState();
    expect(state.status).toBe('signed-out');
    expect(state.accessToken).toBeNull();
    expect(state.account).toBeNull();
  });
});
