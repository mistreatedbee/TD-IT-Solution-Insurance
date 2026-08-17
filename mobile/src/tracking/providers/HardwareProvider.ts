/**
 * Hardware GPS tracker provider — stub until vendor integration (Feature 009 Phase 4).
 *
 * Device registration and asset linking are supported via the backend API.
 * Live telemetry ingestion remains pending vendor selection.
 */
import type { DeviceCapabilitySet, DeviceTelemetryView } from '../types';

export class HardwareProviderNotReadyError extends Error {
  constructor(message = 'Hardware GPS vendor integration is not available yet.') {
    super(message);
    this.name = 'HardwareProviderNotReadyError';
  }
}

export const PENDING_HARDWARE_CAPABILITIES: DeviceCapabilitySet = {
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

export class HardwareProvider {
  readonly id = 'hardware_pending' as const;

  /** Vendor webhook feed — not implemented in Phase 4. */
  async getTelemetry(_deviceId: string): Promise<DeviceTelemetryView | null> {
    return null;
  }

  /** Remote commands require vendor API — not implemented. */
  async sendRemoteCommand(_deviceId: string, _command: string): Promise<void> {
    throw new HardwareProviderNotReadyError();
  }

  getCapabilities(): DeviceCapabilitySet {
    return PENDING_HARDWARE_CAPABILITIES;
  }
}

export const hardwareProvider = new HardwareProvider();
