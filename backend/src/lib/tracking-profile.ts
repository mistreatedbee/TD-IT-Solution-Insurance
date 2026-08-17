/**
 * Resolve tracking profile for an asset — provider-agnostic (Feature 009 Phase 4).
 */
import type { AssetDocument } from '../repositories/assets.js';
import type { TrackingDeviceDocument } from '../repositories/tracking-devices.js';
import {
  INSTALLATION_GUIDE,
  PENDING_HARDWARE_CAPABILITIES,
  SELF_DEVICE_CAPABILITIES,
  type DeviceCapabilitySet,
  type TrackingProviderId,
} from './tracking-device-types.js';

export interface DeviceTelemetryView {
  batteryPercent?: number;
  signalStrength?: 'none' | 'weak' | 'good' | 'strong';
  gpsFix?: 'none' | 'weak' | 'strong';
  movementState?: 'moving' | 'stationary' | 'unknown';
  speedKmh?: number;
  headingDegrees?: number;
  reportedAt?: string;
}

export interface TrackingProfileView {
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
  installationGuide: typeof INSTALLATION_GUIDE;
}

export function resolveTrackingProfile(
  asset: AssetDocument,
  device: TrackingDeviceDocument | null,
): TrackingProfileView {
  if (asset.assetType === 'smartphone') {
    const selfActive = asset.locationSource === 'self_device';
    return {
      assetId: asset.id,
      providerId: 'self_device',
      providerLabel: 'This phone',
      statusMessage: selfActive
        ? 'Location reports from this device while the app is open.'
        : 'Enable location tracking on this phone from the asset screen.',
      capabilities: SELF_DEVICE_CAPABILITIES,
      device: null,
      telemetry: null,
      installationGuide: INSTALLATION_GUIDE,
    };
  }

  if (device) {
    const statusMessage =
      device.status === 'pending_vendor'
        ? 'Device registered — GPS hardware vendor integration is pending. You will be notified when live tracking is available.'
        : device.status === 'activating'
          ? 'Device linked — waiting for the first hardware location ping.'
          : device.status === 'active'
            ? 'Hardware tracker connected.'
            : 'Device activation failed — contact support.';

    return {
      assetId: asset.id,
      providerId: 'hardware_pending',
      providerLabel: 'GPS tracker',
      statusMessage,
      capabilities: device.capabilities ?? PENDING_HARDWARE_CAPABILITIES,
      device: {
        id: device.id,
        serialOrImei: device.serialOrImei,
        label: device.label,
        status: device.status,
        activatedAt: device.activatedAt?.toISOString() ?? null,
      },
      telemetry: null,
      installationGuide: INSTALLATION_GUIDE,
    };
  }

  return {
    assetId: asset.id,
    providerId: 'hardware_pending',
    providerLabel: 'No tracker linked',
    statusMessage:
      'Connect a GPS tracker to enable location recovery for this asset. Hardware vendor integration is coming soon.',
    capabilities: PENDING_HARDWARE_CAPABILITIES,
    device: null,
    telemetry: null,
    installationGuide: INSTALLATION_GUIDE,
  };
}
