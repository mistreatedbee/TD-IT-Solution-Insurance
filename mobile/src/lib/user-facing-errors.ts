import { ApiError, isMissingApiRouteError, NetworkUnavailableError, SessionTerminatedError } from '../api/errors';

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
  | 'invitation'
  | 'location'
  | 'profile'
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
  recovery: 'We could not report this theft. Please try again or contact support.',
  notification: 'We could not update your notification settings. Please try again.',
  'security-case': 'We could not load or update this case. Please try again.',
  invitation: 'We could not accept this invitation. Request a new link from your administrator.',
  location: 'We could not update or load location data. Check permissions and try again.',
  profile: 'We could not save your profile details. Check the fields and try again.',
  generic: GENERIC_FALLBACK,
};

/** Patterns that indicate a message is safe to show (already user-facing). */
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

function mapSupabaseLikeMessage(message: string): string | null {
  const msg = message.toLowerCase();
  if (msg.includes('invalid login credentials')) {
    return 'Incorrect email or password. Double-check both fields and try again.';
  }
  if (msg.includes('email not confirmed')) {
    return 'Please verify your email before signing in. Check your inbox (and spam folder) for the confirmation link.';
  }
  if (msg.includes('user already registered')) {
    return 'An account may already exist for this email. Try signing in, or check your inbox for a verification link.';
  }
  if (
    msg.includes('rate limit') ||
    msg.includes('too many requests') ||
    msg.includes('email rate limit exceeded') ||
    msg.includes('over_email_send_rate_limit')
  ) {
    return 'Too many emails were sent recently. Wait a few minutes, then try again.';
  }
  if (msg.includes('hook requires authorization token') || msg.includes('hook signature')) {
    return 'We could not send your email right now. Please try again in a minute.';
  }
  if (msg.includes('pkce') || msg.includes('code verifier')) {
    return 'Open the verification link on this device, or request a new email from the sign-up screen.';
  }
  if (msg.includes('invalid') && msg.includes('expired')) {
    return 'This link is invalid or has expired. Request a new one and try again.';
  }
  if (msg.includes('password') && msg.includes('weak')) {
    return 'Choose a stronger password — at least 10 characters with a mix of letters and numbers.';
  }
  return null;
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
      return 'You have reached the asset limit for your plan. Upgrade to a higher tier or remove an asset to register another.';
    case 'PLAN_REQUIRES_QUOTE':
      return 'This plan needs a custom quote. Contact us and we will help you choose the right coverage.';
    case 'VALIDATION_ERROR':
      return 'Some details look incorrect. Review the form and try again.';
    case 'NOT_FOUND':
      if (context === 'location') {
        return 'Location data is not available for this asset yet. Enable tracking on a smartphone asset, then refresh.';
      }
      if (context === 'profile') {
        return 'Your profile could not be loaded. If you are on a test build, make sure the backend is running the latest version.';
      }
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
      return 'This action was already processed. Refresh the screen to see the latest state.';
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

  if (err instanceof NetworkUnavailableError) {
    return err.message;
  }

  if (err instanceof ApiError) {
    if (isMissingApiRouteError(err)) {
      if (context === 'profile') {
        return 'Profile editing is not available on the server your app is connected to yet. Run the latest backend locally and point mobile/.env to it, then reload the app.';
      }
      return 'This feature is not available on the server your app is connected to yet. Update the backend or switch to a local development API URL in mobile/.env.';
    }
    const mapped = mapApiErrorByCode(err.code, err.status, err.message, context);
    if (err.code === 'INVALID_CREDENTIALS' && err.attemptsRemaining != null) {
      return `${mapped} ${err.attemptsRemaining} attempt${err.attemptsRemaining === 1 ? '' : 's'} remaining.`;
    }
    if (err.code === 'RATE_LIMITED' && err.status === 429) {
      return mapped;
    }
    return mapped;
  }

  if (err instanceof Error) {
    if (err.name === 'LocationPermissionDeniedError') {
      return 'Location access is off. Open Settings and allow location while using the app, then try again.';
    }
    if (err.name === 'LocationServicesDisabledError') {
      return 'Turn on location services in your device settings, then try again.';
    }
    const supabaseMapped = mapSupabaseLikeMessage(err.message);
    if (supabaseMapped) return supabaseMapped;
    if (looksUserFacing(err.message)) return err.message;
  }

  if (typeof err === 'object' && err !== null && 'message' in err) {
    const msg = String((err as { message: unknown }).message);
    const supabaseMapped = mapSupabaseLikeMessage(msg);
    if (supabaseMapped) return supabaseMapped;
    if (looksUserFacing(msg)) return msg;
  }

  return fallback;
}
