import { FEATURE_HARDWARE_TRACKING_ENABLED } from '../../../../../src/config/features';
import { InstallationGuideScreen } from '../../../../../src/screens/assets/InstallationGuideScreen';
import { FeatureUnavailableScreen } from '../../../../../src/screens/common/FeatureUnavailableScreen';

export default function InstallationGuideRoute() {
  if (!FEATURE_HARDWARE_TRACKING_ENABLED) {
    return (
      <FeatureUnavailableScreen
        headline="The installation guide is not available in this build."
        body="Your registered assets and policy are still available from the Assets tab."
      />
    );
  }

  return <InstallationGuideScreen />;
}
