/**
 * `app.accounts` / `app.account_status_cache` access, per database-design.md
 * §2.2/§4 and migrations/030's SR-9 extension (`user_type`,
 * `partner_organization_id` on the status cache).
 *
 * Authorization-relevant reads MUST go through `getAccountStatus` (the
 * cache), not a wide `app.accounts` read, at every chokepoint api-design.md
 * §2.3 names — this module keeps that distinction explicit by only
 * exposing the wide row where the contract actually needs it
 * (`GET /account/me`, account creation).
 */
import type { Queryable } from './types.js';

export type UserType = 'customer' | 'admin' | 'security_company_operator' | 'support_agent';
export type AccountState = 'pending_verification' | 'active' | 'suspended' | 'deactivated';

export interface AccountRow {
  id: string;
  userType: UserType;
  accountState: AccountState;
  email: string;
  phone: string | null;
  mfaRequired: boolean;
  partnerOrganizationId: string | null;
  invitedBy: string | null;
  createdAt: Date;
}

export interface AccountStatus {
  id: string;
  accountState: AccountState;
  mfaRequired: boolean;
  userType: UserType;
  partnerOrganizationId: string | null;
  updatedAt: Date;
}

/** api-design.md §7 `AdminAccountSummary` — list scope only. */
export interface AdminAccountSummary {
  id: string;
  email: string;
  userType: UserType;
  accountState: AccountState;
  partnerOrganizationId: string | null;
  createdAt: Date;
}

