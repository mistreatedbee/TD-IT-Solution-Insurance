/**
 * Shared query surface every repository is written against. Both `pg`'s
 * `Pool` and `PoolClient` satisfy this structurally, so repository
 * functions can run either as one-off pool queries or inside an explicit
 * transaction (db/pg.ts's `withTransaction`) without any repository code
 * caring which.
 */
export interface Queryable {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number | null }>;
}
