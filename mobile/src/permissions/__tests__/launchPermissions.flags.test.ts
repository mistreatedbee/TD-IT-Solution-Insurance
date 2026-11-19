/** The launch explainer is inert unless its flag is on; the location step also needs the INC-001 flag. */
type LocationMock = { getForegroundPermissionsAsync: jest.Mock; requestForegroundPermissionsAsync: jest.Mock };
type PickerMock = { getCameraPermissionsAsync: jest.Mock; requestCameraPermissionsAsync: jest.Mock };

function loadWithFlags(flags: { launch: boolean; location: boolean }) {
  let mod: typeof import('../launchPermissions') | undefined;
  let Location: LocationMock | undefined;
  let ImagePicker: PickerMock | undefined;
  jest.isolateModules(() => {
    jest.doMock('../../config/features', () => ({
      FEATURE_LAUNCH_LOCATION_PROMPT_ENABLED: flags.launch,
      FEATURE_LOCATION_TRACKING_ENABLED: flags.location,
    }));
    // Same registry as the module under test, so these are the instances it calls.
    Location = require('expo-location');
    ImagePicker = require('expo-image-picker');
    Location!.getForegroundPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true });
    ImagePicker!.getCameraPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true });
    mod = require('../launchPermissions');
  });
  return { mod: mod!, Location: Location!, ImagePicker: ImagePicker! };
}

describe('launchPermissions flag gating', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows nothing and reads no permission state when the launch flag is off', async () => {
    const { mod, Location, ImagePicker } = loadWithFlags({ launch: false, location: true });
    expect(await mod.resolveDueLaunchSteps()).toEqual([]);
    expect(Location.getForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(ImagePicker.getCameraPermissionsAsync).not.toHaveBeenCalled();
  });

  it('skips the location step (no expo-location call) when location tracking is off', async () => {
    const { mod, Location, ImagePicker } = loadWithFlags({ launch: true, location: false });
    expect(await mod.resolveDueLaunchSteps()).toEqual([{ kind: 'camera', status: 'askable' }]);
    expect(Location.getForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(ImagePicker.getCameraPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('includes both steps, location first, when both flags are on', async () => {
    const { mod, Location } = loadWithFlags({ launch: true, location: true });
    expect((await mod.resolveDueLaunchSteps()).map((s) => s.kind)).toEqual(['location', 'camera']);
    expect(Location.getForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
  });
});
