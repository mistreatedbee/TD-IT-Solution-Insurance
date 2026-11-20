/**
 * Feature 023 Phase A item 4 — internal admin notes on a customer's verification.
 * Admin-only; see db/customer-verification-note-collections.ts.
 */
import type { Collection, Db, ObjectId } from 'mongodb';
import { CUSTOMER_VERIFICATION_NOTES_COLLECTION } from '../db/customer-verification-note-collections.js';

export interface CustomerVerificationNote {
  id: string;
  accountId: string;
  authorAccountId: string;
  text: string;
  createdAt: Date;
}

interface NoteDbDoc {
  _id?: ObjectId;
  accountId: string;
  authorAccountId: string;
  text: string;
  createdAt: Date;
}

export interface CustomerVerificationNotesRepo {
  create(input: { accountId: string; authorAccountId: string; text: string }): Promise<CustomerVerificationNote>;
  /** Newest first, bounded by `limit` (index-backed: accountId, createdAt desc). */
  listByAccount(accountId: string, limit: number): Promise<CustomerVerificationNote[]>;
}

function toNote(doc: NoteDbDoc & { _id: ObjectId }): CustomerVerificationNote {
  return {
    id: doc._id.toHexString(),
    accountId: doc.accountId,
    authorAccountId: doc.authorAccountId,
    text: doc.text,
    createdAt: doc.createdAt,
  };
}

export function createCustomerVerificationNotesRepo(db: Db): CustomerVerificationNotesRepo {
  const col: Collection<NoteDbDoc> = db.collection(CUSTOMER_VERIFICATION_NOTES_COLLECTION);
  return {
    async create(input) {
      const doc: NoteDbDoc = { ...input, createdAt: new Date() };
      const result = await col.insertOne(doc);
      return toNote({ ...doc, _id: result.insertedId });
    },
    async listByAccount(accountId, limit) {
      const rows = await col
        .find({ accountId })
        .sort({ createdAt: -1, _id: -1 })
        .limit(limit)
        .toArray();
      return rows.map((row) => toNote(row as NoteDbDoc & { _id: ObjectId }));
    },
  };
}
