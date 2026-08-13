/**
 * Public company contact details sourced from the owner's published site
 * (https://5e0f0c71609dc.site123.me) and owner-confirmed registration number.
 */
export const COMPANY_CONTACT = {
  legalName: 'TD IT Solution (Pty) Ltd',
  tradingName: 'TD IT Solution Insurance',
  founderName: 'Thabo Derrick Magagula',
  addressLines: [
    'Suite 9, 3rd Floor',
    '39 Emkher Street',
    'Nelspruit, Mpumalanga',
    'South Africa',
  ] as const,
  email: 'td.itsolution60@gmail.com',
  registrationNumber: '2019/565817/07',
  phones: [
    { display: '068 132 9499', href: 'tel:+27681329499' },
    { display: '076 357 2860', href: 'tel:+27763572860' },
  ] as const,
  officeHours: 'Monday–Friday, 08:30–17:00',
} as const;

export function companyAddressBlock(): string {
  return COMPANY_CONTACT.addressLines.join(', ');
}
