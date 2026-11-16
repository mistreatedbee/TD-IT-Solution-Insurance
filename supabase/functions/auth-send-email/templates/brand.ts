/** Brand tokens + public assets for transactional email HTML.
 *  Aligned with the current design system (src/styles/td-tokens.css, "Day" theme): cool blue page,
 *  brand navy, brand blue, orange action. Contrast of every text/background pair used in the email
 *  layouts was checked at 4.5:1 or better (light and dark). Keep the backend copy in
 *  backend/src/lib/email-footer.ts and domain-email-templates.ts in step with this file. */
export const EMAIL_BRAND = {
  name: 'TD IT Solution Insurance',
  legalName: 'TD IT Solution (Pty) Ltd',
  tagline: 'Asset Protection & Recovery',
  /** Brand navy: header band, headings. */
  primary: '#2C3E52',
  /** Ink: body text on white. */
  primaryDeep: '#14202D',
  primaryMid: '#2C3E52',
  primaryLight: '#2780B8',
  /** Sunken surface: signature and footer blocks. */
  primaryTint: '#E3EBF3',
  /** Brand blue for decoration. For link text use `link` (higher contrast). */
  secondary: '#2780B8',
  secondaryTint: '#DCEBF7',
  link: '#1A66A0',
  accent: '#F5A022',
  /** Accent as text on light surfaces (4.5:1). */
  accentDeep: '#8F5200',
  accentTint: '#FCEBCB',
  text: '#14202D',
  muted: '#4A5A6C',
  /** Small print on white or the sunken tint (4.5:1 on both). */
  mutedLight: '#5B6B7D',
  background: '#EEF3F8',
  backgroundTop: '#F7FAFD',
  backgroundPattern: '#E6EEF6',
  card: '#FFFFFF',
  border: '#D3DEE9',
  hairline: 'rgba(44,62,82,0.08)',
  success: '#12714A',
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
  email: 'info@tditsolutionsinsurance.co.za',
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
    buttonShadow: '0 6px 20px rgba(245,160,34,0.34)',
    headerGradientEnd: '#1F2D3D',
  },
  recovery: {
    eyebrowColor: EMAIL_BRAND.link,
    heroBg: EMAIL_BRAND.secondaryTint,
    heroBorder: EMAIL_BRAND.secondary,
    stripeColor: EMAIL_BRAND.secondary,
    buttonShadow: '0 6px 20px rgba(245,160,34,0.34)',
    headerGradientEnd: '#1B4E72',
  },
  invite: {
    eyebrowColor: EMAIL_BRAND.primaryMid,
    heroBg: EMAIL_BRAND.primaryTint,
    heroBorder: EMAIL_BRAND.primaryMid,
    stripeColor: EMAIL_BRAND.accent,
    buttonShadow: '0 6px 20px rgba(245,160,34,0.34)',
    headerGradientEnd: '#1F2D3D',
  },
  reauthentication: {
    eyebrowColor: EMAIL_BRAND.accentDeep,
    heroBg: EMAIL_BRAND.accentTint,
    heroBorder: EMAIL_BRAND.accentDeep,
    stripeColor: EMAIL_BRAND.accentDeep,
    buttonShadow: '0 6px 20px rgba(245,160,34,0.34)',
    headerGradientEnd: '#2A2218',
  },
  magiclink: {
    eyebrowColor: EMAIL_BRAND.link,
    heroBg: EMAIL_BRAND.secondaryTint,
    heroBorder: EMAIL_BRAND.secondary,
    stripeColor: EMAIL_BRAND.accent,
    buttonShadow: '0 6px 20px rgba(245,160,34,0.34)',
    headerGradientEnd: '#16293D',
  },
  email_change: {
    eyebrowColor: EMAIL_BRAND.accentDeep,
    heroBg: EMAIL_BRAND.accentTint,
    heroBorder: EMAIL_BRAND.accent,
    stripeColor: EMAIL_BRAND.accent,
    buttonShadow: '0 6px 20px rgba(245,160,34,0.34)',
    headerGradientEnd: '#1F2D3D',
  },
  default: {
    eyebrowColor: EMAIL_BRAND.accentDeep,
    heroBg: EMAIL_BRAND.primaryTint,
    heroBorder: EMAIL_BRAND.primary,
    stripeColor: EMAIL_BRAND.accent,
    buttonShadow: '0 6px 20px rgba(245,160,34,0.34)',
    headerGradientEnd: '#1F2D3D',
  },
};

/**
 * Typography. Web fonts (Zilla Slab, Plus Jakarta Sans) do not load in most mail clients, so each stack
 * falls back to a font every client has: Rockwell/Georgia for headings, the system sans for body.
 */
export const EMAIL_FONT_DISPLAY = "'Zilla Slab',Rockwell,'Roboto Slab',Georgia,serif";
export const EMAIL_FONT_SANS =
  "'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/**
 * Dark mode for clients that support it (Apple Mail, iOS Mail, Outlook apps). Matches the design
 * system's "Night" theme. Written as attribute selectors on the inline colours so no template needs
 * extra classes; the CTA button keeps its orange fill and dark text because only specific text and
 * surface colours are remapped. Clients without support, or that ignore it, show the light design.
 */
export const EMAIL_DARK_MODE_CSS = `
@media (prefers-color-scheme: dark) {
  [style*="background:#EEF3F8"] { background:#0B1622 !important; background-image:none !important; }
  [style*="background:#FFFFFF"] { background:#14253A !important; }
  [style*="background:#E3EBF3"] { background:#0F1D2C !important; }
  [style*="#D3DEE9"] { border-color:rgba(255,255,255,0.14) !important; }
  [style*="color:#14202D"]:not(a) { color:#F2F6FA !important; }
  [style*="color:#2C3E52"] { color:#F2F6FA !important; }
  [style*="color:#4A5A6C"] { color:#AEBBCA !important; }
  [style*="color:#5B6B7D"] { color:#8FA3B8 !important; }
  [style*="color:#1A66A0"] { color:#7CC0F0 !important; }
}`;

/** Hosted logo for email clients (must be absolute HTTPS URL). */
export function emailLogoUrl(): string {
  const override = Deno.env.get('EMAIL_LOGO_URL')?.trim();
  if (override) return override;
  const site = Deno.env.get('EMAIL_PUBLIC_SITE_URL')?.trim() || EMAIL_BRAND.siteUrl;
  return `${site.replace(/\/$/, '')}/logo.png`;
}
