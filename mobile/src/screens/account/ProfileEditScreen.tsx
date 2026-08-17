/**
 * Profile edit — personal details, address, emergency contact, ID number.
 */
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { CustomerProfile, UpdateCustomerProfileRequest } from '../../api/customer-profile';
import { verificationStatusLabel } from '../../api/customer-profile';
import {
  useCustomerProfileQuery,
  useUpdateCustomerProfileMutation,
} from '../../api/hooks/useCustomerProfile';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import { FLOATING_TAB_BAR_CLEARANCE } from '../../navigation/tabBarMetrics';
import { Alert, Badge, Button, Card, Input, Screen } from '../../theme/primitives';
import { colors, spacing, typography } from '../../theme/tokens';

type ProfileFieldErrors = {
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  phone?: string;
  idNumber?: string;
  line1?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  emergencyName?: string;
  emergencyRelationship?: string;
  emergencyPhone?: string;
};

const PHONE_PATTERN = /^\+?[0-9\s()-]{7,20}$/;

function applyProfileToForm(
  profile: CustomerProfile,
  setters: {
    setFirstName: (value: string) => void;
    setMiddleName: (value: string) => void;
    setLastName: (value: string) => void;
    setDateOfBirth: (value: string) => void;
    setPhone: (value: string) => void;
    setLine1: (value: string) => void;
    setLine2: (value: string) => void;
    setCity: (value: string) => void;
    setProvince: (value: string) => void;
    setPostalCode: (value: string) => void;
    setEmergencyName: (value: string) => void;
    setEmergencyRelationship: (value: string) => void;
    setEmergencyPhone: (value: string) => void;
  },
) {
  setters.setFirstName(profile.firstName ?? '');
  setters.setMiddleName(profile.middleName ?? '');
  setters.setLastName(profile.lastName ?? '');
  setters.setDateOfBirth(profile.dateOfBirth ?? '');
  setters.setPhone(profile.phone ?? '');
  setters.setLine1(profile.residentialAddress?.line1 ?? '');
  setters.setLine2(profile.residentialAddress?.line2 ?? '');
  setters.setCity(profile.residentialAddress?.city ?? '');
  setters.setProvince(profile.residentialAddress?.province ?? '');
  setters.setPostalCode(profile.residentialAddress?.postalCode ?? '');
  setters.setEmergencyName(profile.emergencyContact?.name ?? '');
  setters.setEmergencyRelationship(profile.emergencyContact?.relationship ?? '');
  setters.setEmergencyPhone(profile.emergencyContact?.phone ?? '');
}

function validateProfileForm(input: {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  phone: string;
  idNumber: string;
  line1: string;
  city: string;
  province: string;
  postalCode: string;
  emergencyName: string;
  emergencyRelationship: string;
  emergencyPhone: string;
}): ProfileFieldErrors {
  const errors: ProfileFieldErrors = {};

  if (!input.firstName.trim()) errors.firstName = 'First name is required.';
  if (!input.lastName.trim()) errors.lastName = 'Last name is required.';

  const phone = input.phone.trim();
  if (!phone) {
    errors.phone = 'Phone number is required.';
  } else if (!PHONE_PATTERN.test(phone)) {
    errors.phone = 'Enter a valid phone number (at least 7 digits).';
  }

  const dob = input.dateOfBirth.trim();
  if (dob && !/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
    errors.dateOfBirth = 'Use YYYY-MM-DD format.';
  }

  const id = input.idNumber.trim();
  if (id && !/^[0-9]{13}$/.test(id)) {
    errors.idNumber = 'South African ID must be 13 digits.';
  }

  if (!input.line1.trim()) errors.line1 = 'Street address is required.';
  if (!input.city.trim()) errors.city = 'City is required.';
  if (!input.province.trim()) errors.province = 'Province is required.';
  if (!input.postalCode.trim()) errors.postalCode = 'Postal code is required.';

  if (!input.emergencyName.trim()) errors.emergencyName = 'Emergency contact name is required.';
  if (!input.emergencyRelationship.trim()) {
    errors.emergencyRelationship = 'Relationship is required.';
  }

  const emergencyPhone = input.emergencyPhone.trim();
  if (!emergencyPhone) {
    errors.emergencyPhone = 'Emergency contact phone is required.';
  } else if (!PHONE_PATTERN.test(emergencyPhone)) {
    errors.emergencyPhone = 'Enter a valid phone number.';
  }

  return errors;
}

function statusTone(status: CustomerProfile['verificationStatus']) {
  switch (status) {
    case 'verified':
      return 'emerald' as const;
    case 'pending_review':
      return 'gold' as const;
    case 'rejected':
      return 'danger' as const;
    case 'action_required':
      return 'warning' as const;
    default:
      return 'neutral' as const;
  }
}

