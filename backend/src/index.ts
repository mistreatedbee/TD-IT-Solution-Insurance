/**
 * Backend entrypoint.
 *
 * INFRASTRUCTURE SCAFFOLDING ONLY. This process boots an Express app with
 * health checks and MongoDB connectivity wiring. It deliberately does NOT
 * implement Feature 001's auth business logic (signup/login/MFA endpoints)
 * — see backend/README.md's "What's NOT here yet" section and
 * docs/features/001-authentication/architecture/backend-approach.md.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

// Load env from the repo-root .env.local (not a backend-local .env) —
// the credentials already live there. Resolve relative to this file so it
// works regardless of process.cwd() at startup.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRootEnvPath = path.resolve(__dirname, '../../.env.local');
dotenv.config({ path: repoRootEnvPath });

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';

import { loadEnv } from './config/env.js';
import { connectMongo, closeMongo } from './db/mongodb.js';
import { healthRouter } from './routes/health.js';
import { requestIdMiddleware, notFoundHandler, errorHandler } from './middleware/error-handler.js';

async function main(): Promise<void> {
  const env = loadEnv();

  await connectMongo(env.mongodbUri);
  // eslint-disable-next-line no-console
  console.log('[startup] Connected to MongoDB.');

  const app = express();

  app.use(helmet());
  // Explicit origin allowlist, not the permissive default — required once
  // frontend (Vercel) and backend (Render, per ADR-0003) are genuinely
  // cross-origin rather than same-origin. Fails closed: an empty allowlist
  // means no origin is permitted, not "allow all" (see config/env.ts).
  app.use(
    cors({
      origin: env.corsAllowedOrigins.length > 0 ? env.corsAllowedOrigins : false,
      credentials: true, // required once Feature 001's auth uses cookies/sessions
    }),
  );
  app.use(express.json());
  app.use(requestIdMiddleware);

  // Platform-wide prefix ratified as /api (see docs/organization/
  // 05-development-standards.md and the deployment-time resolution note in
  // docs/features/001-authentication/api-design.md §6) — mounted here so it
  // also matches the Vercel multi-service rewrite (/api/* -> this service,
  // everything else -> the frontend). Health checks live under it too
  // (/api/health, /api/health/ready), not at bare /health, so they're
  // actually reachable through that same rewrite rule.
  app.use('/api', healthRouter);

  // NOTE: No /api/v1/auth/*, /api/v1/session/*, /api/v1/mfa/* routes are
  // mounted here. Feature 001's business-logic endpoints await Stage 7
  // (API Design, done) sign-off carrying into Stage 8 (Security Review,
  // not yet done) and Stage 9 (Development) — see backend/README.md.

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
      // eslint-disable-next-line no-console
      console.log('[shutdown] MongoDB connection closed. Exiting.');
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
