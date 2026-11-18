/**
 * Brand tokens for mobile push, aligned with the current design system (Day theme, td-tokens) and with
 * the native accent in app.json (`#F5A022`). Used for Android channel LED colours and the brand colour
 * carried in local notification data. Keep in step with backend NOTIFICATION_BRAND.
 * Note: the notification icon and accent in app.json only change in a NEW native build.
 */
export const PUSH_BRAND = {
  name: 'TD IT Solution Insurance',
  shortName: 'TD Insurance',
  tagline: 'Asset Protection & Recovery',
  /** Brand navy. */
  primary: '#2C3E52',
  primaryMid: '#2C3E52',
  /** Brand blue. */
  secondary: '#2780B8',
  /** Brand orange: the action colour. Matches the native accent in app.json. */
  accent: '#F5A022',
  /** @deprecated Same as `accent`; unused. */
  accentWarm: '#F5A022',
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

export const PUSH_CATEGORIES: {
  id: PushCategoryId;
  name: string;
  description: string;
}[] = [
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
