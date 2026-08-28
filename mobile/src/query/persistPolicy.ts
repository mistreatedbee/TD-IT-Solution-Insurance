import type { Query } from '@tanstack/react-query';

/**
 * SD-FU-09 / INC-001 A-15: coordinate-bearing query results must not be written
 * to plaintext AsyncStorage via the persisted query cache.
 */
export function shouldPersistQuery(query: Query): boolean {
  const key = query.queryKey;
  if (!Array.isArray(key)) return true;

  if (key[0] === 'assets' && key[1] === 'location-summary') return false;
  if (key[0] === 'assets' && key.length >= 3 && key[2] === 'location') return false;
  if (key[0] === 'assets' && key.length >= 3 && key[2] === 'location-history') return false;
  if (key[0] === 'recovery' && key.includes('location')) return false;

  return true;
}
