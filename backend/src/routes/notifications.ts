/**
 * Feature 007 — push token registration and notification preferences (customer mobile).
 */
import { Router, type Request } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { requireActiveAccount } from '../lib/account-gate.js';
import { apiError } from '../lib/errors.js';
import { DEFAULT_AUTHENTICATED_LIMIT } from '../lib/policy.js';
import {
  serializeNotificationPreferences,
  type NotificationCategory,
  type NotificationChannel,
} from '../repositories/notification-preferences.js';
import { validateBody } from '../lib/validation.js';
import { createAuthenticateMiddleware } from '../middleware/authenticate.js';
import { createRateLimiter, clientIp } from '../middleware/rate-limit.js';
import { notifyInBackground } from '../lib/customer-notification-service.js';

const EXPO_PUSH_TOKEN_PATTERN = /^(ExponentPushToken\[[^\]]+\]|ExpoPushToken\[[^\]]+\])$/;

const registerPushTokenSchema = z.object({
  deviceId: z.string().min(1).max(64),
  expoPushToken: z.string().min(10).max(512).regex(EXPO_PUSH_TOKEN_PATTERN, {
    message: 'Invalid Expo push token format',
  }),
  platform: z.enum(['ios', 'android', 'unknown']).default('unknown'),
  appVersion: z.string().max(32).nullable().optional(),
});

const revokePushTokenSchema = z.object({
  deviceId: z.string().min(1).max(64),
});

const channelPreferenceSchema = z.object({
  push: z.boolean().optional(),
  email: z.boolean().optional(),
  sms: z.boolean().optional(),
});

const preferencesPatchSchema = z
  .object({
    theft_critical: channelPreferenceSchema.optional(),
    device_status: channelPreferenceSchema.optional(),
    billing: channelPreferenceSchema.optional(),
    account: channelPreferenceSchema.optional(),
    claims: channelPreferenceSchema.optional(),
    general: channelPreferenceSchema.optional(),
    marketing: channelPreferenceSchema.optional(),
  })
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
    message: 'At least one category must be provided',
  });

function requireCustomer(req: Request): void {
  if (req.auth?.userType !== 'customer') {
    throw apiError('FORBIDDEN');
  }
}

