import { hasAnySupportContact, readSupportContacts, SUPPORT_CONTACTS } from '../support';

describe('support contacts config', () => {
  it('is empty by default (no invented contact details)', () => {
    expect(SUPPORT_CONTACTS).toEqual({ phone: null, email: null, whatsapp: null });
    expect(hasAnySupportContact(SUPPORT_CONTACTS)).toBe(false);
  });

  it('treats blank values as unset and trims the rest', () => {
    const c = readSupportContacts({ phone: '  ', email: ' help@example.test ', whatsapp: undefined });
    expect(c).toEqual({ phone: null, email: 'help@example.test', whatsapp: null });
    expect(hasAnySupportContact(c)).toBe(true);
  });
});
