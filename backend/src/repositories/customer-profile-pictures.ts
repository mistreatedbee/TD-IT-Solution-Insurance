import { Binary, type Collection, type Db } from 'mongodb';
import { CUSTOMER_PROFILE_PICTURES_COLLECTION } from '../db/customer-profile-picture-collections.js';
import type { ProfilePictureContentType } from '../lib/profile-picture-validation.js';

export interface CustomerProfilePictureDocument {
  accountId: string;
  contentType: ProfilePictureContentType;
  data: Buffer;
  updatedAt: Date;
}

interface CustomerProfilePictureDbDoc {
  accountId: string;
  contentType: ProfilePictureContentType;
  data: Binary;
  updatedAt: Date;
}

function toDocument(doc: CustomerProfilePictureDbDoc): CustomerProfilePictureDocument {
  return {
    accountId: doc.accountId,
    contentType: doc.contentType,
    data: Buffer.from(doc.data.buffer),
    updatedAt: doc.updatedAt,
  };
}

export interface CustomerProfilePicturesRepo {
  findByAccountId(accountId: string): Promise<CustomerProfilePictureDocument | null>;
  upsertForAccount(
    accountId: string,
    contentType: ProfilePictureContentType,
    data: Buffer,
  ): Promise<CustomerProfilePictureDocument>;
  deleteForAccount(accountId: string): Promise<boolean>;
}

export function createCustomerProfilePicturesRepo(db: Db): CustomerProfilePicturesRepo {
  const col: Collection<CustomerProfilePictureDbDoc> = db.collection(
    CUSTOMER_PROFILE_PICTURES_COLLECTION,
  );

  return {
    async findByAccountId(accountId) {
      const doc = await col.findOne({ accountId });
      return doc ? toDocument(doc) : null;
    },

    async upsertForAccount(accountId, contentType, data) {
      const updatedAt = new Date();
      await col.updateOne(
        { accountId },
        {
          $set: {
            contentType,
            data: new Binary(data),
            updatedAt,
          },
          $setOnInsert: { accountId },
        },
        { upsert: true },
      );

      const saved = await col.findOne({ accountId });
      if (!saved) throw new Error('Failed to save profile picture');
      return toDocument(saved);
    },

    async deleteForAccount(accountId) {
      const result = await col.deleteOne({ accountId });
      return result.deletedCount > 0;
    },
  };
}
