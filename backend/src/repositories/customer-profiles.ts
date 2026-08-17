import { ObjectId, type Collection, type Db } from 'mongodb';
import { CUSTOMER_PROFILES_COLLECTION } from '../db/customer-profile-collections.js';
import { mongoCursorFilter, type MongoDecodedCursor } from '../lib/mongo-pagination.js';

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
      >
    >,
  ): Promise<CustomerProfileDocument>;
  submitVerification(accountId: string): Promise<CustomerProfileDocument>;
  listByVerificationStatus(
    status: VerificationStatus,
    limit: number,
    cursor: MongoDecodedCursor | null,
  ): Promise<CustomerProfileDocument[]>;
  reviewVerification(
    accountId: string,
    decision: 'verified' | 'rejected' | 'action_required',
    rejectionReasonCustomerSafe: string | null,
  ): Promise<CustomerProfileDocument>;
}

export function createCustomerProfilesRepo(db: Db): CustomerProfilesRepo {
  const col: Collection<CustomerProfileDbDoc> = db.collection(CUSTOMER_PROFILES_COLLECTION);

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
        createdAt: now,
        updatedAt: now,
      } as CustomerProfileDbDoc);

      const created = await col.findOne({ _id: insertResult.insertedId });
      if (!created) throw new Error('Failed to create customer profile');
      return toProfile(created);
    },

    async updateForAccount(accountId, patch) {
      const now = new Date();
      const result = await col.findOneAndUpdate(
        { accountId },
        {
          $set: { ...patch, updatedAt: now },
          $setOnInsert: {
            accountId,
            verificationStatus: 'not_started',
            verificationSubmittedAt: null,
            verificationReviewedAt: null,
            rejectionReasonCustomerSafe: null,
            createdAt: now,
          },
        },
        { upsert: true, returnDocument: 'after' },
      );

      if (!result) throw new Error('Profile update failed');
      const profile = toProfile(result);
      const derived = deriveVerificationStatus(profile);
      if (derived !== profile.verificationStatus && !['pending_review', 'verified', 'rejected', 'action_required'].includes(profile.verificationStatus)) {
        const updated = await col.findOneAndUpdate(
          { accountId },
          { $set: { verificationStatus: derived, updatedAt: new Date() } },
          { returnDocument: 'after' },
        );
        if (updated) return toProfile(updated);
      }
      return profile;
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

    async reviewVerification(accountId, decision, rejectionReasonCustomerSafe) {
      const profile = await this.findByAccountId(accountId);
      if (!profile) {
        throw new Error('PROFILE_NOT_FOUND');
      }
      if (profile.verificationStatus !== 'pending_review') {
        throw new Error('INVALID_VERIFICATION_STATE');
      }

      const now = new Date();
      const result = await col.findOneAndUpdate(
        { accountId, verificationStatus: 'pending_review' },
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
      if (!result) throw new Error('Verification review failed');
      return toProfile(result);
    },
  };
}
