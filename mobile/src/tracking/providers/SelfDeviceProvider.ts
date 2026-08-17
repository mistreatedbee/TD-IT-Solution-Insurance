/**
 * Self-device tracking provider — wraps existing location-report API (Feature 008).
 */
import { reportAssetLocation } from '../../api/asset-location';
import type { DeviceCapabilitySet } from '../types';

export const SELF_DEVICE_CAPABILITIES: DeviceCapabilitySet = {
  liveLocation: false,
  periodicLocation: true,
  battery: false,
  cellularSignal: false,
  speed: false,
  heading: false,
  ignition: false,
  geofencing: false,
  tripHistory: false,
  remoteCommands: false,
};

export class SelfDeviceProvider {
  readonly id = 'self_device' as const;

  async reportLocation(
    assetId: string,
    fix: {
      latitude: number;
      longitude: number;
      accuracyMeters?: number;
      capturedAt: string;
    },
  ): Promise<void> {
    await reportAssetLocation(assetId, {
      latitude: fix.latitude,
      longitude: fix.longitude,
      accuracyMeters: fix.accuracyMeters,
      capturedAt: fix.capturedAt,
      triggeredBy: 'manual_refresh',
    });
  }

  getCapabilities(): DeviceCapabilitySet {
    return SELF_DEVICE_CAPABILITIES;
  }
}

export const selfDeviceProvider = new SelfDeviceProvider();
