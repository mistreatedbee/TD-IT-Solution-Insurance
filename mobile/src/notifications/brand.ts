/**
 * Brand tokens for mobile push — mirrors auth email brand (Feature 007).
 */
export const PUSH_BRAND = {
  name: 'TD IT Solution Insurance',
  shortName: 'TD Insurance',
  tagline: 'Asset Protection & Recovery',
  primary: '#0B2A4A',
  primaryMid: '#2C3E50',
  secondary: '#2780B8',
  accent: '#F5A022',
  logoUrl: 'https://www.tditsolutionsinsurance.co.za/logo.png',
} as const;

export type PushCategoryId =
  | 'theft_critical'
  | 'device_status'
  | 'billing'
  | 'account'
  | 'claims'
  | 'general'
  | 'marketing';

export const PUSH_CATEGORIES: Array<{
  id: PushCategoryId;
  name: string;
  description: string;
}> = [
  {
    id: 'theft_critical',
    name: 'Theft & recovery',
    description: 'Critical alerts when an asset is reported stolen or located',
  },
  {
    id: 'device_status',
    name: 'Device & GPS',
    description: 'Offline devices and tracking status updates',
  },
  {
    id: 'billing',
    name: 'Payments',
    description: 'Receipts, failed payments, and billing reminders',
  },
  {
    id: 'account',
    name: 'Account & security',
    description: 'Sign-in alerts and security changes',
  },
  {
    id: 'claims',
    name: 'Claims',
    description: 'Claim submissions and decisions',
  },
  {
    id: 'general',
    name: 'General',
    description: 'Policy and asset updates',
  },
  {
    id: 'marketing',
    name: 'Tips & offers',
    description: 'Optional education and product tips',
  },
];
