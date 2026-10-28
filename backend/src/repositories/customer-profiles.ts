import { ObjectId, type Collection, type Db } from 'mongodb';
import { CUSTOMER_PROFILES_COLLECTION } from '../db/customer-profile-collections.js';
import { mongoCursorFilter, type MongoDecodedCursor } from '../lib/mongo-pagination.js';
import type { AuditLogRepo } from './audit-log.js';

/**
 * DEFECT-001 §2 — identity-bearing field classification. An edit to any of
 * these while `verified` must drop status back to `in_progress`; an edit
 * while `pending_review` must be refused (409). `phone`, `emergencyContact`,
 * and `profilePictureUpdatedAt` are deliberately excluded (§2 rationale).
 */
const IDENTITY_BEARING_FIELDS = new Set<string>([
  'firstName',
  'middleName',
  'lastName',
  'dateOfBirth',
  'idNumberLast4',
  'residentialAddress',
]);

/**
 * DEFECT-001 §4.1 (b) — thrown when an identity-bearing edit is attempted
 * while the profile is `pending_review`. Routes map this to 409 CONFLICT.
 */
export class ProfileVerificationLockedError extends Error {
  constructor() {
    super('PROFILE_VERIFICATION_LOCKED');
    this.name = 'ProfileVerificationLockedError';
  }
}

export type VerificationStatus =
  | 'not_started'
  | 'in_progress'
  | 'pending_review'
  | 'verified'
  | 'rejected'
  | 'action_required';

export interface ResidentialAddress {
  line1: string;
  line2?: string | null;
  city: string;
  province: string;
  postalCode: string;
  country: string;
}

export interface EmergencyContact {
  name: string;
  relationship: string;
  phone: string;
}

export interface CustomerProfileDocument {
  id: string;
  accountId: string;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  dateOfBirth: Date | null;
  phone: string | null;
  idNumberLast4: string | null;
  residentialAddress: ResidentialAddress | null;
  emergencyContact: EmergencyContact | null;
  verificationStatus: VerificationStatus;
  verificationSubmittedAt: Date | null;
  verificationReviewedAt: Date | null;
  rejectionReasonCustomerSafe: string | null;
  profilePictureUpdatedAt: Date | null;
  /** DEFECT-001 §3 — monotonically increasing, starts at 0. Bumped on
   * resubmission (`submitVerification`) and on an identity-reset
   * (`updateForAccount`, verified -> in_progress). Missing on documents
   * created before this field existed, read back as 0 (§8.1, no backfill). */
  verificationRevision: number;
  createdAt: Date;
  updatedAt: Date;
}

interface CustomerProfileDbDoc {
  _id: ObjectId;
  accountId: string;
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
  dateOfBirth?: Date | null;
  phone?: string | null;
  idNumberLast4?: string | null;
  residentialAddress?: ResidentialAddress | null;
  emergencyContact?: EmergencyContact | null;
  verificationStatus: VerificationStatus;
  verificationSubmittedAt?: Date | null;
  verificationReviewedAt?: Date | null;
  rejectionReasonCustomerSafe?: string | null;
  profilePictureUpdatedAt?: Date | null;
  verificationRevision?: number;
  createdAt: Date;
  updatedAt: Date;
}

