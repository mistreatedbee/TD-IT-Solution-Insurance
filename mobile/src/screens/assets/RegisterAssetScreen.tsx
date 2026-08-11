/**
 * Register asset — POST /v1/assets with type-specific details payload.
 */
import { useRouter, type Href } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useCreateAssetMutation } from '../../api/hooks/useAssets';
import type { AssetType, CreateAssetRequest } from '../../api/assets';
import { ApiError } from '../../api/errors';
import { ASSET_TYPE_OPTIONS } from '../../lib/asset-labels';
import { Alert, Button, FormField, Input, Screen, SelectChipGroup } from '../../theme/primitives';
import { colors, spacing, typography } from '../../theme/tokens';

type DetailFields = Record<string, string>;

const VEHICLE_FIELDS = ['make', 'model', 'year', 'vin', 'licensePlate', 'color'] as const;
const SMARTPHONE_FIELDS = ['brand', 'model', 'imei', 'serialNumber'] as const;
const LAPTOP_FIELDS = ['brand', 'model', 'serialNumber', 'operatingSystem'] as const;
const GENERIC_FIELDS = ['category', 'brand', 'model', 'serialNumber', 'description'] as const;

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

export function RegisterAssetScreen() {
  const router = useRouter();
  const createMutation = useCreateAssetMutation();
  const [assetType, setAssetType] = useState<AssetType>('vehicle');
  const [displayName, setDisplayName] = useState('');
  const [detailFields, setDetailFields] = useState<DetailFields>({});
  const [formError, setFormError] = useState<string | undefined>();

  const visibleFields = useMemo(() => fieldsForType(assetType), [assetType]);
  const required = useMemo(() => requiredFieldsForType(assetType), [assetType]);

  function updateDetail(field: string, value: string) {
    setDetailFields((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit() {
    const name = displayName.trim();
    if (!name) {
      setFormError('Enter a display name for this asset.');
      return;
    }

    for (const field of required) {
      if (!detailFields[field]?.trim()) {
        setFormError(`Enter ${labelForField(field).toLowerCase()}.`);
        return;
      }
    }

    if (assetType === 'vehicle') {
      const year = Number.parseInt(detailFields.year ?? '', 10);
      if (Number.isNaN(year)) {
        setFormError('Enter a valid year.');
        return;
      }
    }

    setFormError(undefined);

    try {
      const body: CreateAssetRequest = {
        assetType,
        displayName: name,
        details: buildDetails(assetType, detailFields),
      };
      const asset = await createMutation.mutateAsync(body);
      if (asset.id) {
        router.replace(`/assets/${asset.id}` as Href);
      } else {
        router.back();
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ACCOUNT_NOT_ACTIVE') {
        setFormError('Your account must be verified and active before registering assets.');
      }
    }
  }

  const submitError =
    createMutation.error instanceof ApiError && createMutation.error.code !== 'ACCOUNT_NOT_ACTIVE'
      ? createMutation.error.message
      : undefined;

  return (
    <Screen>
      <Text style={styles.title}>Register asset</Text>

      {(formError || submitError) ? (
        <View style={styles.alertSpacing}>
          <Alert tone="danger">{formError ?? submitError}</Alert>
        </View>
      ) : null}

      <FormField label="Asset type" required>
        <SelectChipGroup
          options={ASSET_TYPE_OPTIONS}
          value={assetType}
          onChange={(value) => {
            setAssetType(value);
            setDetailFields({});
          }}
        />
      </FormField>

      <Input
        label="Display name"
        value={displayName}
        onChangeText={setDisplayName}
        placeholder="e.g. My Toyota Corolla"
        required
      />

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

      <Button fullWidth loading={createMutation.isPending} onPress={handleSubmit}>
        Register asset
      </Button>
      <Button variant="tertiary" onPress={() => router.back()}>
        Cancel
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: typography.sizes['2xl'],
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  sectionLabel: {
    fontSize: typography.sizes.sm,
    fontWeight: '600',
    color: colors.slate[800],
    marginBottom: spacing.sm,
  },
  alertSpacing: {
    marginBottom: spacing.lg,
  },
});
