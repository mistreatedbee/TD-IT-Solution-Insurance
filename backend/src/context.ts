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
import { createPushTokensRepo, type PushTokensRepo } from './repositories/push-tokens.js';
import {
  createPushTokenSecurityLogRepo,
  type PushTokenSecurityLogRepo,
} from './repositories/push-token-security-log.js';
import {
  createNotificationPreferencesRepo,
  type NotificationPreferencesRepo,
} from './repositories/notification-preferences.js';
import {
  createPushNotificationService,
  type PushNotificationService,
} from './lib/push-notification-service.js';
import {
  createCustomerNotificationService,
  type CustomerNotificationService,
} from './lib/customer-notification-service.js';
import {
  createAuthNotificationService,
  type AuthNotificationService,
} from './lib/auth-notification-service.js';
import {
  createNotificationDeliveryStateRepo,
  type NotificationDeliveryStateRepo,
} from './repositories/notification-delivery-state.js';
import {
  createOnboardingNotificationService,
  type OnboardingNotificationService,
} from './lib/onboarding-notification-service.js';
import {
  createPolicyNotificationService,
  type PolicyNotificationService,
} from './lib/policy-notification-service.js';
import {
  createPolicyActivationService,
  type PolicyActivationService,
} from './lib/policy-activation-service.js';
import {
  createRecoveryNotificationService,
  type RecoveryNotificationService,
} from './lib/recovery-notification-service.js';
import {
  createCustomerProfilesRepo,
  type CustomerProfilesRepo,
} from './repositories/customer-profiles.js';
import {
  createTrackingDevicesRepo,
  type TrackingDevicesRepo,
} from './repositories/tracking-devices.js';
import {
  createLocationEventsRepo,
  type LocationEventsRepo,
} from './repositories/location-events.js';
import { createAlertsRepo, type AlertsRepo } from './repositories/alerts.js';
import { createProductEventsRepo, type ProductEventsRepo } from './repositories/product-events.js';
import { createSupportCasesRepo, type SupportCasesRepo } from './repositories/support-cases.js';

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
  pushTokens: PushTokensRepo;
  pushTokenSecurityLog: PushTokenSecurityLogRepo;
  notificationPreferences: NotificationPreferencesRepo;
  pushNotifications: PushNotificationService;
  customerNotifications: CustomerNotificationService;
  authNotifications: AuthNotificationService;
  notificationDeliveryState: NotificationDeliveryStateRepo;
  onboardingNotifications: OnboardingNotificationService;
  policyNotifications: PolicyNotificationService;
  policyActivation: PolicyActivationService;
  recoveryNotifications: RecoveryNotificationService;
  customerProfiles: CustomerProfilesRepo;
  trackingDevices: TrackingDevicesRepo;
  locationEvents: LocationEventsRepo;
  alerts: AlertsRepo;
  productEvents: ProductEventsRepo;
  supportCases: SupportCasesRepo;
}

export function buildAppContext(env: Env): AppContext {
  const pool = getPgPool(env);
  const kv = getKeyValueStore(env);
  const supabase = getSupabaseAdmin(env);
  const pushTokens = createPushTokensRepo(getDb());
  const pushTokenSecurityLog = createPushTokenSecurityLogRepo(getDb());
  const notificationPreferences = createNotificationPreferencesRepo(getDb());
  const notificationDeliveryState = createNotificationDeliveryStateRepo(getDb());
  const pushNotifications = createPushNotificationService({
    env,
    pushTokens,
    notificationPreferences,
  });
  const accounts = createAccountsRepo(pool);
  const policies = createPoliciesRepo(getDb());
  const policyStatusHistory = createPolicyStatusHistoryRepo(getDb());
  const policyNotifications = createPolicyNotificationService({
    env,
    accounts,
    notificationPreferences,
    deliveryState: notificationDeliveryState,
    pushNotifications,
  });
  const onboardingNotifications = createOnboardingNotificationService({
    env,
    accounts,
    notificationPreferences,
    deliveryState: notificationDeliveryState,
    pushNotifications,
  });
  const policyActivation = createPolicyActivationService({
    policies,
    policyStatusHistory,
    policyNotifications,
  });
  const recoveryNotifications = createRecoveryNotificationService({
    env,
    accounts,
    notificationPreferences,
    pushNotifications,
  });
  return {
    env,
    pool,
    kv,
    supabase,
    accounts,
    invitations: createInvitationsRepo(pool),
    sessions: createSessionRepo(pool),
    enrollmentTickets: createEnrollmentTicketRepo(pool),
    resetMfaTokens: createResetMfaVerificationTokenRepo(pool),
    auditLog: createAuditLogRepo(pool),
    idempotency: createIdempotencyRepo(pool),
    policies,
    assets: createAssetsRepo(getDb()),
    policyStatusHistory,
    adminAccessLog: createAdminAccessLogRepo(getDb()),
    recoveryCases: createRecoveryCasesRepo(getDb()),
    planCatalog: createPlanCatalogRepo(getDb()),
    pushTokens,
    pushTokenSecurityLog,
    notificationPreferences,
    notificationDeliveryState,
    pushNotifications,
    customerNotifications: createCustomerNotificationService({
      env,
      accounts,
      notificationPreferences,
      pushNotifications,
    }),
    authNotifications: createAuthNotificationService({
      env,
      accounts,
      notificationPreferences,
      pushNotifications,
    }),
    onboardingNotifications,
    policyNotifications,
    policyActivation,
    recoveryNotifications,
    customerProfiles: createCustomerProfilesRepo(getDb()),
    trackingDevices: createTrackingDevicesRepo(getDb()),
    locationEvents: createLocationEventsRepo(getDb()),
    alerts: createAlertsRepo(getDb()),
    productEvents: createProductEventsRepo(getDb()),
    supportCases: createSupportCasesRepo(getDb()),
  };
}
