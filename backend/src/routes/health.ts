/**
 * Health-check routes. Mounted under /api in index.ts, so these resolve as
 * GET /api/health and GET /api/health/ready — kept relative here (not
 * hardcoded with the prefix) so the mount point stays index.ts's decision.
 *
 * GET /health        — liveness. No dependency checks. Confirms the process
 *                       is up and able to handle HTTP requests at all.
 * GET /health/ready   — readiness. Pings MongoDB and Postgres. SR-20:
 *                       the PUBLIC response is deliberately minimal (status
 *                       code + `status` only) — no dependency breakdown,
 *                       which security-review.md flagged as a minor
 *                       information disclosure and a free unauthenticated
 *                       liveness oracle. The full per-dependency breakdown
 *                       is served only from `/api/internal/health`, gated
 *                       behind the same internal-service credential as
 *                       every other internal-only surface (SR-13's
 *                       pattern, reused rather than inventing a second one).
 *
 * GET /internal/health also carries `mongoCatalog` — ADR-0008 condition 3's
 * on-demand read of the same catalog-verify.ts check that also runs at
 * startup (see index.ts). Summary only (pass/fail + drift count); full
 * per-collection detail is the [mongo-catalog-verify] startup log block,
 * not re-exposed here even behind auth, to keep this endpoint cheap and
 * avoid a second place index/validator internals can leak from.
 */
import { Router } from 'express';
import { pingMongo, getDb } from '../db/mongodb.js';
import { pingPg } from '../db/pg.js';
import { getSupabaseConfigStatus } from '../db/supabase.js';
import { verifyMongoCatalog } from '../db/catalog-verify.js';
import type { Env } from '../config/env.js';
import { createInternalServiceAuthMiddleware } from '../middleware/internal-service-auth.js';

export function createHealthRouter(env: Env): Router {
  const healthRouter = Router();
  const internalAuth = createInternalServiceAuthMiddleware(env);

  healthRouter.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  healthRouter.get('/health/ready', async (_req, res) => {
    const mongoUp = await pingMongo();
    const ready = mongoUp; // Postgres/Supabase configuration detail is not part of the PUBLIC gate.
    res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready' });
  });

  healthRouter.get('/internal/health', internalAuth, async (_req, res) => {
    const [mongoUp, pgUp] = await Promise.all([pingMongo(), pingPg()]);
    const supabase = getSupabaseConfigStatus(env);

    let mongoCatalog: { status: 'verified' | 'drift' | 'unavailable'; driftCount?: number } = {
      status: 'unavailable',
    };
    if (mongoUp) {
      try {
        const report = await verifyMongoCatalog(getDb());
        mongoCatalog = { status: report.ok ? 'verified' : 'drift', driftCount: report.drift.length };
      } catch {
        mongoCatalog = { status: 'unavailable' };
      }
    }

    res.status(200).json({
      mongodb: mongoUp ? 'up' : 'down',
      mongoCatalog,
      postgres: pgUp ? 'up' : 'down',
      supabase: supabase.configured ? 'configured' : 'not_configured',
      redis: env.redisUrl ? 'configured' : 'not_configured (dev in-memory fallback)',
    });
  });

  return healthRouter;
}
