/**
 * Shared MFA-enrollment lookup (transient-token path). Used by the customer profile
 * (failure degrades to `false`, unchanged behaviour) and by the Feature 020 protection
 * checklist (failure surfaces as 'unavailable' so it is never reported as "not done").
 */
import type { AppContext } from '../context.js';

export async function resolveMfaStatus(
  ctx: Pick<AppContext, 'supabase'>,
  email: string,
): Promise<boolean | 'unavailable'> {
  try {
    const userAccessToken = await ctx.supabase.mintTransientUserAccessToken(email);
    const verifiedFactor = await ctx.supabase.findVerifiedTotpFactor(userAccessToken);
    return verifiedFactor !== null;
  } catch {
    return 'unavailable';
  }
}

export async function resolveMfaEnrolled(
  ctx: Pick<AppContext, 'supabase'>,
  email: string,
): Promise<boolean> {
  return (await resolveMfaStatus(ctx, email)) === true;
}
