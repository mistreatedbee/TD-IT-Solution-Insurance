import type { CustomerProfileDocument } from '../repositories/customer-profiles.js';
import { computeProfileCompletion, maskIdNumberLast4 } from './profile-completion.js';
import type { AccountState } from '../repositories/accounts.js';

export interface SerializedCustomerProfile {
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  dateOfBirth: string | null;
  phone: string | null;
  idNumberMasked: string | null;
  residentialAddress: CustomerProfileDocument['residentialAddress'];
  emergencyContact: CustomerProfileDocument['emergencyContact'];
  verificationStatus: CustomerProfileDocument['verificationStatus'];
  verificationSubmittedAt: string | null;
  verificationReviewedAt: string | null;
  rejectionReasonCustomerSafe: string | null;
  completionPercent: number;
  completionChecklist: { id: string; label: string; done: boolean }[];
}

export function serializeCustomerProfile(
  profile: CustomerProfileDocument,
  extras: {
    accountState: AccountState;
    mfaEnrolled: boolean;
    hasPolicy: boolean;
    hasAsset: boolean;
  },
): SerializedCustomerProfile {
  const completion = computeProfileCompletion({
    accountState: extras.accountState,
    mfaEnrolled: extras.mfaEnrolled,
    hasPolicy: extras.hasPolicy,
    hasAsset: extras.hasAsset,
    firstName: profile.firstName,
    lastName: profile.lastName,
    phone: profile.phone,
    city: profile.residentialAddress?.city ?? null,
    emergencyContactName: profile.emergencyContact?.name ?? null,
    idNumberLast4: profile.idNumberLast4,
    verificationStatus: profile.verificationStatus,
  });

  return {
    firstName: profile.firstName,
    middleName: profile.middleName,
    lastName: profile.lastName,
    dateOfBirth: profile.dateOfBirth?.toISOString().slice(0, 10) ?? null,
    phone: profile.phone,
    idNumberMasked: maskIdNumberLast4(profile.idNumberLast4),
    residentialAddress: profile.residentialAddress,
    emergencyContact: profile.emergencyContact,
    verificationStatus: profile.verificationStatus,
    verificationSubmittedAt: profile.verificationSubmittedAt?.toISOString() ?? null,
    verificationReviewedAt: profile.verificationReviewedAt?.toISOString() ?? null,
    rejectionReasonCustomerSafe: profile.rejectionReasonCustomerSafe,
    completionPercent: completion.percent,
    completionChecklist: completion.checklist,
  };
}
