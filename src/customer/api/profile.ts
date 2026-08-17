import { apiFetch } from './client';

export type VerificationStatus =
  | 'not_started'
  | 'in_progress'
  | 'pending_review'
  | 'verified'
  | 'rejected'
  | 'action_required';

export interface ResidentialAddress {
  line1: string;
  line2?: string | null;
  city: string;
  province: string;
  postalCode: string;
  country: string;
}

export interface EmergencyContact {
  name: string;
  relationship: string;
  phone: string;
}

export interface ProfileChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

export interface CustomerProfile {
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  dateOfBirth: string | null;
  phone: string | null;
  idNumberMasked: string | null;
  residentialAddress: ResidentialAddress | null;
  emergencyContact: EmergencyContact | null;
  verificationStatus: VerificationStatus;
  verificationSubmittedAt: string | null;
  verificationReviewedAt: string | null;
  rejectionReasonCustomerSafe: string | null;
  completionPercent: number;
  completionChecklist: ProfileChecklistItem[];
}

export interface UpdateCustomerProfileRequest {
  firstName?: string;
  middleName?: string | null;
  lastName?: string;
  dateOfBirth?: string | null;
  phone?: string;
  idNumber?: string;
  residentialAddress?: ResidentialAddress;
  emergencyContact?: EmergencyContact;
}

export function getCustomerProfile() {
  return apiFetch<CustomerProfile>('/account/profile');
}

export function updateCustomerProfile(body: UpdateCustomerProfileRequest) {
  return apiFetch<CustomerProfile>('/account/profile', { method: 'PATCH', body });
}

export function submitProfileVerification() {
  return apiFetch<CustomerProfile>('/account/profile/verification/submit', { method: 'POST' });
}

export function verificationStatusLabel(status: VerificationStatus): string {
  switch (status) {
    case 'not_started':
      return 'Not started';
    case 'in_progress':
      return 'In progress';
    case 'pending_review':
      return 'Pending review';
    case 'verified':
      return 'Verified';
    case 'rejected':
      return 'Rejected';
    case 'action_required':
      return 'Action required';
    default:
      return status;
  }
}
