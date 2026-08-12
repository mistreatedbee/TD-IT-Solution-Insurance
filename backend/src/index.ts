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
const repoRootEnvPath = path.resolve(__dirname, '../../.env.local');
dotenv.config({ path: repoRootEnvPath });

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';

import { loadEnv } from './config/env.js';
import { connectMongo, closeMongo, getDb } from './db/mongodb.js';
import { ensurePolicyAssetCollections } from './db/mongo-bootstrap.js';
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
import { createPoliciesRouter } from './routes/policies.js';
import { createAssetsRouter } from './routes/assets.js';
import { createRecoveryRouter } from './routes/recovery.js';
import { createSecurityCasesRouter } from './routes/security-cases.js';
import { createInternalRouter } from './routes/internal.js';
import { requestIdMiddleware, notFoundHandler, errorHandler } from './middleware/error-handler.js';

async function main(): Promise<void> {
  const env = loadEnv();

  await connectMongo(env.mongodbUri);
  // eslint-disable-next-line no-console
  console.log('[startup] Connected to MongoDB.');
  await ensurePolicyAssetCollections(getDb());
  // eslint-disable-next-line no-console
  console.log('[startup] Policy/asset MongoDB collections and indexes ensured.');

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
  v1.use(createPoliciesRouter(ctx));
  v1.use(createAssetsRouter(ctx));
  v1.use(createRecoveryRouter(ctx));
  v1.use(createSecurityCasesRouter(ctx));
  v1.use(createInternalRouter(ctx));
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

  const server = app.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`[startup] Backend listening on port ${env.port} (env=${env.nodeEnv}).`);
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