export function ProfileEditScreen() {
  const router = useRouter();
  const profileQuery = useCustomerProfileQuery();
  const updateMutation = useUpdateCustomerProfileMutation();

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
  const [fieldErrors, setFieldErrors] = useState<ProfileFieldErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    const profile = profileQuery.data;
    if (!profile) return;
    applyProfileToForm(profile, {
      setFirstName,
      setMiddleName,
      setLastName,
      setDateOfBirth,
      setPhone,
      setLine1,
      setLine2,
      setCity,
      setProvince,
      setPostalCode,
      setEmergencyName,
      setEmergencyRelationship,
      setEmergencyPhone,
    });
  }, [profileQuery.data]);

  async function handleSave() {
    setSaveError(null);
    setSaveSuccess(false);

    const errors = validateProfileForm({
      firstName,
      lastName,
      dateOfBirth,
      phone,
      idNumber,
      line1,
      city,
      province,
      postalCode,
      emergencyName,
      emergencyRelationship,
      emergencyPhone,
    });

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setSaveError('Please fix the highlighted fields and try again.');
      return;
    }

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

    if (idNumber.trim()) {
      body.idNumber = idNumber.trim();
    }

    try {
      const updated = await updateMutation.mutateAsync(body);
      applyProfileToForm(updated, {
        setFirstName,
        setMiddleName,
        setLastName,
        setDateOfBirth,
        setPhone,
        setLine1,
        setLine2,
        setCity,
        setProvince,
        setPostalCode,
        setEmergencyName,
        setEmergencyRelationship,
        setEmergencyPhone,
      });
      setIdNumber('');
      setFieldErrors({});
      setSaveSuccess(true);
    } catch (err) {
      setSaveError(mapUserFacingError(err, { context: 'profile' }));
    }
  }

  if (profileQuery.isLoading) {
    return (
      <Screen scroll={false} safeAreaEdges={['bottom']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </Screen>
    );
  }

  if (profileQuery.isError || !profileQuery.data) {
    return (
      <Screen safeAreaEdges={['bottom']}>
        <Alert tone="danger">
          {mapUserFacingError(profileQuery.error, { context: 'profile' })}
        </Alert>
        <Button variant="secondary" onPress={() => profileQuery.refetch()}>
          Try again
        </Button>
      </Screen>
    );
  }

  const profile = profileQuery.data;

  return (
    <Screen
      safeAreaEdges={['bottom']}
      contentContainerStyle={{ paddingBottom: FLOATING_TAB_BAR_CLEARANCE + spacing.lg }}
    >
      <Card style={styles.summaryCard} padding="md">
        <View style={styles.summaryRow}>
          <View>
            <Text style={styles.summaryLabel}>Profile completion</Text>
            <Text style={styles.summaryValue}>{profile.completionPercent}%</Text>
          </View>
          <Badge tone={statusTone(profile.verificationStatus)}>
            {verificationStatusLabel(profile.verificationStatus)}
          </Badge>
        </View>
      </Card>

      <Text style={styles.heading}>Personal details</Text>

      {profile.idNumberMasked ? (
        <Text style={styles.maskedId}>ID on file: {profile.idNumberMasked}</Text>
      ) : null}

      <Input
        label="First name"
        required
        value={firstName}
        onChangeText={setFirstName}
        error={fieldErrors.firstName}
      />
      <Input label="Middle name" value={middleName} onChangeText={setMiddleName} />
      <Input
        label="Last name"
        required
        value={lastName}
        onChangeText={setLastName}
        error={fieldErrors.lastName}
      />
      <Input
        label="Date of birth"
        hint="YYYY-MM-DD"
        value={dateOfBirth}
        onChangeText={setDateOfBirth}
        placeholder="1990-01-01"
        error={fieldErrors.dateOfBirth}
      />
      <Input
        label="Phone"
        required
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        error={fieldErrors.phone}
      />
      <Input
        label="South African ID number"
        type="password"
        value={idNumber}
        onChangeText={setIdNumber}
        keyboardType="number-pad"
        maxLength={13}
        error={fieldErrors.idNumber}
        hint={
          profile.idNumberMasked
            ? 'Enter a new 13-digit ID only if you need to update it.'
            : '13 digits — only the last four are shown after saving.'
        }
      />

      <Text style={styles.sectionHeading}>Residential address</Text>
      <Input
        label="Street address"
        required
        value={line1}
        onChangeText={setLine1}
        error={fieldErrors.line1}
      />
      <Input label="Apartment / unit" value={line2} onChangeText={setLine2} />
      <Input
        label="City"
        required
        value={city}
        onChangeText={setCity}
        error={fieldErrors.city}
      />
      <Input
        label="Province"
        required
        value={province}
        onChangeText={setProvince}
        error={fieldErrors.province}
      />
      <Input
        label="Postal code"
        required
        value={postalCode}
        onChangeText={setPostalCode}
        error={fieldErrors.postalCode}
      />

      <Text style={styles.sectionHeading}>Emergency contact</Text>
      <Input
        label="Full name"
        required
        value={emergencyName}
        onChangeText={setEmergencyName}
        error={fieldErrors.emergencyName}
      />
      <Input
        label="Relationship"
        required
        value={emergencyRelationship}
        onChangeText={setEmergencyRelationship}
        error={fieldErrors.emergencyRelationship}
      />
      <Input
        label="Phone"
        required
        value={emergencyPhone}
        onChangeText={setEmergencyPhone}
        keyboardType="phone-pad"
        error={fieldErrors.emergencyPhone}
      />

      {saveError ? <Alert tone="danger">{saveError}</Alert> : null}
      {saveSuccess ? (
        <Alert tone="success">Profile saved. You can submit for verification when ready.</Alert>
      ) : null}

      <Button
        fullWidth
        onPress={() => void handleSave()}
        disabled={updateMutation.isPending}
        style={styles.saveButton}
      >
        {updateMutation.isPending ? 'Saving…' : 'Save profile'}
      </Button>

      <Button
        variant="secondary"
        fullWidth
        onPress={() => router.push('/(app)/account/verification')}
        style={styles.secondaryButton}
      >
        Go to verification centre
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryCard: {
    marginBottom: spacing.lg,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  summaryLabel: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  summaryValue: {
    fontSize: typography.sizes['2xl'],
    fontWeight: '700',
    color: colors.textPrimary,
  },
  heading: {
    fontSize: typography.sizes.lg,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  sectionHeading: {
    fontSize: typography.sizes.base,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  maskedId: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  saveButton: {
    marginTop: spacing.lg,
  },
  secondaryButton: {
    marginTop: spacing.md,
  },
});
