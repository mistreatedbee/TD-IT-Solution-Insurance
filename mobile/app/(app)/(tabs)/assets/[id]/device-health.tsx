import { FEATURE_HARDWARE_TRACKING_ENABLED } from '../../../../../src/config/features';
import { DeviceHealthScreen } from '../../../../../src/screens/assets/DeviceHealthScreen';
import { FeatureUnavailableScreen } from '../../../../../src/screens/common/FeatureUnavailableScreen';

export default function DeviceHealthRoute() {
  if (!FEATURE_HARDWARE_TRACKING_ENABLED) {
    return (
      <FeatureUnavailableScreen
        headline="Device health is not available in this build."
        body="Your registered assets and policy are still available from the Assets tab."
      />
    );
  }

  return <DeviceHealthScreen />;
}
