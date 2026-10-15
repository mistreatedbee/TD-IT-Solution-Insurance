/**
 * INC-003 A-16: GoTrue reads the email-link redirect from the `redirect_to`
 * QUERY parameter (where supabase-js puts it). The mediation layer must send
 * it there for /resend and /recover, or the allow-listed per-client redirect
 * selection (F-2, A-16) is silently replaced by the project's Site URL.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { getSupabaseAdmin } from '../supabase.js';
import type { Env } from '../../config/env.js';

const env = {
  supabaseUrl: 'https://project.supabase.test',
  supabaseServiceRoleKey: 'service-role-test',
} as unknown as Env;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Supabase mediation layer — redirect_to query parameter', () => {
  it.each([
    ['sendSignupConfirmationEmail', '/auth/v1/resend', 'https://web.example/auth/callback?type=signup'],
    ['sendPasswordRecoveryEmail', '/auth/v1/recover', 'https://web.example/reset-password'],
  ] as const)('%s sends redirect_to in the query string', async (method, path, redirect) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await getSupabaseAdmin(env)[method]('user@example.com', redirect);
    const url = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(url.pathname).toBe(path);
    expect(url.searchParams.get('redirect_to')).toBe(redirect);
  });
});
