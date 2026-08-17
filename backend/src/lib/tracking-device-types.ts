/**
 * Feature 009 Phase 4 — tracking device capability types (shared concept).
 */
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

export type TrackingProviderId = 'self_device' | 'hardware_pending' | 'hardware';

export type TrackingDeviceStatus =
  | 'pending_vendor'
  | 'activating'
  | 'active'
  | 'failed';

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

/** Capabilities exposed once a hardware device is linked — vendor feed still pending in Phase 4. */
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

export const INSTALLATION_GUIDE = {
  title: 'GPS tracker installation',
  summary:
    'Follow these steps to install your GPS tracker. A supported hardware vendor integration is still being finalised — your device ID is saved and will activate automatically when partner connectivity goes live.',
  steps: [
    {
      id: 'choose-location',
      title: 'Choose a concealed location',
      body: 'Mount the tracker where it cannot be easily found or removed. For vehicles, under the dashboard or inside a panel is common.',
    },
    {
      id: 'power',
      title: 'Connect power',
      body: 'Wire the tracker to a stable 12V source (hardwired) or ensure the battery-powered unit is fully charged before hiding it.',
    },
    {
      id: 'test-fix',
      title: 'Verify GPS fix outdoors',
      body: 'After installation, drive outdoors for a few minutes so the device can obtain its first satellite fix.',
    },
    {
      id: 'register-id',
      title: 'Register the device ID in the app',
      body: 'Enter the IMEI or serial number from the tracker label in the activation screen to link it to your protected asset.',
    },
  ],
} as const;
