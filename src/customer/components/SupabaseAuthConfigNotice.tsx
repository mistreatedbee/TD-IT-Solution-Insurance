import { InlineAlert } from '../../dashboard/components/ui';
import { isSupabaseAuthConfigured } from '../supabase/client';

export function SupabaseAuthConfigNotice() {
  if (isSupabaseAuthConfigured()) {
    return null;
  }

  return (
    <InlineAlert tone="danger">
      Customer sign-in is not configured on this deployment. Add{' '}
      <code className="text-xs">VITE_SUPABASE_URL</code> and{' '}
      <code className="text-xs">VITE_SUPABASE_ANON_KEY</code> in Vercel → Settings → Environment
      Variables, then redeploy the web app.
    </InlineAlert>
  );
}
