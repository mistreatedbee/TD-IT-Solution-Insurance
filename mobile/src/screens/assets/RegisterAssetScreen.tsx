/**
 * Register asset — type-specific flows with vehicle onboarding (Feature 009 Phase 3).
 */
import { useRouter, type Href } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useCreateAssetMutation } from '../../api/hooks/useAssets';
import type { AssetType, CreateAssetRequest } from '../../api/assets';
import { ApiError } from '../../api/errors';
import { FEATURE_HARDWARE_TRACKING_ENABLED } from '../../config/features';
import { usePlanUsage } from '../../api/hooks/usePlanUsage';
import { assetLimitUpgradeMessage } from '../../api/plans';
import { ASSET_TYPE_OPTIONS } from '../../lib/asset-labels';
import { Alert, Button, FormField, Input, Screen, SelectChipGroup } from '../../theme/primitives';
import { colors, spacing, typography } from '../../theme/tokens';
import { AssetTypeImage } from '../home/assetVisuals';

type DetailFields = Record<string, string>;
type TrackerIntent = 'yes' | 'no' | 'unsure';

const VEHICLE_FIELDS = ['make', 'model', 'year', 'vin', 'licensePlate', 'color'] as const;
const SMARTPHONE_FIELDS = ['brand', 'model', 'imei', 'serialNumber'] as const;
const LAPTOP_FIELDS = ['brand', 'model', 'serialNumber', 'operatingSystem'] as const;
const GENERIC_FIELDS = ['category', 'brand', 'model', 'serialNumber', 'description'] as const;

const TRACKER_OPTIONS: { value: TrackerIntent; label: string }[] = [
  { value: 'yes', label: 'Yes, I have a tracker' },
  { value: 'no', label: 'No tracker yet' },
  { value: 'unsure', label: 'Not sure' },
];

function fieldsForType(type: AssetType): readonly string[] {
  switch (type) {
    case 'vehicle':
      return VEHICLE_FIELDS;
    case 'smartphone':
      return SMARTPHONE_FIELDS;
    case 'laptop':
      return LAPTOP_FIELDS;
    case 'tablet':
    case 'tv':
    case 'desktop':
      return ['brand', 'model', 'serialNumber', 'components'];
    case 'business_equipment':
    case 'other_electronics':
      return GENERIC_FIELDS;
    default:
      return GENERIC_FIELDS;
  }
}

function requiredFieldsForType(type: AssetType): Set<string> {
  switch (type) {
    case 'vehicle':
      return new Set(['make', 'model', 'year', 'vin']);
    case 'smartphone':
      return new Set(['brand', 'model', 'imei']);
    case 'laptop':
    case 'tablet':
    case 'tv':
    case 'desktop':
      return new Set(['brand', 'model', 'serialNumber']);
    case 'business_equipment':
    case 'other_electronics':
      return new Set(['category', 'brand', 'model', 'serialNumber']);
    default:
      return new Set(['brand', 'model', 'serialNumber']);
  }
}

function buildDetails(type: AssetType, fields: DetailFields): CreateAssetRequest['details'] {
  const trim = (key: string) => fields[key]?.trim() ?? '';

  switch (type) {
    case 'vehicle':
      return {
        make: trim('make'),
        model: trim('model'),
        year: Number.parseInt(trim('year'), 10),
        vin: trim('vin'),
        licensePlate: trim('licensePlate') || null,
        color: trim('color') || null,
      };
    case 'smartphone':
      return {
        brand: trim('brand'),
        model: trim('model'),
        imei: trim('imei'),
        serialNumber: trim('serialNumber') || null,
      };
    case 'laptop':
      return {
        brand: trim('brand'),
        model: trim('model'),
        serialNumber: trim('serialNumber'),
        operatingSystem: trim('operatingSystem') || null,
      };
    case 'tablet':
      return {
        brand: trim('brand'),
        model: trim('model'),
        serialNumber: trim('serialNumber'),
      };
    case 'tv':
      return {
        brand: trim('brand'),
        model: trim('model'),
        serialNumber: trim('serialNumber'),
      };
    case 'desktop':
      return {
        brand: trim('brand'),
        model: trim('model'),
        serialNumber: trim('serialNumber'),
        components: trim('components') || null,
      };
    case 'business_equipment':
      return {
        category: trim('category'),
        brand: trim('brand'),
        model: trim('model'),
        serialNumber: trim('serialNumber'),
        description: trim('description') || null,
      };
    case 'other_electronics':
      return {
        category: trim('category'),
        brand: trim('brand'),
        model: trim('model'),
        serialNumber: trim('serialNumber'),
        description: trim('description') || null,
      };
  }
}