function toProfile(doc: CustomerProfileDbDoc): CustomerProfileDocument {
  return {
    id: doc._id.toHexString(),
    accountId: doc.accountId,
    firstName: doc.firstName ?? null,
    middleName: doc.middleName ?? null,
    lastName: doc.lastName ?? null,
    dateOfBirth: doc.dateOfBirth ?? null,
    phone: doc.phone ?? null,
    idNumberLast4: doc.idNumberLast4 ?? null,
    residentialAddress: doc.residentialAddress ?? null,
    emergencyContact: doc.emergencyContact ?? null,
    verificationStatus: doc.verificationStatus,
    verificationSubmittedAt: doc.verificationSubmittedAt ?? null,
    verificationReviewedAt: doc.verificationReviewedAt ?? null,
    rejectionReasonCustomerSafe: doc.rejectionReasonCustomerSafe ?? null,
    profilePictureUpdatedAt: doc.profilePictureUpdatedAt ?? null,
    verificationRevision: doc.verificationRevision ?? 0,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function deriveVerificationStatus(profile: CustomerProfileDocument): VerificationStatus {
  if (
    profile.verificationStatus === 'pending_review' ||
    profile.verificationStatus === 'verified' ||
    profile.verificationStatus === 'rejected' ||
    profile.verificationStatus === 'action_required'
  ) {
    return profile.verificationStatus;
  }

  const hasIdentityStart = Boolean(profile.idNumberLast4);
  const hasPersonal =
    Boolean(profile.firstName?.trim()) &&
    Boolean(profile.lastName?.trim()) &&
    Boolean(profile.phone?.trim());

  if (hasIdentityStart || hasPersonal) {
    return 'in_progress';
  }

  return 'not_started';
}

export interface CustomerProfilesRepo {
  findByAccountId(accountId: string): Promise<CustomerProfileDocument | null>;
  getOrCreateForAccount(accountId: string): Promise<CustomerProfileDocument>;
  updateForAccount(
    accountId: string,
    patch: Partial<
      Pick<
        CustomerProfileDocument,
        | 'firstName'
        | 'middleName'
        | 'lastName'
        | 'dateOfBirth'
        | 'phone'
        | 'idNumberLast4'
        | 'residentialAddress'
        | 'emergencyContact'
        | 'verificationStatus'
        | 'verificationSubmittedAt'
        | 'rejectionReasonCustomerSafe'
        | 'profilePictureUpdatedAt'
      >
    >,
  ): Promise<CustomerProfileDocument>;
  submitVerification(accountId: string): Promise<CustomerProfileDocument>;
  listByVerificationStatus(
    status: VerificationStatus,
    limit: number,
    cursor: MongoDecodedCursor | null,
  ): Promise<CustomerProfileDocument[]>;
  countByVerificationStatus(status: VerificationStatus): Promise<number>;
  reviewVerification(
    accountId: string,
    decision: 'verified' | 'rejected' | 'action_required',
    rejectionReasonCustomerSafe: string | null,
    expectedRevision: number,
  ): Promise<CustomerProfileDocument>;
}

export function createCustomerProfilesRepo(db: Db, auditLog: AuditLogRepo): CustomerProfilesRepo {
  const col: Collection<CustomerProfileDbDoc> = db.collection(CUSTOMER_PROFILES_COLLECTION);

  /** Mirrors the not_started/in_progress derive pass that already runs for
   * non-identity patches — safe to re-run after an identity-bearing patch
   * too, since it only ever moves between `not_started`/`in_progress` and
   * leaves pending_review/verified/rejected/action_required untouched. */
  async function applyDerivedStatus(
    accountId: string,
    profile: CustomerProfileDocument,
  ): Promise<CustomerProfileDocument> {
    const derived = deriveVerificationStatus(profile);
    if (
      derived !== profile.verificationStatus &&
      !['pending_review', 'verified', 'rejected', 'action_required'].includes(
        profile.verificationStatus,
      )
    ) {
      const updated = await col.findOneAndUpdate(
        { accountId },
        { $set: { verificationStatus: derived, updatedAt: new Date() } },
        { returnDocument: 'after' },
      );
      if (updated) return toProfile(updated);
    }
    return profile;
  }

  /**
   * DEFECT-001 §4.1 — identity-bearing edit path. Closes Defect 1
   * (verify-then-swap): locks the write while `pending_review` (b), and
   * forces `verified` back to `in_progress` with the revision bumped and
   * the stale review fields cleared (a). Retry-once CAS against the
   * `{accountId, verificationStatus: currentStatus}` filter closes the
   * TOCTOU this fix would otherwise reopen against a concurrent admin
   * decision.
   */
  async function identityUpdateForAccount(
    accountId: string,
    patch: Record<string, unknown>,
    now: Date,
  ): Promise<CustomerProfileDocument> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const current = await col.findOne({ accountId });
      const currentStatus: VerificationStatus = current?.verificationStatus ?? 'not_started';

      if (currentStatus === 'pending_review') {
        throw new ProfileVerificationLockedError();
      }

      const extraSet: Record<string, unknown> = {};
      const extraInc: Record<string, number> = {};
      let resetHappened = false;
      if (currentStatus === 'verified') {
        extraSet.verificationStatus = 'in_progress';
        extraSet.verificationReviewedAt = null;
        extraSet.rejectionReasonCustomerSafe = null;
        extraInc.verificationRevision = 1;
        resetHappened = true;
      }

      const setOnInsert: Record<string, unknown> = {
        accountId,
        verificationStatus: 'not_started',
        verificationSubmittedAt: null,
        verificationReviewedAt: null,
        rejectionReasonCustomerSafe: null,
        profilePictureUpdatedAt: null,
        verificationRevision: 0,
        createdAt: now,
      };
      for (const key of [...Object.keys(patch), ...Object.keys(extraSet)]) {
        delete setOnInsert[key];
      }

      const filter = current ? { accountId, verificationStatus: currentStatus } : { accountId };
      const update: Record<string, unknown> = { $set: { ...patch, ...extraSet, updatedAt: now } };
      if (Object.keys(extraInc).length > 0) update.$inc = extraInc;
      if (!current) update.$setOnInsert = setOnInsert;

      // eslint-disable-next-line no-await-in-loop
      const result = await col.findOneAndUpdate(filter, update, {
        upsert: !current,
        returnDocument: 'after',
      });

      if (!result) {
        // Lost the CAS race — status changed between read and write. Retry once.
        continue;
      }

      let profile = toProfile(result);

      if (resetHappened) {
        await auditLog.record({
          accountId,
          actorAccountId: accountId,
          eventType: 'customer_identity_reset',
        });
      }

      profile = await applyDerivedStatus(accountId, profile);
      return profile;
    }

    throw new Error('Profile update failed — concurrent verification state change');
  }

  return {
    async findByAccountId(accountId) {
      const doc = await col.findOne({ accountId });
      return doc ? toProfile(doc) : null;
    },

    async getOrCreateForAccount(accountId) {
      const existing = await col.findOne({ accountId });
      if (existing) return toProfile(existing);

      const now = new Date();
      const insertResult = await col.insertOne({
        accountId,
        firstName: null,
        middleName: null,
        lastName: null,
        dateOfBirth: null,
        phone: null,
        idNumberLast4: null,
        residentialAddress: null,
        emergencyContact: null,
        verificationStatus: 'not_started',
        verificationSubmittedAt: null,
        verificationReviewedAt: null,
        rejectionReasonCustomerSafe: null,
        profilePictureUpdatedAt: null,
        verificationRevision: 0,
        createdAt: now,
        updatedAt: now,
      } as CustomerProfileDbDoc);

      const created = await col.findOne({ _id: insertResult.insertedId });
      if (!created) throw new Error('Failed to create customer profile');
      return toProfile(created);
    },

    async updateForAccount(accountId, patch) {
      const now = new Date();
      const touchesIdentity = Object.keys(patch).some((key) => IDENTITY_BEARING_FIELDS.has(key));

      if (touchesIdentity) {
        return identityUpdateForAccount(accountId, patch, now);
      }

      // MongoDB rejects upserts when the same path appears in both $set and $setOnInsert.
      const setOnInsert: Record<string, unknown> = {
        accountId,
        verificationStatus: 'not_started',
        verificationSubmittedAt: null,
        verificationReviewedAt: null,
        rejectionReasonCustomerSafe: null,
        profilePictureUpdatedAt: null,
        verificationRevision: 0,
        createdAt: now,
      };
      for (const key of Object.keys(patch)) {
        delete setOnInsert[key];
      }

      const result = await col.findOneAndUpdate(
        { accountId },
        {
          $set: { ...patch, updatedAt: now },
          $setOnInsert: setOnInsert,
        },
        { upsert: true, returnDocument: 'after' },
      );

      if (!result) throw new Error('Profile update failed');
      const profile = toProfile(result);
      return applyDerivedStatus(accountId, profile);
    },

    async submitVerification(accountId) {
      const profile = await this.getOrCreateForAccount(accountId);
      if (!profile.firstName?.trim() || !profile.lastName?.trim()) {
        throw new Error('PROFILE_INCOMPLETE');
      }
      if (!profile.phone?.trim()) {
        throw new Error('PROFILE_INCOMPLETE');
      }
      if (!profile.residentialAddress?.city?.trim()) {
        throw new Error('PROFILE_INCOMPLETE');
      }
      if (!profile.idNumberLast4) {
        throw new Error('PROFILE_INCOMPLETE');
      }

      const now = new Date();
      const result = await col.findOneAndUpdate(
        { accountId },
        {
          $set: {
            verificationStatus: 'pending_review',
            verificationSubmittedAt: now,
            rejectionReasonCustomerSafe: null,
            updatedAt: now,
          },
          // DEFECT-001 §4.2 — bump on every genuine resubmission. This is
          // the event that must invalidate any admin page open against the
          // prior pending_review instance (closes the ABA race in §4.3).
          $inc: { verificationRevision: 1 },
        },
        { returnDocument: 'after' },
      );
      if (!result) throw new Error('Verification submit failed');
      return toProfile(result);
    },

    async listByVerificationStatus(status, limit, cursor) {
      const docs = await col
        .find({ verificationStatus: status, ...mongoCursorFilter(cursor) })
        .sort({ verificationSubmittedAt: -1, _id: -1 })
        .limit(limit)
        .toArray();
      return docs.map(toProfile);
    },

    /**
     * Feature 012 FR-4 — `GET /v1/admin/verification-requests/count`. `countDocuments()`
     * against the identical field `listByVerificationStatus` filters on — no `limit`,
     * no cursor (F-012-2 resolved by construction, api-design.md §6).
     */
    async countByVerificationStatus(status) {
      return col.countDocuments({ verificationStatus: status });
    },

    async reviewVerification(accountId, decision, rejectionReasonCustomerSafe, expectedRevision) {
      const profile = await this.findByAccountId(accountId);
      if (!profile) {
        throw new Error('PROFILE_NOT_FOUND');
      }
      if (profile.verificationStatus !== 'pending_review') {
        throw new Error('INVALID_VERIFICATION_STATE');
      }
      // DEFECT-001 §4.3 — cheap pre-check for the common case (admin's page
      // actually is stale); the filter below is what actually closes the
      // race, evaluated atomically against the write.
      if (profile.verificationRevision !== expectedRevision) {
        throw new Error('REVISION_MISMATCH');
      }

      const now = new Date();
      const result = await col.findOneAndUpdate(
        { accountId, verificationStatus: 'pending_review', verificationRevision: expectedRevision },
        {
          $set: {
            verificationStatus: decision,
            verificationReviewedAt: now,
            rejectionReasonCustomerSafe:
              decision === 'rejected' || decision === 'action_required'
                ? rejectionReasonCustomerSafe
                : null,
            updatedAt: now,
          },
        },
        { returnDocument: 'after' },
      );
      if (!result) throw new Error('REVISION_MISMATCH');
      return toProfile(result);
    },
  };
}
