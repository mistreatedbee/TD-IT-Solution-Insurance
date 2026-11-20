import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BriefcaseIcon,
  CrownIcon,
  ShieldCheckIcon,
  SparklesIcon,
  type LucideIcon,
} from 'lucide-react';
import { TdButton, TdGlassCard, TdTextField } from '../../components/td';
import { TD_FOCUS } from '../../components/td/cx';
import { PlanMarketingCard } from '../../components/PlanMarketingCard';
import { AssetBadge, type AssetType as BadgeAssetType } from '../../components/AssetBadge';
import { AuthAlert, AuthEyebrow, AuthLink } from '../../customer/components/MarketingAuthShell';
import { createAsset, listAssets, type Asset, type AssetType } from '../../customer/api/assets';
import { ApiError } from '../../customer/api/errors';
import { createPolicy, listPolicies, type Policy } from '../../customer/api/policies';
import { formatPlanPrice, listPlans, type PlanCatalogItem } from '../../customer/api/plans';
import { useCustomerAuth } from '../../customer/auth/CustomerAuthProvider';
import { resendVerificationEmail, signup } from '../../customer/api/auth';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import { useOtpAutoSubmit } from '../../lib/useOtpAutoSubmit';
import { COMPANY_CONTACT } from '../../lib/companyContact';
import {
  ASSET_CATEGORY_OPTIONS,
  buildAssetDetails,
  fieldLabel,
  requiredFieldsForType,
} from '../../onboarding/assetFormConfig';
import {
  loadAccountType,
  saveAccountType,
  saveAssetDraft,
  loadAssetDraft,
  clearAssetDraft,
  type AccountType,
  type OnboardingStep,
} from '../../onboarding/onboardingStorage';
import { OnboardingProgress } from './OnboardingProgress';
import { OnboardingShell } from './OnboardingShell';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN_LENGTH = 10;

const POLL_INTERVAL_MS = 10_000;

/** Plain text button used for the "back to email and password" escape hatch under MFA forms. */
const LINK_BUTTON =
  'body-sm min-h-[48px] w-full rounded-td-md text-td-ink-muted hover:text-td-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-td-focus-ring';

/** Pre-INC-003-A-14 builds stored `{ email, password }` here. Never written now. */
const LEGACY_PENDING_SIGNUP_AUTH_KEY = 'td_signup_pending_auth';

const ONBOARDING_PLAN_ICONS: Record<string, LucideIcon> = {
  essential: ShieldCheckIcon,
  plus: SparklesIcon,
  pro: CrownIcon,
  business: BriefcaseIcon,
  starter: ShieldCheckIcon,
  standard: SparklesIcon,
  enterprise: BriefcaseIcon,
};

function resolveInitialStep(
  authStatus: string,
  accountState: string | undefined,
  hasPolicy: boolean,
): OnboardingStep {
  if (authStatus !== 'signed-in') return 'welcome';
  if (accountState === 'pending_verification') return 'verify';
  if (!hasPolicy) return 'plan';
  return 'asset-category';
}

