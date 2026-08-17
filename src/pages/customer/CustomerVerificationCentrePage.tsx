import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, SectionHeading } from '../../components';
import { InlineAlert, LoadingState, StatusBadge } from '../../dashboard/components/ui';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import { getCustomerProfile, verificationStatusLabel } from '../../customer/api/profile';
import { listPolicies } from '../../customer/api/policies';
import { listAssets } from '../../customer/api/assets';
import { getAccountMe } from '../../customer/api/auth';
import {
  deriveVerificationCentreItems,
  partitionVerificationItems,
} from '../../customer/tracking/deriveVerificationCentreItems';
import { submitProfileVerification } from '../../customer/api/profile';

export function CustomerVerificationCentrePage() {
  const [profile, setProfile] = useState<Awaited<ReturnType<typeof getCustomerProfile>> | null>(
    null,
  );
  const [account, setAccount] = useState<Awaited<ReturnType<typeof getAccountMe>> | null>(null);
  const [policies, setPolicies] = useState<Awaited<ReturnType<typeof listPolicies>>['data']>([]);
  const [assetCount, setAssetCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getCustomerProfile(), getAccountMe(), listPolicies(), listAssets()])
      .then(([p, a, policyPage, assetPage]) => {
        if (cancelled) return;
        setProfile(p);
        setAccount(a);
        setPolicies(policyPage.data);
        setAssetCount(assetPage.data.length);
      })
      .catch((err) => setError(mapUserFacingError(err)))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const items = useMemo(() => {
    if (!profile) return [];
    return deriveVerificationCentreItems({
      accountState: account?.accountState,
      email: account?.email,
      verificationStatus: profile.verificationStatus,
      verificationSubmittedAt: profile.verificationSubmittedAt,
      completionChecklist: profile.completionChecklist,
      policies,
      assetCount,
    });
  }, [profile, account, policies, assetCount]);

  const { pending, complete } = useMemo(() => partitionVerificationItems(items), [items]);

  async function handleSubmit() {
    setSubmitError(null);
    setSubmitting(true);
    try {
      const updated = await submitProfileVerification();
      setProfile(updated);
    } catch (err) {
      setSubmitError(mapUserFacingError(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <LoadingState />;
  if (error || !profile) {
    return <InlineAlert tone="danger">{error ?? 'Could not load verification centre.'}</InlineAlert>;
  }

  const canSubmit =
    profile.verificationStatus === 'in_progress' ||
    profile.verificationStatus === 'not_started' ||
    profile.verificationStatus === 'rejected' ||
    profile.verificationStatus === 'action_required';

  return (
    <div className="space-y-6">
      <div>
        <SectionHeading as="h1" title="Verification centre" size="md" className="mb-2" />
        <p className="text-sm text-text-secondary">
          Track everything still pending for your account — email, profile, identity review,
          protection plans, and asset registration — in one place.
        </p>
      </div>

      <Card padding="md">
        <p className="text-xs text-text-secondary">Overall setup</p>
        <p className="text-2xl font-bold text-text-primary">{profile.completionPercent}% complete</p>
        <p className="mt-1 text-sm text-text-secondary">
          {pending.length === 0
            ? 'All setup steps are complete.'
            : `${pending.length} item${pending.length === 1 ? '' : 's'} still pending or in review.`}
        </p>
      </Card>

      {profile.rejectionReasonCustomerSafe ? (
        <InlineAlert tone="warning">{profile.rejectionReasonCustomerSafe}</InlineAlert>
      ) : null}

      <SectionHeading as="h2" title={`Pending & in review (${pending.length})`} size="sm" />
      {pending.length === 0 ? (
        <InlineAlert tone="info">
          Nothing is waiting on you right now. Your identity status is{' '}
          {verificationStatusLabel(profile.verificationStatus).toLowerCase()}.
        </InlineAlert>
      ) : (
        <div className="space-y-3">
          {pending.map((item) => (
            <Card key={item.id} padding="md">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase text-text-secondary">{item.category}</p>
                  <p className="font-semibold text-text-primary">{item.title}</p>
                </div>
                <StatusBadge value={item.statusLabel} />
              </div>
              <p className="mt-2 text-sm text-text-secondary">{item.description}</p>
              {item.meta ? <p className="mt-1 text-xs text-text-secondary">{item.meta}</p> : null}
              {item.href ? (
                <Link to={item.href} className="mt-3 inline-block text-sm font-semibold text-primary hover:underline">
                  View details
                </Link>
              ) : null}
            </Card>
          ))}
        </div>
      )}

      {complete.length > 0 ? (
        <>
          <SectionHeading as="h2" title={`Completed (${complete.length})`} size="sm" />
          <div className="space-y-3">
            {complete.map((item) => (
              <Card key={item.id} padding="md">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase text-text-secondary">{item.category}</p>
                    <p className="font-semibold text-text-primary">{item.title}</p>
                  </div>
                  <StatusBadge value={item.statusLabel} />
                </div>
                <p className="mt-2 text-sm text-text-secondary">{item.description}</p>
              </Card>
            ))}
          </div>
        </>
      ) : null}

      <SectionHeading as="h2" title="Identity submission" size="sm" />
      <Card padding="md" className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-text-secondary">Current status</span>
          <StatusBadge value={verificationStatusLabel(profile.verificationStatus)} />
        </div>
        {profile.idNumberMasked ? (
          <p className="text-sm text-text-primary">ID on file: {profile.idNumberMasked}</p>
        ) : null}
        {submitError ? <InlineAlert tone="danger">{submitError}</InlineAlert> : null}
        {profile.verificationStatus === 'verified' ? (
          <InlineAlert tone="info">Your identity is verified. No further action needed.</InlineAlert>
        ) : profile.verificationStatus === 'pending_review' ? (
          <InlineAlert tone="info">
            Your identity details are with our team. We will notify you when review is complete.
          </InlineAlert>
        ) : (
          <div className="flex flex-wrap gap-3">
            <Button disabled={!canSubmit || submitting} onClick={() => void handleSubmit()}>
              {submitting ? 'Submitting…' : 'Submit identity for review'}
            </Button>
            <Link to="/dashboard/profile">
              <Button variant="secondary">Edit profile details</Button>
            </Link>
          </div>
        )}
      </Card>
    </div>
  );
}
