/**
 * Customer onboarding wizard — mirrors web /get-started flow.
 */
import { useRouter, type Href } from 'expo-router';
import {
  BriefcaseIcon,
  CheckIcon,
  ShieldCheckIcon,
  UserIcon,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { createAsset, listAssets, type Asset, type AssetType } from '../../api/assets';
import { login, resendVerification, signup, isMfaChallenge } from '../../api/auth';
import { ApiError } from '../../api/errors';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import {
  assetLimitUpgradeMessage,
  formatAssetUsage,
  formatPlanPrice,
  listPlans,
  type PlanCatalogItem,
} from '../../api/plans';
import { PlanCatalogPicker } from '../policy/PlanCatalogPicker';
import { createPolicy, listPolicies, type Policy } from '../../api/policies';
import { setRefreshToken } from '../../auth/secure-storage';
import { getDeviceName, getOrCreateDeviceId } from '../../auth/device';
import { useSessionStore } from '../../auth/session-store';
import { useAccountQuery, fetchLiveAccountForGating } from '../../auth/useAccountQuery';
import { COMPANY_CONTACT } from '../../lib/companyContact';
import { formatAssetType } from '../../lib/asset-labels';
import {
  ASSET_CATEGORY_OPTIONS,
  buildAssetDetails,
  fieldLabel,
  requiredFieldsForType,
} from '../../onboarding/assetFormConfig';
import { TrackingConnectionDiagram } from '../../onboarding/marketing/components/TrackingConnectionDiagram';
import { OnboardingProgress } from '../../onboarding/OnboardingProgress';
import {
  clearAssetDraft,
  loadAccountType,
  loadAssetDraft,
  loadSignupProfileDraft,
  markOnboardingComplete,
  saveAccountType,
  saveAssetDraft,
  saveSignupProfileDraft,
  type AccountType,
  type OnboardingStep,
} from '../../onboarding/onboardingStorage';
import { Alert, Badge, Button, Card, Input, Screen } from '../../theme/primitives';
import { colors, minTouchTarget, spacing, typography } from '../../theme/tokens';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN_LENGTH = 10;
const MOBILE_PATTERN = /^\+?[0-9\s-]{9,15}$/;

type SignupSubStep = 'name' | 'contact' | 'password';

function resolveInitialStep(
  signedIn: boolean,
  accountState: string | undefined,
  hasPolicy: boolean,
): OnboardingStep {
  if (!signedIn) return 'welcome';
  if (accountState === 'pending_verification') return 'verify';
  if (!hasPolicy) return 'plan';
  return 'asset-category';
}

export interface CustomerOnboardingScreenProps {
  /** When true, user is authenticated — skip account creation steps on resume. */
  signedIn?: boolean;
  /** Skip marketing welcome — start at account type selection. */
  skipWelcome?: boolean;
}

export function CustomerOnboardingScreen({
  signedIn: signedInProp,
  skipWelcome = false,
}: CustomerOnboardingScreenProps) {
  const router = useRouter();
  const sessionStatus = useSessionStore((s) => s.status);
  const setSignedIn = useSessionStore((s) => s.setSignedIn);
  const signedIn = signedInProp ?? sessionStatus === 'signed-in';
  const { data: account } = useAccountQuery();

  const [step, setStep] = useState<OnboardingStep>(skipWelcome ? 'account-type' : 'welcome');
  const [signupSubStep, setSignupSubStep] = useState<SignupSubStep>('name');
  const [accountType, setAccountType] = useState<AccountType | null>(null);
  const [plans, setPlans] = useState<PlanCatalogItem[]>([]);
  const [plansLoaded, setPlansLoaded] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedAssetType, setSelectedAssetType] = useState<AssetType | null>(null);
  const [assetFields, setAssetFields] = useState<Record<string, string>>({});
  const [displayName, setDisplayName] = useState('');
  const [estimatedValue, setEstimatedValue] = useState('');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshData = useCallback(async () => {
    if (!signedIn) return;
    try {
      const [policiesRes, assetsRes] = await Promise.all([listPolicies(), listAssets()]);
      setPolicy(policiesRes.data?.[0] ?? null);
      setAssets(assetsRes.data ?? []);
    } catch {
      /* non-fatal */
    }
  }, [signedIn]);

  useEffect(() => {
    let cancelled = false;
    void loadAccountType().then((type) => {
      if (!cancelled) setAccountType(type);
    });
    void loadAssetDraft().then((draft) => {
      if (draft && !cancelled) setAssetFields(draft);
    });
    void loadSignupProfileDraft().then((draft) => {
      if (!draft || cancelled) return;
      setFirstName(draft.firstName);
      setLastName(draft.lastName);
      setMobile(draft.mobile);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    void (async () => {
      try {
        const [policiesRes, assetsRes] = await Promise.all([listPolicies(), listAssets()]);
        if (cancelled) return;
        const firstPolicy = policiesRes.data?.[0] ?? null;
        setPolicy(firstPolicy);
        setAssets(assetsRes.data ?? []);
        setStep((prev) => {
          if (prev === 'complete') return prev;
          if (prev === 'welcome' || prev === 'account-type' || prev === 'signup') {
            return resolveInitialStep(true, account?.accountState, Boolean(firstPolicy));
          }
          return prev;
        });
      } catch {
        /* non-fatal */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn, account?.accountState]);

  useEffect(() => {
    if (step !== 'plan' || !signedIn || plansLoaded) return;
    let cancelled = false;
    void listPlans()
      .then((res) => {
        if (!cancelled) {
          setPlans(res.data);
          setPlansLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPlans([]);
          setPlansLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [step, signedIn, plansLoaded]);

  async function handleSignup() {
    setError(null);
    const trimmed = email.trim();
    if (!firstName.trim() || !lastName.trim()) {
      setError('Enter your first and last name.');
      return;
    }
    if (!EMAIL_PATTERN.test(trimmed)) {
      setError('Enter a valid email address.');
      return;
    }
    if (mobile.trim() && !MOBILE_PATTERN.test(mobile.trim())) {
      setError('Enter a valid mobile number.');
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
      await saveSignupProfileDraft({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        mobile: mobile.trim(),
      });
      await signup({ email: trimmed, password, consentAccepted: true });
      setStep('verify');
    } catch (err) {
      setError(mapUserFacingError(err, { context: 'signup' }));
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin() {
    setError(null);
    setLoading(true);
    try {
      const deviceId = await getOrCreateDeviceId();
      const deviceName = getDeviceName();
      const result = await login({
        email: loginEmail.trim(),
        password: loginPassword,
        deviceId,
        deviceName,
      });

      if (isMfaChallenge(result)) {
        setError('MFA is required — complete sign-in from the Log in screen.');
        router.push({
          pathname: '/(auth)/mfa-challenge',
          params: { mfaChallengeToken: result.mfaChallengeToken },
        });
        return;
      }

      await setRefreshToken(result.refreshToken);
      setSignedIn({ accessToken: result.accessToken, sessionId: result.sessionId });
      const [policiesRes, assetsRes] = await Promise.all([listPolicies(), listAssets()]);
      const firstPolicy = policiesRes.data?.[0] ?? null;
      setPolicy(firstPolicy);
      setAssets(assetsRes.data ?? []);
      const live = await fetchLiveAccountForGating();
      setStep(resolveInitialStep(true, live.accountState, Boolean(firstPolicy)));
    } catch (err) {
      setError(mapUserFacingError(err, { context: 'auth' }));
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectPlan(plan: PlanCatalogItem) {
    if (plan.isCustomPricing) {
      void Linking.openURL(
        `mailto:${COMPANY_CONTACT.email}?subject=${encodeURIComponent('Business plan quote')}`,
      );
      return;
    }
    setSelectedPlanId(plan.id);
    setLoading(true);
    setError(null);
    try {
      const created = await createPolicy({ planCatalogId: plan.id, planTier: plan.slug });
      setPolicy(created);
      setStep('asset-category');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'PLAN_REQUIRES_QUOTE') {
        setError('Business plans require a custom quote. Contact us to continue.');
      } else {
        setError(mapUserFacingError(err, { context: 'policy' }));
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleRegisterAsset() {
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
    if (selectedAssetType === 'vehicle') {
      const year = Number.parseInt(assetFields.year ?? '', 10);
      if (Number.isNaN(year)) {
        setError('Enter a valid year.');
        return;
      }
    }
    setLoading(true);
    try {
      const body = {
        assetType: selectedAssetType,
        displayName: displayName.trim(),
        details: buildAssetDetails(selectedAssetType, assetFields),
        ...(estimatedValue.trim()
          ? { estimatedValue: { amount: Number.parseFloat(estimatedValue), currency: 'ZAR' as const } }
          : {}),
      };
      const created = await createAsset(body as Parameters<typeof createAsset>[0]);
      setAssets((prev) => [created, ...prev]);
      await clearAssetDraft();
      setAssetFields({});
      setDisplayName('');
      setEstimatedValue('');
      setStep('review');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ASSET_LIMIT_REACHED') {
        setError(assetLimitUpgradeMessage(selectedPlan));
      } else if (err instanceof ApiError && err.code === 'ACCOUNT_NOT_ACTIVE') {
        setStep('verify');
        setError('Verify your email before registering assets.');
      } else {
        setError(mapUserFacingError(err, { context: 'asset' }));
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleFinish() {
    await markOnboardingComplete();
    setStep('complete');
  }

  async function handleGoToApp() {
    await markOnboardingComplete();
    router.replace('/(app)');
  }

  const selectedPlan = useMemo(
    () => plans.find((p) => p.id === selectedPlanId || p.slug === policy?.planTier),
    [plans, selectedPlanId, policy],
  );

  return (
    <Screen>
      <OnboardingProgress step={step} />

      {error ? (
        <View style={styles.alertSpacing}>
          <Alert tone="danger">{error}</Alert>
        </View>
      ) : null}

      {step === 'welcome' ? (
        <>
          <Text style={styles.title}>Welcome to TD IT Solution Insurance</Text>
          <Text style={styles.subtitle}>
            Protect your valuable assets with flexible insurance and intelligent asset protection.
          </Text>
          <View style={styles.actions}>
            <Button size="lg" fullWidth onPress={() => setStep('account-type')}>
              Get Started
            </Button>
            <Button variant="secondary" size="lg" fullWidth onPress={() => router.push('/(auth)/login')}>
              I already have an account
            </Button>
          </View>
        </>
      ) : null}

      {step === 'account-type' ? (
        <>
          <Text style={styles.titleMd}>Who are you protecting?</Text>
          <Text style={styles.subtitle}>Choose the account type that best describes you.</Text>
          <View style={styles.cardGrid}>
            {(
              [
                {
                  type: 'individual' as const,
                  title: 'My personal assets',
                  body: 'Protect your own vehicles, devices and equipment.',
                  Icon: UserIcon,
                },
                {
                  type: 'business' as const,
                  title: 'My business assets',
                  body: 'Protect company assets — Business plans available for larger fleets.',
                  Icon: BriefcaseIcon,
                },
              ] as const
            ).map(({ type, title, body, Icon }) => (
              <Pressable
                key={type}
                accessibilityRole="button"
                onPress={() => {
                  setAccountType(type);
                  void saveAccountType(type);
                }}
                style={[
                  styles.typeCard,
                  accountType === type && styles.typeCardSelected,
                ]}
              >
                <View style={styles.typeIconWrap}>
                  <Icon size={24} color={colors.primary} />
                </View>
                <Text style={styles.typeCardTitle}>{title}</Text>
                <Text style={styles.typeCardBody}>{body}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.rowActions}>
            <Button variant="secondary" onPress={() => (skipWelcome ? router.back() : setStep('welcome'))}>
              Back
            </Button>
            <Button disabled={!accountType} onPress={() => setStep('signup')}>
              Continue
            </Button>
          </View>
        </>
      ) : null}

      {step === 'signup' ? (
        <>
          {signupSubStep === 'name' ? (
            <>
              <Text style={styles.titleMd}>Let&apos;s get to know you</Text>
              <Text style={styles.hint}>We&apos;ll use your name to personalise your protection experience.</Text>
              <Input label="First name" value={firstName} onChangeText={setFirstName} required autoCapitalize="words" />
              <Input label="Last name" value={lastName} onChangeText={setLastName} required autoCapitalize="words" />
              <Button
                fullWidth
                onPress={() => {
                  if (!firstName.trim() || !lastName.trim()) {
                    setError('Enter your first and last name.');
                    return;
                  }
                  setError(null);
                  void saveSignupProfileDraft({
                    firstName: firstName.trim(),
                    lastName: lastName.trim(),
                    mobile: mobile.trim(),
                  });
                  setSignupSubStep('contact');
                }}
              >
                Continue
              </Button>
            </>
          ) : null}
          {signupSubStep === 'contact' ? (
            <>
              <Text style={styles.titleMd}>How can we reach you?</Text>
              <Text style={styles.hint}>We&apos;ll send verification and important alerts to your email.</Text>
              <Input label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" required />
              <Input label="Mobile number" value={mobile} onChangeText={setMobile} keyboardType="phone-pad" hint="Optional — for future SMS alerts." />
              <View style={styles.rowActions}>
                <Button variant="secondary" onPress={() => setSignupSubStep('name')}>
                  Back
                </Button>
                <Button
                  onPress={() => {
                    if (!EMAIL_PATTERN.test(email.trim())) {
                      setError('Enter a valid email address.');
                      return;
                    }
                    if (mobile.trim() && !MOBILE_PATTERN.test(mobile.trim())) {
                      setError('Enter a valid mobile number.');
                      return;
                    }
                    setError(null);
                    setSignupSubStep('password');
                  }}
                >
                  Continue
                </Button>
              </View>
            </>
          ) : null}
          {signupSubStep === 'password' ? (
            <>
              <Text style={styles.titleMd}>Secure your account</Text>
              <Input label="Password" value={password} onChangeText={setPassword} type="password" hint={`At least ${PASSWORD_MIN_LENGTH} characters.`} required />
              <Input label="Confirm password" value={confirmPassword} onChangeText={setConfirmPassword} type="password" required />
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: consentAccepted }}
                onPress={() => setConsentAccepted((v) => !v)}
                style={styles.consentRow}
              >
                <View style={[styles.checkbox, consentAccepted && styles.checkboxChecked]}>
                  {consentAccepted ? <CheckIcon size={14} color="#FFFFFF" /> : null}
                </View>
                <Text style={styles.consentText}>I agree to the Terms and Privacy Policy.</Text>
              </Pressable>
              <View style={styles.rowActions}>
                <Button variant="secondary" onPress={() => setSignupSubStep('contact')}>
                  Back
                </Button>
                <Button loading={loading} onPress={() => void handleSignup()}>
                  Create account
                </Button>
              </View>
            </>
          ) : null}

          <Text style={styles.sectionDivider}>Already registered?</Text>
          <Button variant="tertiary" fullWidth onPress={() => router.push('/(auth)/login')}>
            Log in instead
          </Button>
        </>
      ) : null}

      {step === 'verify' ? (
        <>
          <Badge tone="warning">Verify your account</Badge>
          <Text style={[styles.titleMd, styles.mtMd]}>
            {firstName.trim()
              ? `Almost there, ${firstName.trim()}`
              : 'Check your inbox'}
          </Text>
          <Text style={styles.subtitle}>
            Open the verification link we sent to your email, then continue below.
          </Text>
          <View style={styles.actions}>
            <Button
              variant="secondary"
              loading={loading}
              onPress={async () => {
                setLoading(true);
                try {
                  await resendVerification(email.trim() || account?.email || '');
                } catch (err) {
                  setError(mapUserFacingError(err, { context: 'verify' }));
                } finally {
                  setLoading(false);
                }
              }}
            >
              Resend email
            </Button>
            {signedIn ? (
              <Button
                onPress={async () => {
                  await refreshData();
                  try {
                    const live = await fetchLiveAccountForGating();
                    if (live.accountState === 'active') setStep('plan');
                    else setError('Still waiting for verification — open the link in your email first.');
                  } catch {
                    setError('Could not verify account status. Try again.');
                  }
                }}
              >
                I&apos;ve verified — continue
              </Button>
            ) : null}
          </View>
          {!signedIn ? (
            <>
              <Text style={styles.sectionDivider}>Already verified? Log in to continue</Text>
              <Input label="Email" value={loginEmail} onChangeText={setLoginEmail} keyboardType="email-address" autoCapitalize="none" />
              <Input label="Password" value={loginPassword} onChangeText={setLoginPassword} type="password" />
              <Button fullWidth loading={loading} onPress={() => void handleLogin()}>
                Log in and continue
              </Button>
            </>
          ) : null}
        </>
      ) : null}

      {step === 'plan' ? (
        <>
          <Text style={styles.titleMd}>Choose an insurance plan</Text>
          <Text style={styles.subtitle}>
            Select the plan that matches how many devices you want to protect. Payment is configured in a later step.
          </Text>
          {step === 'plan' && !plansLoaded ? <Text style={styles.hint}>Loading plans…</Text> : null}
          {plans.length > 0 ? (
            <PlanCatalogPicker
              plans={plans}
              selectedPlanId={selectedPlanId}
              loadingPlanId={loading ? selectedPlanId : null}
              onSelectPlan={(plan) => void handleSelectPlan(plan)}
            />
          ) : plansLoaded ? (
            <Alert tone="info">No plans are available right now. Please try again later.</Alert>
          ) : null}
        </>
      ) : null}

      {step === 'asset-category' ? (
        <>
          <Text style={styles.titleMd}>Let&apos;s protect your first asset</Text>
          <Text style={styles.subtitle}>What would you like to protect?</Text>
          <View style={styles.categoryGrid}>
            {ASSET_CATEGORY_OPTIONS.map((opt) => (
              <Pressable
                key={opt.api}
                accessibilityRole="button"
                onPress={() => {
                  setSelectedAssetType(opt.api);
                  setStep('asset-form');
                }}
                style={[
                  styles.categoryChip,
                  selectedAssetType === opt.api && styles.categoryChipSelected,
                ]}
              >
                <View style={styles.categoryIconWrap}>
                  <opt.Icon size={22} color={colors.primary} />
                </View>
                <Text style={styles.categoryLabel}>{opt.label}</Text>
              </Pressable>
            ))}
          </View>
          {assets.length > 0 ? (
            <Button variant="secondary" onPress={() => setStep('review')}>
              {`Skip to review (${assets.length} asset${assets.length === 1 ? '' : 's'})`}
            </Button>
          ) : null}
        </>
      ) : null}

      {step === 'asset-form' && selectedAssetType ? (
        <>
          <Text style={styles.titleMd}>
            {ASSET_CATEGORY_OPTIONS.find((o) => o.api === selectedAssetType)?.prompt ??
              'Register your asset'}
          </Text>
          <Input
            label="Asset name"
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="e.g. MacBook Pro, Toyota Corolla"
            required
          />
          {requiredFieldsForType(selectedAssetType).map((key) => (
            <Input
              key={key}
              label={fieldLabel(key)}
              value={assetFields[key] ?? ''}
              onChangeText={(v) => {
                const next = { ...assetFields, [key]: v };
                setAssetFields(next);
                void saveAssetDraft(next);
              }}
              required
              keyboardType={key === 'year' ? 'number-pad' : 'default'}
              autoCapitalize="none"
            />
          ))}
          <Input
            label="Estimated value (ZAR, optional)"
            value={estimatedValue}
            onChangeText={setEstimatedValue}
            keyboardType="decimal-pad"
          />
          <View style={styles.rowActions}>
            <Button variant="secondary" onPress={() => setStep('asset-category')}>
              Back
            </Button>
            <Button
              onPress={() => {
                if (!displayName.trim()) {
                  setError('Enter a name for this asset.');
                  return;
                }
                const required = requiredFieldsForType(selectedAssetType);
                for (const key of required) {
                  if (!assetFields[key]?.trim()) {
                    setError(`Please enter ${fieldLabel(key).toLowerCase()}.`);
                    return;
                  }
                }
                setError(null);
                setStep('tracking-info');
              }}
            >
              Continue
            </Button>
          </View>
        </>
      ) : null}

      {step === 'tracking-info' ? (
        <>
          <Text style={styles.titleMd}>Connect your protection</Text>
          <Text style={styles.subtitle}>
            Some assets can be paired with a compatible tracking device for additional protection.
          </Text>
          <TrackingConnectionDiagram />
          <Text style={styles.hint}>
            Tracking depends on compatible hardware, device assignment and connectivity. Not every insured asset
            includes tracking.
          </Text>
          <View style={styles.rowActions}>
            <Button variant="secondary" onPress={() => setStep('asset-form')}>
              Back
            </Button>
            <Button loading={loading} onPress={() => void handleRegisterAsset()}>
              Register asset
            </Button>
          </View>
        </>
      ) : null}

      {step === 'review' ? (
        <>
          <Text style={styles.titleMd}>Your protection summary</Text>
          <Card padding="md" style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Account</Text>
            <Text style={styles.summaryValue}>{account?.email ?? email}</Text>
            <Text style={[styles.summaryLabel, styles.mtMd]}>Plan</Text>
            <Text style={styles.summaryValue}>
              {selectedPlan?.name ?? policy?.planTier ?? '—'}
              {selectedPlan ? ` (${formatPlanPrice(selectedPlan)})` : ''}
            </Text>
            {selectedPlan?.maxAssets != null ? (
              <Text style={styles.hint}>
                Asset allowance: {formatAssetUsage(assets.length, selectedPlan.maxAssets)}
              </Text>
            ) : null}
            <View style={styles.mtSm}>
              <Badge tone="warning">Pending activation — payment not configured yet</Badge>
            </View>
            <Text style={[styles.summaryLabel, styles.mtMd]}>Protected assets</Text>
            {assets.length === 0 ? (
              <Text style={styles.hint}>No assets registered yet.</Text>
            ) : (
              assets.map((a) => (
                <Text key={a.id} style={styles.assetLine}>
                  {a.displayName}{' '}
                  <Text style={styles.hint}>({a.assetType ? formatAssetType(a.assetType) : 'asset'})</Text>
                </Text>
              ))
            )}
          </Card>
          <Alert tone="info" style={styles.mtMd}>
            Insurance activation and monthly billing will be completed once payment integration is live.
          </Alert>
          <View style={styles.actions}>
            {selectedPlan?.maxAssets != null && assets.length >= selectedPlan.maxAssets ? (
              <>
                <Alert tone="warning">
                  {assetLimitUpgradeMessage(selectedPlan)} View upgrade options from your plan tab
                  after setup.
                </Alert>
                <Button variant="secondary" onPress={() => router.push('/(app)/policy' as Href)}>
                  View upgrade options
                </Button>
              </>
            ) : (
              <Button variant="secondary" onPress={() => setStep('asset-category')}>
                Add another asset
              </Button>
            )}
            <Button onPress={() => void handleFinish()}>Continue</Button>
          </View>
        </>
      ) : null}

      {step === 'complete' ? (
        <>
          <View style={styles.successIconWrap}>
            <ShieldCheckIcon size={40} color={colors.success} />
          </View>
          <Badge tone="emerald">You&apos;re protected</Badge>
          <Text style={[styles.titleMd, styles.mtMd]}>
            {firstName.trim() ? `Welcome, ${firstName.trim()}` : 'Welcome to TD IT Solution Insurance'}
          </Text>
          <Text style={styles.subtitle}>
            Your asset has been successfully added to your account. Manage your protection from the app.
          </Text>
          <Card padding="md" style={styles.summaryCard}>
            <SuccessRow label="Insurance" value="Active" pending />
            <SuccessRow label="Asset" value="Registered" done />
            <SuccessRow label="Tracking" value="Pending setup" pending />
          </Card>
          <Button fullWidth onPress={() => void handleGoToApp()}>
            Go to my protection
          </Button>
        </>
      ) : null}
    </Screen>
  );
}

function SuccessRow({
  label,
  value,
  done,
  pending,
}: {
  label: string;
  value: string;
  done?: boolean;
  pending?: boolean;
}) {
  return (
    <View style={successRowStyles.row}>
      <Text style={successRowStyles.label}>{label}</Text>
      <View style={successRowStyles.valueWrap}>
        {done ? <CheckIcon size={14} color={colors.success} /> : null}
        <Text
          style={[
            successRowStyles.value,
            done && successRowStyles.valueDone,
            pending && successRowStyles.valuePending,
          ]}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

const successRowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  label: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  valueWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  value: {
    fontSize: typography.sizes.sm,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  valueDone: { color: colors.success },
  valuePending: { color: colors.tones.warning.text },
});

const styles = StyleSheet.create({
  title: {
    fontSize: typography.sizes['2xl'],
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  titleMd: {
    fontSize: typography.sizes.xl,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: typography.sizes.base,
    color: colors.textSecondary,
    lineHeight: typography.sizes.base * 1.4,
    marginBottom: spacing.lg,
  },
  hint: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  actions: {
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  rowActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  alertSpacing: {
    marginBottom: spacing.lg,
  },
  cardGrid: {
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  typeCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.lg,
    minHeight: minTouchTarget * 2,
  },
  typeCardSelected: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  typeIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  typeCardTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  typeCardBody: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.lg,
    minHeight: minTouchTarget,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  consentText: {
    flex: 1,
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  sectionDivider: {
    fontSize: typography.sizes.sm,
    fontWeight: '600',
    color: colors.textPrimary,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  mtMd: { marginTop: spacing.md },
  mtSm: { marginTop: spacing.sm },
  planCard: {
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  planHeader: {
    backgroundColor: colors.primary,
    padding: spacing.md,
  },
  planName: {
    fontSize: typography.sizes.base,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  planTagline: {
    fontSize: typography.sizes.sm,
    color: 'rgba(255,255,255,0.85)',
    marginTop: spacing.xs,
  },
  planBody: {
    padding: spacing.md,
  },
  planPrice: {
    fontSize: typography.sizes['2xl'],
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  planFeature: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  planButton: {
    marginTop: spacing.md,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  categoryChip: {
    width: '47%',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md,
    minHeight: minTouchTarget * 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryIconWrap: {
    marginBottom: spacing.sm,
  },
  categoryChipSelected: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  categoryLabel: {
    fontSize: typography.sizes.sm,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  summaryCard: {
    marginTop: spacing.md,
  },
  summaryLabel: {
    fontSize: typography.sizes.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: colors.textSecondary,
  },
  summaryValue: {
    fontSize: typography.sizes.base,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  assetLine: {
    fontSize: typography.sizes.sm,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  successIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.tones.success.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
});
