import { apiFetch } from './client';
import { newIdempotencyKey } from './idempotency';
import type { components } from './generated/identity-service';

type Schemas = components['schemas'];

export function getInvitation(token: string) {
  return apiFetch<Schemas['InvitationPublic']>(`/invitations/${encodeURIComponent(token)}`, {
    method: 'GET',
    authenticated: false,
  });
}

export function acceptInvitation(token: string, password: string) {
  return apiFetch<{
    accountId: string;
    mfaEnrollmentRequired: true;
    enrollmentTicket: string;
  }>(`/invitations/${encodeURIComponent(token)}/accept`, {
    method: 'POST',
    body: { password },
    authenticated: false,
    headers: { 'Idempotency-Key': newIdempotencyKey() },
  });
}
