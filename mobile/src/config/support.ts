/**
 * Feature 024 Phase 1a — "Talk to support" contact channels, read from build-time config.
 *
 * Unset by default: the owner has not yet chosen the phone number, email address or WhatsApp
 * number to show (Feature 024 README §10 open question 3). Never hard-code a fallback here — an
 * option whose value is missing is hidden, and the sheet says the details are being set up.
 *
 * Each value MUST be read as a literal `process.env.EXPO_PUBLIC_*` member access so Expo inlines
 * it into the bundle (INC-004; lint: expo/no-dynamic-env-var).
 */
export interface SupportContacts {
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
}

function clean(raw: string | undefined): string | null {
  const value = raw?.trim();
  return value ? value : null;
}

export function readSupportContacts(raw: {
  phone?: string;
  email?: string;
  whatsapp?: string;
}): SupportContacts {
  return { phone: clean(raw.phone), email: clean(raw.email), whatsapp: clean(raw.whatsapp) };
}

export const SUPPORT_CONTACTS: SupportContacts = readSupportContacts({
  phone: process.env.EXPO_PUBLIC_SUPPORT_PHONE,
  email: process.env.EXPO_PUBLIC_SUPPORT_EMAIL,
  whatsapp: process.env.EXPO_PUBLIC_SUPPORT_WHATSAPP,
});

export function hasAnySupportContact(contacts: SupportContacts): boolean {
  return contacts.phone != null || contacts.email != null || contacts.whatsapp != null;
}

export function phoneUrl(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

export function emailUrl(email: string): string {
  return `mailto:${email}`;
}

/** wa.me wants the full international number, digits only (no "+", spaces or dashes). */
export function whatsappUrl(number: string): string {
  return `https://wa.me/${number.replace(/\D/g, '')}`;
}
