/**
 * Backend entrypoint.
 *
 * Stage 9 (Development): Feature 001's auth business logic is now mounted
 * under `/api/v1` — signup/login/logout, session refresh/revoke, MFA
 * enroll/verify/challenge, password reset, invitations. See
 * backend/README.md's "What's here" / "What's NOT here yet" sections for
 * exactly what shipped in this pass vs. what remains open (SR items still
 * outstanding, e.g. SR-5/SR-22/SR-23/SR-24/SR-25 are infra/process/go-live
 * gates, not application code).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');
dotenv.config({ path: path.join(repoRoot, '.env') });
dotenv.config({ path: path.join(repoRoot, '.env.local'), override: true });

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';

import { loadEnv } from './config/env.js';
import { connectMongo, closeMongo, getDb } from './db/mongodb.js';
import { ensurePolicyAssetCollections } from './db/mongo-bootstrap.js';
import { verifyMongoCatalog, formatCatalogReport } from './db/catalog-verify.js';
import { closePg } from './db/pg.js';
import { getKeyValueStore, closeKeyValueStore, rebuildRevocationSet } from './db/redis.js';
import { getPgPool } from './db/pg.js';
import { buildAppContext } from './context.js';
import { createHealthRouter } from './routes/health.js';
import { createAuthRouter } from './routes/auth.js';
import { createSessionRouter } from './routes/session.js';
import { createMfaRouter } from './routes/mfa.js';
import { createInvitationsRouter } from './routes/invitations.js';
import { createAdminAccountsRouter } from './routes/admin-accounts.js';
import { createAdminPoliciesRouter } from './routes/admin-policies.js';
import { createAdminAssetsRouter } from './routes/admin-assets.js';
import { createAdminPlansRouter } from './routes/admin-plans.js';
import { createPlansRouter } from './routes/plans.js';
import { createPoliciesRouter } from './routes/policies.js';
import { createAssetsRouter } from './routes/assets.js';
import { createRecoveryRouter } from './routes/recovery.js';
import { createSecurityCasesRouter } from './routes/security-cases.js';
import { createInternalRouter } from './routes/internal.js';
import { createNotificationsRouter } from './routes/notifications.js';
import { createCustomerProfileRouter } from './routes/customer-profile.js';
import { createTrackingDevicesRouter } from './routes/tracking-devices.js';
import { createAlertsRouter } from './routes/alerts.js';
import { createAdminVerificationRouter } from './routes/admin-verification.js';
import { requestIdMiddleware, notFoundHandler, errorHandler } from './middleware/error-handler.js';

async function main(): Promise<void> {
  const env = loadEnv();

  await connectMongo(env.mongodbUri);
  // eslint-disable-next-line no-console
  console.log('[startup] Connected to MongoDB.');
  await ensurePolicyAssetCollections(getDb());
  // eslint-disable-next-line no-console
  console.log('[startup] Policy/asset MongoDB collections and indexes ensured.');

  // ADR-0008 condition 3 / ADR-0006 FU-A10 class of control: read-only
  // assertion that the live Atlas catalog actually matches what the seven
  // collection-spec modules declare, immediately after bootstrap applies
  // them. Never fatal — a drift finding must be visible in Render's logs,
  // not take the API down (bootstrap having just run above already makes an
  // undetected drift unlikely, but this is the check that turns "applied"
  // into "verified" rather than assuming it).
  try {
    const catalogReport = await verifyMongoCatalog(getDb());
    // eslint-disable-next-line no-console
    console.log(formatCatalogReport(catalogReport));
    if (!catalogReport.ok) {
      // eslint-disable-next-line no-console
      console.error(
        `[startup] MongoDB catalog verification FAILED with ${catalogReport.drift.length} drift finding(s) — see [mongo-catalog-verify] lines above.`,
      );
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      '[startup] MongoDB catalog verification could not run:',
      err instanceof Error ? err.message : err,
    );
  }

  const ctx = buildAppContext(env);

  // SR-16(a): rebuild the revocation set from the durable app.sessions
  // record before serving any traffic, so a fresh/failed-over Redis never
  // silently treats a durably-revoked session as valid.
  try {
    const rebuilt = await rebuildRevocationSet(getPgPool(env), getKeyValueStore(env));
    // eslint-disable-next-line no-console
    console.log(`[startup] Revocation set rebuilt from app.sessions: ${rebuilt} entr${rebuilt === 1 ? 'y' : 'ies'}.`);
  } catch (err) {
    // A Postgres/Supabase connection isn't guaranteed to exist yet in every
    // environment this scaffold runs in (no live project is provisioned per
    // this feature's paper-design status) — log loudly rather than crash
    // startup, since MongoDB (already required) remains fully functional.
    // eslint-disable-next-line no-console
    console.error('[startup] Could not rebuild revocation set from app.sessions (Postgres/Supabase unavailable):', err instanceof Error ? err.message : err);
  }

  const app = express();

  // SR-7: trust exactly Render's one reverse-proxy hop so req.ip reflects
  // the real client, not the proxy — load-bearing for every per-IP rate
  // limit and for account_audit_log.ip_address's forensic value.
  app.set('trust proxy', env.trustProxyHops);

  app.use(helmet());
  app.use(
    cors({
      origin: env.corsAllowedOrigins.length > 0 ? env.corsAllowedOrigins : false,
      credentials: true,
    }),
  );
  // SR-21: explicit limit, not the silent 100kb default.
  app.use(express.json({ limit: '100kb' }));
  app.use(requestIdMiddleware);

  app.use('/api', createHealthRouter(env));

  const v1 = express.Router();
  v1.use(createAuthRouter(ctx));
  v1.use(createSessionRouter(ctx));
  v1.use(createMfaRouter(ctx));
  v1.use(createInvitationsRouter(ctx));
  v1.use(createAdminAccountsRouter(ctx));
  v1.use(createAdminPoliciesRouter(ctx));
  v1.use(createAdminAssetsRouter(ctx));
  v1.use(createAdminPlansRouter(ctx));
  v1.use(createPlansRouter(ctx));
  v1.use(createPoliciesRouter(ctx));
  v1.use(createAssetsRouter(ctx));
  v1.use(createRecoveryRouter(ctx));
  v1.use(createSecurityCasesRouter(ctx));
  v1.use(createInternalRouter(ctx));
  v1.use(createNotificationsRouter(ctx));
  v1.use(createCustomerProfileRouter(ctx));
  v1.use(createTrackingDevicesRouter(ctx));
  v1.use(createAlertsRouter(ctx));
  v1.use(createAdminVerificationRouter(ctx));
  // api-design.md §5's platform-wide default rate-limit row
  // (`DEFAULT_AUTHENTICATED_LIMIT`, lib/policy.ts) is NOT wired as a
  // blanket middleware here — deliberately, not by omission: every route
  // mounted above already terminates the request/response cycle with its
  // own, more specific limiter, so a middleware placed after them would be
  // structurally unreachable for any currently-defined endpoint. This
  // constant is real and ready; whoever adds the next authenticated
  // GET-style endpoint without an endpoint-specific limit named in
  // api-design.md §5 should apply `createRateLimiter(ctx.kv,
  // DEFAULT_AUTHENTICATED_LIMIT, ...)` directly on that route, not rely on
  // a blanket catch-all that cannot fire on this router topology.
  app.use('/api/v1', v1);

  app.use(notFoundHandler);
  app.use(errorHandler);

  const server = app.listen(env.port, '0.0.0.0', () => {
    // eslint-disable-next-line no-console
    console.log(`[startup] Backend listening on 0.0.0.0:${env.port} (env=${env.nodeEnv}).`);
  });

  async function shutdown(signal: string): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(`[shutdown] Received ${signal}, shutting down gracefully...`);
    server.close(async (err) => {
      if (err) {
        // eslint-disable-next-line no-console
        console.error('[shutdown] Error closing HTTP server:', err);
      }
      await closeMongo();
      await closePg();
      await closeKeyValueStore();
      // eslint-disable-next-line no-console
      console.log('[shutdown] Connections closed. Exiting.');
      process.exit(err ? 1 : 0);
    });
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[startup] Fatal error during startup:', err);
  process.exit(1);
});
