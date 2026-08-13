import type { AssetType } from '../api/assets';

export const ASSET_CATEGORY_OPTIONS = [
  { api: 'vehicle' as AssetType, label: 'Vehicle' },
  { api: 'laptop' as AssetType, label: 'Laptop' },
  { api: 'smartphone' as AssetType, label: 'Smartphone' },
  { api: 'tablet' as AssetType, label: 'Tablet' },
  { api: 'tv' as AssetType, label: 'Television' },
  { api: 'desktop' as AssetType, label: 'Desktop' },
  { api: 'business_equipment' as AssetType, label: 'Business equipment' },
  { api: 'other_electronics' as AssetType, label: 'Other' },
];

export function requiredFieldsForType(type: AssetType): string[] {
  switch (type) {
    case 'vehicle':
      return ['make', 'model', 'year', 'vin'];
    case 'smartphone':
      return ['brand', 'model', 'imei'];
    case 'laptop':
    case 'tablet':
    case 'tv':
    case 'desktop':
      return ['brand', 'model', 'serialNumber'];
    case 'business_equipment':
    case 'other_electronics':
      return ['category', 'brand', 'model', 'serialNumber'];
    default:
      return ['brand', 'model', 'serialNumber'];
  }
}

export function buildAssetDetails(type: AssetType, fields: Record<string, string>): Record<string, unknown> {
  const t = (k: string) => fields[k]?.trim() ?? '';

  switch (type) {
    case 'vehicle':
      return {
        make: t('make'),
        model: t('model'),
        year: Number.parseInt(t('year'), 10),
        vin: t('vin'),
        licensePlate: t('licensePlate') || null,
        color: t('color') || null,
      };
    case 'smartphone':
      return {
        brand: t('brand'),
        model: t('model'),
        imei: t('imei'),
        serialNumber: t('serialNumber') || null,
      };
    case 'laptop':
      return {
        brand: t('brand'),
        model: t('model'),
        serialNumber: t('serialNumber'),
        operatingSystem: t('operatingSystem') || null,
      };
    case 'tablet':
      return {
        brand: t('brand'),
        model: t('model'),
        serialNumber: t('serialNumber'),
        imei: t('imei') || null,
      };
    case 'tv':
      return {
        brand: t('brand'),
        model: t('model'),
        serialNumber: t('serialNumber'),
        screenSizeInches: t('screenSizeInches') ? Number(t('screenSizeInches')) : null,
      };
    case 'desktop':
      return {
        brand: t('brand'),
        model: t('model'),
        serialNumber: t('serialNumber'),
        components: t('components') || null,
      };
    case 'business_equipment':
    case 'other_electronics':
      return {
        category: t('category'),
        brand: t('brand'),
        model: t('model'),
        serialNumber: t('serialNumber'),
        description: t('description') || null,
      };
    default:
      return { brand: t('brand'), model: t('model'), serialNumber: t('serialNumber') };
  }
}

export function fieldLabel(key: string): string {
  const labels: Record<string, string> = {
    make: 'Make',
    model: 'Model',
    year: 'Year',
    vin: 'VIN / chassis number',
    licensePlate: 'Registration number',
    color: 'Colour',
    brand: 'Brand',
    imei: 'IMEI',
    serialNumber: 'Serial number',
    operatingSystem: 'Operating system',
    screenSizeInches: 'Screen size (inches)',
    components: 'Components',
    category: 'Category',
    description: 'Description',
  };
  return labels[key] ?? key;
}
