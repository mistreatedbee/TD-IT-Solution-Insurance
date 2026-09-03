/**
 * Deploy-time / on-demand assertion that the LIVE MongoDB Atlas catalog
 * matches what the seven collection-spec modules wired into
 * `mongo-bootstrap.ts` declare it should be.
 *
 * Provenance: ADR-0008 §"Consequences" item 1 — "Verification ... is not
 * built. Until that check exists, no document may describe Mongo
 * provisioning as *verified* — only as *applied* ... Owner: devops-engineer
 * with database-architect, riding FU-A10's mechanism rather than becoming a
 * second script (ADR-0006 §17.2)."
 *
 * IMPORTANT — doc-vs-code correction filed alongside this module: FU-A10
 * (ADR-0006 §16.6 / §17.2) is a *committed follow-up*, not an existing
 * mechanism. As of this change there is no deploy-time/CI assertion
 * anywhere in this repository for FU-A10's original target (the Postgres
 * AUD-11 runtime-credential grant check) to ride on. This module is
 * therefore the FIRST concrete implementation of that class of control —
 * built generically enough (declared-catalog diff, pass/fail report,
 * startup + on-demand invocation) that FU-A10's Postgres check can be added
 * as a sibling verifier under the same pattern later, rather than this
 * becoming "a second, separate script" once FU-A10 lands. Until FU-A10's
 * own Postgres check exists, AUD-11 remains "checked," not "enforced" —
 * unaffected by this module, which only covers the Mongo catalog.
 *
 * This module is READ-ONLY. It never creates/alters/drops a collection or
 * index — that remains `mongo-bootstrap.ts` / `bootstrap-mongo-collections.ts`.
 */
import type { Db, Document, IndexDescription } from 'mongodb';

import {
  FEATURE004_COLLECTIONS,
  FEATURE004_INDEXES,
  assetsJsonSchemaValidator,
  adminAccessLogJsonSchemaValidator,
} from './feature004-collections.js';
import { RECOVERY_COLLECTIONS, recoveryCaseIndexes, recoveryCasesJsonSchemaValidator } from './recovery-collections.js';
import {
  NOTIFICATION_COLLECTIONS,
  devicePushTokenIndexes,
  notificationPreferencesIndexes,
  notificationDeliveryStateIndexes,
  pushTokenSecurityEventIndexes,
  devicePushTokensJsonSchemaValidator,
  notificationPreferencesJsonSchemaValidator,
  notificationDeliveryStateJsonSchemaValidator,
  pushTokenSecurityEventJsonSchemaValidator,
} from './notification-collections.js';
import {
  CUSTOMER_PROFILES_COLLECTION,
  customerProfilesIndexes,
  customerProfilesJsonSchemaValidator,
} from './customer-profile-collections.js';
import {
  TRACKING_DEVICES_COLLECTION,
  trackingDevicesIndexes,
  trackingDevicesJsonSchemaValidator,
} from './tracking-device-collections.js';
import {
  LOCATION_EVENTS_COLLECTION,
  locationEventsIndexes,
  locationEventsJsonSchemaValidator,
} from './location-events-collections.js';
import {
  ALERTS_COLLECTION,
  customerAlertsIndexes,
  customerAlertsJsonSchemaValidator,
} from './alerts-collections.js';
import {
  PRODUCT_EVENTS_COLLECTION,
  productEventsIndexes,
  productEventsJsonSchemaValidator,
} from './product-events-collections.js';
import {
  SUPPORT_CASES_COLLECTION,
  supportCaseIndexes,
  supportCasesJsonSchemaValidator,
} from './support-case-collections.js';