export function CustomerOnboardingPage() {
  const auth = useCustomerAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [accountType, setAccountType] = useState<AccountType | null>(loadAccountType());
  const [plans, setPlans] = useState<PlanCatalogItem[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedAssetType, setSelectedAssetType] = useState<AssetType | null>(null);
  const [assetFields, setAssetFields] = useState<Record<string, string>>({});
  const [displayName, setDisplayName] = useState('');
  const [estimatedValue, setEstimatedValue] = useState('');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // ADR-0014 AE-4: both sign-in forms in this wizard (the verify step's
  // "Verified? Sign in" and the signup step's "Already registered?") can hit
  // an account with MFA already enrolled. Previously that `mfa` result was
  // turned away with a dead-end error. `mfaOrigin` tracks which form raised
  // the challenge, so completing it resumes exactly what that form would
  // have done next.
  const [mfaChallengeToken, setMfaChallengeToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaOrigin, setMfaOrigin] = useState<'login' | 'verify' | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshData = useCallback(async () => {
    if (auth.status !== 'signed-in') return;
    try {
      const [policiesRes, assetsRes] = await Promise.all([listPolicies(), listAssets()]);
      setPolicy(policiesRes.data[0] ?? null);
      setAssets(assetsRes.data);
    } catch {
      /* non-fatal on early steps */
    }
  }, [auth.status]);

  useEffect(() => {
    void refreshData();
  }, [refreshData, auth.status, auth.account]);

  useEffect(() => {
    if (auth.status === 'hydrating') return;
    if (auth.status === 'signed-in' && auth.account) {
      const hasPolicy = Boolean(policy);
      setStep((prev) => {
        if (prev === 'complete') return prev;
        return resolveInitialStep(auth.status, auth.account?.accountState, hasPolicy);
      });
    }
  }, [auth.status, auth.account, policy]);

  useEffect(() => {
    if (step !== 'plan') return;
    setPlansLoading(true);
    listPlans()
      // Defensive: `res.data` must be an array before it reaches `plans` state —
      // an unexpected response shape here (e.g. an error body that still resolves
      // 2xx) previously set `plans` to `undefined`, which crashed the
      // `selectedPlan` memo's `plans.find(...)` below with no error boundary,
      // taking down the whole onboarding page.
      .then((res) => setPlans(Array.isArray(res.data) ? res.data : []))
      .catch(() => setPlans([]))
      .finally(() => setPlansLoading(false));
  }, [step]);

  // INC-003 A-14: the wizard used to keep the user's plaintext password in
  // sessionStorage and replay it as a GoTrue password grant every 10 s while
  // waiting for email verification. No credential is held any more: once the
  // user has opened the verification link they sign in once, on this step,
  // with the password they just chose. The only automatic check left is for
  // an already-signed-in account, and it uses the existing backend session —
  // never a stored password.
  const tryAdvanceFromVerification = useCallback(async (): Promise<boolean> => {
    if (auth.status !== 'signed-in') return false;
    const me = await auth.refreshAccount();
    if (me?.accountState === 'active') {
      setStep('plan');
      setError(null);
      return true;
    }
    return false;
  }, [auth]);

  useEffect(() => {
    if (step !== 'verify' || auth.status !== 'signed-in') return;

    void tryAdvanceFromVerification();
    const timer = window.setInterval(() => {
      void tryAdvanceFromVerification();
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [step, auth.status, tryAdvanceFromVerification]);

  // INC-003 A-14: purge any record a pre-fix build left behind in this tab.
  useEffect(() => {
    try {
      sessionStorage.removeItem(LEGACY_PENDING_SIGNUP_AUTH_KEY);
    } catch {
      /* storage unavailable — nothing to purge */
    }
  }, []);

  useEffect(() => {
    const draft = loadAssetDraft();
    if (draft) setAssetFields(draft);
  }, []);

  async function handleSignup(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = email.trim();
    if (!EMAIL_PATTERN.test(trimmed)) {
      setError('Enter a valid email address.');
      return;
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    if (!consentAccepted) {
      setError('Please accept the terms and privacy notice.');
      return;
    }
    setLoading(true);
    try {
      // INC-003 A-16: backend signup (consent enforced server-side too). The
      // response is identical for new and registered addresses.
      await signup({ email: trimmed, password, consentAccepted: true });
      // INC-003 A-14: the password is NOT kept anywhere. Clear it from
      // component state too; the verify step asks for it once, after the
      // link has been opened.
      setPassword('');
      setConfirmPassword('');
      setLoginEmail(trimmed);
      setLoginPassword('');
      setStep('verify');
    } catch (err) {
      setError(mapUserFacingError(err, { context: 'signup' }));
    } finally {
      setLoading(false);
    }
  }

  // INC-003 A-14: one explicit sign-in after verification, replacing the
  // stored-password replay loop.
  async function handleVerifiedSignIn(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await auth.loginWithPassword(loginEmail.trim(), loginPassword);
      if (result.kind === 'tokens') {
        await auth.signInWithTokens(result.accessToken, result.refreshToken);
        setLoginPassword('');
        const me = await auth.refreshAccount();
        if (me?.accountState === 'active') {
          setStep('plan');
        }
      } else if (result.kind === 'mfa') {
        setMfaChallengeToken(result.mfaChallengeToken);
        setMfaCode('');
        setMfaOrigin('verify');
      } else {
        setError('Additional verification is required. Use the login page to finish signing in.');
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ACCOUNT_NOT_ACTIVE') {
        setError('Still waiting for verification — open the link in your email first, then try again.');
      } else {
        setError(mapUserFacingError(err, { context: 'auth' }));
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await auth.loginWithPassword(loginEmail.trim(), loginPassword);
      if (result.kind === 'tokens') {
        await auth.signInWithTokens(result.accessToken, result.refreshToken);
        await refreshData();
        setStep(resolveInitialStep('signed-in', auth.account?.accountState, Boolean(policy)));
      } else if (result.kind === 'mfa') {
        setMfaChallengeToken(result.mfaChallengeToken);
        setMfaCode('');
        setMfaOrigin('login');
      } else {
        setError('Additional verification is required. Use the mobile app or contact support.');
      }
    } catch (err) {
      setError(mapUserFacingError(err, { context: 'auth' }));
    } finally {
      setLoading(false);
    }
  }

  // ADR-0014 AE-4: completes the MFA challenge either sign-in form above
  // raised, then resumes that form's own follow-up — the verify step
  // advances to 'plan' once the account is active, the signup step's
  // "Already registered?" form resolves the usual initial step.
  async function verifyMfaCode(code: string) {
    if (!mfaChallengeToken) return;
    setError(null);
    setLoading(true);
    try {
      await auth.completeMfa(mfaChallengeToken, code.trim());
      setMfaChallengeToken(null);
      setMfaCode('');
      setLoginPassword('');
      const origin = mfaOrigin;
      setMfaOrigin(null);
      const me = await auth.refreshAccount();
      if (origin === 'verify') {
        if (me?.accountState === 'active') {
          setStep('plan');
        }
      } else {
        await refreshData();
        setStep(resolveInitialStep('signed-in', me?.accountState, Boolean(policy)));
      }
    } catch (err) {
      setMfaCode('');
      setError(mapUserFacingError(err, { context: 'mfa' }));
    } finally {
      setLoading(false);
    }
  }

  const { onCodeChange: onMfaCodeChange, submitCode: submitMfaCode } = useOtpAutoSubmit({
    value: mfaCode,
    setValue: setMfaCode,
    submit: verifyMfaCode,
  });

  function handleMfaSubmit(e: FormEvent) {
    e.preventDefault();
    void submitMfaCode(mfaCode);
  }

  function cancelMfa() {
    setMfaChallengeToken(null);
    setMfaCode('');
    setMfaOrigin(null);
    setError(null);
  }

  async function handleSelectPlan(plan: PlanCatalogItem) {
    if (plan.isCustomPricing) {
      window.location.href = `mailto:${COMPANY_CONTACT.email}?subject=Business%20plan%20quote`;
      return;
    }
    setSelectedPlanId(plan.id);
    setLoading(true);
    setError(null);
    try {
      const created = await createPolicy({ planCatalogId: plan.id });
      setPolicy(created);
      setStep('asset-category');
    } catch (err) {
      setError(mapUserFacingError(err, { context: 'policy' }));
    } finally {
      setLoading(false);
    }
  }

  async function handleRegisterAsset(e: FormEvent) {
    e.preventDefault();
    if (!selectedAssetType) return;
    setError(null);
    const required = requiredFieldsForType(selectedAssetType);
    for (const key of required) {
      if (!assetFields[key]?.trim()) {
        setError(`Please enter ${fieldLabel(key).toLowerCase()}.`);
        return;
      }
    }
    if (!displayName.trim()) {
      setError('Enter a name for this asset.');
      return;
    }
    setLoading(true);
    try {
      const body = {
        assetType: selectedAssetType,
        displayName: displayName.trim(),
        details: buildAssetDetails(selectedAssetType, assetFields),
        estimatedValue: estimatedValue.trim()
          ? { amount: Number.parseFloat(estimatedValue), currency: 'ZAR' }
          : null,
      };
      const created = await createAsset(body);
      setAssets((prev) => [created, ...prev]);
      clearAssetDraft();
      setAssetFields({});
      setDisplayName('');
      setEstimatedValue('');
      setStep('review');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ACCOUNT_NOT_ACTIVE') {
        setStep('verify');
      }
      setError(mapUserFacingError(err, { context: 'asset' }));
    } finally {
      setLoading(false);
    }
  }

  const selectedPlan = useMemo(
    () => plans.find((p) => p.id === selectedPlanId || p.slug === policy?.planTier),
    [plans, selectedPlanId, policy],
  );

  const visiblePlans = useMemo(() => {
    const active = plans.filter((p) => p.isActive);
    if (!accountType) return active;
    return active.filter(
      (p) =>
        p.accountTypes.includes('both') ||
        p.accountTypes.includes(accountType),
    );
  }, [plans, accountType]);

  return (
    <OnboardingShell>
      <OnboardingProgress step={step} />

      {error ? <AuthAlert tone="danger" className="mb-td-6">{error}</AuthAlert> : null}

      {step === 'welcome' ? (
        <>
          <h1 className="display-lg text-td-ink">Welcome to TD IT Solution Insurance</h1>
          <p className="body-lg mt-td-3 text-td-ink-muted">
            Protect your valuable assets with flexible insurance and intelligent asset protection.
          </p>
          <div className="mt-td-8 flex flex-col gap-td-3 sm:flex-row">
            <TdButton onClick={() => setStep('account-type')}>Get started</TdButton>
            <TdButton variant="secondary" onClick={() => setStep('signup')}>
              I already have an account
            </TdButton>
          </div>
        </>
      ) : null}

      {step === 'account-type' ? (
        <>
          <h1 className="display-md text-td-ink">Who is this account for?</h1>
          <div className="mt-td-8 grid gap-td-4 sm:grid-cols-2">
            {(['individual', 'business'] as const).map((type) => (
              <TdGlassCard key={type} variant="solid" selected={accountType === type} className="!p-0">
                <button
                  type="button"
                  aria-pressed={accountType === type}
                  className={`block h-full w-full rounded-td-lg p-td-5 text-left ${TD_FOCUS}`}
                  onClick={() => {
                    setAccountType(type);
                    saveAccountType(type);
                  }}
                >
                  <span className="title block capitalize text-td-ink">{type}</span>
                  <span className="body mt-td-2 block text-td-ink-muted">
                    {type === 'individual'
                      ? 'Protect your own vehicles, devices and equipment.'
                      : 'Protect company assets — Business plans available for larger fleets and teams.'}
                  </span>
                </button>
              </TdGlassCard>
            ))}
          </div>
          <div className="mt-td-8 flex gap-td-3">
            <TdButton variant="secondary" onClick={() => setStep('welcome')}>
              Go back
            </TdButton>
            <TdButton disabled={!accountType} onClick={() => setStep('signup')}>
              Continue
            </TdButton>
          </div>
        </>
      ) : null}

      {step === 'signup' ? (
        <>
          <h1 className="display-md text-td-ink">Create your account</h1>
          <p className="body mb-td-6 mt-td-2 text-td-ink-muted">
            {accountType === 'business' ? 'Tell us about your business — ' : 'Tell us about yourself — '}
            start with email and password. Additional profile fields will be collected in a later step.
          </p>
          <form className="space-y-td-4" onSubmit={handleSignup} noValidate>
            <TdTextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <TdTextField
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              help={`At least ${PASSWORD_MIN_LENGTH} characters.`}
              required
            />
            <TdTextField
              label="Confirm password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
            <label className="body flex items-start gap-td-3 text-td-ink-muted">
              <input
                type="checkbox"
                className={`mt-px h-5 w-5 flex-none rounded-td-sm border-td-border-control accent-td-action-primary ${TD_FOCUS}`}
                checked={consentAccepted}
                onChange={(e) => setConsentAccepted(e.target.checked)}
              />
              <span>
                I agree to the <AuthLink to="/terms">Terms</AuthLink> and{' '}
                <AuthLink to="/privacy">Privacy Policy</AuthLink>.
              </span>
            </label>
            <TdButton type="submit" className="w-full" loading={loading}>
              Create account
            </TdButton>
          </form>
          <div className="mt-td-8 border-t border-td-border-subtle pt-td-6">
            <p className="title mb-td-4 text-td-ink">Already registered?</p>
            {mfaChallengeToken && mfaOrigin === 'login' ? (
              <form className="space-y-td-3" onSubmit={handleMfaSubmit} noValidate>
                <p className="body text-td-ink-muted">
                  Enter the 6-digit code from your authenticator app.
                </p>
                <TdTextField
                  label="Authentication code"
                  value={mfaCode}
                  onChange={(e) => onMfaCodeChange(e.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                />
                <TdButton type="submit" variant="secondary" className="w-full" loading={loading}>
                  Verify
                </TdButton>
                <button type="button" className={LINK_BUTTON} onClick={cancelMfa}>
                  Back to email and password
                </button>
              </form>
            ) : (
              <form className="space-y-td-3" onSubmit={handleLogin} noValidate>
                <TdTextField label="Email" type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} />
                <TdTextField
                  label="Password"
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                />
                <TdButton type="submit" variant="secondary" className="w-full" loading={loading}>
                  Log in
                </TdButton>
              </form>
            )}
          </div>
        </>
      ) : null}

      {step === 'verify' ? (
        <>
          <AuthEyebrow>Verify your email</AuthEyebrow>
          <h1 className="display-md text-td-ink">Check your inbox</h1>
          <p className="body mt-td-2 text-td-ink-muted">
            Open the verification link we sent you, then sign in below to continue.
          </p>
          <p className="body mt-td-3 text-td-ink-muted">
            Can&apos;t find it? Check your spam or promotions folder. Verification emails from a new
            domain sometimes land there at first.
          </p>
          <div className="mt-td-6 flex flex-col gap-td-3 sm:flex-row">
            <TdButton
              variant="secondary"
              loading={loading}
              onClick={async () => {
                setError(null);
                setLoading(true);
                try {
                  await resendVerificationEmail(email.trim() || auth.account?.email || '');
                } catch (err) {
                  setError(mapUserFacingError(err, { context: 'verify' }));
                } finally {
                  setLoading(false);
                }
              }}
            >
              Resend email
            </TdButton>
          </div>
          {mfaChallengeToken && mfaOrigin === 'verify' ? (
            <form className="mt-td-6 space-y-td-3" onSubmit={handleMfaSubmit} noValidate>
              <p className="title text-td-ink">Enter your authenticator code</p>
              <TdTextField
                label="Authentication code"
                value={mfaCode}
                onChange={(e) => onMfaCodeChange(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                required
              />
              <TdButton type="submit" className="w-full" loading={loading}>
                Verify
              </TdButton>
              <button type="button" className={LINK_BUTTON} onClick={cancelMfa}>
                Back to email and password
              </button>
            </form>
          ) : (
            <form className="mt-td-6 space-y-td-3" onSubmit={handleVerifiedSignIn} noValidate>
              <p className="title text-td-ink">Verified? Sign in to continue</p>
              <TdTextField label="Email" type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} />
              <TdTextField
                label="Password"
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
              />
              <TdButton type="submit" className="w-full" loading={loading}>
                I&apos;ve verified — continue
              </TdButton>
            </form>
          )}
          {error ? <AuthAlert tone="warning" className="mt-td-4">{error}</AuthAlert> : null}
          <p className="body mt-td-6 text-td-ink-muted">
            Already verified? <AuthLink to="/login">Sign in</AuthLink> or{' '}
            <AuthLink to="/auth/email-verified" state={{ email: email.trim() || auth.account?.email }}>
              open the confirmation page
            </AuthLink>
            .
          </p>
        </>
      ) : null}

      {step === 'plan' ? (
        <>
          <h1 className="display-lg text-td-ink">Choose an insurance plan</h1>
          <p className="body-lg mt-td-3 text-td-ink-muted">
            Select the plan that matches how many devices you want to protect. Prices are shown for planning — payment is configured in a later step.
          </p>
          {plansLoading ? <p className="body mt-td-4 text-td-ink-muted">Loading plans…</p> : null}
          <div className="mt-td-8 grid items-end gap-td-5 sm:grid-cols-2 lg:grid-cols-4">
            {visiblePlans.map((plan) => (
              <PlanMarketingCard
                key={plan.id}
                plan={plan}
                icon={ONBOARDING_PLAN_ICONS[plan.slug] ?? ShieldCheckIcon}
                onSelect={() => void handleSelectPlan(plan)}
                loading={loading && selectedPlanId === plan.id}
                selected={selectedPlanId === plan.id}
              />
            ))}
          </div>
        </>
      ) : null}

      {step === 'asset-category' ? (
        <>
          <h1 className="display-lg text-td-ink">What would you like to protect?</h1>
          <p className="body-lg mt-td-3 text-td-ink-muted">
            Pick a category to register your first asset. You can add more after this step.
          </p>
          <div className="mt-td-8 grid grid-cols-2 gap-td-4 sm:grid-cols-4">
            {ASSET_CATEGORY_OPTIONS.map((opt) => (
              <AssetBadge
                key={opt.api}
                type={opt.badge as BadgeAssetType}
                size="md"
                selected={selectedAssetType === opt.api}
                onClick={() => {
                  setSelectedAssetType(opt.api);
                  setStep('asset-form');
                }}
              />
            ))}
          </div>
          {assets.length > 0 ? (
            <div className="mt-td-8">
              <TdButton variant="secondary" onClick={() => setStep('review')}>
                Skip to review ({assets.length} asset{assets.length === 1 ? '' : 's'})
              </TdButton>
            </div>
          ) : null}
        </>
      ) : null}

      {step === 'asset-form' && selectedAssetType ? (
        <>
          <h1 className="display-md text-td-ink">Register your asset</h1>
          <form className="mt-td-6 space-y-td-4" onSubmit={handleRegisterAsset} noValidate>
            <TdTextField
              label="Asset name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              help="e.g. MacBook Pro, Toyota Corolla"
              required
            />
            {requiredFieldsForType(selectedAssetType).map((key) => (
              <TdTextField
                key={key}
                label={fieldLabel(key)}
                value={assetFields[key] ?? ''}
                onChange={(e) => {
                  const next = { ...assetFields, [key]: e.target.value };
                  setAssetFields(next);
                  saveAssetDraft(next);
                }}
                required
              />
            ))}
            <TdTextField
              label="Estimated value (ZAR, optional)"
              value={estimatedValue}
              onChange={(e) => setEstimatedValue(e.target.value)}
            />
            <div className="flex flex-col gap-td-3 sm:flex-row">
              <TdButton type="button" variant="secondary" onClick={() => setStep('asset-category')}>
                Go back
              </TdButton>
              <TdButton type="submit" loading={loading}>
                Save asset
              </TdButton>
            </div>
          </form>
        </>
      ) : null}

      {step === 'review' ? (
        <>
          <h1 className="display-md text-td-ink">Your protection summary</h1>
          <TdGlassCard variant="solid" className="mt-td-6 space-y-td-4 border-td-border-subtle bg-td-bg-sunken shadow-none">
            <div>
              <p className="body-sm font-bold uppercase tracking-wide text-td-ink-muted">Account</p>
              <p className="body text-td-ink">{auth.account?.email ?? email}</p>
            </div>
            <div>
              <p className="body-sm font-bold uppercase tracking-wide text-td-ink-muted">Plan</p>
              <p className="body text-td-ink">
                {selectedPlan?.name ?? policy?.planTier ?? '—'}{' '}
                {selectedPlan ? `(${formatPlanPrice(selectedPlan)})` : null}
              </p>
              <p className="body-sm mt-td-2 font-semibold text-td-accent-text">
                Pending activation — payment not configured yet
              </p>
            </div>
            <div>
              <p className="body-sm font-bold uppercase tracking-wide text-td-ink-muted">Protected assets</p>
              {assets.length === 0 ? (
                <p className="body text-td-ink-muted">No assets registered yet.</p>
              ) : (
                <ul className="body mt-td-2 space-y-td-1 text-td-ink">
                  {assets.map((a) => (
                    <li key={a.id}>
                      {a.displayName} <span className="text-td-ink-muted">({a.assetType.replace(/_/g, ' ')})</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </TdGlassCard>
          <AuthAlert tone="info" className="mt-td-6">
            Insurance activation and monthly billing will be completed once payment integration is live. Your
            assets are registered and linked to your account.
          </AuthAlert>
          <div className="mt-td-8 flex flex-wrap gap-td-3">
            <TdButton variant="secondary" onClick={() => setStep('asset-category')}>
              Add another asset
            </TdButton>
            <TdButton variant="primary" onClick={() => setStep('complete')}>
              Continue
            </TdButton>
          </div>
        </>
      ) : null}

      {step === 'complete' ? (
        <>
          <AuthEyebrow>Onboarding complete</AuthEyebrow>
          <h1 className="display-md text-td-ink">You&apos;re set up</h1>
          <p className="body mt-td-2 text-td-ink-muted">
            Your account, plan and assets are saved. Download the mobile app for theft reporting and recovery tools on the go.
          </p>
          <div className="mt-td-8 flex flex-col gap-td-3 sm:flex-row">
            <TdButton onClick={() => navigate('/dashboard')}>Go to dashboard</TdButton>
            <TdButton variant="secondary" onClick={() => navigate('/#mobile-app')}>
              Get the app
            </TdButton>
          </div>
        </>
      ) : null}
    </OnboardingShell>
  );
}