function labelForField(field: string): string {
  const labels: Record<string, string> = {
    make: 'Make',
    model: 'Model',
    year: 'Year',
    vin: 'VIN',
    licensePlate: 'License plate',
    color: 'Color',
    brand: 'Brand',
    imei: 'IMEI',
    serialNumber: 'Serial number',
    operatingSystem: 'Operating system',
    category: 'Category',
    description: 'Description',
    components: 'Components',
  };
  return labels[field] ?? field;
}

function vehicleStepCount(hasTrackerStep: boolean): number {
  return hasTrackerStep ? 3 : 2;
}

export function RegisterAssetScreen() {
  const router = useRouter();
  const { currentPlan } = usePlanUsage();
  const createMutation = useCreateAssetMutation();
  const [assetType, setAssetType] = useState<AssetType>('vehicle');
  const [displayName, setDisplayName] = useState('');
  const [detailFields, setDetailFields] = useState<DetailFields>({});
  const [trackerIntent, setTrackerIntent] = useState<TrackerIntent>('unsure');
  const [step, setStep] = useState(0);
  const [formError, setFormError] = useState<string | undefined>();

  const isVehicleFlow = assetType === 'vehicle';
  const totalSteps = vehicleStepCount(isVehicleFlow);
  const visibleFields = useMemo(() => fieldsForType(assetType), [assetType]);
  const required = useMemo(() => requiredFieldsForType(assetType), [assetType]);

  function updateDetail(field: string, value: string) {
    setDetailFields((prev) => ({ ...prev, [field]: value }));
  }

  function validateCurrentStep(): string | undefined {
    if (step === 0) {
      if (!displayName.trim()) return 'Enter a display name for this asset.';
      return undefined;
    }

    if (isVehicleFlow && step === 1) {
      for (const field of required) {
        if (!detailFields[field]?.trim()) {
          return `Enter ${labelForField(field).toLowerCase()}.`;
        }
      }
      const year = Number.parseInt(detailFields.year ?? '', 10);
      if (Number.isNaN(year)) return 'Enter a valid year.';
      return undefined;
    }

    if (!isVehicleFlow) {
      for (const field of required) {
        if (!detailFields[field]?.trim()) {
          return `Enter ${labelForField(field).toLowerCase()}.`;
        }
      }
    }

    return undefined;
  }

  function handleNext() {
    const err = validateCurrentStep();
    if (err) {
      setFormError(err);
      return;
    }
    setFormError(undefined);
    if (step < totalSteps - 1) {
      setStep(step + 1);
    } else {
      void handleSubmit();
    }
  }

  async function handleSubmit() {
    const err = validateCurrentStep();
    if (err) {
      setFormError(err);
      return;
    }

    for (const field of required) {
      if (!detailFields[field]?.trim()) {
        setFormError(`Enter ${labelForField(field).toLowerCase()}.`);
        return;
      }
    }

    setFormError(undefined);

    try {
      const body: CreateAssetRequest = {
        assetType,
        displayName: displayName.trim(),
        details: buildDetails(assetType, detailFields),
      };
      const created = await createMutation.mutateAsync(body);
      if (created.id) {
        if (isVehicleFlow && trackerIntent === 'yes' && FEATURE_HARDWARE_TRACKING_ENABLED) {
          router.replace(`/assets/${created.id}/activate-tracker` as Href);
        } else {
          router.replace(`/assets/${created.id}` as Href);
        }
      } else {
        router.back();
      }
    } catch (submitErr) {
      if (submitErr instanceof ApiError && submitErr.code === 'ACCOUNT_NOT_ACTIVE') {
        setFormError('Your account must be verified and active before registering assets.');
      }
    }
  }

  const submitError =
    createMutation.error instanceof ApiError &&
    createMutation.error.code === 'ACCOUNT_NOT_ACTIVE'
      ? undefined
      : createMutation.error instanceof ApiError &&
          createMutation.error.code === 'ASSET_LIMIT_REACHED'
        ? assetLimitUpgradeMessage(currentPlan)
        : createMutation.error
          ? mapUserFacingError(createMutation.error, { context: 'asset' })
          : undefined;

  const showUpgradeCta =
    createMutation.error instanceof ApiError &&
    createMutation.error.code === 'ASSET_LIMIT_REACHED';

  return (
    <Screen>
      <Text style={styles.title}>Register asset</Text>
      <Text style={styles.progress}>
        Step {step + 1} of {totalSteps}
      </Text>

      {(formError || submitError) ? (
        <View style={styles.alertSpacing}>
          <Alert tone="danger">{formError ?? submitError}</Alert>
          {showUpgradeCta ? (
            <Button
              variant="secondary"
              fullWidth
              onPress={() => router.push('/policy/create' as Href)}
              style={styles.upgradeButton}
            >
              View upgrade options
            </Button>
          ) : null}
        </View>
      ) : null}

      {step === 0 ? (
        <>
          <FormField label="Asset type" required>
            <SelectChipGroup
              options={ASSET_TYPE_OPTIONS}
              value={assetType}
              onChange={(value) => {
                setAssetType(value);
                setDetailFields({});
                setStep(0);
              }}
            />
          </FormField>

          <View style={styles.previewRow}>
            <AssetTypeImage assetType={assetType} size="md" />
            <Text style={styles.previewHint}>
              Choose the type that best matches what you want to protect.
            </Text>
          </View>

          <Input
            label="Display name"
            value={displayName}
            onChangeText={setDisplayName}
            placeholder={
              assetType === 'vehicle' ? 'e.g. My Toyota Corolla' : 'e.g. Work laptop'
            }
            required
          />
        </>
      ) : null}

      {step === 1 && isVehicleFlow ? (
        <>
          <Text style={styles.sectionLabel}>Vehicle details</Text>
          {visibleFields.map((field) => (
            <Input
              key={field}
              label={labelForField(field)}
              value={detailFields[field] ?? ''}
              onChangeText={(v) => updateDetail(field, v)}
              required={required.has(field)}
              keyboardType={field === 'year' ? 'number-pad' : 'default'}
              autoCapitalize="none"
            />
          ))}
        </>
      ) : null}

      {step === 1 && !isVehicleFlow ? (
        <>
          <Text style={styles.sectionLabel}>Details</Text>
          {visibleFields.map((field) => (
            <Input
              key={field}
              label={labelForField(field)}
              value={detailFields[field] ?? ''}
              onChangeText={(v) => updateDetail(field, v)}
              required={required.has(field)}
              keyboardType={field === 'year' ? 'number-pad' : 'default'}
              autoCapitalize="none"
            />
          ))}
        </>
      ) : null}

      {step === 2 && isVehicleFlow ? (
        <>
          <Text style={styles.sectionLabel}>GPS tracker</Text>
          <Text style={styles.sectionHint}>
            Vehicles recover faster with a GPS tracker. Register your device ID after registration
            — live hardware feed activates when our vendor partner goes live.
          </Text>
          <SelectChipGroup
            options={TRACKER_OPTIONS}
            value={trackerIntent}
            onChange={setTrackerIntent}
          />
          {trackerIntent === 'yes' ? (
            <Alert tone="info" style={styles.trackerAlert}>
              After registration you&apos;ll enter your tracker IMEI or serial number to link it to
              this vehicle.
            </Alert>
          ) : null}
          {trackerIntent === 'no' ? (
            <Alert tone="info" style={styles.trackerAlert}>
              You can add a GPS tracker later from the asset command screen.
            </Alert>
          ) : null}
        </>
      ) : null}

      <Button
        fullWidth
        loading={createMutation.isPending}
        onPress={handleNext}
      >
        {step < totalSteps - 1 ? 'Continue' : 'Register asset'}
      </Button>
      {step > 0 ? (
        <Button variant="tertiary" onPress={() => setStep(step - 1)}>
          Back
        </Button>
      ) : (
        <Button variant="tertiary" onPress={() => router.back()}>
          Cancel
        </Button>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: typography.sizes['2xl'],
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  progress: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  sectionLabel: {
    fontSize: typography.sizes.sm,
    fontWeight: '600',
    color: colors.slate[800],
    marginBottom: spacing.sm,
  },
  sectionHint: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    lineHeight: typography.sizes.sm * 1.45,
    marginBottom: spacing.md,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  previewHint: {
    flex: 1,
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    lineHeight: typography.sizes.sm * 1.4,
  },
  trackerAlert: {
    marginTop: spacing.md,
  },
  alertSpacing: {
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  upgradeButton: {
    marginTop: spacing.sm,
  },
});
