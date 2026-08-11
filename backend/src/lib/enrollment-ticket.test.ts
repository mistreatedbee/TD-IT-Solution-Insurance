/**
 * SR-1 unit tests: enrollment-ticket issuance/validation/redemption.
 *
 * These exercise the pure state machine in enrollment-ticket.ts against an
 * in-memory fake of EnrollmentTicketRepo — no live Postgres required. The
 * scenario under test is exactly the one security-review.md's attack tree
 * (§2.3, branch A1) and §7's endpoint table name: SR-1 closes privileged
 * ATO by making the account derivable ONLY from this server-issued ticket,
 * never a client-supplied identifier.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  issueEnrollmentTicket,
  redeemEnrollmentTicket,
  validateEnrollmentTicket,
  type EnrollmentTicketRecord,
  type EnrollmentTicketRepo,
} from './enrollment-ticket.js';
import { randomUUID } from 'node:crypto';

function createFakeRepo(): EnrollmentTicketRepo {
  const rows = new Map<string, EnrollmentTicketRecord>();
  return {
    async create({ tokenHash, accountId, expiresAt }) {
      const record: EnrollmentTicketRecord = { id: randomUUID(), tokenHash, accountId, expiresAt, usedAt: null };
      rows.set(record.id, record);
      return record;
    },
    async findByTokenHash(tokenHash) {
      for (const record of rows.values()) {
        if (record.tokenHash === tokenHash) return record;
      }
      return null;
    },
    async tryMarkUsed(id, usedAt) {
      const record = rows.get(id);
      if (!record || record.usedAt !== null) return false;
      record.usedAt = usedAt;
      return true;
    },
  };
}

describe('enrollment-ticket (SR-1)', () => {
  let repo: EnrollmentTicketRepo;
  const accountId = randomUUID();

  beforeEach(() => {
    repo = createFakeRepo();
  });

  it('issues a token that is not derivable from the account id', async () => {
    const { token } = await issueEnrollmentTicket(repo, accountId);
    expect(token).not.toContain(accountId);
    expect(token.length).toBeGreaterThanOrEqual(40); // base64url of >=32 bytes
  });

  it('redeems a freshly-issued ticket exactly once and returns the bound account', async () => {
    const { token } = await issueEnrollmentTicket(repo, accountId);
    const result = await redeemEnrollmentTicket(repo, token);
    expect(result).toEqual({ ok: true, accountId });
  });

  it('rejects a second redemption of the same ticket (single-use)', async () => {
    const { token } = await issueEnrollmentTicket(repo, accountId);
    const first = await redeemEnrollmentTicket(repo, token);
    expect(first.ok).toBe(true);
    const second = await redeemEnrollmentTicket(repo, token);
    expect(second).toEqual({ ok: false, reason: 'already_used' });
  });

  it('rejects an unknown token — this is the SR-1 privileged-ATO closure: an attacker who knows/guesses an accountId has NOTHING to present here', async () => {
    const result = await redeemEnrollmentTicket(repo, 'a-token-nobody-ever-issued');
    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });

  it('rejects an expired ticket even if otherwise well-formed and unused', async () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const { token, expiresAt } = await issueEnrollmentTicket(repo, accountId, now);
    expect(expiresAt.getTime()).toBe(now.getTime() + 10 * 60 * 1000); // 10-minute TTL, ratified

    const justAfterExpiry = new Date(expiresAt.getTime() + 1);
    const result = await redeemEnrollmentTicket(repo, token, justAfterExpiry);
    expect(result).toEqual({ ok: false, reason: 'expired' });
  });

  it('validateEnrollmentTicket (peek) does not consume the ticket — /mfa/enroll must not burn it', async () => {
    const { token } = await issueEnrollmentTicket(repo, accountId);

    const peeked = await validateEnrollmentTicket(repo, token);
    expect(peeked).toEqual({ ok: true, accountId });

    // Still redeemable afterward — proving the peek did not mark it used.
    const redeemed = await redeemEnrollmentTicket(repo, token);
    expect(redeemed).toEqual({ ok: true, accountId });
  });

  it('never derives an account from anything other than the token — two different accounts issued tickets never cross-resolve', async () => {
    const accountA = randomUUID();
    const accountB = randomUUID();
    const ticketA = await issueEnrollmentTicket(repo, accountA);
    const ticketB = await issueEnrollmentTicket(repo, accountB);

    const resultA = await redeemEnrollmentTicket(repo, ticketA.token);
    const resultB = await redeemEnrollmentTicket(repo, ticketB.token);

    expect(resultA).toEqual({ ok: true, accountId: accountA });
    expect(resultB).toEqual({ ok: true, accountId: accountB });
  });

  it('honors tryMarkUsed as the single-use gate: redeemEnrollmentTicket reports already_used the moment the repo reports the row was already claimed, even if found+unexpired', async () => {
    const { token } = await issueEnrollmentTicket(repo, accountId);
    // Simulate the real Postgres implementation's atomicity guarantee
    // (`UPDATE ... WHERE id = $1 AND used_at IS NULL`) losing a race by
    // having the repo itself report failure on tryMarkUsed even though the
    // row it returned from findByTokenHash still looked unused at read time.
    const originalTryMarkUsed = repo.tryMarkUsed.bind(repo);
    repo.tryMarkUsed = async (id, usedAt) => {
      await originalTryMarkUsed(id, usedAt); // apply it once for realism
      return false; // then report as if a concurrent caller had won the race
    };
    const result = await redeemEnrollmentTicket(repo, token);
    expect(result).toEqual({ ok: false, reason: 'already_used' });
  });
});
