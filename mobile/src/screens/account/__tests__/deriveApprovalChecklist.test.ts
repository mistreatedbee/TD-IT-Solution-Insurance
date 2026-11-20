import { deriveApprovalChecklist } from '../deriveApprovalChecklist';

const empty = {
  firstName: null,
  lastName: null,
  phone: null,
  residentialAddress: null,
  idNumberMasked: null,
  verificationStatus: 'not_started' as const,
};

describe('deriveApprovalChecklist', () => {
  it('lists every item as missing for an empty profile', () => {
    expect(deriveApprovalChecklist(empty).every((i) => !i.done)).toBe(true);
  });

  it('marks fields done from profile data and leaves submit/approval pending', () => {
    const items = deriveApprovalChecklist({
      ...empty,
      firstName: 'Jane',
      lastName: 'Doe',
      phone: '+27820000000',
      residentialAddress: { line1: '1 Main', city: 'Cape Town', province: 'WC', postalCode: '8000', country: 'ZA' },
      idNumberMasked: '********1234',
      verificationStatus: 'in_progress',
    });
    expect(items.filter((i) => !i.done).map((i) => i.id)).toEqual(['submitted', 'approved']);
  });

  it('treats a whitespace-only name as missing', () => {
    const items = deriveApprovalChecklist({ ...empty, firstName: ' ', lastName: 'Doe' });
    expect(items.find((i) => i.id === 'name')?.done).toBe(false);
  });

  it('pending review: only approval is outstanding; verified: nothing is', () => {
    const full = {
      firstName: 'Jane',
      lastName: 'Doe',
      phone: '1',
      residentialAddress: { line1: 'a', city: 'b', province: 'c', postalCode: 'd', country: 'ZA' },
      idNumberMasked: '****',
    };
    expect(
      deriveApprovalChecklist({ ...full, verificationStatus: 'pending_review' }).filter((i) => !i.done).map((i) => i.id),
    ).toEqual(['approved']);
    expect(deriveApprovalChecklist({ ...full, verificationStatus: 'verified' }).every((i) => i.done)).toBe(true);
  });
});
