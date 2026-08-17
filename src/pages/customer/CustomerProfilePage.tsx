import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, Input, SectionHeading } from '../../components';
import { InlineAlert, LoadingState, StatusBadge } from '../../dashboard/components/ui';
import {
  getCustomerProfile,
  submitProfileVerification,
  updateCustomerProfile,
  verificationStatusLabel,
  type CustomerProfile,
  type UpdateCustomerProfileRequest,
} from '../../customer/api/profile';
import { mapUserFacingError } from '../../lib/user-facing-errors';

export function CustomerProfilePage() {
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [phone, setPhone] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyRelationship, setEmergencyRelationship] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');

  function applyProfile(p: CustomerProfile) {
    setProfile(p);
    setFirstName(p.firstName ?? '');
    setMiddleName(p.middleName ?? '');
    setLastName(p.lastName ?? '');
    setDateOfBirth(p.dateOfBirth ?? '');
    setPhone(p.phone ?? '');
    setLine1(p.residentialAddress?.line1 ?? '');
    setLine2(p.residentialAddress?.line2 ?? '');
    setCity(p.residentialAddress?.city ?? '');
    setProvince(p.residentialAddress?.province ?? '');
    setPostalCode(p.residentialAddress?.postalCode ?? '');
    setEmergencyName(p.emergencyContact?.name ?? '');
    setEmergencyRelationship(p.emergencyContact?.relationship ?? '');
    setEmergencyPhone(p.emergencyContact?.phone ?? '');
  }

  useEffect(() => {
    setIsLoading(true);
    getCustomerProfile()
      .then(applyProfile)
      .catch((err) => setLoadError(mapUserFacingError(err)))
      .finally(() => setIsLoading(false));
  }, []);

  async function handleSave() {
    setSaveError(null);
    setSaveSuccess(false);
    setIsSaving(true);

    const body: UpdateCustomerProfileRequest = {
      firstName: firstName.trim(),
      middleName: middleName.trim() || null,
      lastName: lastName.trim(),
      dateOfBirth: dateOfBirth.trim() || null,
      phone: phone.trim(),
      residentialAddress: {
        line1: line1.trim(),
        line2: line2.trim() || null,
        city: city.trim(),
        province: province.trim(),
        postalCode: postalCode.trim(),
        country: 'ZA',
      },
      emergencyContact: {
        name: emergencyName.trim(),
        relationship: emergencyRelationship.trim(),
        phone: emergencyPhone.trim(),
      },
    };
    if (idNumber.trim()) body.idNumber = idNumber.trim();

    try {
      const updated = await updateCustomerProfile(body);
      applyProfile(updated);
      setIdNumber('');
      setSaveSuccess(true);
    } catch (err) {
      setSaveError(mapUserFacingError(err));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSubmitVerification() {
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const updated = await submitProfileVerification();
      applyProfile(updated);
    } catch (err) {
      setSubmitError(mapUserFacingError(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <LoadingState />
      </div>
    );
  }

  if (loadError || !profile) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <InlineAlert tone="danger">{loadError ?? 'Could not load profile.'}</InlineAlert>
        <Link to="/dashboard/account">
          <Button variant="secondary" size="sm">
            Back to account
          </Button>
        </Link>
      </div>
    );
  }

  const canSubmit =
    profile.verificationStatus === 'in_progress' ||
    profile.verificationStatus === 'not_started' ||
    profile.verificationStatus === 'rejected' ||
    profile.verificationStatus === 'action_required';

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <SectionHeading
        as="h2"
        title="Profile & verification"
        size="md"
        subtitle="Personal details, address, emergency contact, and identity verification."
      />

      <Card padding="lg" interactive={false}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-text-secondary">Profile completion</p>
            <p className="text-2xl font-semibold text-primary">{profile.completionPercent}%</p>
          </div>
          <StatusBadge value={verificationStatusLabel(profile.verificationStatus)} />
        </div>
        <ul className="space-y-1 text-sm text-text-secondary">
          {profile.completionChecklist.map((item) => (
            <li key={item.id}>
              {item.done ? '✓' : '○'} {item.label}
            </li>
          ))}
        </ul>
      </Card>

      {profile.rejectionReasonCustomerSafe ? (
        <InlineAlert tone="warning">{profile.rejectionReasonCustomerSafe}</InlineAlert>
      ) : null}

      <Card padding="lg" interactive={false} className="space-y-4">
        <SectionHeading as="h3" title="Personal details" size="md" />

        {profile.idNumberMasked ? (
          <p className="text-sm text-text-secondary">ID on file: {profile.idNumberMasked}</p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          <Input
            label="Middle name"
            value={middleName}
            onChange={(e) => setMiddleName(e.target.value)}
          />
          <Input
            label="Last name"
            className="sm:col-span-2"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
          <Input
            label="Date of birth"
            value={dateOfBirth}
            onChange={(e) => setDateOfBirth(e.target.value)}
            placeholder="YYYY-MM-DD"
          />
          <Input label="Phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Input
            label="South African ID number"
            className="sm:col-span-2"
            value={idNumber}
            onChange={(e) => setIdNumber(e.target.value)}
            placeholder={profile.idNumberMasked ? 'Enter new ID to update' : '13 digits'}
            type="password"
            autoComplete="off"
            hint="Only the last four digits are shown after saving."
          />
        </div>

        <SectionHeading as="h3" title="Residential address" size="md" className="pt-2" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Street address"
            className="sm:col-span-2"
            value={line1}
            onChange={(e) => setLine1(e.target.value)}
          />
          <Input
            label="Apartment / unit"
            className="sm:col-span-2"
            value={line2}
            onChange={(e) => setLine2(e.target.value)}
          />
          <Input label="City" value={city} onChange={(e) => setCity(e.target.value)} />
          <Input label="Province" value={province} onChange={(e) => setProvince(e.target.value)} />
          <Input
            label="Postal code"
            value={postalCode}
            onChange={(e) => setPostalCode(e.target.value)}
          />
        </div>

        <SectionHeading as="h3" title="Emergency contact" size="md" className="pt-2" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Full name"
            className="sm:col-span-2"
            value={emergencyName}
            onChange={(e) => setEmergencyName(e.target.value)}
          />
          <Input
            label="Relationship"
            value={emergencyRelationship}
            onChange={(e) => setEmergencyRelationship(e.target.value)}
          />
          <Input
            label="Phone"
            type="tel"
            value={emergencyPhone}
            onChange={(e) => setEmergencyPhone(e.target.value)}
          />
        </div>

        {saveError ? <InlineAlert tone="danger">{saveError}</InlineAlert> : null}
        {saveSuccess ? (
          <InlineAlert tone="info">Profile saved successfully.</InlineAlert>
        ) : null}

        <Button onClick={() => void handleSave()} disabled={isSaving}>
          {isSaving ? 'Saving…' : 'Save profile'}
        </Button>
      </Card>

      <Card padding="lg" interactive={false} className="space-y-4">
        <SectionHeading as="h3" title="Identity verification" size="md" />
        <p className="text-sm text-text-secondary">
          Submit your profile for review once all required fields are complete. Document upload is
          not required at this stage.
        </p>

        {submitError ? <InlineAlert tone="danger">{submitError}</InlineAlert> : null}

        {profile.verificationStatus === 'verified' ? (
          <InlineAlert tone="info">Your identity is verified.</InlineAlert>
        ) : profile.verificationStatus === 'pending_review' ? (
          <InlineAlert tone="info">
            Your details are with our team. We will notify you when review is complete.
          </InlineAlert>
        ) : (
          <Button
            variant="secondary"
            onClick={() => void handleSubmitVerification()}
            disabled={!canSubmit || isSubmitting}
          >
            {isSubmitting ? 'Submitting…' : 'Submit for verification'}
          </Button>
        )}
      </Card>

      <Link to="/dashboard/account" className="inline-block text-sm text-primary hover:underline">
        Back to account settings
      </Link>
    </div>
  );
}
