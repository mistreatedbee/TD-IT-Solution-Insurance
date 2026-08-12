import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '[customer/supabase] VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required for customer auth.',
  );
}

export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '', {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});

/** Web redirect target for Supabase Auth email links (signup verify, password reset). */
export function supabaseAuthRedirectUrl(type?: 'signup' | 'recovery'): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const base = `${origin}/auth/callback`;
  return type ? `${base}?type=${type}` : base;
}
