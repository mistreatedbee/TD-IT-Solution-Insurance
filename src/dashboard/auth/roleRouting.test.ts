import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PRIVILEGED_DASHBOARD_CONFIG,
  isPrivilegedUserType,
  clearOtherRoleSessions,
} from './roleRouting';
import { CUSTOMER_REFRESH_STORAGE_KEY } from '../../customer/auth/sessionStorageKey';

const ADMIN_KEY = PRIVILEGED_DASHBOARD_CONFIG.admin.storageKey;
const SECURITY_KEY = PRIVILEGED_DASHBOARD_CONFIG.security_company_operator.storageKey;
const CALL_CENTRE_KEY = PRIVILEGED_DASHBOARD_CONFIG.support_agent.storageKey;

describe('isPrivilegedUserType', () => {
  it('accepts exactly the three privileged types', () => {
    expect(isPrivilegedUserType('admin')).toBe(true);
    expect(isPrivilegedUserType('security_company_operator')).toBe(true);
    expect(isPrivilegedUserType('support_agent')).toBe(true);
  });

  it('rejects customer and unknown/dangerous values, including prototype pollution attempts', () => {
    expect(isPrivilegedUserType('customer')).toBe(false);
    expect(isPrivilegedUserType('__proto__')).toBe(false);
    expect(isPrivilegedUserType('constructor')).toBe(false);
    expect(isPrivilegedUserType('toString')).toBe(false);
    expect(isPrivilegedUserType('nonsense')).toBe(false);
  });
});

describe('clearOtherRoleSessions (SR-LU-4)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ accessToken: 'stub-access-token' }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('clears every OTHER role slot but leaves the excepted (about-to-be-written) slot untouched', () => {
    localStorage.setItem(CUSTOMER_REFRESH_STORAGE_KEY, 'customer-refresh');
    sessionStorage.setItem(ADMIN_KEY, 'admin-refresh');
    sessionStorage.setItem(SECURITY_KEY, 'security-refresh');
    sessionStorage.setItem(CALL_CENTRE_KEY, 'call-centre-refresh');

    clearOtherRoleSessions(ADMIN_KEY);

    // The role about to be signed into is left alone by this call — the
    // caller writes its own new token immediately afterward.
    expect(sessionStorage.getItem(ADMIN_KEY)).toBe('admin-refresh');
    // Every other role's session is cleared locally, unconditionally.
    expect(localStorage.getItem(CUSTOMER_REFRESH_STORAGE_KEY)).toBeNull();
    expect(sessionStorage.getItem(SECURITY_KEY)).toBeNull();
    expect(sessionStorage.getItem(CALL_CENTRE_KEY)).toBeNull();
  });

  it('logging in as role A then role B leaves role A unresumeable: A cleared, B intact', () => {
    // Log in as admin first.
    clearOtherRoleSessions(ADMIN_KEY);
    sessionStorage.setItem(ADMIN_KEY, 'admin-refresh');

    // Now log in as a customer in the same browser tab, without logging out.
    clearOtherRoleSessions(CUSTOMER_REFRESH_STORAGE_KEY);
    localStorage.setItem(CUSTOMER_REFRESH_STORAGE_KEY, 'customer-refresh');

    // The prior admin session must not silently still be resumable.
    expect(sessionStorage.getItem(ADMIN_KEY)).toBeNull();
    // The new customer session is untouched by its own establishing call.
    expect(localStorage.getItem(CUSTOMER_REFRESH_STORAGE_KEY)).toBe('customer-refresh');
  });

  it('fires best-effort server-side revocation (refresh, then logout with the resulting access token) for every cleared session that held a token', async () => {
    sessionStorage.setItem(ADMIN_KEY, 'admin-refresh-token');

    clearOtherRoleSessions(null);
    // Revocation is fire-and-forget (not awaited by the caller) — flush microtasks.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const refreshCall = calls.find(([url]) => String(url).endsWith('/session/refresh'));
    expect(refreshCall).toBeTruthy();
    expect(JSON.parse(refreshCall![1].body)).toEqual({
      refreshToken: 'admin-refresh-token',
      deviceId: null,
    });

    const logoutCall = calls.find(([url]) => String(url).endsWith('/session/logout'));
    expect(logoutCall).toBeTruthy();
    expect(logoutCall![1].headers.Authorization).toBe('Bearer stub-access-token');
  });

  it('does not throw and still clears local state when the revocation network calls fail', () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    sessionStorage.setItem(ADMIN_KEY, 'admin-refresh-token');

    expect(() => clearOtherRoleSessions(null)).not.toThrow();
    expect(sessionStorage.getItem(ADMIN_KEY)).toBeNull();
  });

  it('clears nothing and makes no network call when no other role has a stored session', () => {
    clearOtherRoleSessions(ADMIN_KEY);
    expect(fetch).not.toHaveBeenCalled();
  });
});