/** One declared collection, as the source-of-truth modules describe it. */
interface DeclaredCollectionSpec {
  /** Which of the seven wired modules this collection belongs to — for report grouping. */
  module:
    | 'feature004'
    | 'recovery'
    | 'notification'
    | 'customer-profile'
    | 'tracking-device'
    | 'location-events'
    | 'alerts'
    | 'product-analytics'
    | 'support-cases';
  collection: string;
  /**
   * Validator this module applies via createCollection/collMod. `undefined`
   * for collections created without one (none currently) — presence is then
   * not asserted either way.
   */
  validator?: Document;
  indexes: IndexDescription[];
}

/** Mongo's default index name when a spec omits `name`: "<field>_<dir>_<field>_<dir>...". */
function defaultIndexName(key: IndexDescription['key']): string {
  return Object.entries(key)
    .map(([field, dir]) => `${field}_${String(dir)}`)
    .join('_');
}

function indexSpecName(spec: IndexDescription): string {
  return spec.name ?? defaultIndexName(spec.key);
}

const DECLARED_CATALOG: DeclaredCollectionSpec[] = [
  {
    module: 'feature004',
    collection: FEATURE004_COLLECTIONS.policies,
    indexes: FEATURE004_INDEXES.policies,
  },
  {
    module: 'feature004',
    collection: FEATURE004_COLLECTIONS.policyStatusHistory,
    indexes: FEATURE004_INDEXES.policyStatusHistory,
  },
  {
    module: 'feature004',
    collection: FEATURE004_COLLECTIONS.assets,
    validator: assetsJsonSchemaValidator,
    indexes: FEATURE004_INDEXES.assets,
  },
  {
    module: 'feature004',
    collection: FEATURE004_COLLECTIONS.adminAccessLog,
    validator: adminAccessLogJsonSchemaValidator,
    indexes: FEATURE004_INDEXES.adminAccessLog,
  },
  {
    module: 'recovery',
    collection: RECOVERY_COLLECTIONS.recoveryCases,
    validator: recoveryCasesJsonSchemaValidator,
    indexes: recoveryCaseIndexes,
  },
  {
    module: 'notification',
    collection: NOTIFICATION_COLLECTIONS.devicePushTokens,
    validator: devicePushTokensJsonSchemaValidator,
    indexes: devicePushTokenIndexes,
  },
  {
    module: 'notification',
    collection: NOTIFICATION_COLLECTIONS.notificationPreferences,
    validator: notificationPreferencesJsonSchemaValidator,
    indexes: notificationPreferencesIndexes,
  },
  {
    module: 'notification',
    collection: NOTIFICATION_COLLECTIONS.notificationDeliveryState,
    validator: notificationDeliveryStateJsonSchemaValidator,
    indexes: notificationDeliveryStateIndexes,
  },
  {
    module: 'notification',
    collection: NOTIFICATION_COLLECTIONS.pushTokenSecurityEvents,
    validator: pushTokenSecurityEventJsonSchemaValidator,
    indexes: pushTokenSecurityEventIndexes,
  },
  {
    module: 'customer-profile',
    collection: CUSTOMER_PROFILES_COLLECTION,
    validator: customerProfilesJsonSchemaValidator,
    indexes: customerProfilesIndexes,
  },
  {
    module: 'tracking-device',
    collection: TRACKING_DEVICES_COLLECTION,
    validator: trackingDevicesJsonSchemaValidator,
    indexes: trackingDevicesIndexes,
  },
  {
    module: 'location-events',
    collection: LOCATION_EVENTS_COLLECTION,
    validator: locationEventsJsonSchemaValidator,
    indexes: locationEventsIndexes,
  },
  {
    module: 'alerts',
    collection: ALERTS_COLLECTION,
    validator: customerAlertsJsonSchemaValidator,
    indexes: customerAlertsIndexes,
  },
  {
    module: 'product-analytics',
    collection: PRODUCT_EVENTS_COLLECTION,
    validator: productEventsJsonSchemaValidator,
    indexes: productEventsIndexes,
  },
  {
    module: 'support-cases',
    collection: SUPPORT_CASES_COLLECTION,
    validator: supportCasesJsonSchemaValidator,
    indexes: supportCaseIndexes,
  },
];

