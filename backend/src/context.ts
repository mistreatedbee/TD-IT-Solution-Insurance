/**
 * Wires together every dependency Feature 001's routes need: the Postgres
 * pool (db/pg.ts), the KV store (db/redis.ts), the Supabase mediation layer
 * (db/supabase.ts), and one instance of each repository. Built once at
 * startup and threaded through route factories — nothing here is a global
 * singleton import inside a route file, so tests can construct an
 * equivalent context against fakes instead.
 */
import type { Pool } from 'pg';
import type { Env } from './config/env.js';
import { getPgPool } from './db/pg.js';
import { getKeyValueStore, type KeyValueStore } from './db/redis.js';
import { getSupabaseAdmin, type SupabaseAdmin } from './db/supabase.js';
import { createAccountsRepo, type AccountsRepo } from './repositories/accounts.js';
import { createInvitationsRepo, type InvitationsRepo } from './repositories/invitations.js';
import { createSessionRepo } from './repositories/sessions.js';
import type { SessionRepo } from './lib/refresh-session.js';
import { createEnrollmentTicketRepo } from './repositories/enrollment-tickets.js';
import type { EnrollmentTicketRepo } from './lib/enrollment-ticket.js';
import { createResetMfaVerificationTokenRepo } from './repositories/reset-mfa-tokens.js';
import type { ResetMfaVerificationTokenRepo } from './lib/reset-mfa-verification.js';
import { createAuditLogRepo, type AuditLogRepo } from './repositories/audit-log.js';
import { createIdempotencyRepo, type IdempotencyRepo } from './repositories/idempotency.js';
import { getDb } from './db/mongodb.js';
import { createPoliciesRepo, type PoliciesRepo } from './repositories/policies.js';
import { createAssetsRepo, type AssetsRepo } from './repositories/assets.js';
import {
  createPolicyStatusHistoryRepo,
  type PolicyStatusHistoryRepo,
} from './repositories/policy-status-history.js';
import { createAdminAccessLogRepo, type AdminAccessLogRepo } from './repositories/admin-access-log.js';
import { createRecoveryCasesRepo, type RecoveryCasesRepo } from './repositories/recovery-cases.js';
import { createPlanCatalogRepo, type PlanCatalogRepo } from './repositories/plan-catalog.js';

export interface AppContext {
  env: Env;
  pool: Pool;
  kv: KeyValueStore;
  supabase: SupabaseAdmin;
  accounts: AccountsRepo;
  invitations: InvitationsRepo;
  sessions: SessionRepo;
  enrollmentTickets: EnrollmentTicketRepo;
  resetMfaTokens: ResetMfaVerificationTokenRepo;
  auditLog: AuditLogRepo;
  idempotency: IdempotencyRepo;
  policies: PoliciesRepo;
  assets: AssetsRepo;
  policyStatusHistory: PolicyStatusHistoryRepo;
  adminAccessLog: AdminAccessLogRepo;
  recoveryCases: RecoveryCasesRepo;
  planCatalog: PlanCatalogRepo;
}

export function buildAppContext(env: Env): AppContext {
  const pool = getPgPool(env);
  const kv = getKeyValueStore(env);
  const supabase = getSupabaseAdmin(env);
  return {
    env,
    pool,
    kv,
    supabase,
    accounts: createAccountsRepo(pool),
    invitations: createInvitationsRepo(pool),
    sessions: createSessionRepo(pool),
    enrollmentTickets: createEnrollmentTicketRepo(pool),
    resetMfaTokens: createResetMfaVerificationTokenRepo(pool),
    auditLog: createAuditLogRepo(pool),
    idempotency: createIdempotencyRepo(pool),
    policies: createPoliciesRepo(getDb()),
    assets: createAssetsRepo(getDb()),
    policyStatusHistory: createPolicyStatusHistoryRepo(getDb()),
    adminAccessLog: createAdminAccessLogRepo(getDb()),
    recoveryCases: createRecoveryCasesRepo(getDb()),
    planCatalog: createPlanCatalogRepo(getDb()),
  };
}
