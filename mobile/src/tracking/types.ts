import type { AssetLocationSummaryItem } from '../api/asset-location';

export type TrackingStatus =
  | 'online'
  | 'last_known'
  | 'offline'
  | 'tracking_disabled'
  | 'tracking_unavailable';

export type TrackingProviderId = 'self_device' | 'hardware_pending' | 'hardware';

export interface DeviceCapabilitySet {
  liveLocation: boolean;
  periodicLocation: boolean;
  battery: boolean;
  cellularSignal: boolean;
  speed: boolean;
  heading: boolean;
  ignition: boolean;
  geofencing: boolean;
  tripHistory: boolean;
  remoteCommands: boolean;
}

export interface DeviceTelemetryView {
  batteryPercent?: number;
  signalStrength?: 'none' | 'weak' | 'good' | 'strong';
  gpsFix?: 'none' | 'weak' | 'strong';
  movementState?: 'moving' | 'stationary' | 'unknown';
  speedKmh?: number;
  headingDegrees?: number;
  reportedAt?: string;
}

export interface InstallationGuideStep {
  id: string;
  title: string;
  body: string;
}

export interface InstallationGuide {
  title: string;
  summary: string;
  steps: InstallationGuideStep[];
}

export interface TrackingProfile {
  assetId: string;
  providerId: TrackingProviderId;
  providerLabel: string;
  statusMessage: string;
  capabilities: DeviceCapabilitySet;
  device: {
    id: string;
    serialOrImei: string;
    label: string | null;
    status: string;
    activatedAt: string | null;
  } | null;
  telemetry: DeviceTelemetryView | null;
  installationGuide: InstallationGuide;
}

export interface TrackingDeviceRecord {
  id: string;
  serialOrImei: string;
  label: string | null;
  deviceTypeId: string;
  status: string;
  providerId: string;
  assetId: string | null;
  activatedAt: string | null;
  capabilities: DeviceCapabilitySet;
}

export type AlertSeverity = 'critical' | 'high' | 'warning' | 'info';

export type AlertCategory = 'security' | 'tracking' | 'device' | 'insurance' | 'payment' | 'account';

export interface DashboardAlert {
  id: string;
  severity: AlertSeverity;
  category: AlertCategory;
  title: string;
  body: string;
  href?: string;
}

export interface AssetTrackingView extends AssetLocationSummaryItem {
  trackingStatus: TrackingStatus;
  trackingLabel: string;
  locationLabel: string | null;
}

export interface ProtectionDashboardData {
  greetingName: string;
  subtitle: string;
  assetCount: number;
  protectedAssetCount: number;
  trackingOnlineCount: number;
  trackingActiveCount: number;
  alertCount: number;
  criticalAlertCount: number;
  profilePercent: number;
  profileChecklist: { id: string; label: string; done: boolean }[];
  assetPreviews: AssetTrackingView[];
  alerts: DashboardAlert[];
  clientAlerts: DashboardAlert[];
  openRecoveryCount: number;
  hasPolicy: boolean;
  isPendingVerification: boolean;
}
