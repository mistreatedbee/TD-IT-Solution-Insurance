import { FEATURE_HARDWARE_TRACKING_ENABLED } from '../../../../src/config/features';
import { DeviceHealthScreen } from '../../../../src/screens/assets/DeviceHealthScreen';
import { FeatureUnavailableScreen } from '../../../../src/screens/common/FeatureUnavailableScreen';

export default function DeviceHealthRoute() {
  if (!FEATURE_HARDWARE_TRACKING_ENABLED) {
    return (
      <FeatureUnavailableScreen
        headline="Device health is coming soon."
        body="Tracker health monitoring is not available in this build yet."
      />
    );
  }

  return <DeviceHealthScreen />;
}
