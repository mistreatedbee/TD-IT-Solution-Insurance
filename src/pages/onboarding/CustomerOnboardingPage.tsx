import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Badge, Button, Card, Input, SectionHeading } from '../../components';
import { ArrowLink } from '../../components/ArrowLink';
import { AssetBadge, type AssetType as BadgeAssetType } from '../../components/AssetBadge';
import { InlineAlert } from '../../dashboard/components/ui';
import { createAsset, listAssets, type Asset, type AssetType } from '../../customer/api/assets';
import { ApiError } from '../../customer/api/errors';
import { createPolicy, listPolicies, type Policy } from '../../customer/api/policies';
import { formatPlanPrice, listPlans, type PlanCatalogItem } from '../../customer/api/plans';
import { useCustomerAuth } from '../../customer/auth/CustomerAuthProvider';
import { resendSignupVerification, signUpWithSupabase } from '../../customer/supabase/auth';
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
import {
  clearPendingSignupAuth,
  loadPendingSignupAuth,
  savePendingSignupAuth,
} from '../../onboarding/pendingSignupAuth';
import { OnboardingProgress } from './OnboardingProgress';
import { OnboardingShell } from './OnboardingShell';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN_LENGTH = 10;

const POLL_INTERVAL_MS = 10_000;

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
      .then((res) => setPlans(res.data))
      .catch(() => setPlans([]))
      .finally(() => setPlansLoading(false));
  }, [step]);

  const tryAdvanceFromVerification = useCallback(async (): Promise<boolean> => {
    if (auth.status === 'signed-in') {
      const me = await auth.refreshAccount();
      if (me?.accountState === 'active') {
        clearPendingSignupAuth();
        setStep('plan');
        setError(null);
        return true;
      }
    }

    const creds = loadPendingSignupAuth();
    if (!creds) return false;

    try {
      const result = await auth.loginWithPassword(creds.email, creds.password);
      if (result.kind === 'tokens') {
        await auth.signInWithTokens(result.accessToken, result.refreshToken);
        const me = await auth.refreshAccount();
        if (me?.accountState === 'active') {
          clearPendingSignupAuth();
          setStep('plan');
          setError(null);
          return true;
        }
      }
    } catch {
      /* still pending */
    }
    return false;
  }, [auth]);

  useEffect(() => {
    if (step !== 'verify') return;

    void tryAdvanceFromVerification();
    const timer = window.setInterval(() => {
      void tryAdvanceFromVerification();
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [step, tryAdvanceFromVerification]);

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
      const result = await signUpWithSupabase(trimmed, password);
      if (result === 'already_verified') {
        navigate('/auth/email-verified', { replace: true, state: { email: trimmed } });
        return;
      }
      savePendingSignupAuth(trimmed, password);
      setStep('verify');
    } catch (err) {
      setError(mapUserFacingError(err, { context: 'signup' }));
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
      } else {
        setError('Additional verification is required. Use the mobile app or contact support.');
      }
    } catch (err) {
      setError(mapUserFacingError(err, { context: 'auth' }));
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectPlan(plan: PlanCatalogItem) {
    if (plan.isCustomPricing) {
      window.location.href = `mailto:${COMPANY_CONTACT.email}?subject=Enterprise%20plan%20quote`;
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
                    : 'Protect company assets — enterprise plans available for larger fleets.'}
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
            subtitle="Open the verification link we sent you — we will continue automatically once it is confirmed."
          />
          <p className="mt-3 text-sm text-text-secondary">
            Can&apos;t find it? Check your spam or promotions folder. Verification emails from a new
            domain sometimes land there at first.
          </p>
          <p className="mt-2 text-sm text-text-secondary">
            We check every few seconds — no need to refresh your inbox.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Button
              variant="secondary"
              loading={loading}
              onClick={async () => {
                setError(null);
                setLoading(true);
                try {
                  await resendSignupVerification(email.trim() || auth.account?.email || '');
                } catch (err) {
                  setError(mapUserFacingError(err, { context: 'verify' }));
                } finally {
                  setLoading(false);
                }
              }}
            >
              Resend email
            </Button>
            <Button
              loading={loading}
              onClick={async () => {
                setLoading(true);
                setError(null);
                try {
                  const advanced = await tryAdvanceFromVerification();
                  if (!advanced) {
                    setError(
                      'Still waiting for verification — open the link in your email first, then try again.',
                    );
                  }
                } finally {
                  setLoading(false);
                }
              }}
            >
              I&apos;ve verified — continue
            </Button>
          </div>
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
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {plans.map((plan) => (
              <Card
                key={plan.id}
                className={`flex flex-col p-0 overflow-hidden ${selectedPlanId === plan.id ? 'ring-2 ring-primary' : ''}`}
              >
                <div className="bg-primary px-4 py-3 text-white">
                  <p className="font-bold">{plan.name}</p>
                  <p className="text-sm text-white/80">{plan.tagline}</p>
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <p className="text-2xl font-bold text-text-primary">{formatPlanPrice(plan)}</p>
                  <ul className="mt-3 flex-1 space-y-1 text-sm text-text-secondary">
                    {plan.features.map((f) => (
                      <li key={f}>• {f}</li>
                    ))}
                  </ul>
                  <Button
                    className="mt-4"
                    variant={plan.isCustomPricing ? 'secondary' : 'primary'}
                    fullWidth
                    loading={loading && selectedPlanId === plan.id}
                    onClick={() => void handleSelectPlan(plan)}
                  >
                    {plan.isCustomPricing ? 'Request a quote' : 'Select plan'}
                  </Button>
                </div>
              </Card>
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
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
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
