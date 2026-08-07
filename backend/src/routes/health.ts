/**
 * Health-check routes.
 *
 * GET /health        — liveness. No dependency checks. Confirms the process
 *                       is up and able to handle HTTP requests at all.
 * GET /health/ready   — readiness. Pings MongoDB (the service's live
 *                       dependency). Reports whether Supabase is configured
 *                       without pinging it — no live Supabase credential
 *                       exists yet (see src/db/supabase.ts), so a ping
 *                       would only ever fail; reporting configured/not-configured
 *                       status is more honest than a fake check.
 */
import { Router } from 'express';
import { pingMongo } from '../db/mongodb.js';
import { getSupabaseConfigStatus } from '../db/supabase.js';

export const healthRouter = Router();

healthRouter.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

healthRouter.get('/health/ready', async (_req, res) => {
  const mongoUp = await pingMongo();
  const supabase = getSupabaseConfigStatus();

  const ready = mongoUp; // Supabase is not yet part of the readiness gate — not configured.

  res.status(ready ? 200 : 503).json({
    status: ready ? 'ready' : 'not_ready',
    dependencies: {
      mongodb: mongoUp ? 'up' : 'down',
      supabase: supabase.configured ? 'configured' : 'not_configured',
    },
  });
});