export type DriftKind =
  | 'missing_collection'
  | 'missing_index'
  | 'index_option_mismatch'
  | 'missing_validator'
  | 'validator_mismatch';

export interface DriftEntry {
  kind: DriftKind;
  module: DeclaredCollectionSpec['module'];
  collection: string;
  /** Index name, when the drift is index-scoped. */
  index?: string;
  detail: string;
}

export interface CollectionCheckResult {
  module: DeclaredCollectionSpec['module'];
  collection: string;
  exists: boolean;
  validatorDeclared: boolean;
  validatorMatches: boolean | null; // null when no validator declared
  indexesDeclared: number;
  indexesMatched: number;
  /** Live indexes present but not declared by the spec module — informational, not drift. */
  undeclaredLiveIndexes: string[];
}

export interface CatalogVerificationReport {
  checkedAt: string;
  ok: boolean;
  collections: CollectionCheckResult[];
  drift: DriftEntry[];
}

function indexOptionsMatch(
  declared: IndexDescription,
  live: { key: Record<string, number | string>; unique?: boolean; sparse?: boolean; partialFilterExpression?: Document },
): string[] {
  const mismatches: string[] = [];

  const declaredKey = JSON.stringify(declared.key);
  const liveKey = JSON.stringify(live.key);
  if (declaredKey !== liveKey) {
    mismatches.push(`key ${declaredKey} !== live ${liveKey}`);
  }

  const declaredUnique = declared.unique === true;
  const liveUnique = live.unique === true;
  if (declaredUnique !== liveUnique) {
    mismatches.push(`unique declared=${declaredUnique} live=${liveUnique}`);
  }

  const declaredSparse = declared.sparse === true;
  const liveSparse = live.sparse === true;
  if (declaredSparse !== liveSparse) {
    mismatches.push(`sparse declared=${declaredSparse} live=${liveSparse}`);
  }

  const declaredPartial = declared.partialFilterExpression
    ? JSON.stringify(declared.partialFilterExpression)
    : undefined;
  const livePartial = live.partialFilterExpression
    ? JSON.stringify(live.partialFilterExpression)
    : undefined;
  if (declaredPartial !== livePartial) {
    mismatches.push(`partialFilterExpression declared=${declaredPartial ?? '(none)'} live=${livePartial ?? '(none)'}`);
  }

  return mismatches;
}

/**
 * Read-only. Lists the live Atlas catalog (collections + their indexes +
 * validator options) and diffs it against `DECLARED_CATALOG`. Never
 * mutates the database.
 */
