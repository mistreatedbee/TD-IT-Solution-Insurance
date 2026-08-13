import type { LucideIcon } from 'lucide-react-native';
import {
  BriefcaseIcon,
  CarIcon,
  LaptopIcon,
  MonitorIcon,
  PackageIcon,
  SmartphoneIcon,
  TabletIcon,
  TvIcon,
} from 'lucide-react-native';
import type { AssetType } from '../api/assets';

export const ASSET_CATEGORY_OPTIONS: {
  api: AssetType;
  label: string;
  Icon: LucideIcon;
  prompt: string;
}[] = [
  { api: 'vehicle', label: 'Vehicle', Icon: CarIcon, prompt: 'Tell us about your vehicle.' },
  { api: 'laptop', label: 'Laptop', Icon: LaptopIcon, prompt: 'Tell us about your laptop.' },
  { api: 'smartphone', label: 'Smartphone', Icon: SmartphoneIcon, prompt: 'Tell us about your smartphone.' },
  { api: 'tablet', label: 'Tablet', Icon: TabletIcon, prompt: 'Tell us about your tablet.' },
  { api: 'tv', label: 'Television', Icon: TvIcon, prompt: 'Tell us about your television.' },
  { api: 'desktop', label: 'Computer', Icon: MonitorIcon, prompt: 'Tell us about your computer.' },
  {
    api: 'business_equipment',
    label: 'Business equipment',
    Icon: BriefcaseIcon,
    prompt: 'Tell us about this equipment.',
  },
  { api: 'other_electronics', label: 'Other', Icon: PackageIcon, prompt: 'Tell us about this asset.' },
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
