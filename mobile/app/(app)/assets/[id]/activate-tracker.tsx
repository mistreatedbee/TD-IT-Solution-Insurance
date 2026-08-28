import { FEATURE_HARDWARE_TRACKING_ENABLED } from '../../../../src/config/features';
import { DeviceActivationScreen } from '../../../../src/screens/assets/DeviceActivationScreen';
import { FeatureUnavailableScreen } from '../../../../src/screens/common/FeatureUnavailableScreen';

export default function ActivateTrackerRoute() {
  if (!FEATURE_HARDWARE_TRACKING_ENABLED) {
    return (
      <FeatureUnavailableScreen
        headline="Tracker setup is coming soon."
        body="GPS hardware activation is not available in this build yet. Your asset is still registered and visible from the Assets tab."
      />
    );
  }

  return <DeviceActivationScreen />;
}
