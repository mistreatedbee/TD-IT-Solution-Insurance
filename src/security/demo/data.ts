/**
 * LOCAL-ONLY DEMO DATA (docs/organization/security-dashboard-local-demo.md, ADR-0013).
 * Entirely fictional. In-memory only; resets on page reload. Shapes mirror
 * backend/src/repositories/recovery-cases.ts serializers (offer tier vs claimed tier).
 */
import type { SecurityCaseStatus } from '../api/cases';

/**
 * Entirely fictional demo org, per docs/organization/demo-security-partner-profile.md.
 * No such company is registered with PSIRA; the registration number below is invented, not
 * looked up — see that doc for the collision check and sourcing notes.
 */
export const DEMO_ORG_NAME = 'Vukani Asset Protection & Recovery (Pty) Ltd (trading as Vukani Recovery)';
export const DEMO_ORG_TRADING_NAME = 'Vukani Recovery';
export const DEMO_ORG_PSIRA_NUMBER =
  'PSIRA Reg. No. 9284671 — registration status not independently verified; demo data only';
export const DEMO_ORG_TAGLINE =
  "Vukani Recovery — Asset tracing and recovery coordination, wherever it's taken.";
export const DEMO_ORG_ID = 'd3d3d3d3d3d3d3d3d3d3d3d3';
/** Display-only name/title for the fictional demo operator; account shape is unchanged. */
export const DEMO_OPERATOR_DISPLAY_NAME = 'Lindiwe Mahlangu, Recovery Operations Manager';
export const DEMO_ACCOUNT = {
  id: 'a1a1a1a1a1a1a1a1a1a1a1a1',
  email: 'demo.operator@example.invalid',
  userType: 'security_company_operator',
  accountState: 'active',
  mfaRequired: true,
  mfaEnrolled: true,
  partnerOrganizationId: DEMO_ORG_ID,
};

export interface DemoCase {
  id: string;
  assetId: string;
  status: SecurityCaseStatus;
  referenceNumber: string;
  reportedAt: string;
  notes: string | null;
  lastLocationAt: string | null;
  partnerOrganizationId: string | null;
  updatedAt: string;
  /** Not sent to the client; used only to label notes. */
  _label: string;
}

const FORWARD: Record<SecurityCaseStatus, SecurityCaseStatus[]> = {
  open: ['investigating', 'tracking', 'recovered', 'closed'],
  investigating: ['tracking', 'recovered', 'closed'],
  tracking: ['recovered', 'closed'],
  recovered: ['closed'],
  closed: [],
};
export function isForward(from: SecurityCaseStatus, to: SecurityCaseStatus): boolean {
  return FORWARD[from].includes(to);
}

const HOUR = 3_600_000;
const iso = (now: number, hoursAgo: number) => new Date(now - hoursAgo * HOUR).toISOString();
const hex = (n: number) => n.toString(16).padStart(24, '0');

export function buildDemoCases(now: number = Date.now()): DemoCase[] {
  const mk = (
    n: number,
    status: SecurityCaseStatus,
    claimed: boolean,
    hoursAgo: number,
    label: string,
    notes: string | null,
    locAgo: number | null,
  ): DemoCase => ({
    id: hex(0xc0de00 + n),
    assetId: [1, 2, 3].map((k) => ((n * 2654435761 * k) >>> 0).toString(16).padStart(8, '0')).join(''),
    status,
    referenceNumber: `REC-DEMO-${String(1000 + n)}`,
    reportedAt: iso(now, hoursAgo),
    notes,
    lastLocationAt: locAgo === null ? null : iso(now, locAgo),
    partnerOrganizationId: claimed ? DEMO_ORG_ID : null,
    updatedAt: iso(now, Math.max(hoursAgo - 1, 0.1)),
    _label: label,
  });
  return [
    mk(1, 'open', false, 3, 'Vehicle - Toyota Hilux, Sandton, Johannesburg', null, null),
    mk(2, 'open', false, 20, 'Phone - Samsung Galaxy, Cape Town CBD', null, null),
    mk(3, 'open', false, 52, 'Laptop - Dell Latitude, Umhlanga, Durban', null, null),
    mk(4, 'investigating', true, 30, 'Vehicle - VW Polo, Pretoria East', 'Customer confirmed last parking spot. Contacted local patrol.', 28),
    mk(5, 'tracking', true, 75, 'Phone - iPhone, Bloemfontein', 'Device pinging intermittently near Brandwag. Fictional demo location.', 2),
    mk(6, 'tracking', true, 120, 'Laptop - Lenovo ThinkPad, Gqeberha', 'Last seen on a fictional network in Walmer.', 6),
    mk(7, 'recovered', true, 200, 'Vehicle - Ford Ranger, Centurion', 'Vehicle located and handed to owner. Demo record.', 150),
    mk(8, 'closed', true, 400, 'Phone - Huawei, Polokwane', 'Closed - no further action. Demo record.', null),
  ];
}

/** Wire shape: offer tier (unclaimed) omits asset/notes/location; claimed tier includes them. */
export function serializeDemoCase(c: DemoCase) {
  if (c.partnerOrganizationId === null) {
    return {
      id: c.id,
      status: c.status,
      referenceNumber: c.referenceNumber,
      reportedAt: c.reportedAt,
      partnerOrganizationId: null,
      updatedAt: c.updatedAt,
    };
  }
  return {
    id: c.id,
    assetId: c.assetId,
    status: c.status,
    referenceNumber: c.referenceNumber,
    reportedAt: c.reportedAt,
    notes: c.notes,
    lastLocationAt: c.lastLocationAt,
    partnerOrganizationId: c.partnerOrganizationId,
    updatedAt: c.updatedAt,
  };
}
