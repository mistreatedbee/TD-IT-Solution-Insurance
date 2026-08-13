/** Brand tokens + public assets for transactional email HTML.
 *  Aligned with src/index.css design tokens (navy, gold, secondary blue). */
export const EMAIL_BRAND = {
  name: 'TD IT Solution Insurance',
  legalName: 'TD IT Solution (Pty) Ltd',
  tagline: 'Asset Protection & Recovery',
  /** Logo wordmark navy — matches Logo component `tone="navy"`. */
  primary: '#0B2A4A',
  primaryDeep: '#0A1628',
  primaryMid: '#2C3E50',
  primaryLight: '#1a4a7a',
  primaryTint: '#E7EBEF',
  secondary: '#2780B8',
  secondaryTint: '#E3F0F8',
  accent: '#F5A022',
  accentDeep: '#D9720A',
  accentTint: '#FDECD2',
  text: '#1C1917',
  muted: '#6B6156',
  mutedLight: '#8a939b',
  background: '#FAF8F5',
  backgroundPattern: '#F2EDE6',
  card: '#FFFFFF',
  border: '#E4DDD1',
  hairline: 'rgba(44,62,80,0.08)',
  success: '#059669',
  siteUrl: 'https://www.tditsolutionsinsurance.co.za',
  siteDisplay: 'www.tditsolutionsinsurance.co.za',
  registrationNumber: '2019/565817/07',
  director: {
    honorific: 'Mr',
    name: 'Thabo Derrick Magagula',
    title: 'Director',
  },
  addressLines: [
    'Suite 9, 3rd Floor',
    '39 Emkher Street',
    'Nelspruit, Mpumalanga',
    'South Africa',
  ],
  officeHours: 'Monday–Friday, 08:30–17:00',
  phones: [
    { display: '068 132 9499', href: 'tel:+27681329499' },
    { display: '076 357 2860', href: 'tel:+27763572860' },
  ],
  email: 'td.itsolution60@gmail.com',
} as const;

/** Per-template accent + hero treatment for distinct visual personality. */
export type EmailThemeKey =
  | 'signup'
  | 'recovery'
  | 'invite'
  | 'reauthentication'
  | 'magiclink'
  | 'email_change'
  | 'default';

export interface EmailTheme {
  eyebrowColor: string;
  heroBg: string;
  heroBorder: string;
  stripeColor: string;
  buttonShadow: string;
  headerGradientEnd: string;
}

export const EMAIL_THEMES: Record<EmailThemeKey, EmailTheme> = {
  signup: {
    eyebrowColor: EMAIL_BRAND.accentDeep,
    heroBg: EMAIL_BRAND.accentTint,
    heroBorder: EMAIL_BRAND.accent,
    stripeColor: EMAIL_BRAND.accent,
    buttonShadow: '0 4px 14px rgba(245,160,34,0.45)',
    headerGradientEnd: '#16212C',
  },
  recovery: {
    eyebrowColor: EMAIL_BRAND.secondary,
    heroBg: EMAIL_BRAND.secondaryTint,
    heroBorder: EMAIL_BRAND.secondary,
    stripeColor: EMAIL_BRAND.secondary,
    buttonShadow: '0 4px 14px rgba(39,128,184,0.35)',
    headerGradientEnd: '#1a3d5c',
  },
  invite: {
    eyebrowColor: EMAIL_BRAND.primaryMid,
    heroBg: EMAIL_BRAND.primaryTint,
    heroBorder: EMAIL_BRAND.primaryMid,
    stripeColor: EMAIL_BRAND.accent,
    buttonShadow: '0 4px 14px rgba(44,62,80,0.25)',
    headerGradientEnd: '#1C2833',
  },
  reauthentication: {
    eyebrowColor: EMAIL_BRAND.accentDeep,
    heroBg: '#FFF5E6',
    heroBorder: EMAIL_BRAND.accentDeep,
    stripeColor: EMAIL_BRAND.accentDeep,
    buttonShadow: '0 4px 14px rgba(217,114,10,0.40)',
    headerGradientEnd: '#2a1a0a',
  },
  magiclink: {
    eyebrowColor: EMAIL_BRAND.secondary,
    heroBg: EMAIL_BRAND.secondaryTint,
    heroBorder: EMAIL_BRAND.secondary,
    stripeColor: EMAIL_BRAND.accent,
    buttonShadow: '0 4px 14px rgba(39,128,184,0.30)',
    headerGradientEnd: '#0F1A2C',
  },
  email_change: {
    eyebrowColor: EMAIL_BRAND.accentDeep,
    heroBg: EMAIL_BRAND.accentTint,
    heroBorder: EMAIL_BRAND.accent,
    stripeColor: EMAIL_BRAND.accent,
    buttonShadow: '0 4px 14px rgba(245,160,34,0.40)',
    headerGradientEnd: '#16212C',
  },
  default: {
    eyebrowColor: EMAIL_BRAND.accent,
    heroBg: EMAIL_BRAND.primaryTint,
    heroBorder: EMAIL_BRAND.primary,
    stripeColor: EMAIL_BRAND.accent,
    buttonShadow: '0 4px 14px rgba(11,42,74,0.20)',
    headerGradientEnd: '#0A1628',
  },
};

/** Hosted logo for email clients (must be absolute HTTPS URL). */
export function emailLogoUrl(): string {
  const override = Deno.env.get('EMAIL_LOGO_URL')?.trim();
  if (override) return override;
  const site = Deno.env.get('EMAIL_PUBLIC_SITE_URL')?.trim() || EMAIL_BRAND.siteUrl;
  return `${site.replace(/\/$/, '')}/logo.png`;
}