/** api-design.md §7 `AdminAccountDetail` — single-record admin view. */
export interface AdminAccountDetail {
  id: string;
  email: string;
  phone: string | null;
  userType: UserType;
  accountState: AccountState;
  mfaRequired: boolean;
  partnerOrganizationId: string | null;
  invitedBy: string | null;
  suspendedAt: Date | null;
  deactivatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminAccountListFilters {
  userType?: UserType;
  accountState?: AccountState;
  partnerOrganizationId?: string;
  /** Exact match only — backed by accounts_email_unique (api-design.md §11.E). */
  email?: string;
}

interface AccountDbRow {
  id: string;
  user_type: UserType;
  account_state: AccountState;
  email: string;
  phone: string | null;
  mfa_required: boolean;
  partner_organization_id: string | null;
  invited_by: string | null;
  created_at: Date;
}

function toAccount(row: AccountDbRow): AccountRow {
  return {
    id: row.id,
    userType: row.user_type,
    accountState: row.account_state,
    email: row.email,
    phone: row.phone,
    mfaRequired: row.mfa_required,
    partnerOrganizationId: row.partner_organization_id,
    invitedBy: row.invited_by,
    createdAt: new Date(row.created_at),
  };
}

const ACCOUNT_COLUMNS =
  'id, user_type, account_state, email, phone, mfa_required, partner_organization_id, invited_by, created_at';

const ADMIN_DETAIL_COLUMNS =
  `${ACCOUNT_COLUMNS}, suspended_at, deactivated_at, updated_at`;

function toAdminSummary(row: Pick<AccountDbRow, 'id' | 'email' | 'user_type' | 'account_state' | 'partner_organization_id' | 'created_at'>): AdminAccountSummary {
  return {
    id: row.id,
    email: row.email,
    userType: row.user_type,
    accountState: row.account_state,
    partnerOrganizationId: row.partner_organization_id,
    createdAt: new Date(row.created_at),
  };
}

interface AdminDetailDbRow extends AccountDbRow {
  suspended_at: Date | null;
  deactivated_at: Date | null;
  updated_at: Date;
}

function toAdminDetail(row: AdminDetailDbRow): AdminAccountDetail {
  return {
    id: row.id,
    email: row.email,
    phone: row.phone,
    userType: row.user_type,
    accountState: row.account_state,
    mfaRequired: row.mfa_required,
    partnerOrganizationId: row.partner_organization_id,
    invitedBy: row.invited_by,
    suspendedAt: row.suspended_at ? new Date(row.suspended_at) : null,
    deactivatedAt: row.deactivated_at ? new Date(row.deactivated_at) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export function createAccountsRepo(db: Queryable) {
  return {
    async createCustomerAccount(id: string, email: string): Promise<AccountRow> {
      const result = await db.query<AccountDbRow>(
        `insert into app.accounts (id, user_type, account_state, email, mfa_required)
         values ($1, 'customer', 'pending_verification', $2, false)
         returning ${ACCOUNT_COLUMNS}`,
        [id, email],
      );
      const row = result.rows[0];
      if (!row) throw new Error('[repositories/accounts] insert returned no row');
      return toAccount(row);
    },

    async createPrivilegedAccountFromInvitation(input: {
      id: string;
      email: string;
      userType: UserType;
      partnerOrganizationId: string | null;
      invitedBy: string;
    }): Promise<AccountRow> {
      const result = await db.query<AccountDbRow>(
        `insert into app.accounts
           (id, user_type, account_state, email, mfa_required, partner_organization_id, invited_by)
         values ($1, $2, 'active', $3, true, $4, $5)
         returning ${ACCOUNT_COLUMNS}`,
        [input.id, input.userType, input.email, input.partnerOrganizationId, input.invitedBy],
      );
      const row = result.rows[0];
      if (!row) throw new Error('[repositories/accounts] insert returned no row');
      return toAccount(row);
    },

    async findById(id: string): Promise<AccountRow | null> {
      const result = await db.query<AccountDbRow>(`select ${ACCOUNT_COLUMNS} from app.accounts where id = $1`, [id]);
      const row = result.rows[0];
      return row ? toAccount(row) : null;
    },

    async findByEmail(email: string): Promise<AccountRow | null> {
      const result = await db.query<AccountDbRow>(
        `select ${ACCOUNT_COLUMNS} from app.accounts where email = $1`,
        [email.trim().toLowerCase()],
      );
      const row = result.rows[0];
      return row ? toAccount(row) : null;
    },

    async markEmailVerified(id: string): Promise<void> {
      await db.query(
        `update app.accounts set account_state = 'active', updated_at = now()
         where id = $1 and account_state = 'pending_verification'`,
        [id],
      );
    },

    /** api-design.md §2.3: the D-2/Mechanism-2 chokepoint read — always
     * this, never the wide `app.accounts` row, at `/session/refresh`,
     * `/account/me`, and `/internal/accounts/{id}/status`. */
    async getAccountStatus(id: string): Promise<AccountStatus | null> {
      const result = await db.query<{
        id: string;
        account_state: AccountState;
        mfa_required: boolean;
        user_type: UserType;
        partner_organization_id: string | null;
        updated_at: Date;
      }>(
        `select id, account_state, mfa_required, user_type, partner_organization_id, updated_at
         from app.account_status_cache
         where id = $1`,
        [id],
      );
      const row = result.rows[0];
      if (!row) return null;
      return {
        id: row.id,
        accountState: row.account_state,
        mfaRequired: row.mfa_required,
        userType: row.user_type,
        partnerOrganizationId: row.partner_organization_id,
        updatedAt: new Date(row.updated_at),
      };
    },

    /** GET /v1/admin/accounts — cursor-paginated, filterable list (§11.E). */
    async listForAdmin(
      filters: AdminAccountListFilters,
      limit: number,
      cursor: { createdAt: Date; id: string } | null,
    ): Promise<AdminAccountSummary[]> {
      const params: unknown[] = [];
      const where: string[] = [];

      if (filters.userType !== undefined) {
        params.push(filters.userType);
        where.push(`user_type = $${params.length}`);
      }
      if (filters.accountState !== undefined) {
        params.push(filters.accountState);
        where.push(`account_state = $${params.length}`);
      }
      if (filters.partnerOrganizationId !== undefined) {
        params.push(filters.partnerOrganizationId);
        where.push(`partner_organization_id = $${params.length}`);
      }
      if (filters.email !== undefined) {
        params.push(filters.email.trim().toLowerCase());
        where.push(`email = $${params.length}`);
      }
      if (cursor) {
        params.push(cursor.createdAt, cursor.id);
        where.push(`(created_at, id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`);
      }

      params.push(limit);
      const whereClause = where.length > 0 ? `where ${where.join(' and ')}` : '';

      const result = await db.query<Pick<AccountDbRow, 'id' | 'email' | 'user_type' | 'account_state' | 'partner_organization_id' | 'created_at'>>(
        `select id, email, user_type, account_state, partner_organization_id, created_at
         from app.accounts
         ${whereClause}
         order by created_at desc, id desc
         limit $${params.length}`,
        params,
      );
      return result.rows.map(toAdminSummary);
    },

    /** GET /v1/admin/accounts/{id} — admin detail (§11.E). */
    async findByIdForAdminDetail(id: string): Promise<AdminAccountDetail | null> {
      const result = await db.query<AdminDetailDbRow>(
        `select ${ADMIN_DETAIL_COLUMNS} from app.accounts where id = $1`,
        [id],
      );
      const row = result.rows[0];
      return row ? toAdminDetail(row) : null;
    },
  };
}

export type AccountsRepo = ReturnType<typeof createAccountsRepo>;
