/**
 * `app.invitations` access, per database-design.md §2.7. Token lookup is
 * always by hash, server-side (never a direct client PostgREST query — §5.4
 * of that document); this repository is the only place that happens.
 */
import type { Queryable } from './types.js';
import type { UserType } from './accounts.js';

export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked';

export interface InvitationRecord {
  id: string;
  email: string;
  userType: UserType;
  partnerOrganizationId: string | null;
  invitedBy: string;
  status: InvitationStatus;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
}

interface Row {
  id: string;
  email: string;
  user_type: UserType;
  partner_organization_id: string | null;
  invited_by: string;
  status: InvitationStatus;
  expires_at: Date;
  accepted_at: Date | null;
  created_at: Date;
}

function toRecord(row: Row): InvitationRecord {
  return {
    id: row.id,
    email: row.email,
    userType: row.user_type,
    partnerOrganizationId: row.partner_organization_id,
    invitedBy: row.invited_by,
    status: row.status,
    expiresAt: new Date(row.expires_at),
    acceptedAt: row.accepted_at ? new Date(row.accepted_at) : null,
    createdAt: new Date(row.created_at),
  };
}

const COLUMNS = `id, email, user_type, partner_organization_id, invited_by, status, expires_at, accepted_at, created_at`;

export function createInvitationsRepo(db: Queryable) {
  return {
    async create(input: {
      email: string;
      userType: UserType;
      partnerOrganizationId: string | null;
      invitedBy: string;
      tokenHash: string;
      expiresAt: Date;
    }): Promise<InvitationRecord> {
      const result = await db.query<Row>(
        `insert into app.invitations
           (email, user_type, partner_organization_id, invited_by, token_hash, expires_at)
         values ($1, $2, $3, $4, $5, $6)
         returning ${COLUMNS}`,
        [
          input.email.trim().toLowerCase(),
          input.userType,
          input.partnerOrganizationId,
          input.invitedBy,
          input.tokenHash,
          input.expiresAt,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new Error('[repositories/invitations] insert returned no row');
      return toRecord(row);
    },

    async findByTokenHash(tokenHash: string): Promise<InvitationRecord | null> {
      const result = await db.query<Row>(`select ${COLUMNS} from app.invitations where token_hash = $1`, [
        tokenHash,
      ]);
      const row = result.rows[0];
      return row ? toRecord(row) : null;
    },

    async markAccepted(id: string): Promise<boolean> {
      const result = await db.query(
        `update app.invitations
         set status = 'accepted', accepted_at = now()
         where id = $1 and status = 'pending'`,
        [id],
      );
      return (result.rowCount ?? 0) > 0;
    },

    async hasPendingForEmail(email: string): Promise<boolean> {
      const result = await db.query(
        `select 1 from app.invitations where email = $1 and status = 'pending' limit 1`,
        [email.trim().toLowerCase()],
      );
      return (result.rowCount ?? 0) > 0;
    },
  };
}

export type InvitationsRepo = ReturnType<typeof createInvitationsRepo>;
