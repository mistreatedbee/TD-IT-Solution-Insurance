/**
 * Feature 023 Phase A item 5 — what is still missing before identity approval.
 * Mirrors the backend submit rule (`customer-profiles.ts` `submitVerification`: name,
 * phone, address city and ID last 4 are required), then submit and review. Built only
 * from the profile the API already returns; no document items (Phase B).
 */
import type { CustomerProfile } from '../../api/customer-profile';

export interface ApprovalChecklistItem {
  id: 'name' | 'phone' | 'address' | 'id_number' | 'submitted' | 'approved';
  label: string;
  done: boolean;
}

type ChecklistProfile = Pick<
  CustomerProfile,
  'firstName' | 'lastName' | 'phone' | 'residentialAddress' | 'idNumberMasked' | 'verificationStatus'
>;

export function deriveApprovalChecklist(profile: ChecklistProfile): ApprovalChecklistItem[] {
  const status = profile.verificationStatus;
  return [
    { id: 'name', label: 'First and last name', done: Boolean(profile.firstName?.trim() && profile.lastName?.trim()) },
    { id: 'phone', label: 'Phone number', done: Boolean(profile.phone?.trim()) },
    { id: 'address', label: 'Residential address', done: Boolean(profile.residentialAddress?.city?.trim()) },
    { id: 'id_number', label: 'Last 4 digits of your ID number', done: Boolean(profile.idNumberMasked) },
    { id: 'submitted', label: 'Submit for review', done: status === 'pending_review' || status === 'verified' },
    { id: 'approved', label: 'Approved by our team', done: status === 'verified' },
  ];
}
