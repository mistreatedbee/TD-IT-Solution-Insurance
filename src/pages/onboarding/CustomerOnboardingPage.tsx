import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  BriefcaseIcon,
  CrownIcon,
  ShieldCheckIcon,
  SparklesIcon,
  type LucideIcon,
} from 'lucide-react';
import { Button, Badge, Card, Input, SectionHeading } from '../../components';
import { PlanMarketingCard } from '../../components/PlanMarketingCard';
import { ArrowLink } from '../../components/ArrowLink';
import { AssetBadge, type AssetType as BadgeAssetType } from '../../components/AssetBadge';
import { InlineAlert } from '../../dashboard/components/ui';
import { createAsset, listAssets, type Asset, type AssetType } from '../../customer/api/assets';
import { ApiError } from '../../customer/api/errors';
import { createPolicy, listPolicies, type Policy } from '../../customer/api/policies';
import { formatPlanPrice, listPlans, type PlanCatalogItem } from '../../customer/api/plans';
import { useCustomerAuth } from '../../customer/auth/CustomerAuthProvider';
import { resendVerificationEmail, signup } from '../../customer/api/auth';
import { mapUserFacingError } from '../../lib/user-facing-errors';
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
  async function handleMfaSubmit(e: FormEvent) {
    e.preventDefault();
    if (!mfaChallengeToken) return;
    setError(null);
    setLoading(true);
    try {
      await auth.completeMfa(mfaChallengeToken, mfaCode.trim());
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
      setError(mapUserFacingError(err, { context: 'mfa' }));
    } finally {
      setLoading(false);
    }
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

      {error ? (
        <div className="mb-6">
          <InlineAlert tone="danger">{error}</InlineAlert>
        </div>
      ) : null}

      {step === 'welcome' ? (
        <>
          <SectionHeading
            as="h1"
            align="left"
            title="Welcome to TD IT Solution Insurance"
            subtitle="Protect your valuable assets with flexible insurance and intelligent asset protection."
          />
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button size="lg" onClick={() => setStep('account-type')}>
              Get Started
            </Button>
            <Button variant="secondary" size="lg" onClick={() => setStep('signup')}>
              I already have an account
            </Button>
          </div>
        </>
      ) : null}

      {step === 'account-type' ? (
        <>
          <SectionHeading as="h1" align="left" title="Who is this account for?" size="md" />
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {(['individual', 'business'] as const).map((type) => (
              <Card
                key={type}
                interactive
                className={`cursor-pointer p-6 ${accountType === type ? 'ring-2 ring-primary' : ''}`}
                onClick={() => {
                  setAccountType(type);
                  saveAccountType(type);
                }}
              >
                <p className="text-lg font-bold text-text-primary capitalize">{type}</p>
                <p className="mt-2 text-sm text-text-secondary">
                  {type === 'individual'
                    ? 'Protect your own vehicles, devices and equipment.'
                    : 'Protect company assets — Business plans available for larger fleets and teams.'}
                </p>
              </Card>
            ))}
          </div>
          <div className="mt-8 flex gap-3">
            <Button variant="secondary" onClick={() => setStep('welcome')}>
              Back
            </Button>
            <Button disabled={!accountType} onClick={() => setStep('signup')}>
              Continue
            </Button>
          </div>
        </>
      ) : null}

      {step === 'signup' ? (
        <>
          <SectionHeading as="h1" align="left" title="Create your account" size="md" />
          <p className="mb-6 text-sm text-text-secondary">
            {accountType === 'business' ? 'Tell us about your business — ' : 'Tell us about yourself — '}
            start with email and password. Additional profile fields will be collected in a later step.
          </p>
          <form className="space-y-4" onSubmit={handleSignup} noValidate>
            <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
              required
            />
            <Input
              label="Confirm password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
            <label className="flex items-start gap-3 text-sm text-text-secondary">
              <input
                type="checkbox"
                className="mt-1"
                checked={consentAccepted}
                onChange={(e) => setConsentAccepted(e.target.checked)}
              />
              <span>
                I agree to the <ArrowLink href="/terms">Terms</ArrowLink> and{' '}
                <ArrowLink href="/privacy">Privacy Policy</ArrowLink>.
              </span>
            </label>
            <Button type="submit" fullWidth loading={loading}>
              Create account
            </Button>
          </form>
          <div className="mt-8 border-t border-border pt-6">
            <p className="mb-4 text-sm font-semibold text-text-primary">Already registered?</p>
            {mfaChallengeToken && mfaOrigin === 'login' ? (
              <form className="space-y-3" onSubmit={handleMfaSubmit} noValidate>
                <p className="text-sm text-text-secondary">
                  Enter the 6-digit code from your authenticator app.
                </p>
                <Input
                  label="Authentication code"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                />
                <Button type="submit" variant="secondary" fullWidth loading={loading}>
                  Verify
                </Button>
                <button
                  type="button"
                  className="w-full text-sm text-text-secondary hover:text-text-primary"
                  onClick={cancelMfa}
                >
                  Back to email and password
                </button>
              </form>
            ) : (
              <form className="space-y-3" onSubmit={handleLogin} noValidate>
                <Input label="Email" type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} />
                <Input
                  label="Password"
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                />
                <Button type="submit" variant="secondary" fullWidth loading={loading}>
                  Log in
                </Button>
              </form>
            )}
          </div>
        </>
      ) : null}

      {step === 'verify' ? (
        <>
          <Badge tone="gold">Verify your email</Badge>
          <SectionHeading
            as="h1"
            title="Check your inbox"
            size="md"
            className="mt-4"
            subtitle="Open the verification link we sent you, then sign in below to continue."
          />
          <p className="mt-3 text-sm text-text-secondary">
            Can&apos;t find it? Check your spam or promotions folder. Verification emails from a new
            domain sometimes land there at first.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Button
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
            </Button>
          </div>
          {mfaChallengeToken && mfaOrigin === 'verify' ? (
            <form className="mt-6 space-y-3" onSubmit={handleMfaSubmit} noValidate>
              <p className="text-sm font-semibold text-text-primary">Enter your authenticator code</p>
              <Input
                label="Authentication code"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
              />
              <Button type="submit" fullWidth loading={loading}>
                Verify
              </Button>
              <button
                type="button"
                className="w-full text-sm text-text-secondary hover:text-text-primary"
                onClick={cancelMfa}
              >
                Back to email and password
              </button>
            </form>
          ) : (
            <form className="mt-6 space-y-3" onSubmit={handleVerifiedSignIn} noValidate>
              <p className="text-sm font-semibold text-text-primary">Verified? Sign in to continue</p>
              <Input label="Email" type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} />
              <Input
                label="Password"
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
              />
              <Button type="submit" fullWidth loading={loading}>
                I&apos;ve verified — continue
              </Button>
            </form>
          )}
          {error ? (
            <div className="mt-4">
              <InlineAlert tone="warning">{error}</InlineAlert>
            </div>
          ) : null}
          <p className="mt-6 text-sm text-text-secondary">
            Already verified?{' '}
            <Link to="/login" className="font-semibold text-primary hover:underline">
              Sign in
            </Link>{' '}
            or{' '}
            <Link
              to="/auth/email-verified"
              className="font-semibold text-primary hover:underline"
              state={{ email: email.trim() || auth.account?.email }}
            >
              open the confirmation page
            </Link>
            .
          </p>
        </>
      ) : null}

      {step === 'plan' ? (
        <>
          <SectionHeading
            as="h1"
            align="left"
            title="Choose an insurance plan"
            subtitle="Select the plan that matches how many devices you want to protect. Prices are shown for planning — payment is configured in a later step."
          />
          {plansLoading ? <p className="text-sm text-text-secondary">Loading plans…</p> : null}
          <div className="mt-8 grid items-end gap-5 sm:grid-cols-2 lg:grid-cols-4">
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
          <SectionHeading
            as="h1"
            align="left"
            title="What would you like to protect?"
            subtitle="Pick a category to register your first asset. You can add more after this step."
          />
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
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
            <div className="mt-8">
              <Button variant="secondary" onClick={() => setStep('review')}>
                Skip to review ({assets.length} asset{assets.length === 1 ? '' : 's'})
              </Button>
            </div>
          ) : null}
        </>
      ) : null}

      {step === 'asset-form' && selectedAssetType ? (
        <>
          <SectionHeading as="h1" align="left" title="Register your asset" size="md" />
          <form className="mt-6 space-y-4" onSubmit={handleRegisterAsset} noValidate>
            <Input
              label="Asset name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. MacBook Pro, Toyota Corolla"
              required
            />
            {requiredFieldsForType(selectedAssetType).map((key) => (
              <Input
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
            <Input
              label="Estimated value (ZAR, optional)"
              value={estimatedValue}
              onChange={(e) => setEstimatedValue(e.target.value)}
            />
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button type="button" variant="secondary" onClick={() => setStep('asset-category')}>
                Back
              </Button>
              <Button type="submit" loading={loading}>
                Save asset
              </Button>
            </div>
          </form>
        </>
      ) : null}

      {step === 'review' ? (
        <>
          <SectionHeading as="h1" align="left" title="Your protection summary" size="md" />
          <Card className="mt-6 space-y-4 p-6">
            <div>
              <p className="text-xs font-semibold uppercase text-text-secondary">Account</p>
              <p className="text-text-primary">{auth.account?.email ?? email}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-text-secondary">Plan</p>
              <p className="text-text-primary">
                {selectedPlan?.name ?? policy?.planTier ?? '—'}{' '}
                {selectedPlan ? `(${formatPlanPrice(selectedPlan)})` : null}
              </p>
              <Badge tone="gold" className="mt-2">
                Pending activation — payment not configured yet
              </Badge>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-text-secondary">Protected assets</p>
              {assets.length === 0 ? (
                <p className="text-sm text-text-secondary">No assets registered yet.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm">
                  {assets.map((a) => (
                    <li key={a.id}>
                      {a.displayName} <span className="text-text-secondary">({a.assetType.replace(/_/g, ' ')})</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
          <div className="mt-6">
            <InlineAlert tone="info">
              Insurance activation and monthly billing will be completed once payment integration is live. Your
              assets are registered and linked to your account.
            </InlineAlert>
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button onClick={() => setStep('asset-category')}>Add another asset</Button>
            <Button variant="primary" onClick={() => setStep('complete')}>
              Continue
            </Button>
          </div>
        </>
      ) : null}

      {step === 'complete' ? (
        <>
          <Badge tone="emerald">Onboarding complete</Badge>
          <SectionHeading
            as="h1"
            title="You're set up"
            size="md"
            className="mt-4"
            subtitle="Your account, plan and assets are saved. Download the mobile app for theft reporting and recovery tools on the go."
          />
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button onClick={() => navigate('/dashboard')}>Go to dashboard</Button>
            <Button variant="secondary" onClick={() => navigate('/#mobile-app')}>
              Get the mobile app
            </Button>
          </div>
        </>
      ) : null}
    </OnboardingShell>
  );
}
