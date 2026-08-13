/**
 * New device login detection — Feature 007.
 */
import { describe, it, expect, vi } from 'vitest';
import { notifyNewDeviceLoginIfNeeded } from './auth-login-notifications.js';
import type { SessionRepo } from './refresh-session.js';

function fakeSessions(seenDevices: Set<string>): SessionRepo {
  return {
    async insertNew() {
      throw new Error('not used');
    },
    async findByRefreshTokenHash() {
      return null;
    },
    async findById() {
      return null;
    },
    async revokeAndReplace() {
      return undefined;
    },
    async revoke() {
      return undefined;
    },
    async revokeFamily() {
      return [];
    },
    async revokeAllForAccount() {
      return [];
    },
    async hasPriorSessionForDevice(accountId, deviceId) {
      return seenDevices.has(`${accountId}:${deviceId}`);
    },
  };
}

describe('auth-login-notifications', () => {
  it('notifies when device is first seen', async () => {
    const notify = vi.fn(async () => undefined);
    const sessions = fakeSessions(new Set());

    await notifyNewDeviceLoginIfNeeded(
      {
        sessions,
        authNotifications: { notifyNewDeviceLogin: notify } as never,
      },
      {
        accountId: 'acct-1',
        userType: 'customer',
        deviceId: 'device-a',
        deviceName: 'Test Phone',
        ipAddress: '10.0.0.1',
      },
    );

    expect(notify).toHaveBeenCalledOnce();
  });

  it('skips notification for known device', async () => {
    const notify = vi.fn(async () => undefined);
    const sessions = fakeSessions(new Set(['acct-1:device-a']));

    await notifyNewDeviceLoginIfNeeded(
      {
        sessions,
        authNotifications: { notifyNewDeviceLogin: notify } as never,
      },
      {
        accountId: 'acct-1',
        userType: 'customer',
        deviceId: 'device-a',
        deviceName: 'Test Phone',
        ipAddress: '10.0.0.1',
      },
    );

    expect(notify).not.toHaveBeenCalled();
  });
});
