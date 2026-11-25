import { describe, it, expect } from 'vitest';
import {
  customerVerificationNotesIndexes,
  customerVerificationNotesJsonSchemaValidator,
  VERIFICATION_NOTE_MAX_LENGTH,
} from './customer-verification-note-collections.js';

describe('db/customer-verification-note-collections', () => {
  it('indexes the per-customer newest-first read', () => {
    expect(customerVerificationNotesIndexes).toEqual([
      { key: { accountId: 1, createdAt: -1, _id: -1 }, name: 'customer_verification_notes_accountId_createdAt_id' },
    ]);
  });

  it('caps note length in the validator to match the route', () => {
    const text = customerVerificationNotesJsonSchemaValidator.$jsonSchema.properties.text;
    expect(text.maxLength).toBe(VERIFICATION_NOTE_MAX_LENGTH);
  });
});
