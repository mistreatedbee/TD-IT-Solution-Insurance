import { resolveTrackingUiCapabilities } from '../TrackingCapabilityService';
import type { TrackingProfile } from '../types';

describe('resolveTrackingUiCapabilities', () => {
  const baseProfile: TrackingProfile = {
    assetId: '507f1f77bcf86cd799439022',
    providerId: 'hardware_pending',
    providerLabel: 'No tracker linked',
    statusMessage: 'Connect a GPS tracker',
    capabilities: {
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
    },
    device: null,
    telemetry: null,
    installationGuide: { title: 'Guide', summary: '', steps: [] },
  };

  it('shows activation when no hardware device linked', () => {
    const ui = resolveTrackingUiCapabilities(baseProfile);
    expect(ui.showDeviceActivation).toBe(true);
    expect(ui.showDeviceHealth).toBe(false);
    expect(ui.hardwarePending).toBe(true);
  });

  it('hides activation when device is linked', () => {
    const ui = resolveTrackingUiCapabilities({
      ...baseProfile,
      device: {
        id: '507f1f77bcf86cd799439033',
        serialOrImei: 'ABC123',
        label: null,
        status: 'activating',
        activatedAt: '2026-08-01T12:00:00.000Z',
      },
    });
    expect(ui.showDeviceActivation).toBe(false);
    expect(ui.showDeviceHealth).toBe(true);
  });

  it('hides hardware flows for self_device provider', () => {
    const ui = resolveTrackingUiCapabilities({
      ...baseProfile,
      providerId: 'self_device',
      providerLabel: 'This phone',
    });
    expect(ui.showDeviceActivation).toBe(false);
    expect(ui.showInstallationGuide).toBe(false);
  });
});
