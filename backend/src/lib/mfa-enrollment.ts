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

/** F1 (Feature 020 security review): short-TTL cache of the enrolled BOOLEAN only. */
export const MFA_ENROLLED_CACHE_TTL_SECONDS = 90;
export const mfaEnrolledCacheKey = (accountId: string): string => `mfa-enrolled:${accountId}`;

/**
 * Cached variant: avoids a generateLink + /verify mint (which overwrites the user's pending
 * magic-link token) on every call. Key = accountId; value = 'true'|'false'. 'unavailable'
 * results are never cached. Cache errors degrade to a live lookup.
 */
export async function resolveMfaStatusCached(
  ctx: Pick<AppContext, 'supabase' | 'kv'>,
  accountId: string,
  email: string,
): Promise<boolean | 'unavailable'> {
  const key = mfaEnrolledCacheKey(accountId);
  try {
    const hit = await ctx.kv.get(key);
    if (hit === 'true') return true;
    if (hit === 'false') return false;
  } catch {
    /* fall through to live lookup */
  }
  const live = await resolveMfaStatus(ctx, email);
  if (live !== 'unavailable') {
    try {
      await ctx.kv.set(key, String(live), MFA_ENROLLED_CACHE_TTL_SECONDS);
    } catch {
      /* best effort */
    }
  }
  return live;
}

export async function invalidateMfaEnrolledCache(ctx: Pick<AppContext, 'kv'>, accountId: string): Promise<void> {
  try {
    await ctx.kv.del(mfaEnrolledCacheKey(accountId));
  } catch {
    /* best effort; TTL bounds staleness */
  }
}
