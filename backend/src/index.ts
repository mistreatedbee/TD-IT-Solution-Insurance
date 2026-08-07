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
  app.use(cors());
  app.use(express.json());
  app.use(requestIdMiddleware);

  app.use(healthRouter);

  // NOTE: No /v1/auth/*, /v1/session/*, /v1/mfa/* routes are mounted here.
  // Feature 001's business-logic endpoints await Stage 7 (API Design) and
  // Stage 8 (Security Review) sign-off — see backend/README.md.

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