export function createNotificationsRouter(ctx: AppContext): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(ctx.env, ctx.kv);
  const rateLimit = createRateLimiter(
    ctx.kv,
    { attempts: DEFAULT_AUTHENTICATED_LIMIT.attempts, windowSeconds: DEFAULT_AUTHENTICATED_LIMIT.windowSeconds },
    (req) => `notifications:${req.auth!.accountId}`,
  );

  router.put(
    '/devices/push-token',
    authenticate,
    rateLimit,
    validateBody(registerPushTokenSchema),
    async (req, res, next) => {
      try {
        requireCustomer(req);
        const accountId = req.auth!.accountId;
        await requireActiveAccount(ctx.accounts, accountId);

        const body = req.body as z.infer<typeof registerPushTokenSchema>;

        // SR-007-2 (security-review.md §7.2): registering a push token must
        // be scoped to the session's bound device — mirrors the device-
        // binding check already enforced at /session/refresh
        // (lib/refresh-session.ts's `presentedDeviceId`/`session.deviceId`
        // comparison). FAIL CLOSED: a session with no bound device is
        // rejected outright rather than skipped, per the re-verification's
        // explicit ruling — "the registration request itself supplies a
        // device id, so there is no legitimate device-less caller" for this
        // route specifically. (`/session/refresh`'s own nullable handling is
        // NOT the right precedent to mirror here: there, a missing device id
        // is an optional extra signal on a rotation that already has other
        // protections; here it would otherwise let an attacker bypass this
        // check entirely just by omitting `deviceId` at login.)
        //
        // NOTE: this check alone does not stop token seizure — an attacker
        // can supply their OWN honestly-bound device id while registering a
        // STOLEN token string. The actual protection against that is the
        // deferred-takeover state machine in repositories/push-tokens.ts
        // (SR-007-2), engaged below regardless of whether this check passes.
        const session = await ctx.sessions.findById(req.auth!.sessionId);
        if (!session?.deviceId || session.deviceId !== body.deviceId) {
          throw apiError('DEVICE_MISMATCH');
        }

        const result = await ctx.pushTokens.register({
          accountId,
          deviceId: body.deviceId,
          expoPushToken: body.expoPushToken,
          platform: body.platform,
          appVersion: body.appVersion ?? null,
        });

        // SR-007-2: a collision on tokenHash across accounts is handled as a
        // deferred takeover (repositories/push-tokens.ts) — never an
        // unauthenticated inline demotion. `demotedAccountIds` is non-empty
        // only when a cooldown has just completed; `isNewTakeoverClaim` is
        // true only the first time this account+device contests a given
        // token, so a legitimate app re-registering on every foreground
        // during the cooldown does not re-alert or re-log the losing
        // account. No token material is ever logged (SR-007-6).
        if (result.isNewTakeoverClaim || result.demotedAccountIds.length > 0) {
          const eventType = result.demotedAccountIds.length > 0 ? 'takeover_completed' : 'takeover_pending';
          notifyInBackground(
            'push-token-takeover-security-log',
            ctx.pushTokenSecurityLog.record({
              eventType,
              claimingAccountId: accountId,
              claimingDeviceId: body.deviceId,
              contestedAccountIds: result.contestedAccountIds,
              actorSessionId: req.auth!.sessionId,
              ipAddress: clientIp(req),
              userAgent: req.header('user-agent') ?? null,
            }),
          );

          // Alert every losing account exactly once, at the moment their
          // token is first contested — not on every cooldown-refresh call,
          // and not again when the takeover later completes (they were
          // already told it would, in that first email).
          if (result.isNewTakeoverClaim) {
            for (const losingAccountId of result.contestedAccountIds) {
              notifyInBackground(
                'push-token-takeover-alert-email',
                ctx.authNotifications.notifyPushTokenReregisteredElsewhere({ accountId: losingAccountId }),
              );
            }
          }
        }

        const record = result.token;
        res.status(200).json({
          deviceId: record.deviceId,
          platform: record.platform,
          enabled: record.enabled,
          registeredAt: record.lastRegisteredAt.toISOString(),
          pendingTakeover: result.pendingTakeover,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  router.delete(
    '/devices/push-token',
    authenticate,
    rateLimit,
    validateBody(revokePushTokenSchema),
    async (req, res, next) => {
      try {
        requireCustomer(req);
        const accountId = req.auth!.accountId;
        const { deviceId } = req.body as z.infer<typeof revokePushTokenSchema>;
        await ctx.pushTokens.disableForDevice(accountId, deviceId);
        res.status(204).send();
      } catch (err) {
        next(err);
      }
    },
  );

  router.get('/notifications/preferences', authenticate, rateLimit, async (req, res, next) => {
    try {
      requireCustomer(req);
      const accountId = req.auth!.accountId;
      await requireActiveAccount(ctx.accounts, accountId);
      const prefs = await ctx.notificationPreferences.getOrCreate(accountId);
      res.json(serializeNotificationPreferences(prefs));
    } catch (err) {
      next(err);
    }
  });

  router.patch(
    '/notifications/preferences',
    authenticate,
    rateLimit,
    validateBody(preferencesPatchSchema),
    async (req, res, next) => {
      try {
        requireCustomer(req);
        const accountId = req.auth!.accountId;
        await requireActiveAccount(ctx.accounts, accountId);

        const patch = req.body as Partial<
          Record<NotificationCategory, Partial<Record<NotificationChannel, boolean>>>
        >;

        // theft_critical push cannot be disabled via self-service (product policy placeholder).
        if (patch.theft_critical?.push === false) {
          throw apiError('VALIDATION_ERROR');
        }

        const updated = await ctx.notificationPreferences.update(accountId, patch);
        res.json(serializeNotificationPreferences(updated));
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/notifications/test',
    authenticate,
    createRateLimiter(
      ctx.kv,
      { attempts: 3, windowSeconds: 60 * 60 },
      (req) => `notifications-test:${req.auth!.accountId}`,
    ),
    async (req, res, next) => {
      try {
        requireCustomer(req);
        const accountId = req.auth!.accountId;
        await requireActiveAccount(ctx.accounts, accountId);

        const result = await ctx.pushNotifications.sendToAccount({
          accountId,
          templateId: 'account.security.test',
        });

        const sent = result.tickets.filter((ticket) => ticket.status === 'ok').length;
        res.status(202).json({
          message: sent > 0 ? 'Test notification queued' : 'No push tokens registered for this account',
          sent,
          tickets: result.tickets.length,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
