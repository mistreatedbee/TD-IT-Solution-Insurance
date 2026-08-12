import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cachedClient: SupabaseClient | undefined;

/** True when Vite baked in both vars at build time (required on Vercel). */
export function isSupabaseAuthConfigured(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  return Boolean(url?.trim() && key?.trim());
}

/**
 * Lazily create the Supabase browser client — never call createClient with empty
 * strings (throws and whitescreens the whole SPA if env vars are missing).
 */
export function getSupabase(): SupabaseClient {
  if (cachedClient) {
    return cachedClient;
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

  if (!supabaseUrl?.trim() || !supabaseAnonKey?.trim()) {
    throw new Error(
      'Supabase Auth is not configured for this build. Set VITE_SUPABASE_URL and ' +
        'VITE_SUPABASE_ANON_KEY in Vercel (or .env locally), then redeploy.',
    );
  }

  cachedClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  });

  return cachedClient;
}

/** Web redirect target for Supabase Auth email links (signup verify, password reset). */
export function supabaseAuthRedirectUrl(type?: 'signup' | 'recovery'): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const base = `${origin}/auth/callback`;
  return type ? `${base}?type=${type}` : base;
}