export async function verifyMongoCatalog(db: Db): Promise<CatalogVerificationReport> {
  const drift: DriftEntry[] = [];
  const collections: CollectionCheckResult[] = [];

  for (const spec of DECLARED_CATALOG) {
    const liveCollections = await db
      .listCollections({ name: spec.collection }, { nameOnly: false })
      .toArray();
    const exists = liveCollections.length > 0;

    if (!exists) {
      drift.push({
        kind: 'missing_collection',
        module: spec.module,
        collection: spec.collection,
        detail: `Declared in ${spec.module}-collections.ts but does not exist in the live database.`,
      });
      collections.push({
        module: spec.module,
        collection: spec.collection,
        exists: false,
        validatorDeclared: spec.validator !== undefined,
        validatorMatches: spec.validator !== undefined ? false : null,
        indexesDeclared: spec.indexes.length,
        indexesMatched: 0,
        undeclaredLiveIndexes: [],
      });
      continue;
    }

    // Validator check
    let validatorMatches: boolean | null = null;
    if (spec.validator !== undefined) {
      const liveValidator = liveCollections[0]?.options?.validator as Document | undefined;
      if (liveValidator === undefined) {
        validatorMatches = false;
        drift.push({
          kind: 'missing_validator',
          module: spec.module,
          collection: spec.collection,
          detail: 'Collection has no validator applied; a validator is declared.',
        });
      } else {
        const matches = JSON.stringify(liveValidator) === JSON.stringify(spec.validator);
        validatorMatches = matches;
        if (!matches) {
          drift.push({
            kind: 'validator_mismatch',
            module: spec.module,
            collection: spec.collection,
            detail: 'Live validator does not deep-equal the declared $jsonSchema/$and validator document.',
          });
        }
      }
    }

    // Index check
    const liveIndexes = await db.collection(spec.collection).indexes();
    const liveByName = new Map(liveIndexes.map((idx) => [idx.name as string, idx]));

    let indexesMatched = 0;
    const declaredNames = new Set<string>();
    for (const declaredIndex of spec.indexes) {
      const name = indexSpecName(declaredIndex);
      declaredNames.add(name);
      const live = liveByName.get(name);
      if (!live) {
        drift.push({
          kind: 'missing_index',
          module: spec.module,
          collection: spec.collection,
          index: name,
          detail: `Declared index "${name}" (key ${JSON.stringify(declaredIndex.key)}) not found on the live collection.`,
        });
        continue;
      }
      const mismatches = indexOptionsMatch(declaredIndex, live as unknown as {
        key: Record<string, number | string>;
        unique?: boolean;
        sparse?: boolean;
        partialFilterExpression?: Document;
      });
      if (mismatches.length > 0) {
        drift.push({
          kind: 'index_option_mismatch',
          module: spec.module,
          collection: spec.collection,
          index: name,
          detail: mismatches.join('; '),
        });
      } else {
        indexesMatched += 1;
      }
    }

    const undeclaredLiveIndexes = liveIndexes
      .map((idx) => idx.name as string)
      .filter((name) => name !== '_id_' && !declaredNames.has(name));

    collections.push({
      module: spec.module,
      collection: spec.collection,
      exists: true,
      validatorDeclared: spec.validator !== undefined,
      validatorMatches,
      indexesDeclared: spec.indexes.length,
      indexesMatched,
      undeclaredLiveIndexes,
    });
  }

  const ok = drift.length === 0;

  return {
    checkedAt: new Date().toISOString(),
    ok,
    collections,
    drift,
  };
}

/**
 * Formats a `CatalogVerificationReport` as a human-readable, greppable
 * block for stdout (Render logs) or CI output. Deliberately not JSON-only —
 * see mongo-bootstrap.ts's existing `[startup]` console.log convention.
 */
export function formatCatalogReport(report: CatalogVerificationReport): string {
  const lines: string[] = [];
  lines.push(`[mongo-catalog-verify] checkedAt=${report.checkedAt} result=${report.ok ? 'PASS' : 'FAIL'}`);
  lines.push(
    `[mongo-catalog-verify] ${report.collections.length} declared collections checked, ${report.drift.length} drift finding(s).`,
  );
  for (const c of report.collections) {
    const validatorNote = c.validatorDeclared
      ? ` validator=${c.validatorMatches ? 'match' : 'MISMATCH'}`
      : '';
    lines.push(
      `[mongo-catalog-verify]   ${c.module}/${c.collection}: exists=${c.exists} indexes=${c.indexesMatched}/${c.indexesDeclared}${validatorNote}` +
        (c.undeclaredLiveIndexes.length > 0
          ? ` undeclared-live-indexes=[${c.undeclaredLiveIndexes.join(', ')}]`
          : ''),
    );
  }
  if (report.drift.length > 0) {
    lines.push('[mongo-catalog-verify] DRIFT:');
    for (const d of report.drift) {
      lines.push(
        `[mongo-catalog-verify]   - [${d.kind}] ${d.module}/${d.collection}${d.index ? `.${d.index}` : ''}: ${d.detail}`,
      );
    }
  }
  return lines.join('\n');
}
