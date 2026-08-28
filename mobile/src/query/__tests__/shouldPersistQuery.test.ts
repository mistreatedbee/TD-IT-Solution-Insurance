import type { Query } from '@tanstack/react-query';
import { shouldPersistQuery } from '../persistPolicy';

function mockQuery(queryKey: unknown): Query {
  return { queryKey } as Query;
}

describe('shouldPersistQuery (SD-FU-09 / INC-001 A-15)', () => {
  it('excludes location-summary from the persisted cache', () => {
    expect(shouldPersistQuery(mockQuery(['assets', 'location-summary']))).toBe(false);
  });

  it('excludes per-asset location reads from the persisted cache', () => {
    expect(shouldPersistQuery(mockQuery(['assets', 'asset-1', 'location']))).toBe(false);
    expect(shouldPersistQuery(mockQuery(['assets', 'asset-1', 'location-history', 25]))).toBe(
      false,
    );
  });

  it('excludes recovery case location from the persisted cache', () => {
    expect(shouldPersistQuery(mockQuery(['recovery', 'cases', 'case-1', 'location']))).toBe(false);
  });

  it('still persists non-sensitive queries', () => {
    expect(shouldPersistQuery(mockQuery(['account', 'me']))).toBe(true);
    expect(shouldPersistQuery(mockQuery(['assets', 'list']))).toBe(true);
    expect(shouldPersistQuery(mockQuery(['policies']))).toBe(true);
  });
});
