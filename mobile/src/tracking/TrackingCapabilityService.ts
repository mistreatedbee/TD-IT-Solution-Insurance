/**
 * Resolve UI capability flags from a tracking profile — Feature 009 Phase 4.
 */
import type { DeviceCapabilitySet, TrackingProfile } from './types';

export interface TrackingUiCapabilities {
  showDeviceActivation: boolean;
  showInstallationGuide: boolean;
  showDeviceHealth: boolean;
  showBattery: boolean;
  showSignal: boolean;
  showSpeed: boolean;
  showLiveDot: boolean;
  showTripHistory: boolean;
  showGeofences: boolean;
  hardwarePending: boolean;
}

export function resolveTrackingUiCapabilities(
  profile: TrackingProfile | null | undefined,
): TrackingUiCapabilities {
  const caps: DeviceCapabilitySet = profile?.capabilities ?? emptyCapabilities();
  const isSelfDevice = profile?.providerId === 'self_device';
  const hasDevice = profile?.device != null;
  const hardwarePending = profile?.providerId === 'hardware_pending';

  return {
    showDeviceActivation: !isSelfDevice && !hasDevice,
    showInstallationGuide: !isSelfDevice,
    showDeviceHealth: !isSelfDevice && hasDevice,
    showBattery: caps.battery && hasDevice,
    showSignal: caps.cellularSignal && hasDevice,
    showSpeed: caps.speed && hasDevice,
    showLiveDot: caps.liveLocation && hasDevice,
    showTripHistory: caps.tripHistory,
    showGeofences: caps.geofencing,
    hardwarePending,
  };
}

function emptyCapabilities(): DeviceCapabilitySet {
  return {
    liveLocation: false,
    periodicLocation: false,
    battery: false,
    cellularSignal: false,
    speed: false,
    heading: false,
    ignition: false,
    geofencing: false,
    tripHistory: false,
    remoteCommands: false,
  };
}
