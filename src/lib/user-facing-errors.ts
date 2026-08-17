import { ApiError, SessionTerminatedError } from '../customer/api/errors';
import { mapSupabaseAuthError } from '../customer/supabase/auth';

export type UserFacingErrorContext =
  | 'auth'
  | 'signup'
  | 'verify'
  | 'password-reset'
  | 'mfa'
  | 'onboarding'
  | 'policy'
  | 'asset'
  | 'claim'
  | 'recovery'
  | 'notification'
  | 'security-case'
  | 'admin'
  | 'invitation'
  | 'generic';

const GENERIC_FALLBACK =
  'Something went wrong on our side. Please try again in a moment, or contact support if this keeps happening.';

const CONTEXT_FALLBACK: Record<UserFacingErrorContext, string> = {
  auth: 'We could not sign you in. Check your email and password, then try again.',
  signup: 'We could not create your account. Check your details and try again.',
  verify: 'We could not confirm your email yet. Open the link in your inbox, or request a new verification email.',
  'password-reset': 'We could not reset your password. Request a new reset link and try again.',
  mfa: 'We could not verify your code. Check the digits and try again.',
  onboarding: 'We could not continue onboarding. Please try again.',
  policy: 'We could not update your plan. Please try again.',
  asset: 'We could not save this asset. Check the details and try again.',
  claim: 'We could not submit your claim. Please try again.',
  recovery: 'We could not complete this recovery action. Please try again or contact support.',
  notification: 'We could not update your notification settings. Please try again.',
  'security-case': 'We could not load or update this case. Please try again.',
  admin: 'We could not complete that admin action. Please try again.',
  invitation: 'We could not accept this invitation. Request a new link from your administrator.',
  generic: GENERIC_FALLBACK,
};

function looksUserFacing(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed || trimmed.length > 280) return false;
  if (/^\{/.test(trimmed) || trimmed.includes('Error:') || trimmed.includes(' at ')) return false;
  if (/^[A-Z_]+$/.test(trimmed)) return false;
  if (/^(TypeError|ReferenceError|SyntaxError|fetch failed)/i.test(trimmed)) return false;
  if (/^\d{3}\s/.test(trimmed) || trimmed.includes('ECONNREFUSED') || trimmed.includes('ENOTFOUND')) {
    return false;
  }
  return true;
}

function mapApiErrorByCode(code: string, status: number, message: string, context: UserFacingErrorContext): string {
  switch (code) {
    case 'INVALID_CREDENTIALS':
      return 'Incorrect email or password. Double-check both fields and try again.';
    case 'ACCOUNT_LOCKED':
    case 'RATE_LIMITED':
      return 'Too many attempts. Wait a few minutes, then try again.';
    case 'ACCOUNT_NOT_ACTIVE':
      return context === 'asset' || context === 'policy'
        ? 'Verify your email before continuing. Check your inbox for the confirmation link.'
        : 'Your account is not active yet. Verify your email, then sign in again.';
    case 'ACCOUNT_SUSPENDED':
      return 'This account is currently unavailable. Contact support if you believe this is a mistake.';
    case 'ASSET_LIMIT_REACHED':
      return 'You have reached the asset limit for your plan. Upgrade your plan or remove an asset to add another.';
    case 'PLAN_REQUIRES_QUOTE':
      return 'This plan needs a custom quote. Contact us and we will help you choose the right coverage.';
    case 'VALIDATION_ERROR':
      return 'Some details look incorrect. Review the form and try again.';
    case 'NOT_FOUND':
      return context === 'security-case'
        ? 'This case could not be found. It may have been closed or reassigned.'
        : 'We could not find what you were looking for. Go back and try again.';
    case 'FORBIDDEN':
      return 'You do not have permission to do that. Sign in with the correct account or contact support.';
    case 'UNAUTHORIZED':
    case 'REFRESH_TOKEN_INVALID':
      return 'Your session expired. Sign in again to continue.';
    case 'MFA_CHALLENGE_INVALID':
      return 'That code is incorrect. Open your authenticator app and enter the current 6-digit code.';
    case 'MFA_CHALLENGE_EXPIRED':
      return 'This verification step timed out. Sign in again to get a fresh code.';
    case 'MFA_ENROLLMENT_NOT_FOUND':
    case 'ENROLLMENT_TICKET_INVALID':
      return 'This setup session expired. Start sign-in again to set up two-factor authentication.';
    case 'INVITATION_INVALID':
      return 'This invitation link is not valid. Ask your administrator to send a new one.';
    case 'INVITATION_EXPIRED':
      return 'This invitation has expired or was already used. Request a new invitation from your administrator.';
    case 'RESET_TOKEN_INVALID':
      return 'This password reset link is not valid. Request a new reset email.';
    case 'RESET_TOKEN_EXPIRED':
      return 'This password reset link has expired. Request a new reset email from the sign-in screen.';
    case 'UPSTREAM_UNAVAILABLE':
      return 'Our service is waking up. Wait a few seconds and try again.';
    case 'INTERNAL_ERROR':
      return GENERIC_FALLBACK;
    case 'CONFLICT':
    case 'IDEMPOTENCY_KEY_REUSE':
      return 'This action was already processed. Refresh the page to see the latest state.';
    case 'DEVICE_MISMATCH':
      return 'Complete this action on the device you used to sign in.';
    case 'STEP_UP_REQUIRED':
      return 'Please verify your identity again before continuing.';
    default:
      if (looksUserFacing(message)) return message;
      if (status === 404) return CONTEXT_FALLBACK[context];
      if (status >= 500) return GENERIC_FALLBACK;
      return CONTEXT_FALLBACK[context];
  }
}

export interface MapUserFacingErrorOptions {
  context?: UserFacingErrorContext;
  fallback?: string;
}

/** Maps network/offline failures to a friendly message (web has no NetworkUnavailableError class). */
function mapNetworkLike(err: unknown): string | null {
  if (!(err instanceof Error)) return null;
  const msg = err.message.toLowerCase();
  if (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('load failed') ||
    msg.includes('network request failed')
  ) {
    return 'Could not reach the server. Check your internet connection and try again.';
  }
  return null;
}

/**
 * Maps any caught error to a safe, actionable message for end users.
 * Never surfaces raw driver, stack, or JSON error text.
 */
export function mapUserFacingError(err: unknown, options: MapUserFacingErrorOptions = {}): string {
  const context = options.context ?? 'generic';
  const fallback = options.fallback ?? CONTEXT_FALLBACK[context];

  if (err instanceof SessionTerminatedError) {
    return err.reason === 'account-suspended'
      ? 'This account is currently unavailable. Contact support if you need help.'
      : 'Your session expired. Sign in again to continue.';
  }

  const networkMapped = mapNetworkLike(err);
  if (networkMapped) return networkMapped;

  if (err instanceof ApiError) {
    return mapApiErrorByCode(err.code, err.status, err.message, context);
  }

  if (err instanceof Error) {
    const supabaseMapped = mapSupabaseAuthError(err);
    if (supabaseMapped !== err.message || looksUserFacing(supabaseMapped)) {
      return supabaseMapped;
    }
  }

  if (typeof err === 'object' && err !== null && 'message' in err) {
    const msg = String((err as { message: unknown }).message);
    const supabaseMapped = mapSupabaseAuthError({ message: msg });
    if (supabaseMapped !== msg || looksUserFacing(supabaseMapped)) {
      return supabaseMapped;
    }
    if (looksUserFacing(msg)) return msg;
  }

  return fallback;
}
