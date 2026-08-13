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
import { createRateLimiter } from '../middleware/rate-limit.js';

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
        const record = await ctx.pushTokens.register({
          accountId,
          deviceId: body.deviceId,
          expoPushToken: body.expoPushToken,
          platform: body.platform,
          appVersion: body.appVersion ?? null,
        });

        res.status(200).json({
          deviceId: record.deviceId,
          platform: record.platform,
          enabled: record.enabled,
          registeredAt: record.lastRegisteredAt.toISOString(),
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
