import { describe, expect, it } from 'vitest';

import { openMongoDatabase, resolveMongoDatabaseName } from '../mongo-connection.js';

describe('mongo-connection', () => {
  it('resolveMongoDatabaseName prefers override over URI path', () => {
    expect(
      resolveMongoDatabaseName('mongodb+srv://user:pass@cluster.example.net/production_db', 'staging_db'),
    ).toBe('staging_db');
  });

  it('resolveMongoDatabaseName reads database from URI when override absent', () => {
    expect(resolveMongoDatabaseName('mongodb+srv://user:pass@cluster.example.net/my_db?retryWrites=true')).toBe(
      'my_db',
    );
  });

  it('openMongoDatabase uses override when provided', () => {
    const fakeClient = {
      db: (name?: string) => ({ databaseName: name ?? 'default' }),
    };
    const db = openMongoDatabase(fakeClient as never, 'td_it_insurance_staging');
    expect(db.databaseName).toBe('td_it_insurance_staging');
  });
});
